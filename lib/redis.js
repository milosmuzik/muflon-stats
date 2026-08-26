import getRedis from '../lib/redis.js';

const STREAM_ID = process.env.ZENO_STREAM_ID || 'wjj5yshttnitv';
const METADATA_URL = `https://api.zeno.fm/mounts/metadata/subscribe/${STREAM_ID}`;
const FETCH_TIMEOUT_MS = 5000;

const PLAYS_KEY = 'muflon:plays'; // sorted set: score = unix ts, member = JSON event
const LAST_TRACK_KEY = 'muflon:last'; // string "artist||title" pro rychlé porovnání
const RETENTION_SECONDS = 9 * 24 * 60 * 60; // držíme 9 dní surového logu (dashboard ukazuje 7)

// Zeno posílá metadata jako SSE (nekonečný stream). Nás zajímá jen první
// událost - jakmile ji dostaneme, spojení zavřeme, ať funkce neběží dlouho.
async function fetchCurrentTrack() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(METADATA_URL, { signal: controller.signal });
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // nedokončený řádek necháme na příště

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        try {
          const payload = JSON.parse(jsonStr);
          reader.cancel().catch(() => {});
          return payload;
        } catch {
          // řádek zatím není kompletní/platný JSON, čekáme na další chunk
        }
      }
    }
    return null;
  } catch {
    // timeout, výpadek zdrojového serveru apod. - tenhle tik prostě přeskočíme
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Zeno formát metadat se může lišit stanici od stanice - zkoušíme
// nejběžnější varianty polí, ať appka nespadne na nečekaném tvaru dat.
function extractTrack(payload) {
  if (!payload || typeof payload !== 'object') return null;

  let artist = payload.artist || payload.Artist || '';
  let title =
    payload.title || payload.Title || payload.song || payload.Song || '';
  const streamTitle = payload.streamTitle || payload.StreamTitle;

  if (!title && streamTitle) {
    if (streamTitle.includes(' - ')) {
      const parts = streamTitle.split(' - ');
      artist = parts[0];
      title = parts.slice(1).join(' - ');
    } else {
      title = streamTitle;
    }
  }

  artist = (artist || '').trim();
  title = (title || '').trim();
  if (!title) return null;

  return { artist, title };
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  let redis;
  try {
    redis = getRedis();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }

  const payload = await fetchCurrentTrack();
  const track = extractTrack(payload);

  if (!track) {
    return res
      .status(200)
      .json({ ok: true, skipped: true, reason: 'no valid track data' });
  }

  const trackKey = `${track.artist}||${track.title}`;

  try {
    const lastKey = await redis.get(LAST_TRACK_KEY);

    if (lastKey === trackKey) {
      return res
        .status(200)
        .json({ ok: true, skipped: true, reason: 'unchanged', track });
    }

    const now = Math.floor(Date.now() / 1000);
    const event = JSON.stringify({
      ts: now,
      artist: track.artist,
      title: track.title,
    });

    await redis.zadd(PLAYS_KEY, { score: now, member: event });
    await redis.set(LAST_TRACK_KEY, trackKey);
    await redis.zremrangebyscore(PLAYS_KEY, 0, now - RETENTION_SECONDS);

    return res.status(200).json({ ok: true, logged: track });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
