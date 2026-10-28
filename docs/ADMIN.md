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
- Second indicator `tools/tradingview/foxrex-wave-zones.pine` (Wave Retracement Zones, v8). The header comment of the file is the full specification. In short:
  - Strategy (fixed): a wave runs from its start to the first price stall (a high/low not exceeded for 2 bars); buy after an up wave that made a higher high than the previous stall high, sell after a down wave that made a lower low. Zone = 38.2–61.8% of the wave, entry at 50% (limit) or on a rejection candle in the zone, stop beyond 78.6% capped by timeframe. The same wave engine runs on the major timeframe.
  - Trend filter (structure swings, 5 bars): higher highs + higher lows = buys only, lower highs + lower lows = sells only, range = no wave trades. Strong daily and major zones trade in a range too (buys at support, sells at resistance, never against the trend). Trend lines: a resistance line from an earlier higher swing high through a later lower one and a support line from an earlier lower swing low through a later higher one, kept only while price has respected them; both = triangle, one only = channel with a dashed parallel. Profit protection default: stop to entry after TP2, to TP1 after TP3. Scorecard shows today only; every intraday chart keeps today's and yesterday's trades.
  - Three zone kinds with distinct looks: local (chart timeframe, grey, dashed border, "M5 BUY ZONE"), major (higher timeframe that sets the direction, auto 1m→15m, 5m→1H, 15m→4H, 1H→D; coloured, "H1 BUY ZONE · MAJOR"; a local zone inside a major zone of the same side is not drawn twice) and daily (today's support/resistance bands, "D1 BUY S1"). At most two live local zones per side; finished zones are removed.
  - Trades only from these zones: middle-of-zone limit or rejection candle (local and major zones), rejection out of the zone (daily zones, minimum strength). Every timeframe trades its own setups (direction filter off by default; optional major-structure / active-major-zone filters). One trade at a time per timeframe.
  - Auto profile by timeframe: 1m TP 1/2/3/5 stop up to 5; 5m TP 2.5/5/10/15 and 15m TP 2.5/5/10/20 stop up to 10; 1H/4H TP 5/10/20/40 stop up to 15; D+ TP 10/20/40/80 stop up to 25. Major/daily zone trades use at least the 5m targets. Stops sit beyond the zone, capped.
  - Simulation: every trade is 1 lot, no spread, $6 commission per lot (adjustable; $ per point auto = 100 for gold). P&L in $ on each trade's tooltip, the last-trade row and a "1 lot $" scorecard column.
  - No-progress exit after 15 bars without TP1, maximum life 60 bars, step profit protection; a trade that touched a target is a win.
  - The open trade shows a red stop area and a green target area, with entry, SL and TP prices at the right edge. A finished winner is recorded as the highest target touched ("BUY TP2 +5") with a short line at that target level; never as a stop loss. Daily scorecard per timeframe.
  - Update 29 Oct: stall = 1, 2 or 3 bars (default 1). Trend = direction of the last close beyond a swing high/low; range when nothing breaks for 40 bars. Seven targets: TP1–TP4 drawn, TP5–TP7 continue in steps of (TP4 − TP3) and are not drawn; after TP3 the stop trails two targets behind (TP3→TP1 … TP7→TP5); no time limit after TP2. Up to 3 open trades in the same direction, a new one only when the earlier ones are protected. Daily zone height follows the chart ATR (narrow on 1m, wider on 1H). Alerts on entry and on close; with a Telegram chat id the message is JSON for a webhook to `https://api.telegram.org/bot<TOKEN>/sendMessage` (TradingView plan with webhooks required; keep the token only in TradingView).
  - Update 29 Oct (2): range = no break for 30 bars on 1m, 12 bars (1 hour) on 5m, 8 bars on 15m, 6 above (input to override). No limit on open trades in the same direction (each new one only after the earlier ones are protected). Daily zones trade up to twice per zone per side per day, 10 bars apart.
