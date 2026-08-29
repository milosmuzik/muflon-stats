// api/latest.js
//
// Veřejný, neautentizovaný endpoint pro krátký živý log posledních
// hraných skladeb - používá ho např. web Rádia Muflon.
//
// Request:
// GET /api/latest?limit=4
//
// Response:
// { "ok": true, "tracks": [{ "track": "Interpret — Název", "playedAt": "2024-...T...Z" }, ...] }

import getRedis from '../lib/redis.js';
import { looksLikeAd } from '../lib/ad-filter.js';

const PLAYS_KEY = 'muflon:plays';
const LOOKBACK_SECONDS = 24 * 60 * 60; // stačí poslední den, log chce jen pár nejnovějších
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

// Endpoint čte web Rádia Muflon, který běží na jiné doméně, proto CORS
// povolujeme pro kohokoliv.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  let redis;
  try {
    redis = getRedis();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }

  const limitParam = parseInt(req.query.limit, 10);
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const now = Math.floor(Date.now() / 1000);
  const from = now - LOOKBACK_SECONDS;

  let tracks;
  try {
    const raw = await redis.zrange(PLAYS_KEY, from, now, { byScore: true });
    tracks = raw
      .map((item) => {
        try {
          return typeof item === 'string' ? JSON.parse(item) : item;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((e) => !looksLikeAd(e.artist) && !looksLikeAd(e.title))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit)
      .map((e) => ({
        track: `${e.artist} — ${e.title}`,
        playedAt: new Date(e.ts * 1000).toISOString(),
      }));
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  return res.status(200).json({ ok: true, tracks });
}
