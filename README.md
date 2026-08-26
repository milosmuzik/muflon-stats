# Muflon Stats

Appka sleduje hrané skladby na Zeno.fm streamu Rádia Muflon a ukazuje
statistiky za posledních 7 dní (živý log, žebříček, graf podle hodiny,
shrnutí pro sociální sítě).

## Jak appka funguje

- `api/poll.js` – volá se každou minutu zvenku (cron-job.org). Zjistí
  aktuální skladbu na streamu a pokud se liší od poslední uložené,
  zapíše ji do Redis.
- `api/data.js` – čte log z Redis a počítá statistiky pro dashboard
  (posledních 7 dní, klouzavé okno).
- `public/` – samotný dashboard (statické HTML/CSS/JS).

## 1. Nasazení na Vercel

1. Nahraj obsah této složky do nového GitHub repa `muflon-stats`
   (Add file → Upload files).
2. Na vercel.com → New Project → vyber repo `muflon-stats` → Deploy.

## 2. Připojení Upstash Redis

1. V projektu na Vercelu: záložka **Storage** → **Create Database** →
   **Upstash** (Redis).
2. Nech Vercel spravovat účet za tebe ("Let Vercel manage your
   Upstash account") – bez hesla, bez karty.
3. Po vytvoření databáze ji přiřaď k projektu `muflon-stats` – Vercel
   sám doplní potřebné proměnné prostředí.

## 3. Volitelné: zabezpečení pollovacího endpointu

Aby na `/api/poll` nemohl volat kdokoliv jiný než cron-job.org, můžeš
v nastavení projektu (Settings → Environment Variables) přidat:

```
CRON_SECRET = libovolný-tajný-řetězec
```

Pokud tuhle proměnnou nastavíš, endpoint bude vyžadovat
`?secret=libovolný-tajný-řetězec` v URL. Pokud ji nenastavíš, endpoint
zůstane otevřený (jednodušší start, méně bezpečné).

## 4. Nastavení cron-job.org

1. Přihlas se na console.cron-job.org.
2. **Cronjobs** → **Create cronjob**.
3. URL: `https://muflon-stats.vercel.app/api/poll` (případně s
   `?secret=...`, pokud jsi nastavil CRON_SECRET výše – doplň svou
   skutečnou Vercel doménu).
4. Interval: každou minutu.
5. Ulož a zapni.

## 5. Dashboard

Appka běží na `https://muflon-stats.vercel.app/` (statická stránka
v `public/`, žádné přihlašování).

## Poznámky

- Odhad "hodin hudby" počítá appka jako součet mezer mezi začátky po
  sobě jdoucích skladeb. Mezery delší než 10 minut appka bere jako
  výpadek zdrojového serveru streamu a do součtu je nezahrnuje.
- Po prvním nasazení stojí za to zkontrolovat Vercel function logy
  (`api/poll`) po pár prvních voláních – ověří se tím, že appka
  správně parsuje formát metadat z tvého konkrétního streamu. Pokud
  by log ukazoval "no valid track data" pořád dokola, stačí mi sem
  poslat ukázku odpovědi a parsování doladíme.
