# FOXREX Admin

`https://foxrex.co/admin/` is the single admin entry. It contains the Studio (content operating system) and the Trading desk. `/studio/` and `/foxrex-studio.html` redirect here; browser data is kept because the origin is unchanged.

## Login

- Username `FOXREX` (case-insensitive) and the password set with the tool below. The password is never stored in the repository.
- How it works and what it does not protect against: see [SECURITY.md](../SECURITY.md). For server-side protection enable Cloudflare Access on `/admin/*` ([CLOUDFLARE-ACCESS.md](CLOUDFLARE-ACCESS.md)).
- Change the password (signs out every saved session):

  ```bash
  FOXREX_ADMIN_USER=FOXREX FOXREX_ADMIN_PASSWORD='new long passphrase' node tools/admin/set-credentials.mjs
  git add admin/gate.json && git commit -m "Rotate admin credentials" && git push
  ```

  On Windows PowerShell set the variables with `$env:FOXREX_ADMIN_USER="FOXREX"` and `$env:FOXREX_ADMIN_PASSWORD="…"` first.
- "Sign out" is at the bottom of the sidebar.

## Trading desk → Session checklist

Open before each session (direct link: `/admin/#checklist`). Each factor has three states and a weight for gold and for US indices; the two gauges show the session bias.

Where each factor value comes from, in order:

| Source | Factors | Data |
|---|---|---|
| Your choice for today (tag "يدوي") | any | this browser only, resets daily; click the same state again to clear it |
| Automatic (tag "تلقائي") | DXY, US 10Y, VIX, oil, ES/NQ futures, gold daily trend, gold vs prior-day range, high-impact US events | `data/quotes.json`, live Gold API, `data/market/ai-technical.json`, `data/calendar.json` |
| Today's research (tag "بحث اليوم") | Fed expectations, real yields, geopolitics, gold flows, mega-cap earnings, Fed speakers, after-close earnings, plus fallbacks | `data/desk/session-research.json` |
| None (tag "حدده من الشارت") | Europe session, index levels and trend, gold levels when no fresh prior-day bar | read from the live charts on the page |

Automatic rules: DXY ±0.15%, US 10Y ±3 bp, VIX ±3%, oil ±1%, futures average ±0.2%; gold trend = last daily close vs 10/20-day averages; gold level = live price vs the prior trading day's high/low (only when that bar is the previous weekday). Stale data is ignored rather than guessed.

### Daily research file

Update `data/desk/session-research.json` once per trading day before the London open (the daily editorial task can do it). Keep `date` in Istanbul time; a file with an older date is shown as stale and not applied. Values: `0` = first option (rising / hawkish / escalation / yes), `1` = middle, `2` = third. Write `why`, `facts` and `brief` in Arabic and list the sources.

## Trading desk → Market data health

Shows each data file with its last update and age, every stored quote with its source and observation time, and the sources that failed in the last refresh.

## Market data pipeline

- `.github/workflows/market-data.yml` runs `tools/market/refresh.py` every 15 minutes on weekdays and hourly at weekends, and commits `data/quotes.json` only when it changes. Run it by hand from GitHub → Actions → "Refresh market data" → Run workflow.
- Symbols: XAUUSD, XAGUSD, BTCUSD (Gold API); EURUSD, GBPUSD, USDJPY, SPX, NAS100, US30, DXY, US10Y, VIX, WTI, BRENT, ES, NQ (Yahoo Finance chart API). A failed source keeps its last verified value and timestamp and is listed in `errors`.
- The public ticker (`scripts/public/market.js`) reads the snapshot every minute and Gold API every 20 seconds. A price older than 30 minutes is dimmed. A live change is shown only against the previous trading day's close.
