# FOXREX — Website Blueprint (implementation decision document)

**Status:** revision 2, 2026-10-04. The direction is **approved by the owner**, subject to the decisions below. This is
documentation only: nothing is implemented, production is unchanged, and the visual identity and REX-MASTER are
untouched.
**Detail lives in:** `WEBSITE-CONTENT-AUDIT.md` · `FOXREX-INFORMATION-ARCHITECTURE.md` · `FOXREX-CONTENT-MODEL.md` ·
`FOXREX-EDITORIAL-SYSTEM.md` · `FOXREX-STUDIO-PUBLISHING-MAP.md` · `FOXREX-SITEMAP.md` · `FOXREX-LAUNCH-CONTENT-PLAN.md`.
Where a detail document and this one disagree, **this document wins**.

---

## 0. OWNER DECISIONS

### APPROVED
| # | Decision |
|---|---|
| 1 | **Audience:** primary launch audience is Arabic-speaking retail traders. Launch editorial coverage is gold, FX and major macro events. The architecture is **not** Arabic-only and **not** gold/FX-only: it extends to indices, crypto, commodities and global markets. English is a first-class edition |
| 2 | **15:30 slot = "US Session Preview".** It is never described as the US market open. Actual open coverage is event-driven and computed from New York time (DST-aware) |
| 3 | **Hero:** English-only messaging on `/`, Arabic-native messaging on `/ar/`. The Arabic tagline is removed from the English hero. No mixed-language branding decoration unless approved later |
| 7 | **Three connected layers:** A. Market Data · B. Market Intelligence · C. Trading Intelligence, visible in the sitemap, homepage, content model and Studio |
| 8 | **The homepage is a live financial publication**, not a landing page. Brand promotion is secondary |
| 9 | **Graceful absence:** sections are omitted when there is nothing current. No "not published yet", "coming soon", "no data" or "feed unavailable" |
| 10 | **Permalinks are P0** for every durable editorial item |
| 11 | **Gold is a first-class top-level destination** (`/gold/`); Gold Focus is the flagship product |
| 12 | **REX is the editorial explanation personality**, used only where he adds value. No filler |
| 14 | **One source item → website canonical → Telegram / Instagram / Story / Carousel.** Studio is the operational CMS. No disconnected pipelines |
| 15 | **Freshness model:** `dataAsOf`, `sourceTimestamp`, `receivedAt`, `validUntil`, `freshnessStatus` LIVE / FRESH / AGING / STALE / UNAVAILABLE |
| 16 | **Focused launch scope:** a working product over page count. No empty archives |
| 17 | **Header without a "FOXREX" label:** Markets · Gold · Analysis · News · Signals · Learn · language · Join Telegram |

### PENDING (owner input required; nothing may be invented)
| Item | State |
|---|---|
| Legal entity, company name, registration, regulator, licence, jurisdiction, office, legal status | **TBD — OWNER INPUT REQUIRED.** Legal pages remain draft until owner/legal review |
| Signals commercial model (free / member / premium) | **TBD.** Architecture supports PUBLIC / MEMBER / PREMIUM; no paywall and no pricing claims now |
| Capability statuses: trading engine, decision system, ML, AI reasoning, risk engine, execution, market-data infrastructure | **STATUS REQUIRES SYSTEM VERIFICATION** (§13). None is described publicly until verified |
| Market data provider and credentials (PR #6) | Owner action; until then there are no live widgets |
| Economic calendar data source | Owner action; until then events are entered by the desk with a source |
| Daily desk capacity beyond the P0 minimum | Owner/desk decision; adds slots without redesign |

### NOT IN CURRENT SCOPE
- Website implementation, redesign, mockups, visual identity work.
- The cinematic Experience (PR #7, draft, not continued) and the **Market Noise** storytelling concept (P2, future; not built).
- REX generation, Higgsfield, credits.
- PR #6 (Market Data Layer) changes and merges; PR #8 merge.
- Accounts, login, paywall, pricing, broker/execution integration, automated social posting.

---

## 1. Final architecture

```
                        ┌──────────────────────────────────────────────┐
  providers ───────────▶│ A. MARKET DATA  (Market API, quality gate,   │───────────── real-time path ──────────────┐
  calendar source       │    freshness: LIVE/FRESH/AGING/STALE/UNAVAIL)│   (bypasses Studio: measured, not written)│
                        └───────────────────────┬──────────────────────┘                                           │
                                                │ snapshot into priceRef (value + source + times)                  │
                                                ▼                                                                  │
                        ┌──────────────────────────────────────────────┐                                           │
                        │ B. MARKET INTELLIGENCE                       │                                           │
                        │    why it is happening, what matters         │                                           │
                        │    (Brief, Preview, Recap, News, Analysis,   │                                           │
                        │     Event, REX)                              │                                           │
                        └───────────────────────┬──────────────────────┘                                           │
                                                ▼                                                                  │
                        ┌──────────────────────────────────────────────┐                                           │
                        │ C. TRADING INTELLIGENCE                      │                                           │
                        │    setups, scenarios, decisions              │                                           │
                        │    (Gold Focus levels, Trading Ideas,        │                                           │
                        │     Signals, Results)                        │                                           │
                        └───────────────────────┬──────────────────────┘                                           │
                                                ▼                                                                  │
                        ┌──────────────────────────────────────────────┐                                           │
                        │ EDITORIAL ENGINE / STUDIO                    │                                           │
                        │ IDEA→DRAFT→REVIEW→APPROVED→SCHEDULED→        │                                           │
                        │ PUBLISHED→ARCHIVED · human approval · EN+AR  │                                           │
                        └───────────────────────┬──────────────────────┘                                           │
                                                ▼                                                                  │
                        ┌──────────────────────────────────────────────┐                                           │
                        │ WEBSITE (canonical)  foxrex.co · /ar/        │◀──────────────────────────────────────────┘
                        │ permalinks · hubs · homepage                 │   live widgets render API data directly,
                        └───────┬────────────────┬────────────────┬────┘   labelled with source, time and status
                                ▼                ▼                ▼
                            Telegram         Instagram      Social (Story · Carousel · Reel)
                        derivatives rendered from the approved canonical item, always linking back to it
```

- **The real-time path** (Market Pulse, live XAUUSD on `/gold/`, `/markets/` table) goes API → browser. It never goes
  through Studio, and it is never typed into editorial content.
- **Breaking News** goes through the same Studio approval, with Telegram as the fastest derivative. There is no
  unapproved fast lane for editorial content.

## 2. What the site is
A **live financial publication** for market and trading intelligence, run by a daily editorial desk. Every visit
answers: **What is happening? Why? What matters today? What should I watch next?** Then: what follows for trading,
with its risk.

## 3. Audience and coverage
- **Primary:** Arabic-speaking retail traders. **Secondary:** English-speaking traders; both are first-class editions.
- **Launch coverage:** gold (flagship), FX majors, major macro events (central banks, CPI, NFP…).
- **Extensible by design:** instruments come from a symbol registry with an `assetClass`. Indices, crypto, commodities
  and global markets are added as registry entries, with filters and `/markets/<symbol>/` pages, and no new structure.

## 4. Navigation
```
[logo → home]   Markets   Gold   Analysis   News   Signals   Learn        [العربية | English]   Join Telegram
Footer:  FOXREX (About + Meet REX, Methodology*, Technology*, Contact) · Coverage · Legal · Follow      (* P1)
```
No mega-menus. Sub-sections are filters. The language switch keeps the reader on the same page.

## 5. Homepage (live publication)
| # | Section | Layer | Answers |
|---|---|---|---|
| 01 | Market Pulse | A | What is happening? |
| 02 | What Matters Now (the desk's lead) | B | Why? What matters today? |
| 03 | Today & Watch Next (desk items + next events, DST-aware times) | B + A | What to watch next? |
| 04 | Gold Focus (flagship) | B + C | Gold: context, levels, scenarios |
| 05 | Desk Read (regime · USD · yields · volatility · next event) | B | What regime are we in? |
| 06 | Trading Ideas & Signals | C | What follows for trading, with risk |
| 07 | Latest Analysis | B | What does FOXREX think? |
| 08 | News That Matters | B | Why? |
| 09 | REX Explains (only when current and useful) | B | Understanding |
| 10 | Community + Risk | — | — |

There is no technology or brand showcase on the homepage. Section rules are in `FOXREX-STUDIO-PUBLISHING-MAP.md` §3.

## 6. Graceful absence rules
1. **A section renders only when it has something current to say.** Otherwise it is **omitted**: no heading, no frame,
   no placeholder.
2. **Never render** "not published yet", "coming soon", "no data", "feed unavailable", dashes or zeros standing in for values.
3. **Live data absent** (no provider, or UNAVAILABLE): the widget is omitted. Individual STALE / UNAVAILABLE symbols
   drop out of the strip; the rest stay.
4. **Editorial past its validity:** follows `stalePolicy`: omitted from current-state surfaces, or shown once, clearly
   dated and de-emphasised ("Last Gold Focus: 3 Oct"). It is never presented as today's.
5. **Missed desk slots** are not shown. Future slots appear only as a time in "Today & Watch Next", never as an empty card.
6. **Hubs and lists** (`/analysis/`, `/news/`, `/signals/`): with no recent items, they show their latest items with dates,
   or their evergreen content (methodology, lessons). They are never an empty frame.
7. **Archives and secondary pages** (`/desk/`, `/signals/results/`, `/markets/<symbol>/`, weekly outlook) **are not built
   until they have items**, and they are not in the sitemap or navigation until then.
8. **Minimum viable front page:** the P0 daily desk (Brief, Gold Focus, Recap, News) guarantees 02 / 03 / 04 on every
   trading day. The launch gate exists so the page is never mostly absent.
9. **Telegram and community links are static** and always present. They are the only "follow" calls to action.

## 7. Page hierarchy and P0 final
| Layer | P0 (launch) | P1 (when real) | P2 |
|---|---|---|---|
| — | `/` Home | | |
| A | `/markets/` (pulse when live; instrument guide) | `/markets/<symbol>/`, `/calendar/` | more instruments / asset classes |
| A+B+C | `/gold/`, `/gold/<date>/` (flagship) | | |
| B | `/analysis/`, `/analysis/<slug>/` | `/analysis/weekly-outlook/` | |
| B | `/news/`, `/news/<slug>/` | | |
| B | `/desk/<date>/morning-brief/`, `/desk/<date>/market-recap/` | `/desk/` archive; `us-session-preview`, `event`, `rex-note` slots | |
| C | `/signals/`, `/signals/methodology/` | `/signals/<id>/`, `/signals/results/` | |
| B | `/learn/`, `/learn/<slug>/` (5 lessons) | Ask REX answers | `/learn/glossary/` |
| — | `/about/`, `/contact/`, legal ×3 (draft until review), `sitemap.xml` | `/methodology/`, `/technology/` (verified only) | RSS, search |

All of it is mirrored at `/ar/…` with identical Latin slugs.
**P0 capabilities:** per-item permalinks and pre-rendered pages; v3 feed with archive indexes; the homepage restructure
with graceful absence and freshness; the new header; attribution.

## 8. Content types by layer
| Layer | Types |
|---|---|
| **A. Market Data** | Market Snapshot · Economic Event (data part) |
| **B. Market Intelligence** | Morning Brief · US Session Preview · Market Recap · News · Economic Event (editorial) · Analysis (+ Weekly Outlook) · REX Explains (lesson / note / Q&A) |
| **C. Trading Intelligence** | Gold Focus levels/scenarios (flagship, B + C) · Trading Idea (BUY / SELL / WAIT) · Signal · Signal Result |
| Social-only derivatives | Reel · Story · Carousel · Campaign (with `parentId`, never on the website) |

## 9. Permalinks (P0)
Every durable editorial item has:
- a **stable ID** (`<translationGroupId>-<lang>`)
- a **canonical URL** (`urlPath`, immutable after first publish)
- **`publishedAt`** (never changes) and **`updatedAt`** (shown as "Updated")
- a **language relationship** (`translationGroupId` + hreflang pair)
- **source and attribution** (`sources[]`, `origin`)
- **archive discoverability** (section list + monthly archive index + sitemap)

Published URLs never 404: they are withdrawn with a notice, never deleted.

## 10. Daily cycle and the US session model (Istanbul time)
| Time (IST) | Slot | Launch |
|---|---|---|
| 09:00 | Morning Brief | **P0** |
| 11:00 | Gold Focus | **P0** |
| 14:00 | Event of the Day (only when relevant) | P1 |
| 15:30 | **US Session Preview** | P1 |
| realtime | Breaking / Data Released | **P0** |
| 19:00 | REX Note (only when it adds value) | P1 |
| 22:30 | Market Recap | **P0** |

**US session model:** Istanbul slot times are editorial. Other markets' times are **computed from their own timezone**
and shown in IST. Türkiye has no DST; New York does:

| | US daylight time (≈ Mar–Nov) | US standard time |
|---|---|---|
| US data 08:30 ET | 15:30 IST | 16:30 IST |
| US cash open 09:30 ET | 16:30 IST | 17:30 IST |

The 15:30 preview states the computed open time. In winter it publishes before the 08:30 ET data and says so. Open
coverage, when warranted, is an event-driven News or Event item at the computed time. A missed slot is skipped, never
back-filled.

## 11. Studio → Website flow
The lifecycle `IDEA → DRAFT → REVIEW → APPROVED → SCHEDULED → PUBLISHED → ARCHIVED` already exists. Each type has one
canonical permalink and derived surfaces. Studio groups types by layer and applies stricter validation to Trading
Intelligence. The publishing contract (designed, **not implemented**) produces the feed entry, a pre-rendered page, a
sitemap update and derivative payloads (Telegram text, Instagram caption, Story frame, Carousel slides) that the
operator posts. Every record carries `access`; only `PUBLIC` publishes at launch.

## 12. Freshness model
| Status | Meaning (data / editorial) | Display |
|---|---|---|
| **LIVE** | Real-time source, within the live window / never editorial | Quote styling, "Live · source" |
| **FRESH** | Delayed or recent value / within validity | Value + explicit "as of" time |
| **AGING** | Getting old, or market closed / past half of validity | Value + time, de-emphasised; "Closed · last <time>" |
| **STALE** | Beyond the stale window / past `validUntil` | **Never in quote styling.** Omitted, or plain dated text |
| **UNAVAILABLE** | No value or rejected / — | Omitted |

The fields are `dataAsOf`, `sourceTimestamp` (age is measured from this), `receivedAt` and `validUntil`.
`freshnessStatus` is computed at render time and never stored by hand. `marketState` (OPEN / CLOSED) is separate.
**A stale value never looks like a current live quote.** Full definitions and the mapping from PR #6's states are in
`FOXREX-CONTENT-MODEL.md` §1.1.

## 13. Capability claims (evidence-based)
Every branch of the repository was inspected. **No evidence** was found for a trading engine, decision system, ML,
market-analysis AI reasoning, risk engine or execution. Market-data infrastructure is built and tested in unmerged
PR #6, with no provider connected. All seven are **STATUS REQUIRES SYSTEM VERIFICATION**, and the public site
describes none of them until verified. Supportable wording today: "AI may assist drafting; a person reviews everything
before publication." The evidence table is in `FOXREX-LAUNCH-CONTENT-PLAN.md` §7.

## 14. Signals and access
Signals are Trading Intelligence: entry, stop (always), targets, risk, context, a public update history, and results
recorded with losses. Every record carries `access: PUBLIC | MEMBER | PREMIUM`. **At launch everything is PUBLIC.**
URLs never depend on tier, and there is no paywall, pricing or performance claim. The commercial model is pending the owner.

## 15. EN / AR
English is at `/…` and Arabic at `/ar/…`, with **the same Latin slugs**. They are paired items with the same facts,
levels, sources and times; the Arabic is written natively, not literally translated. Each language is approved
separately. Each edition has its own hero (English-only / Arabic-native). Typography is unchanged: IBM Plex Sans
Arabic + Inter, with Latin runs isolated.

## 16. REX
REX is the **editorial intelligence and explanation personality**. He appears for explanation, education,
interpretation, market context and selected commentary. He never gives entries, stops or targets. There is no daily
quota and no filler, and he is not a decorative section. REX-MASTER is unchanged.

## 17. What to remove / keep
- **Remove (content blocks):** the hero pillar list; the Arabic tagline in the English hero; the 5 "not yet published"
  cards; the empty ticker placeholder; empty homepage blocks.
- **Remove (claims and promises):** the empty Ask REX tab; "WhatsApp coming soon"; the "Why FOXREX" claims and "AI
  Intelligence — In development".
- **Remove (duplicates):** the homepage technology/brand showcase; the duplicated signals explainer and gold copy.
- **Remove (housekeeping):** the `/foxrex-studio.html` stub; internal docs served publicly (verify).
- **Keep:** the honest data posture; the `/ar/` architecture and typography; the 5 lessons; the About principles and
  Meet REX; the signal contract; the Studio approval gate and audit trail; the approved identity.

## 18. What to build next (after this blueprint is accepted)
1. **v3 content contract** in `studio/cms-model.js` + schema: layer, access, `urlPath`, freshness fields,
   `US_SESSION_PREVIEW`, `TRADING_IDEA`, REX formats. Tests first.
2. **Permalinks and pre-rendered item pages** in the build and the publishing engine; archive indexes; sitemap and hreflang.
3. **Homepage restructure** with graceful absence and freshness, using the existing design system (no redesign);
   the new header and footer; per-edition hero copy.
4. **Run the P0 desk for 10 trading days** (Brief, Gold Focus, Recap, News; EN + AR) as the launch gate.
5. **Owner, in parallel:** legal entity and jurisdiction, provider credentials (PR #6), a calendar source, and
   capability verification.
