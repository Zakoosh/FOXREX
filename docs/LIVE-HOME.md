# Image-led homepage and verified release updates

Owner mandate, 26 October 2026: a compact but visually strong homepage with photographic backdrop, real candlestick gold-chart preview, news strip, indicative prices, a pre-release alert and verified results with linked analysis. Preserve English root, Arabic/Turkish equivalents, REX education, both themes and the sticky educational/not-recommendations notice.

## Prices

`scripts/public/home.js` reads the repo snapshots in `data/quotes.json` and polls Gold API's public, keyless, CORS-enabled `/price/XAU`, `/price/XAG`, `/price/BTC` endpoints every 30 seconds while the tab is visible. Show source and original source time in Istanbul, not an invented market-trade time. Gold API updatedAt is the provider's fetch time. Prices are indicative, not executable. Reject invalid/future timestamps and non-positive/non-finite prices. A late snapshot must not overwrite a newer quote. Old quotes retain their real time and fade after the freshness threshold. Failed refreshes never manufacture a new observation timestamp.

`python tools/market/refresh.py` refreshes public Gold API and Yahoo Finance FX snapshots, retaining last verified values on failure. The hourly automation maintains repository snapshots and checks overdue releases; it is not a tick-by-tick FX feed. No account, paid/history endpoint or API key is authorized or needed. Provider references: https://gold-api.com/docs and https://gold-api.com/faqs .

## Calendar and news states

`data/calendar.json` stores exact UTC release time, source check time, status, optional source-backed actual and analysisPath. All display is Istanbul time. The homepage updates its local event state every 15 seconds, refreshing calendar data every 30 seconds. A foreground on-page alert appears 15 minutes before a listed high-impact release. After the scheduled time, keep `Awaiting official confirmation` until an actual has been independently verified and published. Do not infer a result from elapsed time. No notification permission, sound, push or social publication is enabled.

Exact-time automations check the currently verified events shortly after their official release times. Their execution, research and deployment take time: this is scheduled editorial verification, not a guaranteed instant economic-data terminal. The hourly job catches delayed releases. Daily editorial work must create/update exact-time jobs for newly verified upcoming releases, reusing event IDs and checking existing task IDs to avoid duplicates or obsolete schedules. If an agency changes the schedule, update the calendar and its pending task. Never claim a future task has already published a result.

## Verified result publication

Prepare a JSON package for `node tools/editorial/results.mjs package.json --apply`:

- authorization: owner-authorized-release-results-2026-10-26
- results: eventId, actual { value, sourceUrl }, translationGroupId of the existing news article
- articleUpdates: id, summary, body for the corresponding EN/AR/TR records (optional title/image changes follow the enrichment contract).

The result preparer refuses premature results, non-agency source hosts and missing trilingual analysis. It adds official release provenance and prepares feed/calendar together. The future agent must verify actual values and reporting period against the exact official release before running it. Keep the original URL/first publication, add updated copy with confirmed actuals and original conditional gold/FX analysis. Do not invent forecasts, consensus, or observed market reactions. For a press conference with no numeric result, update the developing article using enrich.mjs only after verifying actual official remarks; do not populate a fake economic number.

Run the deterministic builder, feed/schema checks and relevant tests; publish feed, calendar and generated pages in one atomic Git commit. Verify Pages deployment and public state. Preserve concurrent commits.

## Imagery and charts

Each of the 18 existing original publication groups now has its own cover; paired language records share that article's cover. Eleven original topic-specific assets were created with the built-in image tool: one home backdrop and ten covers for policy planning, gold/yields, EUR/USD, growth/inflation, gold risk, Fed, ECB, GDP, PCE and employment costs. Prompt direction: premium editorial photography/conceptual illustration, midnight navy, emerald and restrained gold, no overlaid text, chart, logo or invented figures. Assets live in assets/media, with exact mappings in content-ops/updates/2026-10-26-distinct-covers.json. Retain existing image/source provenance.

All technical analysis charts must be actual OHLC candlestick charts with wicks and bodies, labelled timeframe/date/source and annotated reference levels. Never replace them with a generated illustration, simulated series or simple line chart. `tools/charts/render.py` is the reproducible chart renderer; support/resistance are calculation lines over real candles. Preserve excluded bad provider bars, dated snapshots, and full-size-on-tap behaviour. The home gold feature derives from the latest published XAUUSD technical article, not a hardcoded date.
