# FOXREX — Content Model

**Status:** proposed contract for owner review, 2026-10-04. It does not change the current feed (schema v2) or Studio.
It extends the existing model in `studio/cms-model.js` and `data/content.schema.json`. Each type below states what
already exists (v2) and what would change in a future v3.

The model separates **three connected layers** (owner decision 7; see also `FOXREX-EDITORIAL-SYSTEM.md` §4). They are
never collapsed into one generic feed:

| Layer | Question | Produced by | Types |
|---|---|---|---|
| **A. Market Data** | What is happening? | Systems (Market API, calendar source). Never written by hand, never stored inside editorial text | Market Snapshot, Economic Event (data part) |
| **B. Market Intelligence** | Why is it happening, and what matters? | The desk in Studio, approved by a person | Morning Brief, US Session Preview, Market Recap, News, Economic Event (editorial part), Analysis, Weekly Outlook, Gold Focus (context part), REX Explains |
| **C. Trading Intelligence** | What setup, scenario or decision follows? | The desk in Studio, with stricter validation (stop, risk, invalidation) | Gold Focus (levels and scenarios), Trading Idea, Signal, Signal Result |

Gold Focus deliberately spans B and C: it is the flagship product, where context and levels meet. Each layer has its
own validation, its own freshness rules and its own surfaces on the site.

**Coverage is extensible.** Launch editorial coverage is gold, FX and major macro events, but no field, enum or URL
assumes it. Instruments come from the symbol registry, so indices, crypto, commodities and broader global markets
are added as registry entries with an `assetClass`, not as schema changes.

---

## 1. Common envelope (every editorial type)

| Field | Type | Rule | v2 |
|---|---|---|---|
| `id` | string | `<translationGroupId>-<lang>`, immutable | ✓ |
| `type` | enum | One of the types below | ✓ |
| `layer` | `market-intelligence` \| `trading-intelligence` | Derived from `type` (Gold Focus: both). Drives surfaces and validation | **new** |
| `access` | `PUBLIC` \| `MEMBER` \| `PREMIUM` | **Launch: PUBLIC only.** Reserved so Signals (and others) can later be tiered without a schema change. No paywall, no pricing claims now (owner decision 5) | **new** |
| `language` | `en` \| `ar` | Each language is its own record, linked by `translationGroupId` | ✓ |
| `translationGroupId` | string | `<type>-<yyyy-mm-dd>-<slug>`; shared by EN and AR | ✓ |
| `title` | text ≤ 180 | Plain text | ✓ |
| `slug` | kebab-case | **Shared by EN and AR** (Latin), unique per section | ✓ |
| `urlPath` | string | Canonical path, derived by the publisher, never typed by hand (e.g. `analysis/eurusd-ecb-holds/`). **Immutable after first publish** | **new** |
| `canonicalUrl` | URL | `https://foxrex.co/` + (`ar/` if Arabic) + `urlPath` | **new** (derived) |
| `summary` | text ≤ 600 | Card and SEO description | ✓ |
| `body` | text ≤ 20 000 | Plain text with paragraphs; no HTML | ✓ |
| `instruments` | symbol[] | Canonical registry symbols; replaces the single `symbol` (kept for compatibility) | **new** (v2 `symbol`) |
| `timeframe` | enum | `intraday` \| `1-3d` \| `swing` \| `weekly` \| `position` | v2 free text → enum |
| `tags` | tag[] | From the controlled vocabulary (IA §7) | ✓ (free) |
| `status` | lifecycle | IDEA, DRAFT, REVIEW, APPROVED, SCHEDULED, PUBLISHED, ARCHIVED (Studio only; the feed contains PUBLISHED only) | ✓ |
| `createdAt` / `updatedAt` / `publishedAt` | ISO UTC | Shown in Istanbul time. `publishedAt` = first publication (never changes); `updatedAt` = last substantive republish, shown publicly as "Updated" | ✓ |
| `archive` | derived | `{ month: 'yyyy-mm', sectionIndex, dateIndex? }`: every published item is reachable from its section list and its monthly archive index (archive discoverability) | **new** (derived) |
| `scheduledAt` | ISO UTC | For SCHEDULED | ✓ (Studio) |
| `publishVersion` | int | Increments on every republish | ✓ |
| `origin` | object | `{ desk: 'FOXREX Desk', author?: string, assistance: 'none' \| 'ai-assisted' \| 'system-generated', reviewedBy: string }`. **Public attribution:** "FOXREX Desk", optionally an author, and "AI-assisted, reviewed by the desk" where true | **new** |
| `sources` | source[] | `{ name, url?, publishedAt?, retrievedAt? }` | ✓ |
| `lead` | bool | The desk's current "What Matters Now" story; at most one active per language | **new** |
| `seo` | object | `{ title?, description? }`; the canonical and hreflang are derived | ✓ |
| `riskDisclosure` | text | Required on trading-related types; defaults to the standard text | ✓ |
| `image` | object | Optional `{ src: assets/media/…, alt }` | ✓ |

### 1.1 Freshness model (every price-sensitive value and item)

**Fields** (on every Market Snapshot, on every `priceRef`, and on every editorial item that states a level, price or
market condition):

| Field | Meaning |
|---|---|
| `dataAsOf` | ISO UTC instant at which the stated value or levels were true (for editorial: the analyst's reference time) |
| `sourceTimestamp` | ISO UTC time **given by the source/provider** for the value (provider tick time, release time). Age is always measured from this, never from when we received it |
| `receivedAt` | ISO UTC time FOXREX received or snapshotted the value (detects transport delay and frozen feeds) |
| `validUntil` | ISO UTC: after this the value or item may not be presented as current |
| `freshnessStatus` | `LIVE` \| `FRESH` \| `AGING` \| `STALE` \| `UNAVAILABLE`: computed at render time, **never stored by hand** |
| `dataSource` | e.g. `"<provider> via FOXREX Market API"`, `"Chart: XAUUSD spot, 1H"` |
| `priceRef` | Optional `{ symbol, price, priceType, source, sourceTimestamp, receivedAt }`, snapshotted from the Market API at writing time, **never typed by hand** |
| `stalePolicy` | `hide` \| `label-dated` \| `archive-only`: what current-state surfaces do with an editorial item once it is STALE |

**Status definitions** (thresholds are per asset class and configurable; the defaults below are proposals):

| Status | Live data (quote) | Editorial item | How it may be displayed |
|---|---|---|---|
| **LIVE** | Real-time entitlement, source age ≤ live window (e.g. 60 s FX/metals) | — (editorial is never "live") | Quote styling allowed; "Live · <source>" |
| **FRESH** | Delayed entitlement or age ≤ fresh window (e.g. 5 min) | `now < validUntil` and within its slot's window | Value + explicit time ("as of 14:02 IST"); no "live" styling |
| **AGING** | Age between fresh and stale windows (e.g. 5–20 min), or market closed with a recent last value | Past half of its validity (e.g. Gold Focus after 18:00 IST) | Value + time, visually de-emphasised; "Closed · last 22:59" when the session is closed |
| **STALE** | Age beyond the stale window while the market should be open | `now ≥ validUntil` | **Never in quote styling.** Data: hidden from tickers, or "last value at <date time>" in plain text. Editorial: follows `stalePolicy` (hidden from current-state surfaces, or dated label) |
| **UNAVAILABLE** | No value, rejected by the quality gate, or provider down | — | The value is not shown. No dashes, no "feed unavailable" banner on the homepage (§ graceful absence, `FOXREX-WEBSITE-BLUEPRINT.md`) |

`marketState` (`OPEN` \| `CLOSED` \| `HALTED`) is **separate** from freshness: a closed market makes a quote AGING
(with "Closed" shown), not STALE.

**Hard rules:**
1. **A stale value must never visually appear as a current live quote.** Quote styling (large number, tick colour,
   "live" dot) is reserved for LIVE and FRESH.
2. Freshness is computed from `sourceTimestamp`, so a frozen feed repeating an old value ages into STALE.
3. Editorial items never carry LIVE. Permalinks always show `publishedAt`, `dataAsOf` and, once STALE, a "This
   analysis is from <date>; levels may no longer apply" banner.
4. A homepage or hub "today" surface shows an editorial item only while it is FRESH or AGING.

**Alignment with PR #6 (not changed in this phase):** the Market Data Layer currently emits
`LIVE · DELAYED · STALE · MARKET_CLOSED · UNAVAILABLE`. Proposed public mapping: LIVE → LIVE; DELAYED → FRESH or AGING
by age; STALE → STALE; MARKET_CLOSED → AGING + `marketState=CLOSED`; UNAVAILABLE → UNAVAILABLE. PR #6 already
measures age from the provider timestamp and keeps `providerTime` / `receivedAt`, which map to `sourceTimestamp` /
`receivedAt`.

---

## 2. Types

Legend: **E** = editorial (Studio → feed), **D** = data (system → Market API), **v2** = exists today. Layer: **[A]** Market Data · **[B]** Market Intelligence · **[C]** Trading Intelligence.

### 2.1 Market Snapshot (D) [A]
The live state of an instrument. **Not a Studio type and never published as editorial.**
`{ symbol, status, price, bid, ask, mid, last, spread, change?, changePct?, changeBasis?, providerTime, receivedAt, ageMs, source{provider, attribution, realtime}, marketOpen }`.
This is the PR #6 normalized quote, unchanged. Later additions (P1/P2): candles `{symbol, tf, t, o, h, l, c, v?}`,
derived indicators, each with `method` and `asOf`.

### 2.2 Morning Brief (E; v2 `MORNING_BRIEF`) [B]
| Field | Rule |
|---|---|
| `overnight` | 3–5 bullets: what moved and why |
| `deskRead` | **The Desk Read** (homepage §06): `{ regime: risk-on\|risk-off\|mixed, usd: firm\|soft\|mixed, yields: rising\|falling\|flat, volatility: low\|normal\|elevated, note }`, each with a one-line reason. FOXREX's judgement, labelled as such |
| `todayAgenda` | Scheduled events (links to Economic Events) with Istanbul times |
| `levels` | Key levels for 2–4 instruments `{ symbol, support[], resistance[], note }` |
| `watch` | What would change the picture today |
| `validUntil` | The end of the editorial day (next 09:00 IST) |
| `stalePolicy` | `archive-only` |

### 2.3 Gold Focus (E; v2 `GOLD_FOCUS`) [B + C] — flagship product
| Field | Rule |
|---|---|
| `marketState` | Short description of current behaviour |
| `trend` | `{ bias: bullish\|bearish\|neutral, timeframe }` |
| `keySupport[]`, `keyResistance[]`, `importantLevel` | **Structured levels** `{ price, label?, kind: support\|resistance\|pivot }` (v2: strings) |
| `bullishScenario`, `bearishScenario` | Condition → path → target, with the triggering level |
| `invalidation` | The level or condition that voids the bias |
| `technicalContext` | Structure and momentum in plain words |
| `macroDriver` | The dominant macro driver (real yields / USD / risk / central banks / flows) |
| `priceRef`, `dataAsOf` | Required |
| `validUntil` | The next Gold Focus (next trading day, 11:00 IST) |
| `stalePolicy` | `label-dated` |

### 2.4 Analysis (E; v2 `ANALYSIS`) [B]
`instruments[1..3]`, `method: technical | macro | combined`, `format: standard | weekly-outlook | special`, `bias`,
`timeframe`, `thesis` (≤ 400; the card text), `keyLevels[]` (structured), `bullishScenario`, `bearishScenario`,
`invalidation`, `body`, `priceRef`, `dataAsOf`, `validUntil` (default: by timeframe, e.g. intraday 24 h, swing 7 d),
`stalePolicy: label-dated`.

### 2.5 Weekly Outlook (E; new **format** of Analysis) [B]
`format: weekly-outlook`, `weekOf` (Monday date), `calendarHighlights[]` (Economic Event refs),
`instruments` (the 4–6 covered), a per-instrument `{ bias, levels, scenario }` block and `themes[]`.
Published Sunday or Monday morning; `validUntil` Friday close.

### 2.6 News (E; v2 `NEWS`) [B]
| Field | Rule |
|---|---|
| `whatHappened` | Facts, with source and time (`sources[]` ≥ 1 required) |
| `whyItMatters` | The FOXREX interpretation |
| `marketsAffected` | `[{ symbol, direction?: up\|down\|mixed, note }]` |
| `whatToWatch` | The next trigger or level |
| `importance` | `LOW` \| `MEDIUM` \| `HIGH` (HIGH may be flagged `lead`) |
| `category` | `economy` \| `central-banks` \| `commodities` \| `fx` \| `indices` \| `crypto` \| `geopolitics` |
| `eventTime` | When it happened (not when it was published) |
| `eventRef` | Optional link to an Economic Event |
| `validUntil` | Default 48 h for current-state surfaces |
| `stalePolicy` | `archive-only` |

### 2.7 Economic Event (D + E) [A + B]
- **Data part** (calendar provider, P1): `{ id, country, name, importance, scheduledAt, consensus?, previous?, actual?, unit, source, updatedAt }`.
  **Never typed by hand.**
- **Editorial part** (v2 `EVENT`, the 14:00 "Event of the Day"): `eventRef`, `preview` (what is expected and why it matters),
  `scenarios` (above / in-line / below consensus → market reaction), `instruments`, then `reaction` (added after the release
  as an update).
- `validUntil`: the end of the event day.

### 2.8 Trading Idea (E; **new**) [C]
A published, conditional view. **It is not an order.**
`instruments[1]`, `stance: BUY | SELL | WAIT`, `condition` (what must happen first, e.g. "retest and hold above 2,315"),
`zone`, `invalidation`, `targets[]?`, `timeframe`, `rationale`, `priceRef`, `dataAsOf`, `validUntil`.
`WAIT` is a first-class output: "conditions not met" is information, and it matches the FOXREX WAIT → BUY discipline.

### 2.9 Signal (E; v2 `SIGNAL`, extended) [C]
| Field | Rule |
|---|---|
| `instrument`, `direction` | `BUY` \| `SELL` |
| `entry` | Number or zone `{ from, to }` |
| `stopLoss` | Required, set before entry (existing rule) |
| `targets[1..5]` | — |
| `riskMessage`, `analysisContext` | Required (existing) |
| `riskReward` | Derived by the publisher, never typed |
| `validity` | Expiry instant (v2: free text → ISO) |
| `state` | **new:** `PENDING` (not triggered) → `ACTIVE` (triggered) → `CLOSED` \| `EXPIRED` \| `CANCELLED` |
| `updates[]` | **new:** `{ at, action: triggered\|stop-moved\|partial-close\|closed\|cancelled\|note, value?, note }`; append-only, public |
| `telegramRef` | Optional URL of the original Telegram post (proof of the publication time) |
| `ideaRef` / `analysisRef` | The analysis it came from |

### 2.10 Signal Result (E; v2 `SIGNAL_RESULT`) [C]
`signalId` (required), `direction`, `entry`, `exit`, `outcome` (TARGET_HIT, STOPPED_OUT, BREAKEVEN, CLOSED_MANUALLY, EXPIRED),
`closedAt`, `resultNotes`. **New:** `resultR` (the result in R multiples, derived) and `lessons` (optional).
**Aggregate statistics (win rate, total R) are not published** until an independent verification process exists
(existing policy).

### 2.11 REX Explains (E; v2 `REX_EXPLAINS`, `REX_NOTE`, `ASK_REX`, `LEARN` → **one type with a `format` field**) [B]
`format: explainer | note | qa | lesson`, `topic: basics | technical | macro | risk`, `question` (for `qa`),
`body`, `takeaway` (one sentence), `relatedInstruments[]`, `relatedEventRef?`, `level: beginner | intermediate`.
`trigger` (optional) is the market move that prompted it ("why gold fell today"); when set, the piece also carries
`dataAsOf` and appears in the 19:00 slot. Evergreen lessons have no `validUntil`.
REX speaks **as a teacher, not a forecaster**: REX pieces never carry entries, stops or targets.
**REX is the explanation personality, not a section to fill.** A REX piece is published only when it explains,
teaches, interprets or gives market context that adds value. There is no daily REX quota and no filler.

### 2.12 Market Recap (E; v2 `MARKET_RECAP`) [B]
`howItClosed` (per instrument `{ symbol, move: up|down|flat, note }`, closing prices come from the Market API as `priceRef`),
`whatDrove`, `deskReadCheck` (did this morning's Desk Read hold? a short honest review), `tomorrow` (events and levels).
`validUntil`: next 09:00 IST.

### 2.13 US Session Preview (E; v2 `US_OPEN` → v3 `US_SESSION_PREVIEW`) [B]
`preSessionState` (XAUUSD and majors), `keyLevels`, `catalysts` (US data releases and related events),
`scenarios`, `usSessionOpensAt` (derived, see below), `validUntil` (US cash close, derived).
**It is a preview, not the open.** Times are computed from the New York calendar, not hardcoded in Istanbul time:
the US cash open is 09:30 America/New_York, which is 16:30 IST while the US observes daylight time and 17:30 IST
otherwise (Türkiye has no DST). Actual market-open coverage, when needed, is an event (`EVENT`/`NEWS`) keyed to
that computed time.

---

## 3. Mapping to the current schema (v2 → v3)

| v2 | v3 | Change |
|---|---|---|
| `MORNING_BRIEF`, `MARKET_RECAP`, `EVENT` | same | Structured fields added (deskRead, levels, howItClosed, eventRef) |
| `US_OPEN` | `US_SESSION_PREVIEW` | Renamed; times derived from the New York calendar (DST-aware) |
| `GOLD_FOCUS` | same | Structured levels; technicalContext, macroDriver, validUntil |
| `ANALYSIS` | same + `format` | `weekly-outlook` format; structured levels; method |
| `NEWS` | same | Four-part body (whatHappened / whyItMatters / marketsAffected / whatToWatch) |
| — | `TRADING_IDEA` | **New** (BUY/SELL/WAIT, conditional) |
| `SIGNAL` | same | state + updates[] + validity as ISO + telegramRef |
| `SIGNAL_RESULT` | same | resultR derived |
| `LEARN`, `REX_EXPLAINS`, `REX_NOTE`, `ASK_REX` | `REX_EXPLAINS` + `format` | Merged |
| `REEL`, `STORY`, `CAROUSEL`, `CAMPAIGN` | same, plus `parentId` | Social derivatives link to their parent editorial record |
| (envelope) | `layer`, `access`, `urlPath`, `canonicalUrl`, `archive`, `instruments[]`, `origin`, `lead`, `dataAsOf`, `sourceTimestamp`, `receivedAt`, `priceRef`, `validUntil`, `stalePolicy` | **New** |
| `data/content.json` (single file, ≤ 500 items) | Split feed: `data/feed/latest.json` (current-state surfaces) + per-item static pages + monthly archive indexes | Required for permalinks and an archive |

Integrity rules (enforced by `cms-model.js` + schema), to be extended in v3:
1. No market-sensitive item without `dataAsOf`.
2. `priceRef` is snapshotted, never typed.
3. Signals require `stopLoss` before `entry` can be set.
4. A `lead` story must be HIGH importance or a desk piece.
5. EN and AR versions must keep the protected tokens (symbols, prices, times) identical.
6. Plain text only.
7. `access` must be `PUBLIC` until the owner approves a commercial model (no gated content at launch).
8. `urlPath` and `publishedAt` never change after first publish.
