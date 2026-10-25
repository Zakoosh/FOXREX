# FOXREX Content Backbone v3

**Status:** implemented on `feat/content-backbone-v3` (2026-10-04) and awaiting owner review. No real content is
published. The production feed is v3 and empty.
**Implements:** `FOXREX-WEBSITE-BLUEPRINT.md` §§1, 6–9, 11–12, 14 and `FOXREX-CONTENT-MODEL.md`.
**Related:**
- `CONTENT-ROUTING.md` covers URLs and EN/AR.
- `CONTENT-FRESHNESS.md` covers time and staleness.
- `CONTENT-MIGRATION-V3.md` covers v2 → v3.
- `PUBLISHING.md` covers the engine.

This phase builds the data and content foundation only. There is no visual redesign: static pages build
byte-identically, and generated pages reuse the existing layout and CSS classes.

---

## 1. One contract, three layers

```
Studio record (worker CMS store, private) ── approval ──▶ v3 feed entry (data/content.json, public)
        │                                                      │
        └── studio/cms-model.js: types, layers, validation, routes, entries, integrity ◀──┘
                                                               │
                         tools/site/build.mjs ──▶ permanent pages · archives · sitemap
                         scripts/content/select.js ──▶ listings · homepage contract
```

There is one model. The same `studio/cms-model.js` is loaded by Studio (browser), by the publishing engine (worker),
by the site generator and by the feed checker. Studio and the website do not have separate content models. Legacy
Studio types are mapped explicitly (§3), not through a second model.

| Layer | Question | Where it lives | Types |
|---|---|---|---|
| `MARKET_DATA` | What is happening? | Market API (PR #6), rendered live. **Never in the editorial feed.** | Market Snapshot, Economic Event (data contracts in `scripts/content/freshness.js`) |
| `MARKET_INTELLIGENCE` | Why, and what matters? | Studio → feed | Morning Brief, US Session Preview, Event of the Day, Market Recap, News, Analysis, Weekly Outlook, REX Explains |
| `TRADING_INTELLIGENCE` | What setup or scenario follows? | Studio → feed | Gold Focus (also MI: `layers`), Trading Idea, Signal, Signal Result |

Every entry carries `layer`. Gold Focus also carries `layers: [MI, TI]`. Selectors (`latestByLayer`), integrity checks
(the layer must match the type) and the Studio Publishing panel all read it.

## 2. Storage decision

**Choice:** `data/content.json` (schema **v3**) stays the single canonical store of everything published, in both
languages, plus tombstones of withdrawn items. Pages are derived from it.

Why:
- **Concurrency:** one file means one optimistic-concurrency token (feed version). The existing engine already
  guarantees serial, idempotent and conflict-checked writes to it, and splitting the feed would need a new
  multi-file transaction.
- **Deterministic and inspectable:** same feed, same pages (`build.mjs --check`). It is plain JSON in Git, with
  readable diffs.
- **Schema-validated:** `data/content.schema.json` (v3) plus `feedIntegrity()` run before every write.
- **No private content:** drafts and approvals live in the worker's git-ignored store (`worker/data/cms/`). Only
  PUBLISHED entries reach the repository.
- **No competing database:** pages, listings, archives and the sitemap are generated, never edited by hand.
  `data/generated-content.json` lists the generated files, so a page that no longer belongs to the feed is removed and
  never orphaned.

**Scaling note:** the schema allows 5 000 items. When the file approaches about 2 MB, shard it by month
(`data/feed/<yyyy-mm>.json` plus an index) inside the same publisher transaction. That is a storage change only; the
entry contract does not change.

## 3. Types

| v3 feed type | Studio types that publish it | Layer | Permanent path | Validity window (default) |
|---|---|---|---|---|
| `MORNING_BRIEF` | MORNING_BRIEF | MI | `desk/<date>/morning-brief/` | until next trading day 09:00 IST |
| `GOLD_FOCUS` | GOLD_FOCUS | TI (+MI) | `gold/<date>/` | until next trading day 11:00 IST |
| `EVENT` | EVENT | MI | `desk/<date>/event/` | end of the Istanbul day of the event |
| `US_SESSION_PREVIEW` | US_SESSION_PREVIEW, **US_OPEN (legacy)** | MI | `desk/<date>/us-session-preview/` | US cash close (New York time) |
| `MARKET_RECAP` | MARKET_RECAP | MI | `desk/<date>/market-recap/` | next trading day 09:00 IST |
| `ANALYSIS` | ANALYSIS | MI | `analysis/<slug>/` | by timeframe (H1: 1 d, H4: 3 d, D1: 7 d, W1: 14 d; default 7 d) |
| `WEEKLY_OUTLOOK` | WEEKLY_OUTLOOK | MI | `analysis/<slug>/` (+ `analysis/weekly-outlook/` archive) | 7 d |
| `NEWS` | NEWS | MI | `news/<slug>/` | 48 h (then archive-only) |
| `TRADING_IDEA` | TRADING_IDEA (new) | TI | `signals/<slug>/` | **required** `fields.validUntil` |
| `SIGNAL` | SIGNAL | TI | `signals/<slug>/` | `fields.validUntil` or 7 d |
| `SIGNAL_RESULT` | SIGNAL_RESULT | TI | `signals/results/<slug>/` | none (historical record) |
| `REX_EXPLAINS` | REX_EXPLAINS, **LEARN / REX_NOTE / ASK_REX (legacy)** | MI | `format` `note` → `desk/<date>/rex-note/`; `lesson` / `explainer` / `qa` → `learn/<slug>/` | note 24 h; others evergreen |

Social-only types (`REEL`, `STORY`, `CAROUSEL`, `CAMPAIGN`) are Studio records with `website: false`. They have no
route, never enter the feed, and the feed integrity rules reject them.

## 4. The v3 entry (public)

**Common fields (always present):**
- **Identity and placement:** `id`, `type`, `layer`, `language`, `translationGroupId`, `section`, `slug`, `urlPath`.
- **Text:** `title`, `summary`.
- **Publication:** `publishedAt` (first publication, permanent), `updatedAt`, `publishVersion`, `editorialDate` (the
  route date, in Istanbul time).
- **Rights and provenance:**
  - `access`: `PUBLIC` only for now.
  - `origin`: `studio` or `migration-v2`.
  - `attribution`: `{ byline, assistance }`.

**Optional fields (only when meaningful):**
- **Classification:** `layers`, `format`, `legacyType`, `slot`, `body`, `symbol`, `market`, `category`, `bias`,
  `instruments[]`, `timeframes[]`, `tags[]`.
- **Placement:** `lead` (the desk's current lead story).
- **Media and SEO:** `image`, `seo`.
- **Sources and risk:** `sources[]`, `riskDisclosure`.
- **Authorship:** `author` (set only from an editor-entered byline; never invented).
- **Freshness and price:** `freshness` (see `CONTENT-FRESHNESS.md`), `priceRef`.

**Type-specific fields** keep their v2 names, so existing renderers keep working:
- **Gold Focus:** levels and scenarios.
- **Analysis and Weekly Outlook:** key levels and scenarios.
- **Trading Idea:** `stance`, `condition`, `zone`, `invalidation`, `targets`, `rationale`.
- **Signal:** entry, stop and targets.
- **Signal Result:** outcome.
- **Morning Brief:** `deskRead` with `regime`, `usd`, `yields`, `volatility`, `nextEvent`.
- **REX Explains:** `takeaway`.

**Sources** follow `{ name, url?, publisher?, publishedAt?, retrievedAt?, sourceType? }`.
- `sourceType` is one of: official, market-data-provider, central-bank, government, exchange, broker, news,
  internal-analysis.
- News and Event entries need at least one **external** source with an https URL. `internal-analysis` does not count.
- A price needs its source and observation time.
- Sources are never invented, and AI-generated news is never publishable.

**Access:** the `access` field reserves `MEMBER` and `PREMIUM`. Validation, the publisher and the feed integrity rules
all refuse anything except `PUBLIC`. There is no paywall, no pricing and no gated URL, and URLs will not depend on the
tier when one exists.

## 5. Validation layers

1. `validateRecord(r, 'draft' | 'publish')` in Studio and the worker. It applies type-specific rules:
   - **Gold Focus:** levels and both scenarios.
   - **Trading Idea:** a stance; a zone unless WAIT; condition, invalidation, rationale and validUntil.
   - **Weekly Outlook:** a body.
   - **Signal:** the stop on the correct side of entry.
   - **All types:** reserved slugs, https-only sources, plain text only.
2. `publishGate` and the publisher's `buildEntry` add approval, the permanent URL, collisions and EN/AR slug pairing.
3. `data/content.schema.json`: a `oneOf` per type on the candidate feed.
4. `feedIntegrity`:
   - unique ids, unique `language + urlPath`, and one path per translation group;
   - route shape and editorial date, and layer and section matching the type;
   - signal references, PUBLIC only, no markup, https sources;
   - no fixtures, no future items.

## 6. Selectors and the homepage contract

Implemented in `scripts/content/select.js` (UMD: Node and browser).
- **Selectors:** `publishedForLanguage`, `latestByType`, `latestByLayer`, `latestByInstrument`, `latestByTag`,
  `latestBySection`, `publishedBetween`, `todayInIstanbul`, `latestMorningBrief`, `latestMarketRecap`,
  `currentGoldFocus`, `translationOf`, `alternatesFor`, `archives`, `archiveByMonth`.
- **One canonical item, many placements:** every placement is the same entry, selected by query. Nothing is
  duplicated.

`homepage(feed, { lang, now, quotes })` returns `foxrex.homepage.v1`. An optional key is **omitted** when it has
nothing current.

| Key | Selection |
|---|---|
| `marketPulse` | Market API quotes whose status is LIVE, FRESH or AGING. Omitted when no provider is connected. |
| `leadStory` | The newest `lead` item that is FRESH or AGING; else today's newest desk piece; else a still-valid HIGH news item |
| `today` | Today's (Istanbul) published desk pieces in slot order, plus upcoming always-on slots as times only, plus `usSession` (New York-computed) |
| `morningBrief` / `deskRead` | Today's Morning Brief while valid, and its `deskRead` |
| `goldFocus` | `{ item, freshness, current }`. Past its validity it is `dated: true` (never presented as today's) for up to 7 days, then omitted. |
| `tradingIntelligence` | Valid trading ideas and signals, plus the latest result from the last 7 days |
| `latestAnalysis` | Analysis and Weekly Outlook items from the last 7 days |
| `importantNews` | News from the last 48 h, HIGH impact first |
| `rexExplains` | A REX note still valid today. No evergreen filler. |
| `absent` | Internal reason per omitted key: `NO_CONTENT`, `STALE_CONTENT`, `DATA_UNAVAILABLE` or `NOT_YET_DUE`. For diagnostics only; never rendered as visitor copy. |

The current homepage is unchanged in this phase. The contract is what the homepage restructure will consume next.

## 7. Studio compatibility

- **New types in the editor:** US Session Preview, Weekly Outlook, Trading Idea, and REX Explains with a format field.
  Legacy types stay editable and filterable, and publish as their v3 type.
- **New fields:** freshness (`dataAsOf`, `validUntil`), Desk Read, byline, lead, source publisher and source type.
- **New displays:** the layer and the permanent URL appear in the editor and the publish preview.
- **Slug lock:** once published, the slug is locked (`409 SLUG_LOCKED`). Titles can change freely without changing
  identity.
- **No redesign:** these are fields in the existing form only.

## 8. Publishing compatibility

The lifecycle is unchanged: `IDEA → DRAFT → REVIEW → APPROVED → SCHEDULED → PUBLISHED → ARCHIVED`. Approval is
recorded server-side, AI produces drafts only, and approval never survives an edit.

**What the engine adds:**
- The permanent URL is computed (and reused) at publication.
- After the feed is written, `tools/site/build.mjs` generates the pages.
- The feed and all generated files are committed in **one** commit, which carries a `Permanent-Url` trailer.

**What is preserved:**
- **Idempotency:** an idempotency key on every publish.
- **Concurrency:** the feed version must match, otherwise the publish fails with 409.
- **Dry run:** it now also reports the page plan, and still writes nothing.
- **Versioning:** each republish increments the publish version.
- **Audit trail:** unchanged.
- **Transactional rollback:** a generator, commit or push failure resets the repository and removes the generated
  files. The record stays APPROVED for retry.
- **Unpublish:** writes a tombstone. The URL serves a noindex "withdrawn" notice, and the item leaves listings and the
  sitemap.

## 9. Files

| File | Role |
|---|---|
| `studio/cms-model.js` | Types, layers, routes, validation, v3 entries, feed integrity, v2 → v3 mapping (shared) |
| `scripts/content/time.js` | Istanbul editorial day, desk slots, New York session (DST), market sessions |
| `scripts/content/freshness.js` | Freshness statuses, thresholds, validity defaults, Market Snapshot and Economic Event contracts |
| `scripts/content/select.js` | Selectors, homepage contract, archives |
| `worker/src/content-v3.js` | Publisher entry builder (permanent identity, collisions, validity) |
| `tools/site/content-pages.mjs` | Item, withdrawn and archive pages (escaped, deterministic) |
| `tools/site/build.mjs` | Static build with `--feed`, `--out`, `--plan` and `--check`, plus the generated-files manifest |
| `tools/content/migrate-v2-v3.mjs` | Migration CLI (`CONTENT-MIGRATION-V3.md`) |
| `scripts/public/item.js` | Item page: shows the dated notice once `validUntil` has passed |
| `data/content.schema.json` / `data/content.schema.v2.json` | v3 schema / v2 schema (migration input) |
| `worker/test/fixtures/content-v3.mjs` | TEST fixtures (test-only) |
