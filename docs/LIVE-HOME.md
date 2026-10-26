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

## Owner update: theme pairing and hourly auditing

The light homepage uses its own daylight/ivory gold artwork and a real light candlestick preview, selected by the active data-theme setting. The dark artwork remains for dark mode. `tools/charts/render.py` now renders both palettes from identical OHLC observations. Keep both foreground contrast and the mini-chart card consistent with the selected theme.

The existing hourly task `6ade7fbb91348191a6d24412afed48c0` is now titled «تدقيق الأسعار والأخبار العاجلة», starting at 02:00 Europe/Istanbul on 26 October 2026, recurring hourly. It audits served quote mappings/currency/units/timestamps/staleness and checks an independent comparable source when available. This is verification of indicative data, not a guarantee of an executable price or universal accuracy. Never compare a spot observation with a futures contract or mismatched timestamps. Invalid responses preserve the last verified value and observation time.

The same task searches for material breaking gold/forex/macro news and publishes verified new developments with a distinct owned image, source evidence and original conditional analysis in all three languages. Reuse deterministic event identities and update the existing story when appropriate. Skip unverified rumours and filler. Hourly checks imply a check-and-verification delay, not an instantaneous news wire. Preserve source publication time separately from FOXREX publication/update time.

Facebook/Instagram publication is still not configured. Metricool has been suggested as a possible connector, but it is not confirmed installed or connected. Do not treat this as permission to post or claim social posting is live. The user must first authorize account linking through the provider and identify the intended destinations/publishing scope; never ask for credentials in chat.

Light hero asset: assets/media/home-market-hero-light-v2.webp, created with the built-in image tool from the dark counterpart. Prompt: preserve the gold bars/coins and wide composition; replace the navy night setting with airy ivory marble, pearl architecture and daylight, restrained emerald accents and warm metallic gold; calm bright space for navy text, no text/logo/chart.

## Owner presentation update — 26 October 2026

Show each article's original publication date AND exact hour/minute and its last content update in Europe/Istanbul, including catalog cards. Never replace the article timestamp with a build or source-quote fetch time. Keep publication time separate from market observation time.

Only setups with actual entry, at least one target and a stop-loss qualify for the Signals desk. Incomplete imported records stay ANALYSIS in Technical Analysis with their existing permanent routes; never render blank Entry/TP/SL or trade-result panels for them. Keep analytical range boundaries as ordinary technical levels. Summarize source attribution in the final source disclosure rather than repeatedly naming providers in article copy or beside each data point. Preserve original canonical provenance internally.

The homepage news ribbon now scrolls continuously without manual dragging, with automatic Important and Soon badges (Soon means a release within one hour), hover/focus pause, a pause button and reduced-motion support. Keep duplicated loop content inert and hidden from accessibility readers.

Show indicative daily percentage change with an explicit sign and green/red/neutral color. SPX (^GSPC), NAS100 (^NDX) and US30 (^DJI) are cash index observations in points, not broker CFDs. Use Yahoo's verified regular-session percentage or a true preceding-session daily close, never chartPreviousClose from the beginning of a multi-day range. Spot metals compare the current spot observation against the preceding verified spot daily close, retaining its date and independent source URL. If that prior close is unavailable or too old, show an unavailable change; do not compare against futures or fabricate zero. Never carry a stale reference over to a later session. Keep source timestamps and delayed/stale status.

Daily-close snapshots may arrive after newer browser price observations. Keep the close reference separately, recompute the daily percentage against the newest price, and never let an older snapshot regress the displayed quote. The browser helper mergeQuote covers this arrival-order regression; homepage JavaScript has a content-version query so deployment refreshes the client implementation.

## Owner correction: Arabic ticker, AI series and search quality (26 October)

Keep ticker geometry LTR for a seamless physical loop, but isolate each Arabic anchor
and headline with RTL direction; isolate numeric times LTR. News order follows verified source-release chronology descending, with exact article
publication time as the tie-breaker for the same release date. Never make an old
September release appear newer because its article was backfilled today. Unreleased
previews remain separately labelled; writing times remain explicitly labelled Published.

Preserve the prominent nine-instrument AI-assisted series in Technical, its real source
and chart-age limits, paired palettes and stable URLs. Read docs/AI-TECHNICAL.md. Every
article has a useful navigation sidebar, related articles, visible authorship, breadcrumbs
and honest publication/update times. Read docs/SEO.md and run the built-page SEO audit.
