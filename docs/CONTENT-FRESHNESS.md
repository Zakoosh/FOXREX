# FOXREX Content Freshness — time, staleness, and never showing stale as current

Implemented in `scripts/content/time.js` and `scripts/content/freshness.js` (UMD: Node and browser).

## 1. Fields

| Field | Where | Meaning |
|---|---|---|
| `dataAsOf` | `entry.freshness`, quotes | When the stated value or levels were true. Basis: `editor`, `price-snapshot`, `publication` or `migration` |
| `sourceTimestamp` | quotes, `priceRef`, `freshness` | Time given by the **source** (provider tick, release time). Age is measured from this. |
| `receivedAt` | quotes | When FOXREX received it. It detects transport delay and frozen feeds and never resets the age. |
| `validUntil` | `entry.freshness` | After this the item is never presented as current |
| `stalePolicy` | `entry.freshness` | What current-state surfaces do once STALE: `hide`, `label-dated` or `archive-only` |
| `freshnessStatus` | computed only | `LIVE` · `FRESH` · `AGING` · `STALE` · `UNAVAILABLE`. It is never stored by hand. |
| `marketState` | computed / provider | `OPEN`, `CLOSED` or `UNKNOWN`. It is **separate** from freshness. |

## 2. Status rules

**Quotes** (`quoteFreshness`):
- A missing or invalid value, a missing source time, a source time more than 10 s in the future, or an unknown asset
  class → **UNAVAILABLE** (with a reason).
- **Market CLOSED:** the last value is **AGING** for `closedAgingMs` (a weekend), then **STALE**. *A closed market
  is not stale.*
- **Market OPEN:**
  - age ≤ `liveMs` **and** a real-time entitlement → **LIVE**;
  - age ≤ `freshMs` → **FRESH** (delayed entitlements stop here and are never LIVE);
  - age ≤ `staleMs` → **AGING**;
  - beyond that → **STALE**.

**Default thresholds** (configurable through `overrides` per class, data type or `dataType:class`):

| Class | LIVE ≤ | FRESH ≤ | STALE after | Closed: AGING for | Symbols |
|---|---|---|---|---|---|
| fx | 60 s | 5 min | 20 min | 72 h | EURUSD, GBPUSD, USDJPY, … |
| metal | 60 s | 5 min | 20 min | 72 h | XAUUSD, XAGUSD |
| index / energy | 120 s | 5 min | 20 min | 72 h | DXY, US30, NAS100, SPX500, GER40 / WTI, BRENT |
| crypto | 60 s | 2 min | 10 min | — (24/7) | BTCUSD, ETHUSD |
| rates | 5 min | 15 min | 60 min | 72 h | US10Y (no source yet) |
| data type `calendar` | — | 24 h | 7 d | — | economic calendar |

**Market sessions** are computed from the New York trading week:
- **FX:** Sunday 17:00 to Friday 17:00 New York time.
- **Metals, indices and energy:** Sunday 18:00 to Friday 17:00, with a daily 17:00–18:00 break.
- **Crypto:** 24/7.

Holidays are not modelled, so quotes on a holiday age into STALE and are never shown as LIVE.

**Editorial items** (`itemFreshness`) are **never LIVE**:
- An item with no `validUntil` is evergreen and stays **FRESH**.
- Otherwise it is **FRESH** until half of its validity window, then **AGING** until `validUntil`, then **STALE**.

**Display** (`display(status)`):
- Quote styling (large number, tick colour, live dot) is used only for LIVE and FRESH.
- AGING shows the value and the time, de-emphasised.
- STALE never shows the value as a quote; at most "last value at <time>" in plain text.
- UNAVAILABLE shows nothing: no dashes and no "feed unavailable".

**PR #6 mapping** (`fromMarketApi`):

| Market Data Layer status | Public status |
|---|---|
| LIVE | LIVE |
| DELAYED | FRESH or AGING, by age |
| STALE | STALE |
| MARKET_CLOSED | AGING or STALE, with `marketState` CLOSED |
| UNAVAILABLE | UNAVAILABLE (with the provider's reason) |

PR #6 itself is not changed.

## 3. Validity defaults (editorial)

`defaultValidity(type, …)` computes the window. An editor-entered `fields.validUntil` always wins.

| Type | Default `validUntil` |
|---|---|
| Morning Brief | next trading day 09:00 IST |
| Gold Focus | next trading day 11:00 IST (Friday → Monday) |
| Market Recap | next trading day 09:00 IST |
| US Session Preview | US cash close (16:00 New York, DST-aware) |
| Event of the Day | end of the Istanbul day |
| News | 48 h |
| Analysis | by timeframe (1–30 d, default 7 d) |
| Weekly Outlook | 7 d |
| Signal | 7 d |
| REX note | 24 h |
| Trading Idea | no default: the editor must set it |

REX lessons, explainers, Q&A and Signal Results are evergreen.

**Where staleness is decided:**
- The static page is built once, so the **browser** decides staleness. `scripts/public/item.js` reveals the dated
  notice ("This Gold Focus is from …; its levels and conditions may no longer apply") once `validUntil` has passed.
- Without JavaScript, the "Levels as of <exact time> IST" line is still true.
- The client renderer labels a Gold Focus that is past its validity as "Last Gold Focus", never as today's.

## 4. Istanbul editorial day and the New York clock

**Istanbul (the editorial day):**
- The editorial date is the calendar day in Europe/Istanbul (UTC+3 all year), never the UTC day. 21:00Z is already
  the next editorial day.
- Desk slots in Istanbul wall time:
  - Morning Brief 09:00
  - Gold Focus 11:00
  - Event of the Day 14:00 (conditional)
  - US Session Preview 15:30
  - REX Note 19:00 (conditional)
  - Market Recap 22:30

**New York (US market events):**
- Anything tied to New York is computed in America/New_York and shown in Istanbul time (`usSession`).
- US data at 08:30 New York is 15:30 IST during US daylight time and 16:30 IST otherwise.
- The US cash open at 09:30 New York is **16:30 / 17:30 IST**.
- **15:30 IST is the US Session Preview, never "the open".** The preview page states the computed open time.
- DST is resolved through `Intl`, never hardcoded. The tests cover both transitions (8 Mar and 1 Nov 2026) and the
  spring-forward gap.

## 5. Layer A data contracts

- **Market Snapshot** (`validateMarketSnapshot`) requires:
  - a symbol and a positive price;
  - the `sourceTimestamp` and the `source` attribution;
  - optionally `receivedAt` and `marketState`.
- **Economic Event** (`validateEconomicEvent`) requires:
  - an id, a name, `scheduledAt` (UTC) and the market `timezone`;
  - an importance;
  - a source with an https URL;
  - an actual figure only together with `releasedAt`.

These are contracts only. No provider is connected and no value is fabricated. Live widgets stay omitted until a
provider is verified (PR #6 plus credentials).
