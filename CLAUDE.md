# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Co appka dělá

Sleduje hrané skladby na Zeno.fm streamu Rádia Muflon a zobrazuje statistiky za posledních 7 dní (živý log, žebříček, graf podle hodiny, shrnutí pro sociální sítě). Žádný build krok, žádný framework — vanilla serverless funkce nasazené na Vercel + statický frontend.

## Architektura

- **`api/poll.js`** — volané externím cronem (cron-job.org) každou minutu. Otevře SSE spojení na Zeno.fm metadata endpoint (`https://api.zeno.fm/mounts/metadata/subscribe/{STREAM_ID}`), přečte první událost a **tvrdě** ukončí spojení přes `controller.abort()` — pouhé `reader.cancel()` socket spolehlivě neuvolní a appka by při opakovaných voláních vyčerpala limit otevřených spojení (EMFILE). Pokud se skladba liší od poslední uložené (`muflon:last` v Redis), zapíše ji do sorted setu `muflon:plays` (score = unix timestamp) a ořízne záznamy starší než `RETENTION_SECONDS` (9 dní).
- **`api/data.js`** — čte `muflon:plays` z Redis pro klouzavé okno (default 7 dní, `?range_hours=` pro jiné okno) a z eventů dopočítává: souhrn (počet přehrání, unikátní skladby, odhad odehraných hodin), žebříček TOP 20, rozložení podle hodiny dne (`Europe/Prague`), živý log posledních 50 a text pro sociální sítě.
  - Odehraný čas se počítá jako součet mezer mezi začátky po sobě jdoucích skladeb; mezera delší než `OUTAGE_THRESHOLD_SECONDS` (10 min) se bere jako výpadek streamu a do součtu se nezahrnuje.
- **`api/debug-metadata.js`** — diagnostický endpoint, dumpuje syrovou odpověď/timing ze Zeno.fm metadata streamu (na ladění formátu, když `poll` hlásí "no valid track data").
- **`lib/redis.js`** — lazy singleton klient Upstash Redis; zkouší víc názvů env proměnných (`KV_REST_API_URL/TOKEN`, `UPSTASH_REDIS_REST_URL/TOKEN`, `REDIS_REST_URL/TOKEN`), protože Vercel↔Upstash integrace je pojmenovává různě podle způsobu propojení.
- **`public/`** — statický dashboard (`index.html` + `app.js` + `style.css`), bez frameworku. Fetchuje `/api/data` a renderuje hero čísla, žebříček, graf podle hodin a živý log.

## Nasazení a provoz

- Hosting: Vercel (serverless functions v `api/`, statika z `public/`). Deploy je automatický z gitu.
- Storage: Upstash Redis, připojené přes Vercel Storage integraci (proměnné prostředí doplní Vercel automaticky).
- Polling: externí cron (cron-job.org) volá `GET /api/poll` každou minutu. Endpoint lze zabezpečit proměnnou `CRON_SECRET` (pak vyžaduje `?secret=...`); bez ní zůstává otevřený.
- Žádné vlastní build/test/lint skripty (`package.json` má jen jednu závislost, `@upstash/redis`, a žádnou `scripts` sekci). Před nasazením ověřuj syntakticky (`node --check api/*.js lib/*.js`) a chování ručně přes lokální fetch na endpointy.
