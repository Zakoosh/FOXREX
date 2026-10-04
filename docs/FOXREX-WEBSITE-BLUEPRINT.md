# FOXREX — Website Blueprint (owner master)

**Status:** for owner review, 2026-10-04. Planning only. Nothing is implemented, production is unchanged, and the
visual identity and REX-MASTER are untouched.
**Detail lives in:** `WEBSITE-CONTENT-AUDIT.md` · `FOXREX-INFORMATION-ARCHITECTURE.md` · `FOXREX-CONTENT-MODEL.md` ·
`FOXREX-EDITORIAL-SYSTEM.md` · `FOXREX-STUDIO-PUBLISHING-MAP.md` · `FOXREX-SITEMAP.md` · `FOXREX-LAUNCH-CONTENT-PLAN.md`.

---

## 1. What the site is
A **bilingual market-intelligence and trading-media publication**, run by a daily editorial desk and anchored on gold
and the major USD markets. Every page answers four questions: **What is happening? Why? What to watch next? What does
FOXREX think matters?** It is a publication first: data supports it, and products (signals) sit on top with their risk shown.

**Today's problem (audit):** the structure is sound and honest, but the site is mostly empty states, nothing has its
own URL, and there is no archive. The fix is content and structure, not a redesign.

## 2. Audience
- **Primary (proposed; owner to confirm):** Arabic-speaking retail traders, focused on gold and FX, who want a daily,
  trustworthy read with clear levels and risk.
- **Secondary:** English-speaking traders following the same desk.
- **Tertiary:** learners who arrive through REX lessons and stay for the daily desk.

## 3. Navigation
```
Header:  FOXREX   Markets   Gold   Analysis   News   Signals   Learn          العربية   Join on Telegram
Footer:  FOXREX (About + Meet REX, Methodology*, Technology*, Contact) · Coverage · Legal · Follow      (* P1)
```
Gold moves into the header. Company pages move to the footer. There are no mega-menus: sub-sections are filters.

## 4. Homepage structure: "Today at FOXREX"
| # | Section | Rule |
|---|---|---|
| 01 | Market Pulse | **Hidden until a data provider is live** |
| 02 | What Matters Now | The desk's lead story |
| 03 | Today at FOXREX | Today's desk timeline; missed slots are not shown |
| 04 | Gold Focus | Today's; if older, labelled with its date |
| 05 | Latest Analysis | Last 7 days |
| 06 | Desk Read | Editorial at launch (regime, USD, yields, volatility, next event); data-derived later |
| 07 | News That Matters | Four-part format, last 48 h |
| 08 | Signals & Trading Ideas | Only when real; methodology link always present |
| 09 | REX Explains | Today's REX note + evergreen lessons |
| 10 | How FOXREX works | Capability statuses (P1) |
| 11 | Community | Telegram, Instagram, Facebook |
| 12 | Risk & footer | Always |

**Every section collapses when it has nothing current. No placeholders.**

## 5. Page hierarchy
```
/                     Home
/markets/             (P1: /markets/<symbol>/, /calendar/)
/gold/                /gold/<date>/
/analysis/            /analysis/<slug>/          (P1: /analysis/weekly-outlook/)
/news/                /news/<slug>/
/signals/             /signals/methodology/      (P1: /signals/<id>/, /signals/results/)
/learn/               /learn/<slug>/             (P2: /learn/glossary/)
/desk/<date>/<slot>/  (P1: /desk/ archive)
/about/  /contact/  /risk-disclosure/  /terms/  /privacy/   (P1: /methodology/, /technology/)
```

## 6. Content types
| Type | Layer |
|---|---|
| Market Snapshot | Data |
| Morning Brief | Editorial |
| Gold Focus | Editorial |
| Analysis (incl. Weekly Outlook format) | Editorial |
| News | Editorial |
| Economic Event | Data + editorial |
| Trading Idea (new; may say WAIT) | Editorial |
| Signal | Editorial |
| Signal Result | Editorial |
| REX Explains (lesson / note / Q&A) | Editorial |
| US Open | Editorial |
| Market Recap | Editorial |

Social-only (never on the site): Reel, Story, Carousel, Campaign.

Every market-sensitive item carries `dataAsOf`, its source, `validUntil` and a stale policy.

## 7. Daily cycle (Istanbul time)
| Time | Slot | Launch status |
|---|---|---|
| 09:00 | Morning Brief | **P0** |
| 11:00 | Gold Focus | **P0** |
| 14:00 | Event of the Day (only when relevant) | P1 |
| 15:30 | US Open (really a US-session preview: the cash open is 16:30/17:30 IST) | P1 |
| realtime | Breaking / Data Released | **P0** |
| 19:00 | REX Note | P1 |
| 22:30 | Market Recap | **P0** |

**One content system:** the website item is canonical, and Telegram and social are rendered from it and link back to it.
A missed slot is skipped, never back-filled.

## 8. Studio → Website flow
`IDEA → DRAFT → REVIEW → APPROVED → SCHEDULED → PUBLISHED → ARCHIVED`. This lifecycle already exists. Each type maps to
one canonical permalink plus derived surfaces (homepage, hubs, filters). Publishing (designed, **not implemented**) must
produce the feed entry, a pre-rendered permalink page, a sitemap update and a Telegram text. Permalinks never 404.
Signals are never deleted.

## 9. Live data vs editorial
- **Data** (quotes, freshness, calendar) comes only from the Market Data API and is rendered live with source, time
  and state. It is never stored in editorial content.
- **Editorial** prices are **snapshots with an "as of" time**. Levels are analysis, not prices.
- **No provider means no live widgets.** Stale editorial is labelled with its date and never shown as current.

## 10. EN / AR
English is at `/…` and Arabic at `/ar/…`, with **the same Latin slugs**. They are paired items: the same facts, levels
and sources, written natively in Arabic, not literally translated. Each language is approved on its own, and the
language switch keeps you on the same page. Typography is unchanged (IBM Plex Sans Arabic + Inter, Latin runs isolated).

## 11. P0 / P1 / P2
- **P0:**
  - Home, markets, gold (+ daily permalinks), analysis (+ articles), news (+ stories), signals and signals/methodology,
    learn (+ 5 lessons), desk Morning Brief and Recap permalinks, about, contact, legal, sitemap.
  - Per-item permalinks, the v3 feed, the homepage restructure, Gold in the navigation, attribution.
- **P1:**
  - Live Market Pulse, instrument pages, calendar, signal pages and results, the desk archive.
  - The US Open, REX Note and Event slots, Weekly Outlook, methodology and technology pages, Telegram derivatives.
- **P2:**
  - Computed Desk Read, glossary, search, RSS, extra instruments, automated social.
  - The Experience and Market Noise storytelling.

## 12. What to remove
- Content blocks: the hero pillar list, the 5 "not yet published" cards, the empty ticker placeholder and the empty
  homepage blocks.
- Claims and promises: the Ask REX empty tab, "WhatsApp coming soon", and the vague "Why FOXREX" claims.
- Duplicates: the duplicated signals explainer and the duplicated gold copy.
- Housekeeping: the `/foxrex-studio.html` stub, and internal docs served publicly (verify).

## 13. What to keep
- The honest data posture: freshness states, no fabricated numbers and no performance claims.
- The bilingual `/ar/` architecture and its typography.
- The 5 REX lessons, the About principles and Meet REX, and the signal contract (stop and risk always).
- The Studio approval gate and audit trail.
- The approved FOXREX identity and REX-MASTER, unchanged.

## 14. What to build next (after owner approval)
1. **Approve this blueprint**, and confirm the audience, the 15:30 slot framing and the hero tagline.
2. **v3 content contract + per-item permalinks** (engine + build), docs-to-code with tests. No visual redesign.
3. **Homepage restructure** to "Today at FOXREX" using the existing design system, with collapse-when-empty.
4. **Navigation and footer update**, `/signals/methodology/`, lessons as permalinks, sitemap and hreflang.
5. **Run the desk for 10 trading days** (Brief, Gold Focus, Recap, EN + AR) as the launch gate.
6. **In parallel (owner):** provider credentials for PR #6, a calendar source, the legal entity and jurisdiction, and
   capability statuses.

**Owner decisions needed:** primary audience · 15:30 slot framing · hero Arabic tagline in EN · legal entity and
jurisdiction · capability statuses (trading engine, ML, decision system) · signals free or paid.
