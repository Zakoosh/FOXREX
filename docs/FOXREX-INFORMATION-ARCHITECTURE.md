# FOXREX — Information Architecture

**Status:** planning proposal for owner review, 2026-10-04. It defines structure only, not visual design.
Related documents: `FOXREX-SITEMAP.md` (URLs), `FOXREX-CONTENT-MODEL.md` (types), `FOXREX-LAUNCH-CONTENT-PLAN.md` (priorities).

---

## 1. What the website is

FOXREX is a **market-intelligence and trading-media publication**, organised around a daily editorial desk and anchored
on gold and the major USD markets. It is published in Arabic and English as two first-class editions.

Every screen must help a reader answer four questions:

| Question | Answered by |
|---|---|
| **What is happening in the markets?** | Market Pulse (live data, when connected) and the latest desk piece |
| **Why is it happening?** | What Matters Now, News That Matters (why it matters), analysis, REX |
| **What should I watch next?** | Levels and scenarios, the next scheduled event, the next desk slot, invalidation levels |
| **What does FOXREX think matters?** | The desk's lead story, bias and scenarios, trading ideas and signals with their risk |

Organising principles:
1. **Editorial first, data second, product third.** The desk produces the content and data supports it.
2. **One canonical home per thing.** Gold has one hub, every published item has one URL, and filters stay filters
   rather than becoming pages.
3. **No empty pages at launch.** A page exists only when real content or real data can fill it.
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
FOXREX   Markets   Gold   Analysis   News   Signals   Learn          العربية   Join on Telegram
```

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
├── MARKETS ──────────── /markets/                         P0  overview: pulse (when live) + what each instrument is
│     ├── instrument     /markets/<symbol>/                P1  e.g. /markets/eurusd/ — data + related analysis/news
│     └── calendar       /calendar/                        P1  economic calendar (requires a calendar data source)
│
├── GOLD ─────────────── /gold/                            P0  the Gold hub: today's Gold Focus + gold analysis/news + drivers
│     └── gold focus     /gold/<yyyy-mm-dd>/               P0  permalink of each day's Gold Focus
│
├── ANALYSIS ─────────── /analysis/                        P0  list, filters: instrument · method (technical/macro) · format
│     ├── article        /analysis/<slug>/                 P0
│     └── weekly outlook /analysis/weekly-outlook/         P1  archive of the Weekly Outlook format
│
├── NEWS ─────────────── /news/                            P0  "news that matters", filters: high impact · central banks · economy · commodities · FX · crypto
│     └── story          /news/<slug>/                     P0
│
├── SIGNALS ──────────── /signals/                         P0  active ideas/signals + recent outcomes + risk statement
│     ├── methodology    /signals/methodology/             P0  how signals are produced, managed, recorded; risk rules
│     ├── signal         /signals/<id>/                    P1  one signal with its full update history
│     └── results        /signals/results/                 P1  every closed result, losses included (no win-rate claims)
│
├── LEARN ────────────── /learn/                           P0  REX's lessons, topic filters: basics · technical · macro · risk
│     ├── lesson         /learn/<slug>/                    P0  (5 lessons exist today)
│     └── glossary       /learn/glossary/                  P2
│
├── DESK (archive) ───── /desk/                            P1  every desk piece by date
│     └── piece          /desk/<yyyy-mm-dd>/<slot>/        P0  morning-brief · event · us-open · rex-note · market-recap
│
└── FOXREX (footer)
      ├── /about/                                          P0  incl. Meet REX
      ├── /methodology/                                    P1  editorial + analysis + data methodology, sources, AI policy
      ├── /technology/                                     P1  capabilities with LIVE/BETA/RESEARCH/PLANNED
      ├── /contact/                                        P0
      └── /risk-disclosure/ · /terms/ · /privacy/          P0
```

The Arabic edition mirrors every path under `/ar/` (see `FOXREX-SITEMAP.md`).

## 5. Homepage architecture (content, not visual design)

The homepage is **"Today at FOXREX"**: a front page edited by the desk. Sections are listed in priority order. Each
section has a purpose, a source and a rule for empty or stale content. **A section with nothing current to show
collapses; it does not show a placeholder.**

| # | Section | Purpose | Content | Source | When empty or stale |
|---|---|---|---|---|---|
| 01 | **Market Pulse** | What is happening, in 3 seconds | XAUUSD, DXY, EURUSD, GBPUSD, USDJPY, BTCUSD; later US10Y, WTI, SPX500/NAS100. Price, change (only if the provider gives the basis), freshness state, source, time | Market Data API (live layer) | **Hidden entirely until a provider is connected.** Per symbol: DELAYED, STALE, CLOSED or UNAVAILABLE is shown as a word, never as a number |
| 02 | **What Matters Now** | The one dominant story | 1 lead: headline, 2-line why-it-matters, affected markets, link. Plus 2–3 supporting developments (one line each) | Editorial: the desk's current lead (any type flagged `lead`), normally the latest desk piece or high-impact news | Falls back to the latest desk piece. If nothing has been published in 24 h of trading time, the section is hidden |
| 03 | **Today at FOXREX** | The daily desk, operational | A timeline of today's slots: published items link to their permalink, upcoming slots show only their time, and "Event of the Day" appears only when scheduled | Editorial: desk types | Slots that are not yet due show the time only. Missed slots are not shown. No "not yet published" ×5 |
| 04 | **Gold Focus** | The anchor instrument | Today's market state, trend/bias, key support, important level, key resistance, bullish and bearish scenarios, technical context, macro driver, invalidation, "levels as of" time. Live XAUUSD shown separately with its own label | Editorial `GOLD_FOCUS` + live XAUUSD | Older than its validity: shown with a dated "Last Gold Focus: <date>" label, never as today's. None at all: section hidden |
| 05 | **Latest Analysis** | Serious ideas | 3–4 cards: instrument, bias, timeframe, headline, thesis, key levels, published time, attribution | Editorial `ANALYSIS` | Hidden if none in the last 7 days |
| 06 | **Desk Read / Market Intelligence** | FOXREX's differentiator: the state of the market at a glance | **Launch (editorial):** regime (risk-on/off/mixed), USD state, yields, volatility tone, next high-impact event, each with the desk's one-line read and time. **Later (computed, P2):** the same fields derived from data, with their method and status shown | Launch: fields in the Morning Brief. Later: the data layer | Older than today's Morning Brief: hidden |
| 07 | **News That Matters** | Filtered context, not a feed | 3–5 stories, each with what happened, why it matters, markets affected and what to watch next | Editorial `NEWS` | Hidden if nothing in 48 h |
| 08 | **Signals & Trading Ideas** | Structured ideas with risk | Latest 1–3: instrument, BUY / SELL / WAIT, entry, stop, targets, risk, status, context, timestamp. Link to methodology and results | Editorial `SIGNAL` / `TRADING_IDEA` + `SIGNAL_RESULT` | Hidden if none active. The methodology link always remains |
| 09 | **REX Explains** | Understanding, with personality | The latest REX piece, ideally tied to today's move ("why gold fell"), plus 2 evergreen lessons | Editorial `REX_EXPLAINS` | Evergreen lessons always available |
| 10 | **How FOXREX works** | Truthful technology and method | One line per capability with LIVE / BETA / RESEARCH / PLANNED, linking to `/technology/` and `/methodology/` | Static and owner-confirmed | Always present (P1). At launch, a single line in About |
| 11 | **Community** | Where to follow | Telegram (primary), Instagram, Facebook | Static | — |
| 12 | **Risk & footer** | Professional disclosure | Short risk statement, link to the full disclosure, legal links | Static | — |

**Notes on your proposed homepage:**
- **06 Market Intelligence** cannot be computed honestly yet: there is no yield data, no candles for volatility and no calendar.
  At launch it becomes the **Desk Read**, an editorial, timestamped judgement written with the Morning Brief. It
  becomes data-derived later, labelled BETA until validated.
- **10 FOXREX Technology** is low on the reading path. It earns a single strip, not a showcase.
- **01 Market Pulse with placeholder dashes is worse than no pulse.** Hide it until data is live.

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
