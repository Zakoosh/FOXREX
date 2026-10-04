# FOXREX — Launch Content Plan (P0 / P1 / P2 / REMOVE)

**Status:** planning proposal for owner review, 2026-10-04. Nothing here is implemented.
**Principle:** launch a small site that is full, not 40 pages that are empty. A page ships when real content or real
data can fill it.

---

## 1. P0 — required for launch

### Pages
| Page | What makes it "full" at launch |
|---|---|
| `/` Home | At least Gold Focus + Morning Brief or Recap + 1 analysis + REX lessons. Empty sections collapse |
| `/markets/` | Instrument descriptions (exist). Pulse hidden until data is live |
| `/gold/` + `/gold/<date>/` | Today's Gold Focus (daily) + "What moves gold" linking to lessons |
| `/analysis/` + `/analysis/<slug>/` | ≥ 3 published analyses before launch |
| `/news/` + `/news/<slug>/` | News published as it happens, in the four-part format; ≥ 3 before launch |
| `/signals/` + `/signals/methodology/` | Methodology and risk (content exists). Active signals only when real |
| `/learn/` + 5 lessons `/learn/<slug>/` | Content exists (bilingual) |
| `/desk/<date>/morning-brief/` · `/desk/<date>/market-recap/` | Published daily |
| `/about/`, `/contact/`, `/risk-disclosure/`, `/terms/`, `/privacy/` | Exist; legal needs entity and jurisdiction (§5) |
| `sitemap.xml`, hreflang, canonical, OG/JSON-LD on permalinks | Required for permalinks to be useful |

### Capabilities (build, in this order)
1. **Per-item permalinks + static pre-rendering** (contract: `FOXREX-STUDIO-PUBLISHING-MAP.md` §4).
2. **v3 feed:** split feed + monthly archive + `urlPath`, `instruments[]`, `origin`, `lead`, `dataAsOf`/`validUntil`/`stalePolicy`.
3. **Homepage rebuilt as "Today at FOXREX"**, with collapse-when-empty and stale labelling (IA §5). **No visual
   redesign:** the same design system, restructured sections.
4. **Header navigation adds Gold**; the footer gains the FOXREX / Coverage / Legal / Follow groups.
5. **Attribution line** on every item (desk / analyst / "system-assisted, desk-reviewed").

### Daily editorial minimum (P0)
- **Morning Brief 09:00 · Gold Focus 11:00 · Market Recap 22:30**, EN + AR, every trading day.
- **News** when it matters.
- **Analysis** at least 3 per week. **Signals** only when there is a setup.

### Launch readiness gates (all must be true)
- [ ] 10 consecutive trading days of Brief + Gold Focus + Recap published on time in both languages (proves the cadence
      before the public relies on it; these can be published to the live site in a soft launch).
- [ ] ≥ 3 analyses, ≥ 3 news items, 5 lessons live with permalinks.
- [ ] No placeholder text anywhere ("not yet published", "—", "coming soon").
- [ ] Every price shown has a source and an "as of" time; no live widget is visible without a connected provider.
- [ ] Legal pages name the entity and jurisdiction; risk disclosure is linked from every signal and analysis.
- [ ] Owner has confirmed the status (LIVE / BETA / RESEARCH / PLANNED) of every capability mentioned anywhere.

## 2. P1 — next, once its data or content exists

| Item | Prerequisite |
|---|---|
| Market Pulse on Home + `/markets/` live table | PR #6 merged + provider credentials + verified LIVE/DELAYED states |
| `/markets/<symbol>/` instrument pages | Live data + enough tagged content per symbol |
| `/calendar/` + automated Event of the Day inputs | A licensed calendar data source |
| `/signals/<id>/` + `/signals/results/` | First closed signals (losses included) |
| `/desk/` archive + `/desk/<date>/` | ~2 weeks of desk content |
| US Open 15:30, REX Note 19:00, Event of the Day 14:00 slots | Desk capacity (`FOXREX-EDITORIAL-SYSTEM.md` §5) |
| Weekly Outlook + `/analysis/weekly-outlook/` | Weekly commitment |
| `/methodology/`, `/technology/` | Owner-confirmed capability statuses |
| Home 10 "How FOXREX works" strip | `/technology/` exists |
| Telegram derivative text generated at publish (operator posts manually) | v3 engine |
| Ask REX answers as `/learn/<slug>/` (`format=qa`) | Real questions from the community |

## 3. P2 — later

- Computed Desk Read / market regime (data-derived, labelled BETA until validated).
- `/learn/glossary/`, site search, RSS feeds.
- Instruments beyond the six public symbols (XAGUSD, US30, NAS100, SPX500, WTI, ETHUSD; US10Y needs a source).
- Automated Telegram/social posting, newsletter.
- The cinematic Experience and the "Market Noise / information field" storytelling element (preserved, not built).
- Accounts, personalisation, paid tiers (not defined by the owner).

## 4. REMOVE (from the current site)

| Remove | Why | Replace with |
|---|---|---|
| Hero 5-pillar list | Repeats the navigation | What Matters Now (Home 02) |
| Five "Not yet published today" desk cards | Five empty states on the front page | Timeline showing only published items and upcoming times |
| Empty ticker placeholder ("not connected") | A placeholder pulse is worse than none | Hidden until live (P1) |
| Gold Focus "—" empty card, "No analysis/news/signals published yet" blocks on Home | Shell impression | Sections collapse when empty |
| Ask REX empty tab | No content | Ask REX on Telegram link; Q&A pages later |
| "WhatsApp channel: coming soon" | Promise without date | Remove until it exists |
| "Why FOXREX" vague claims (Speed, Research, Data) | Unverified capability claims | `/technology/` with explicit status (P1); one honest line in About until then |
| Duplicated signals explainer on Home | Duplicate of `/signals/` | One line + link to methodology |
| Static "What moves gold" copy on `/gold/` that duplicates a lesson | Duplicate content | Link to `/learn/gold-and-yields/` |
| `/foxrex-studio.html` stub | Legacy | 301 to `/studio/` or delete |
| Internal docs served from the Pages root (verify) | Hygiene and exposure | Exclude from the Pages artifact |

**Owner to confirm:** the Arabic tagline inside the English hero («تداول أذكى... فرص أكبر») — keep it as a deliberate
bilingual brand device, or move it to the Arabic edition only.

## 5. KEEP (good and already true)

- The honest data posture: freshness states, "never fabricate", no performance claims.
- The bilingual architecture (`/ar/` mirror, RTL, typography rules).
- The 5 REX lessons (become permalinks).
- The About principles (no fake data, risk first, people review AI, education not advice) and Meet REX.
- The signal contract: entry, stop on the correct side, targets, risk message, context, results recorded incl. losses.
- The Studio lifecycle, approval gate, dry run, idempotency, audit trail, and "AI-generated news is never publishable".
- The approved FOXREX identity and REX-MASTER, unchanged.

## 6. Legal and trust items before launch (owner input needed)

- Legal entity name, jurisdiction and registered address in Terms / Privacy / Risk Disclosure.
- Conflict-of-interest statement (does anyone at FOXREX trade the published instruments? are there broker affiliations?).
- Whether signals are free or paid, and whether a regulatory status statement is required in the target markets.
- AI-use statement on `/methodology/` ("system-assisted, desk-reviewed").
