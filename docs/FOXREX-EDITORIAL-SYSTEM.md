# FOXREX — Daily Editorial System

**Status:** planning proposal for owner review, 2026-10-04. Nothing here is implemented beyond what the current Studio
already supports (see `PUBLISHING.md`).
**Timezone:** every time is **Europe/Istanbul** (UTC+3 all year). Storage is UTC.
Related: `FOXREX-CONTENT-MODEL.md` (fields), `FOXREX-STUDIO-PUBLISHING-MAP.md` (lifecycle and destinations).

---

## 1. One content system, not three workflows

```
             ┌──────────────────────────── ONE CANONICAL ITEM (Studio record, EN + AR pair) ────────────────────────────┐
 inputs ───▶ │ structured fields (bias, levels, scenarios, sources, dataAsOf…) + body + summary + lead + social block  │
             └───────────────┬──────────────────────────────┬─────────────────────────────────┬────────────────────────┘
                             │                              │                                 │
                     WEBSITE (canonical)            TELEGRAM (derivative)             SOCIAL (derivative)
                     permalink + hub + home slot    short post + link to permalink    caption / card / reel script
```

- **The website item is the source of truth.** Telegram and social posts are *derived from* the approved item, rendered
  from its structured fields, and always link back to the permalink.
- **A derivative never states anything that is not in the approved canonical item** (no new levels, no new claims).
- **One approval covers the canonical item.** A derivative that only re-renders approved fields needs no second
  approval. A derivative with new wording (a reel script, a campaign) is its own Studio record (`REEL`, `STORY`,
  `CAROUSEL`, `CAMPAIGN`) with its own review. Those social-only types never reach the website.
- **EN and AR are produced together** as a `translationGroupId` pair, and each language is approved on its own
  (`FOXREX-SITEMAP.md` §3).

## 2. The daily cycle (trading days, Monday–Friday)

| Time (IST) | Slot | Type | Website destination | Always? |
|---|---|---|---|---|
| **09:00** | Morning Brief | `MORNING_BRIEF` | `/desk/<date>/morning-brief/` · Home 02/03/06 | Every trading day |
| **11:00** | Gold Focus | `GOLD_FOCUS` | `/gold/<date>/` · `/gold/` · Home 04 | Every trading day |
| **14:00** | Event of the Day | `EVENT` | `/desk/<date>/event/` · Home 03 · `/news/` filter | **Only when a high-impact event is scheduled** |
| **15:30** | US Open | `US_OPEN` | `/desk/<date>/us-open/` · Home 03 | Every US trading day |
| realtime | Breaking / Data Released | `NEWS` (`breaking=true`) | `/news/<slug>/` · Home 02 (as lead) / 07 | When it happens and matters |
| **19:00** | REX Explains / REX Note | `REX_EXPLAINS` (`format=note`) | `/desk/<date>/rex-note/` → canonical `/learn/<slug>/` when evergreen · Home 09 | Every trading day |
| **22:30** | Market Recap | `MARKET_RECAP` | `/desk/<date>/market-recap/` · Home 02/03 | Every trading day |
| Sunday 20:00 | Weekly Outlook *(P1)* | `ANALYSIS` (`format=weekly-outlook`) | `/analysis/<slug>/` · `/analysis/weekly-outlook/` | Weekly |

Weekend: no desk slots. Crypto news can still publish as `NEWS`. The homepage shows Friday's Recap, labelled with its date.

**Missed slot rule.** If a slot is not published within its window (90 minutes for scheduled slots), it is **skipped,
not back-filled**. The homepage timeline simply does not show it. A late Morning Brief at 13:00 would be stale and
misleading.

## 3. Slot specifications

Every slot below follows the same pattern: purpose, inputs, output, template, responsible system, website placement and
derivatives. "Desk" means the human editor (operator) in Studio. "Assist" means AI-assisted drafting, which is only
ever a DRAFT and always human-reviewed. "Data" means the Market Data API (PR #6, once a provider is connected).

### 3.1 09:00 — Morning Brief
- **Purpose:** set the day. What happened overnight, what matters today, what to watch.
- **Inputs:** overnight moves (Data snapshot, or desk-noted levels with source and time); economic calendar for today;
  overnight headlines (sourced); yesterday's Recap "what to watch".
- **Output:** one `MORNING_BRIEF` item (EN + AR).
- **Template:**
  1. Headline (the day in one line)
  2. **Lead:** the dominant story + why it matters (2–3 sentences)
  3. **Desk Read** (structured): regime · USD · yields · volatility · next high-impact event, each with a one-line read
  4. Key levels to watch (structured, with `dataAsOf`)
  5. Today's calendar (time IST · event · why it matters)
  6. What would change the view
  7. Risk line
- **Responsible system:** Desk writes, Assist may draft from sourced inputs, Data supplies the snapshot. Approved in Studio.
- **Website:** `/desk/<date>/morning-brief/`. Becomes Home 02 lead (until a newer lead exists), fills Home 06 Desk Read,
  and is the first item in Home 03.
- **Telegram:** 5–7 lines: headline · lead sentence · 3 levels · next event time · link.
- **Social:** carousel or story card "Today at FOXREX" (lead + 3 things to watch) linking to the site.

### 3.2 11:00 — Gold Focus
- **Purpose:** the anchor instrument, fully structured.
- **Inputs:** XAUUSD price snapshot (Data, frozen into `priceRef`); gold drivers (USD, real yields, risk sentiment,
  flows); the desk's chart read.
- **Output:** one `GOLD_FOCUS` item.
- **Template:** market state · trend/bias · key support · important level · key resistance · bullish scenario · bearish
  scenario · technical context · macro driver · invalidation · "levels as of <time>, source" · risk line.
- **Responsible system:** Desk (the analysis); Data (snapshot only). Studio validation already enforces the required fields.
- **Website:** `/gold/<date>/` (canonical), shown on `/gold/` and Home 04. Valid until the next Gold Focus or
  `validUntil`. After that it is labelled "Last Gold Focus: <date>".
- **Telegram:** bias · support/resistance · invalidation · link. **No entries and no stops**: a Gold Focus is analysis,
  not a signal.
- **Social:** a levels card (bias + 3 levels + "as of" time) and an optional short reel script (separate `REEL` record).

### 3.3 14:00 — Event of the Day (only when relevant)
- **Purpose:** prepare readers for a scheduled high-impact release (CPI, NFP, FOMC, ECB, BoE…).
- **Trigger:** a high-impact event in today's calendar that affects a covered instrument. **No event means no slot.** The
  slot is never filled with filler.
- **Inputs:** the event (time, previous, consensus, source); the instruments affected; the desk's scenarios.
- **Output:** one `EVENT` item. After the release, the actual figure is a **News** item ("Data Released") that links back.
- **Template:** what is released and when (IST) · previous / consensus (sourced) · why it matters · markets affected ·
  scenarios (above / in line / below consensus) · what to watch after the release · risk line.
- **Responsible system:** Desk + Data (calendar, P1). Until a calendar source exists, the desk enters the event with a
  source URL (already required by validation).
- **Website:** `/desk/<date>/event/` + the `/news/` "high impact" filter + Home 03 (and Home 02 lead on the day).
- **Telegram:** "Today 15:30 IST: US CPI. Consensus X (source). Why it matters…" + link.
- **Social:** a story countdown card (time + why it matters).

### 3.4 15:30 — US Open
- **Purpose:** what changed since the morning, going into the New York session.
- **Timing note (owner decision):** the US cash equity open is 16:30 IST while the US is on daylight time and 17:30 IST
  in winter. 15:30 IST matches the 08:30 ET US data releases (summer). So 15:30 is a **US session preview**, not the
  open. Keep 15:30 and frame it as "into the US session", or move the slot to follow the open by 15 minutes.
- **Inputs:** moves since the Morning Brief (Data snapshot); any releases (News items); index futures and USD state.
- **Output:** one `US_OPEN` item.
- **Template:** headline · what changed since 09:00 · the Morning Brief view: still valid or revised (explicitly) ·
  levels into the open (with `dataAsOf`) · what to watch for the rest of the session · risk line.
- **Responsible system:** Desk + Data.
- **Website:** `/desk/<date>/us-open/` · Home 03 · becomes Home 02 lead if it supersedes the Morning Brief lead.
- **Telegram:** 4–5 lines + link.
- **Social:** optional. Not every slot needs a social derivative.

### 3.5 Realtime — Breaking / Data Released
- **Purpose:** report the facts quickly, with the FOXREX lens.
- **Trigger:** a scheduled release has printed, or unscheduled news moves a covered market. **Not** every headline:
  only items that pass the "does this matter to our instruments?" test.
- **Inputs:** a primary source (official release, central bank, reputable wire), its time, and the market reaction
  (Data snapshot).
- **Output:** one `NEWS` item with `breaking=true` (EN and AR may publish minutes apart; each is approved on its own).
- **Template (mandatory four parts):** what happened (with figure vs consensus and source time) · why it matters ·
  markets affected · what to watch next.
- **Responsible system:** Desk. Assist may draft from the sourced release. **AI-generated news is never publishable**
  (existing rule). It needs a source name and `https://` URL.
- **Website:** `/news/<slug>/` · Home 02 (lead while it is the dominant story) and Home 07.
- **Telegram:** **primary channel for speed.** The figure, a one-line why-it-matters, and the link.
- **Social:** only for major events (a story card).

### 3.6 19:00 — REX Explains / REX Note
- **Purpose:** explain *why* something happened today, in REX's voice, educational and not advisory.
- **Inputs:** today's dominant move (from the Brief, Gold Focus or News); the relevant lesson topic.
- **Output:** one `REX_EXPLAINS` item, `format=note` (tied to today) or `format=lesson` (evergreen).
- **Template:** the question ("Why did gold fall today?") · the short answer · the mechanism explained simply · what to
  watch next time · link to the evergreen lesson · a "REX explains, he does not advise" line.
- **Rules:** REX never gives entries, stops, targets or trade instructions. He references the desk's analysis by link.
  REX is the existing approved REX-MASTER identity; nothing here changes him.
- **Responsible system:** Desk (REX voice guide) + Assist draft.
- **Website:** `/desk/<date>/rex-note/` · Home 09. A note that becomes evergreen is promoted to `/learn/<slug>/`, which
  becomes the canonical URL, and the desk URL then redirects there.
- **Telegram:** the question + the one-line answer + link.
- **Social:** **the strongest social format.** A REX reel/carousel script (separate `REEL` or `CAROUSEL` record) built
  from the approved note.

### 3.7 22:30 — Market Recap
- **Purpose:** close the day honestly. What happened, and was the morning view right?
- **Inputs:** closing snapshot (Data); the day's desk items; the Morning Brief Desk Read.
- **Output:** one `MARKET_RECAP` item.
- **Template:** headline · what happened (3–5 bullets, with instruments) · **Desk Read check** (morning read vs outcome:
  right, wrong or mixed, stated plainly) · signal/idea updates (link only) · what to watch tomorrow · risk line.
- **Responsible system:** Desk + Data.
- **Website:** `/desk/<date>/market-recap/` · Home 02/03 overnight.
- **Telegram:** the day in three lines + tomorrow's key event + link.
- **Social:** optional daily "day in 3" card.

### 3.8 Signals and Trading Ideas (not slot-bound)
- Published **when there is a setup, never to a quota.** A `SIGNAL` carries entry, stop, targets, risk and context
  (existing validation). A `TRADING_IDEA` (new type) may say **WAIT**.
- Updates (stop moved, target hit, cancelled) append to the signal's `updates[]`. Closing creates a `SIGNAL_RESULT`.
- **Website:** `/signals/` (and `/signals/<id>/`, P1). **Telegram:** the signal channel, where a post always includes
  the stop and a risk line and links to `/signals/methodology/`.
- No win rates, profit totals or performance claims anywhere (existing rule).

## 4. Live data vs editorial intelligence (Phase 9)

Two layers that never mix in storage:

| | **Live / structured market data** | **Editorial intelligence** |
|---|---|---|
| What | Quotes, change, freshness, calendar events (P1), candles (later) | Briefs, Gold Focus, analysis, news, REX, signals |
| Source | Market Data API (PR #6): provider → quality gate → `/api/market/*` | Studio records → approval → publishing engine → static feed |
| Updates | Continuously, in the browser via the API | Only when a human publishes |
| Shown as | Values with **source · time · state** (LIVE / DELAYED / STALE / CLOSED / UNAVAILABLE) | Text with its **published time** and **"levels as of"** time |
| Stored in | Not in the repo, not in the CMS | `data/content.json` (v3: split feed) |

**Rules:**
1. **No live-looking value is ever typed into editorial HTML or body text.** A price in editorial content is a
   *snapshot reference* (`priceRef` = value + source + `dataAsOf`) and is always displayed with its "as of" time.
2. **Live values are rendered only by the data layer**, client-side, from the API, with their freshness state.
3. **A level is analysis, not a price.** Support/resistance/entry/stop are the desk's numbers, labelled as levels.
4. **If the provider is not connected, live widgets are hidden**, not filled with dashes, demo values or the last
   editorial number.
5. **Stale editorial is labelled, never promoted.** Each market-sensitive type has `validUntil` and a `stalePolicy`
   (hide / label with date / archive-only) — see `FOXREX-CONTENT-MODEL.md` §1.1.
6. **Never display stale information as current information.** The homepage decides "current" from `validUntil` and
   the data layer's freshness, not from position on the page.

## 5. Volume and staffing reality check

A full trading day is 5 scheduled desk items + 0–1 event + 0–n news, × 2 languages ≈ **12–16 approvals per day**. That
is a lot for one operator. Recommendation for launch:
- **Minimum daily commitment (P0):** Morning Brief, Gold Focus, Market Recap, plus News when it matters.
- **Add when capacity allows (P1):** US Open, REX Note daily, Event of the Day.
- Better to publish three reliable slots every day than seven slots irregularly. The homepage collapses missing slots,
  so the commitment can grow without redesign.
