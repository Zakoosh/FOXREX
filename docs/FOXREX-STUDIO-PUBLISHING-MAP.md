# FOXREX — Studio → Website Publishing Map

**Status:** CONTRACT DESIGN ONLY, 2026-10-04. **Not implemented.** The current engine (`PUBLISHING.md`) publishes v2
items into `data/content.json` with page-level destinations and no per-item URLs. This document defines the v3 contract
the engine should implement next. No publishing behaviour changes until the owner approves it.

---

## 1. Lifecycle (unchanged, already implemented)

```
IDEA → DRAFT → REVIEW → APPROVED → SCHEDULED → PUBLISHED → ARCHIVED
                 ▲          │           │           │
                 └─ reject ─┘     unschedule        └─ unpublish → ARCHIVED (URL kept, see §5)
any edit to REVIEW / APPROVED / SCHEDULED / PUBLISHED → back to DRAFT, approval cleared (live version keeps serving)
```

| State | Meaning | Visible on site? |
|---|---|---|
| IDEA | Slot or topic reserved (e.g. tomorrow's Event of the Day) | No |
| DRAFT | Being written; AI drafts and translations land here only | No |
| REVIEW | Complete, validated, waiting for a named reviewer | No |
| APPROVED | Approved by a named operator (`approvedBy`) | No |
| SCHEDULED | Approved and given a future IST time; publishes once due (manual confirm while `SCHEDULER_ENABLED=false`) | No |
| PUBLISHED | In the public feed with a permalink | **Yes** |
| ARCHIVED | Withdrawn or expired. History is kept | Permalink kept with an "archived" or "withdrawn" notice (§5) |

The rules stay as they are: Save ≠ Approve ≠ Publish. No AI approval path. Each language is approved on its own.

## 2. Type → website destination (v3 contract)

`canonical` is the item's single permalink. `surfaces` are the lists and hubs that show it, and they are derived; they
are never separate copies.

| Studio type | Canonical URL (EN; AR = `/ar` + same) | Surfaces (lists / hubs / homepage) | Telegram derivative | Social derivative |
|---|---|---|---|---|
| `MORNING_BRIEF` | `/desk/<date>/morning-brief/` | Home 02 lead, 03 timeline, 06 Desk Read · `/desk/` | Yes | Optional card |
| `GOLD_FOCUS` | `/gold/<date>/` | Home 04 · `/gold/` (current + archive) · Home 03 | Yes (no entries/stops) | Levels card |
| `EVENT` | `/desk/<date>/event/` | Home 03 (+02 on the day) · `/news/?f=high-impact` · `/calendar/` (P1) | Yes | Story card |
| `US_OPEN` | `/desk/<date>/us-open/` | Home 03 (+02 if lead) · `/desk/` | Yes | Optional |
| `MARKET_RECAP` | `/desk/<date>/market-recap/` | Home 02/03 overnight · `/desk/` | Yes | Optional |
| `NEWS` | `/news/<slug>/` | Home 02 (if lead) / 07 · `/news/` · `/markets/<symbol>/` (P1) | Yes (primary for breaking) | Major only |
| `ANALYSIS` | `/analysis/<slug>/` | Home 05 · `/analysis/` · `/gold/` if XAUUSD · `/markets/<symbol>/` (P1) | Yes (summary) | Optional |
| `ANALYSIS` `format=weekly-outlook` *(P1)* | `/analysis/<slug>/` | `/analysis/weekly-outlook/` · Home 05 pinned on Mon | Yes | Carousel |
| `TRADING_IDEA` *(new)* | `/signals/<id>/` (P1; before that, anchor on `/signals/`) | Home 08 · `/signals/` | Yes (signal channel) | No |
| `SIGNAL` | `/signals/<id>/` (P1; before that `/signals/#<id>`) | Home 08 · `/signals/` | Yes (signal channel, always with stop + risk) | **No** |
| `SIGNAL_RESULT` | the parent signal's URL (a result is a state of the signal) | `/signals/` recent outcomes · `/signals/results/` (P1) | Yes (update post) | **No** |
| `REX_EXPLAINS` `format=note` | `/desk/<date>/rex-note/` | Home 09 · `/learn/` latest | Yes | **REX reel/carousel** |
| `REX_EXPLAINS` `format=lesson` | `/learn/<slug>/` | Home 09 evergreen · `/learn/` by topic | When new | Carousel |
| `REX_EXPLAINS` `format=qa` (Ask REX, P1) | `/learn/<slug>/` | `/learn/` | Yes | Optional |
| `REEL` · `STORY` · `CAROUSEL` · `CAMPAIGN` | **none: social only, never on the website** (existing rule) | — | — | itself |

**Legacy mapping:** v2 `LEARN`, `REX_NOTE` and `ASK_REX` become `REX_EXPLAINS` with `format` lesson / note / qa. The v2
`PAGE_PATH` list (home, gold, analysis, news, learn, signals) becomes the derived `surfaces`.

## 3. Homepage slot resolution (deterministic, no manual placement)

The homepage is computed from published items. Nobody hand-places items.

| Home section | Rule |
|---|---|
| 02 What Matters Now | The newest item with `lead=true` whose `validUntil` has not passed; else the newest desk item from today; else hidden |
| 03 Today at FOXREX | Today's (IST) desk items in slot order; future slots show their time only; missed slots are omitted |
| 04 Gold Focus | The newest `GOLD_FOCUS`; if `validUntil` has passed → "Last Gold Focus: <date>" label; none → hidden |
| 05 Latest Analysis | The 3–4 newest `ANALYSIS` from the last 7 days |
| 06 Desk Read | `deskRead` from today's `MORNING_BRIEF`; otherwise hidden |
| 07 News That Matters | The 3–5 newest `NEWS` from the last 48 h, high impact first |
| 08 Signals & Ideas | Active `SIGNAL` / `TRADING_IDEA`, then the most recent result |
| 09 REX Explains | The newest `REX_EXPLAINS` note + 2 evergreen lessons |

The **lead** flag is an editorial field set at approval time, so the desk can choose the lead without touching layout.

## 4. What the engine must produce per publication (contract)

For every PUBLISH of item `X` (language `L`):
1. **Feed entries** (v3 split feed, see `FOXREX-CONTENT-MODEL.md` §3):
   - `data/feed/latest.json` holds the newest N per surface. This is what the homepage and hubs read.
   - `data/feed/<yyyy-mm>.json` is the monthly archive (append).
   - `data/items/<L>/<urlPath>.json` holds the full item.
2. **Static permalink page** at `urlPath` (and `/ar/` + `urlPath` for AR), pre-rendered with title, description,
   canonical, `hreflang` pair, Open Graph and `NewsArticle`/`Article` JSON-LD, so it is crawlable without JavaScript.
3. **Sitemap** update: `sitemap.xml` (and `/ar/` entries) with `lastmod`.
4. **Derivative payloads** (not sent yet): a Telegram text rendered from structured fields + permalink, stored with the
   publication record for the operator to post. **Automatic Telegram/social posting is out of scope** until the owner
   approves it.
5. The **commit trailers and audit log** stay as they are today (`Content-Id`, `Publish-Version`, `Publication-Id`,
   `Approved-By`, `Published-By`).

Validation additions for v3: `urlPath` is unique and immutable after first publish; `slug` is lowercase Latin
`[a-z0-9-]`; market-sensitive types require `dataAsOf` + `validUntil` + `stalePolicy`; `priceRef` only comes from a
data snapshot (never free text); an EN/AR pair shares `urlPath`.

## 5. Archive, unpublish and corrections

- **Permalinks never 404 once published.** Unpublishing keeps the URL with a "This item was withdrawn on <date>" notice
  and removes it from every surface. Withdrawals for legal reasons can use a full takedown (owner decision).
- **Corrections:** republishing a substantive change adds a visible "Updated <time>: <what changed>" line. Typos do not.
- **Expiry is not archival.** An expired Gold Focus stays at its permalink as a dated record; it just stops being "current".
- **Signals** are never deleted. A cancelled signal stays with its status, which keeps results honest.

## 6. Not implemented (explicitly)

- No change to `studio/cms-model.js`, the worker, the feed schema or the site build in this phase.
- No automatic scheduler, Telegram bot posting or social posting.
- No per-item pages yet. They are the first P0 build item once this contract is approved (`FOXREX-LAUNCH-CONTENT-PLAN.md`).
