# Muflon Stats

Appka sleduje hrané skladby na streamu Rádia Muflon a zobrazuje
statistiky za posledních 7 dní – živý log, žebříček, graf podle hodiny
a shrnutí pro sociální sítě.

## Co je potřeba nastavit

Aby appka fungovala, je potřeba udělat 4 kroky:

1. Nahrát appku na Vercel
2. Připojit databázi (Upstash Redis)
3. Nastavit pravidelné volání appky (cron-job.org)
4. Volitelně appku trochu zabezpečit

Návod na každý krok je níže.

---

## Krok 1 – Nahrání appky na Vercel

1. Nahraj obsah této složky do nového GitHub repozitáře (např. přes
   tlačítko "Add file → Upload files").
2. Jdi na vercel.com → **New Project** → vyber tento repozitář →
   klikni na **Deploy**.

## Krok 2 – Připojení databáze

Appka si musí ukládat data někam do databáze. Použijeme Upstash Redis,
který jde napojit přímo ve Vercelu.

1. V projektu na Vercelu otevři záložku **Storage**.
2. Klikni na **Create Database** a vyber **Upstash**.
3. Nech Vercel spravovat účet za tebe (nebude potřeba heslo ani
   platební karta).
4. Databázi přiřaď k projektu – Vercel si sám doplní vše potřebné.

## Krok 3 – Pravidelné spouštění appky

Appka potřebuje, aby se každou minutu někdo "zeptal", jestli nehraje
nová skladba. K tomu slouží stránka cron-job.org.

1. Přihlas se na console.cron-job.org.
2. Klikni na **Cronjobs** → **Create cronjob**.
3. Jako adresu (URL) zadej:
   `https://muflon-stats.vercel.app/api/poll`
4. Nastav interval na **každou minutu**.
5. Ulož a zapni.

## Krok 4 – Volitelné zabezpečení (nepovinné)

Bez tohoto kroku appka funguje normálně, jen je adresa
`/api/poll` otevřená pro kohokoliv. Pokud to chceš uzavřít jen pro
cron-job.org, udělej toto:

1. Ve Vercelu: **Settings → Environment Variables** a přidej
   proměnnou `CRON_SECRET` s libovolnou tajnou hodnotou.
2. V adrese v cron-job.org (krok 3) pak přidej na konec
   `?secret=tvoje-tajna-hodnota`.

## Kde appku najdu

Appka běží na adrese `https://muflon-stats.vercel.app/` – je to
statická stránka, bez přihlašování.

## Časté dotazy

**Jak appka počítá "hodiny hudby"?**
Sečte mezery mezi začátky po sobě jdoucích skladeb. Pokud je mezera
delší než 10 minut, bere to jako výpadek streamu a do součtu ji
nezapočítá.

**Appka hlásí "no valid track data", co s tím?**
Zkontroluj ve Vercelu function logy pro `api/poll`. Pokud se tahle
hláška opakuje pořád dokola, pošli mi ukázku odpovědi ze streamu a
doladíme to spolu.
