# FOXREX — Information Architecture

**Status:** revised after owner decisions, 2026-10-04 (direction approved; see `FOXREX-WEBSITE-BLUEPRINT.md` §0). It
defines structure only, not visual design.
Related documents: `FOXREX-SITEMAP.md` (URLs), `FOXREX-CONTENT-MODEL.md` (types), `FOXREX-LAUNCH-CONTENT-PLAN.md` (priorities).

---

## 1. What the website is

FOXREX is a **live financial publication** for market and trading intelligence, organised around a daily editorial
desk. Launch coverage is **gold, FX and major macro events**, for a primary audience of **Arabic-speaking retail
traders**, with English as a first-class edition. The architecture is **not** Arabic-only and **not** gold/FX-only:
instruments, filters and URLs come from a symbol registry, so indices, crypto, commodities and broader global markets
are added as coverage grows, without restructuring.

FOXREX is built as **three connected layers**, visible throughout the site:

| Layer | Question | On the site |
|---|---|---|
| **A. Market Data** | What is happening? | Market Pulse, `/markets/`, live values on hubs (system-produced, freshness-labelled) |
| **B. Market Intelligence** | Why is it happening, and what matters? | What Matters Now, the Desk, News, Analysis, REX |
| **C. Trading Intelligence** | What setup, scenario or decision follows? | Gold Focus levels and scenarios, Trading Ideas, Signals, Results |

Every screen must help a reader answer four questions:

| Question | Answered by |
|---|---|
| **What is happening in the markets?** | Market Pulse (live data, when connected) and the latest desk piece |
| **Why is it happening?** | What Matters Now, News That Matters (why it matters), analysis, REX |
| **What should I watch next?** | Levels and scenarios, the next scheduled event, the next desk slot, invalidation levels |
| **What does FOXREX think matters?** | The desk's lead story, bias and scenarios, trading ideas and signals with their risk |

Organising principles:
1. **A publication, not a landing page.** The homepage answers what is happening, why, what matters today and what to
   watch next. Brand promotion is secondary.
2. **One canonical home per thing.** Gold has one hub, every published item has one URL, and filters stay filters
   rather than becoming pages.
3. **No empty pages and no empty sections.** A page exists only when real content or real data can fill it; a section
   with nothing current is omitted (graceful absence rules: `FOXREX-WEBSITE-BLUEPRINT.md` §6).
4. **Status is always visible.** Data shows its source, time and freshness. Capabilities show LIVE / BETA / RESEARCH / PLANNED.
5. **Every published item has a permalink** in both languages.

## 2. Critique of the proposed architecture

The proposal you gave me has 7 top-level sections and about 36 sub-pages.

| Proposed | Assessment | Decision |
|---|---|---|
| **HOME** | Correct. | Keep |
| **MARKETS** → Overview, Gold, Forex, Crypto, Indices, Commodities, Economic Calendar | Six of these seven sub-pages need live data that does not exist yet (no provider, no candles, no calendar). At launch they would be six empty shells, the "40 empty pages" problem. "Gold" here duplicates the Gold hub. | **Collapse** to one `/markets/` page at launch. Per-instrument pages come later (P1). Asset-class pages are not needed: one Markets page with groups is enough for about 12 instruments. Calendar becomes its own page when a data source exists (P1). |
| **ANALYSIS** → Latest, Gold, Forex, Technical, Macro, Weekly Outlook | It mixes two different axes: **instrument** (Gold, Forex) and **method** (Technical, Macro). As separate pages they would overlap and fragment a small volume of content. Gold Analysis duplicates the Gold hub. | **One `/analysis/` list with filters** (instrument and method), plus article permalinks. Weekly Outlook is an analysis **format** with its own archive URL (P1). |
| **NEWS** → Latest, High Impact, Central Banks, Economy, Commodities, Currencies | Five of the six are filters, not pages. FOXREX must not become a generic news wire. | **One `/news/` list with filters**, plus permalinks. Every item uses the four-part structure: what happened, why it matters, markets affected, what to watch next. |
| **SIGNALS** → Active, Results, How Signals Work, Risk Methodology | "How Signals Work" and "Risk Methodology" are one subject. A Results page with no verified results is empty. | `/signals/` (active and recent) + `/signals/methodology/` at launch. `/signals/results/` once the first closed results exist (P1). |
| **LEARN** → REX Explains, Trading Basics, Technical, Macro, Risk Management, Glossary | "REX Explains" is a **format** (REX's voice), not a topic, so mixing it with topics creates duplicates. Four topic pages with five lessons in total would be thin. | `/learn/` hub with topic filters + lesson permalinks `/learn/<slug>/`. REX is the voice of all of Learn. Glossary is P2. |
| **FOXREX** → About, Technology, Methodology, REX, Contact | A publication's company pages belong in the **footer**, not in the main navigation. "REX" as a standalone page duplicates About and Learn. | Footer group "FOXREX": About (includes Meet REX), Methodology, Technology, Contact, legal. |
| *(missing)* **Gold** in the top level | Gold is the primary instrument and the 11:00 desk slot. Burying it under Markets and Analysis hides the product's anchor. | **Promote Gold to the main navigation.** |
| *(missing)* **Today / Desk** | The daily desk is FOXREX's core differentiator, but the proposal has no home for it or its archive. | The homepage is "Today". Desk pieces get permalinks and a date archive at `/desk/` (archive P1). The desk is not in the main nav, because the homepage is the desk. |

## 3. Final navigation

### Header (primary): 6 items + language + 1 action

```
[FOXREX logo → home]   Markets   Gold   Analysis   News   Signals   Learn          [العربية / English]   Join Telegram
```

- **"FOXREX" is not a navigation label.** The logo links home, as on every publication; there is no "FOXREX"
  menu. Company information lives in the footer (owner decision 17). There is no strong UX reason to put it in the header:
  returning readers come for markets, not for the company.
- **Order** follows the reader's questions: what is happening (Markets), the anchor instrument (Gold), what FOXREX thinks
  (Analysis), why it is happening (News), what to do about it with risk (Signals), and understanding it (Learn).
- **No dropdown mega-menus at launch.** Sub-navigation lives inside each section as filters, which is how a premium
  publication behaves.
- **The language switch goes to the same page** in the other edition (it does not reset to the home page). Arabic header order is
  mirrored (RTL).
- **One persistent action:** Join on Telegram, the existing community and signal channel.

### Footer

| FOXREX | Coverage | Legal | Follow |
|---|---|---|---|
| About (incl. Meet REX) | Markets | Risk Disclosure | Telegram |
| Methodology *(P1)* | Gold | Terms of Use | Instagram |
| Technology *(P1)* | Analysis | Privacy Policy | Facebook |
| Contact | News | | |
| | Signals | | |
| | Learn | | |
| | Desk archive *(P1)* | | |
| | Economic Calendar *(P1)* | | |

Plus the persistent short risk statement and a link to the full disclosure.

## 4. Page hierarchy

```
HOME (Today at FOXREX)
│
├── MARKETS [A] ──────── /markets/                         P0  overview: pulse (when live) + what each instrument is, grouped by asset class (registry-driven)
│     ├── instrument     /markets/<symbol>/                P1  e.g. /markets/eurusd/ — data + related analysis/news
│     └── calendar       /calendar/                        P1  economic calendar (requires a calendar data source)
│
├── GOLD [A+B+C] ─────── /gold/                            P0  flagship hub: today's Gold Focus + gold analysis/news + drivers
│     └── gold focus     /gold/<yyyy-mm-dd>/               P0  permalink of each day's Gold Focus
│
├── ANALYSIS [B] ─────── /analysis/                        P0  list, filters: instrument · method (technical/macro) · format
│     ├── article        /analysis/<slug>/                 P0
│     └── weekly outlook /analysis/weekly-outlook/         P1  archive of the Weekly Outlook format
│
├── NEWS [B] ─────────── /news/                            P0  "news that matters", filters: high impact · central banks · economy · commodities · FX · crypto
│     └── story          /news/<slug>/                     P0
│
├── SIGNALS [C] ──────── /signals/                         P0  active ideas/signals + recent outcomes + risk statement
│     ├── methodology    /signals/methodology/             P0  how signals are produced, managed, recorded; risk rules
│     ├── signal         /signals/<id>/                    P1  one signal with its full update history
│     └── results        /signals/results/                 P1  every closed result, losses included (no win-rate claims)
│
├── LEARN [B] ────────── /learn/                           P0  REX's lessons, topic filters: basics · technical · macro · risk
│     ├── lesson         /learn/<slug>/                    P0  (5 lessons exist today)
│     └── glossary       /learn/glossary/                  P2
│
├── DESK [B] (archive) ─ /desk/                            P1  every desk piece by date (only once it has ~2 weeks of content; no empty archives)
│     └── piece          /desk/<yyyy-mm-dd>/<slot>/        P0  morning-brief · event · us-session-preview · rex-note · market-recap
│
└── FOXREX (footer)
      ├── /about/                                          P0  incl. Meet REX
      ├── /methodology/                                    P1  editorial + analysis + data methodology, sources, AI policy
      ├── /technology/                                     P1  capabilities with LIVE/BETA/RESEARCH/PLANNED
      ├── /contact/                                        P0
      └── /risk-disclosure/ · /terms/ · /privacy/          P0
```

The Arabic edition mirrors every path under `/ar/` (see `FOXREX-SITEMAP.md`). Layer tags: [A] Market Data,
[B] Market Intelligence, [C] Trading Intelligence.

## 5. Homepage architecture (content, not visual design)

The homepage behaves like a **live financial publication's front page**, not a landing page advertising FOXREX. A
returning reader should understand, from the top of the page: **what is happening (A), why (B), what matters today
(B), what to watch next (B + A)**, then **what follows for trading (C)**.

Sections exist only because they answer those questions, not because a content type exists. **A section with nothing
current is omitted.** It never shows "not published yet", "coming soon", "no data" or "feed unavailable".

| # | Section | Layer | Answers | Content | Omitted when |
|---|---|---|---|---|---|
| 01 | **Market Pulse** | A | What is happening? | Compact strip: XAUUSD, DXY, EURUSD, GBPUSD, USDJPY, BTCUSD (registry-driven, extensible). Value, change (if the provider supplies the basis), freshness status, source, time | No provider connected; per symbol, STALE/UNAVAILABLE values are dropped from the strip |
| 02 | **What Matters Now** | B | Why? What matters today? | The lead: headline, 2-line why-it-matters, affected markets, link. Plus 2–3 supporting developments | No FRESH lead or desk item |
| 03 | **Today & Watch Next** | B + A | What to watch next? | Today's published desk items (linked) + the next 1–3 scheduled events, with times computed from each market's own clock and shown in IST | Nothing published today and nothing scheduled |
| 04 | **Gold Focus** | B + C | The flagship | Market state, bias, support / important level / resistance, both scenarios, technical context, macro driver, invalidation, "levels as of". Live XAUUSD separate and labelled | None in 7 days (an older one appears dated and de-emphasised) |
| 05 | **Desk Read** | B | What regime are we in? | Launch: editorial regime · USD · yields · volatility · next high-impact event, from the Morning Brief. Later: data-derived, labelled BETA | No Morning Brief today |
| 06 | **Trading Ideas & Signals** | C | What follows for trading? | Active ideas/signals (BUY / SELL / WAIT, entry, stop, targets, risk, status, time); the latest result | Nothing active and no result in 7 days |
| 07 | **Latest Analysis** | B | What does FOXREX think? | 3–4 cards: instrument, bias, timeframe, headline, thesis, attribution | None in 7 days |
| 08 | **News That Matters** | B | Why? | 3–5 four-part stories | None in 48 h |
| 09 | **REX Explains** | B | Understanding | A REX note tied to today's move, when one exists | No current REX note (no evergreen filler on the homepage) |
| 10 | **Community + Risk** | — | — | Telegram, Instagram, Facebook; short risk statement and legal links | Never |

**Removed from the homepage proposal:** "How FOXREX works / Technology" (brand promotion; it moves to the footer and
`/technology/` P1, with verified statuses only).

**Notes:**
- **Desk Read** cannot be computed honestly yet (no yields, candles or calendar data). At launch it is an editorial,
  timestamped judgement written with the Morning Brief.
- **Market Pulse with placeholder dashes is worse than no pulse.** It stays omitted until data is live.
- If almost everything is omitted (a cold start), the page still has 02/03/04 from the P0 minimum daily desk. That is
  why the launch gate requires the desk to run first (`FOXREX-LAUNCH-CONTENT-PLAN.md`).

## 6. Page-level content architecture (summary)

| Page | Primary question | Sections, in order |
|---|---|---|
| `/markets/` | What is happening? | Pulse table (live, with freshness) · instruments grouped (Metals, FX majors, Indices, Crypto, Rates when available), each with what it is, what moves it, and links to analysis/news · Calendar link (P1) |
| `/gold/` | What is gold doing and why? | Today's Gold Focus (or the last one, dated) · live XAUUSD (separate, labelled) · what is driving gold now (editorial) · gold analysis · gold-relevant news · Gold Focus archive · evergreen "What moves gold" (links to REX lessons, no duplicated copy) |
| `/analysis/` | What does FOXREX think? | Filters (instrument, method, format) · list newest first · Weekly Outlook pinned when current |
| `/analysis/<slug>/` | — | Headline · instrument · bias · timeframe · thesis · key levels (with "as of" time) · scenarios · invalidation · body · sources · attribution · risk statement · related (same instrument) |
| `/news/` | Why is it happening? | Filters · high-impact items first within the day · four-part summaries |
| `/news/<slug>/` | — | What happened · why it matters · markets affected · what to watch next · sources with times · related analysis |
| `/signals/` | What is the idea, and its risk? | Risk statement · active signals and ideas · recently closed (with outcome) · methodology summary · Telegram |
| `/signals/methodology/` | Can I trust the process? | How an idea is produced · entry/stop/target rules · management and updates · how results are recorded · what we never claim |
| `/learn/` | How do markets work? | Topic filters · latest REX piece · lessons by topic · Ask REX (Telegram) |
| `/learn/<slug>/` | — | Lesson · takeaway · related lessons · related live context (e.g. a CPI lesson linking to the next CPI on the calendar, P1) |
| `/desk/<date>/<slot>/` | — | Slot-specific template (see `FOXREX-EDITORIAL-SYSTEM.md`) |
| `/about/` | Who is FOXREX? | What FOXREX is · principles · Meet REX · how we use AI · company/contact details |

## 7. Search, tags and cross-linking

- **Instrument is the master taxonomy:** every item carries `instruments[]` (canonical symbols from the symbol registry).
  Instrument pages and filters are generated from it.
- **Topic tags** come from a small controlled vocabulary: inflation, central-banks, employment, growth, risk-sentiment,
  geopolitics, technical-structure, earnings. Free tags are not public.
- **Related content:** the same instrument within 7 days, plus REX lessons linked by topic.
- **Search:** P2. Filters are enough at launch volume.

## 8. Not in scope for the website

- Trading accounts, broker integration, a user login on the public site, paid tiers. These are not defined by the owner.
- The cinematic Experience (PR #7). The "Market Noise / information field" concept is kept for a future storytelling
  element, and nothing is built around it now.
