# Original AI-assisted technical analysis

Run `python tools/market/ai_technical.py`, then feed validation, site build, SEO audit,
regression checks and atomic publication. Technical hub has nine prominent instrument
links and prioritizes this series. Stable `/analysis/ai-technical-<symbol>/` routes exist
in EN, AR and TR. Do not reclassify incomplete imported reports as trade signals.

The initial series was authored with AI assistance. The script reproduces data intake,
calculations and conditional rule-based prose; it does not call an LLM on its own and
must not be advertised as a freshly reasoning model on each execution. The scheduled
editorial agent must review the actual inputs and add substantive instrument-specific
AI interpretation on its runs without inventing facts. No human-review claim.

Seven major FX pairs use verified free Yahoo spot FX H1 observations; symbol/currency,
OHLC, granularity, sorted unique timestamps, complete bars and indicative quote times
are checked. Invalid/partial bars are excluded, gaps are not filled. Range levels are
20 observed completed-bar highs/lows; they are not repeatedly tested zones. EMA uses
an initial N-observation mean; RSI and ATR use Wilder smoothing. Long EMAs are omitted
when samples are insufficient. No artificial forex volume.

XAUUSD/XAGUSD H1 symbols returned 404 on the free source. Their last independently
verified spot D1 charts through 23 October remain explicitly dated and stale; a fresh
Gold API indicative price is shown separately if available and never makes the chart
current. Do not replace spot with futures, ETFs or simulated candles. H4/D1 context for
FX is omitted without separate verified data. Source names are disclosed at the end.

`data/market/ai-technical.json` preserves all input candles and observations. Hourly
revision records preserve metrics and snapshot hash. On intake failure preserve previous
article publication, content update and actual data times. Keep real last-checked separate.
Freshness notices are visible on dated metal views even without JS. Atomic publication
must include chart palettes, feed, snapshots, revisions and generated pages.

The ChatGPT hourly task was observed paused during this change. Running this script
once does not resume a paused task or establish reliable background refresh. Do not
claim continuous hourly publication from a successful manual run.

Spot D1 input has session-date precision only. The editor-basis ISO anchor is a
conservative freshness boundary, not a provider close timestamp. Public text shows
the date only; 00:00 on the chart is explicitly a session-date marker. Actual writing
and indicative quote timestamps remain separate and exact.
