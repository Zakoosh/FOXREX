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

## Trading desk → Gold levels (top of the checklist)

The first panel on `/admin/#checklist` is the gold levels summary: the live price (Gold API, every 20 seconds), a one-paragraph read (between which support and resistance, what a break opens, which side is nearer) and a ladder of up to four resistance and four support zones with strength and distance.

- Daily data: spot D1 bars from `data/market/ai-technical.json` when they include the previous session; otherwise COMEX gold futures bars from `data/market/gold-daily.json` (written by the market-data workflow, completed sessions only) converted to spot with the spot–futures basis measured in the same refresh (XAUUSD − GCFUT).
- Levels: prior session high/low/close, daily pivot P/R1/R2/S1/S2, previous week high/low, 20-day high/low, swing highs/lows of the last 60 sessions, 20/50-day averages, round numbers (50/100) and the analyst levels in `data/desk/session-research.json` → `levels.goldLevels`. Levels within ~0.12 × ATR merge into one zone; strength is the weighted count of levels in the zone.
- Update cadence: computed levels change automatically after each completed session; the price and distances update continuously; analyst levels change when the research file is updated.

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
- Symbols: XAUUSD, XAGUSD, BTCUSD (Gold API); EURUSD, GBPUSD, USDJPY, SPX, NAS100, US30, DXY, US10Y, VIX, WTI, BRENT, ESFUT, NQFUT, GCFUT (Yahoo Finance chart API), plus completed GC daily sessions in `data/market/gold-daily.json`. A failed source keeps its last verified value and timestamp and is listed in `errors`.
- The public ticker (`scripts/public/market.js`) reads the snapshot every minute and Gold API every 20 seconds. A price older than 30 minutes is dimmed. A live change is shown only against the previous trading day's close.

## Trading desk → TradingView indicator

`/admin/#tvscript` shows `tools/tradingview/foxrex-levels-scalper.pine` (Pine Script v6) with a copy button, install steps and today's analyst levels (from the research file) ready to paste into the indicator settings.

- English-only labels; LuxAlgo and SMA-scalp modules are off by default. Levels are drawn time-anchored from the start of today's session; prior-day high/low/pivot are plotted through history on intraday charts.
- Modules, each can be shown or hidden in the indicator settings: daily S/R zones (same engine as the desk), adjustable MA cross (EMA/SMA/WMA/HMA/RMA) with trend EMA, scalping BUY/SELL (cross) and B+/S+ (pullback) signals confirmed on bar close with trend/RSI/higher-timeframe/room/session filters and ATR SL/TP, dashboard with the rules-based recommendation, LuxAlgo S&R Signals MTF (breakouts, tests, retests, rejections, manipulation zones), and SMA scalp B/S with RSI reversal (!).
- Alerts: `alertcondition` entries for each signal type, plus `alert()` messages with SL/TP (choose "Any alert() function call").
- Licence: includes code adapted from LuxAlgo (CC BY-NC-SA 4.0) and nicks1008 (MPL 2.0). Non-commercial use with attribution; do not sell or publish it as a closed FOXREX product.
- Second indicator `tools/tradingview/foxrex-wave-zones.pine` (Wave Retracement Zones): break of structure → sequential sell/buy zones at the 50–61.8% retracement of the impulse leg, entry on a rejection candle in the zone (bar close). Targets in fixed points (default TP1 5 / TP2 10) or leg end/extension; stop at the 78.6% invalidation or fixed points; optional stop to entry after TP1; trades close after N bars. Abnormal-candle filter (range > k × ATR or > max points in the last bars) blocks entries. Daily scorecard (today / yesterday / chart: trades, wins, losses, win %, net points with 50% at TP1). Zones stay until invalidated (then fade); a finished trade hides its zone and keeps one label with side, result and points (losers smaller). Works on the chart's own timeframe.
