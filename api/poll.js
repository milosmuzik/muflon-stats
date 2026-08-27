import getRedis from '../lib/redis.js';
import { looksLikeAd } from '../lib/ad-filter.js';

const STREAM_ID = process.env.ZENO_STREAM_ID || 'wjj5yshttnitv';
const METADATA_URL = `https://api.zeno.fm/mounts/metadata/subscribe/${STREAM_ID}`;
const FETCH_TIMEOUT_MS = 8000;

const PLAYS_KEY = 'muflon:plays';
const LAST_TRACK_KEY = 'muflon:last';
const RETENTION_SECONDS = 9 * 24 * 60 * 60;

function describeCause(cause) {
  if (!cause) return null;
  if (Array.isArray(cause.errors)) {
    return cause.errors
      .map((err) => `${err.code || err.name || '?'}: ${err.message || err}`)
      .join(' | ');
  }
  if (cause.code) return `${cause.code}: ${cause.message}`;
  return String(cause);
}

// Zeno posílá metadata jako nekonečný SSE stream. Nás zajímá jen první
// událost - jakmile ji dostaneme, spojení TVRDĚ ukončíme přes
// controller.abort() (samotné reader.cancel() spolehlivě neuvolní socket
// a při opakovaných voláních appka postupně vyčerpá limit otevřených
// spojení - "EMFILE").
async function fetchCurrentTrack(debug) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const timeline = [];
  const t0 = Date.now();
  const mark = (label) => { if (debug) timeline.push(`${label}: +${Date.now() - t0}ms`); };

  try {
    mark('starting fetch');
    const res = await fetch(METADATA_URL, {
      signal: controller.signal,
      headers: { Accept: 'text/event-stream' },
    });
    mark(`got response status ${res.status}`);
    if (!res.ok || !res.body) {
      controller.abort();
      return { payload: null, timeline };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let raw = '';

    while (true) {
      const { value, done } = await reader.read();
      mark(`chunk done=${done} bytes=${value ? value.length : 0}`);
      if (done) break;
      const chunkText = decoder.decode(value, { stream: true });
      raw += chunkText;
      buffer += chunkText;

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        try {
          const payload = JSON.parse(jsonStr);
          try { await reader.cancel(); } catch {}
          controller.abort();
          return { payload, timeline, raw };
        } catch (parseErr) {
          mark(`parse fail: ${parseErr.message}`);
        }
      }
      if (raw.length > 3000) break;
    }
    controller.abort();
    return { payload: null, timeline, raw };
  } catch (e) {
    mark(`error: ${e.message}`);
    return {
      payload: null,
      timeline,
      error: e.message,
      cause: describeCause(e.cause),
    };
  } finally {
    clearTimeout(timeout);
  }
}

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
  if (looksLikeAd(artist) || looksLikeAd(title)) return null;

  return { artist, title };
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const debug = req.query.debug === '1';

  let redis;
  try {
    redis = getRedis();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }

  const { payload, timeline, raw, error, cause } = await fetchCurrentTrack(debug);
  const track = extractTrack(payload);

  if (!track) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      reason: 'no valid track data',
      ...(debug ? { timeline, raw, error, cause, payload } : {}),
    });
  }

  const trackKey = `${track.artist}||${track.title}`;

  try {
    const lastKey = await redis.get(LAST_TRACK_KEY);

    if (lastKey === trackKey) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'unchanged', track });
    }

    const now = Math.floor(Date.now() / 1000);
    const event = JSON.stringify({ ts: now, artist: track.artist, title: track.title });

    await redis.zadd(PLAYS_KEY, { score: now, member: event });
    await redis.set(LAST_TRACK_KEY, trackKey);
    await redis.zremrangebyscore(PLAYS_KEY, 0, now - RETENTION_SECONDS);

    return res.status(200).json({ ok: true, logged: track });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
