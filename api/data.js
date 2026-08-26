import getRedis from '../lib/redis.js';

const PLAYS_KEY = 'muflon:plays';
const DEFAULT_RANGE_SECONDS = 7 * 24 * 60 * 60; // klouzavé okno: posledních 7 dní
const OUTAGE_THRESHOLD_SECONDS = 10 * 60; // mezera delší než 10 min = výpadek streamu, nepočítá se

export default async function handler(req, res) {
  let redis;
  try {
    redis = getRedis();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }

  const rangeParam = parseInt(req.query.range_hours, 10);
  const rangeSeconds =
    Number.isFinite(rangeParam) && rangeParam > 0
      ? rangeParam * 3600
      : DEFAULT_RANGE_SECONDS;

  const now = Math.floor(Date.now() / 1000);
  const from = now - rangeSeconds;

  let events;
  try {
    const raw = await redis.zrange(PLAYS_KEY, from, now, { byScore: true });
    events = raw
      .map((item) => {
        try {
          return typeof item === 'string' ? JSON.parse(item) : item;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.ts - b.ts);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }

  // --- souhrn ---
  const totalPlays = events.length;
  const uniqueSet = new Set(events.map((e) => `${e.artist}||${e.title}`));
  const uniqueTracks = uniqueSet.size;

  // Odhad odehraného času = součet mezer mezi začátky sousedních skladeb.
  // Mezery delší než OUTAGE_THRESHOLD_SECONDS bereme jako výpadek streamu
  // (restart zdrojového serveru apod.) a do součtu je nezahrnujeme.
  let secondsPlayed = 0;
  for (let i = 0; i < events.length; i++) {
    const start = events[i].ts;
    const end = i < events.length - 1 ? events[i + 1].ts : now;
    const gap = end - start;
    if (gap > 0 && gap <= OUTAGE_THRESHOLD_SECONDS) {
      secondsPlayed += gap;
    }
  }
  const hoursPlayed = Math.round((secondsPlayed / 3600) * 10) / 10;

  // --- žebříček nejhranějších skladeb ---
  const counts = new Map();
  for (const e of events) {
    const key = `${e.artist}||${e.title}`;
    const entry = counts.get(key) || { artist: e.artist, title: e.title, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  const leaderboard = [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // --- graf: počet přehrání podle hodiny dne (Europe/Prague) ---
  const hourly = new Array(24).fill(0);
  for (const e of events) {
    const hourStr = new Date(e.ts * 1000).toLocaleString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Europe/Prague',
    });
    const h = parseInt(hourStr, 10) % 24;
    hourly[h] += 1;
  }

  // --- živý log: posledních 50 skladeb, nejnovější první ---
  const liveLog = [...events].reverse().slice(0, 50);

  // --- shrnutí pro sociální sítě ---
  const top = leaderboard[0];
  const rangeDays = Math.round(rangeSeconds / 86400);
  const socialText = top
    ? `${rangeDays} dní · ${totalPlays} skladeb · ${uniqueTracks} unikátních · ${hoursPlayed} h hudby · TOP: ${top.artist} – ${top.title} (${top.count}×)`
    : `${rangeDays} dní · zatím nemáme dost dat.`;

  return res.status(200).json({
    ok: true,
    range_hours: Math.round(rangeSeconds / 3600),
    generated_at: now,
    summary: { totalPlays, uniqueTracks, hoursPlayed },
    leaderboard,
    hourly,
    liveLog,
    socialText,
  });
}
