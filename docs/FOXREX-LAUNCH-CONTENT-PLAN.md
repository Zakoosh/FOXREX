# FOXREX — Launch Content Plan (P0 / P1 / P2 / REMOVE)

**Status:** revised after owner decisions, 2026-10-04. Nothing here is implemented.
**Principle:** launch a **working product**, not a page count. A small site that is full beats 40 pages that are empty.
A page ships when real content or real data can fill it; an archive ships when it has items.

---

## 1. P0 — required for launch

### Pages
| Page | What makes it "full" at launch |
|---|---|
| `/` Home | Behaves as a live publication: What Matters Now + Today & Watch Next + Gold Focus from the daily desk. Sections without current content are omitted |
| `/markets/` | Instrument descriptions (exist). Pulse hidden until data is live |
| `/gold/` + `/gold/<date>/` | Today's Gold Focus (daily) + "What moves gold" linking to lessons |
| `/analysis/` + `/analysis/<slug>/` | ≥ 3 published analyses before launch |
| `/news/` + `/news/<slug>/` | News published as it happens, in the four-part format; ≥ 3 before launch |
| `/signals/` + `/signals/methodology/` | Methodology and risk (content exists). Active signals only when real |
| `/learn/` + 5 lessons `/learn/<slug>/` | Content exists (bilingual) |
| `/desk/<date>/morning-brief/` · `/desk/<date>/market-recap/` | Published daily |
| `/about/`, `/contact/` | Exist |
| `/risk-disclosure/`, `/terms/`, `/privacy/` | Exist. **Remain DRAFT until owner/legal review.** Entity and jurisdiction: **TBD — OWNER INPUT REQUIRED** (§6) |
| `sitemap.xml`, hreflang, canonical, OG/JSON-LD on permalinks | Required for permalinks to be useful |

### Capabilities (build, in this order)
1. **Per-item permalinks + static pre-rendering** (contract: `FOXREX-STUDIO-PUBLISHING-MAP.md` §4).
2. **v3 feed:** split feed + monthly archive + `urlPath`, `instruments[]`, `origin`, `lead`, `dataAsOf`/`validUntil`/`stalePolicy`.
3. **Homepage restructured as a live publication** (IA §5), with the graceful absence rules and the freshness model.
   **No visual redesign:** the same design system, restructured sections.
4. **Header:** Markets · Gold · Analysis · News · Signals · Learn · language · Join Telegram (no "FOXREX" label; the
   logo links home). The footer gains the FOXREX / Coverage / Legal / Follow groups.
5. **Attribution line** on every item (desk / analyst / "AI-assisted, reviewed by the desk" only where true).
6. **Hero copy per edition:** English-only on `/`, Arabic-native on `/ar/`. No mixed-language decoration.

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
- [ ] Legal pages reviewed by the owner/legal; entity and jurisdiction filled by the owner (never invented). Risk
      disclosure is linked from every signal and analysis.
- [ ] No capability is described publicly unless its status is verified (§7). Anything at STATUS REQUIRES SYSTEM
      VERIFICATION is not mentioned on the public site.

## 2. P1 — next, once its data or content exists

| Item | Prerequisite |
|---|---|
| Market Pulse on Home + `/markets/` live table | PR #6 merged + provider credentials + verified LIVE/DELAYED states |
| `/markets/<symbol>/` instrument pages | Live data + enough tagged content per symbol |
| `/calendar/` + automated Event of the Day inputs | A licensed calendar data source |
| `/signals/<id>/` + `/signals/results/` | First closed signals (losses included) |
| `/desk/` archive + `/desk/<date>/` | ~2 weeks of desk content |
| US Session Preview 15:30, Event of the Day 14:00, REX Note 19:00 (when it adds value) | Desk capacity (`FOXREX-EDITORIAL-SYSTEM.md` §5) |
| Coverage beyond gold/FX/macro (indices, crypto, commodities) | Registry entries + desk capacity; no schema or URL change |
| Signals access tiers (MEMBER / PREMIUM) | Owner decision on the commercial model; the field exists, nothing is gated |
| Weekly Outlook + `/analysis/weekly-outlook/` | Weekly commitment |
| `/methodology/`, `/technology/` | Owner-confirmed capability statuses |
| `/technology/` | Every listed capability verified (§7). Not on the homepage |
| Telegram derivative text generated at publish (operator posts manually) | v3 engine |
| Ask REX answers as `/learn/<slug>/` (`format=qa`) | Real questions from the community |

## 3. P2 — later

- Computed Desk Read / market regime (data-derived, labelled BETA until validated).
- `/learn/glossary/`, site search, RSS feeds.
- Instruments beyond the six public symbols (XAGUSD, US30, NAS100, SPX500, WTI, ETHUSD; US10Y needs a source).
- Automated Telegram/social posting, newsletter.
- The cinematic Experience and the "Market Noise / information field" storytelling element (preserved, not built).
- Accounts, personalisation, paid tiers, paywall, pricing (not decided by the owner; architecture keeps `access` ready).

## 4. REMOVE (from the current site)

| Remove | Why | Replace with |
|---|---|---|
| Hero 5-pillar list | Repeats the navigation | What Matters Now (Home 02) |
| Five "Not yet published today" desk cards | Five empty states on the front page | Timeline showing only published items and upcoming times |
| Empty ticker placeholder ("not connected") | A placeholder pulse is worse than none | Hidden until live (P1) |
| Gold Focus "—" empty card, "No analysis/news/signals published yet" blocks on Home | Shell impression | Sections are omitted when empty (graceful absence rules) |
| Ask REX empty tab | No content | Ask REX on Telegram link; Q&A pages later |
| "WhatsApp channel: coming soon" | Promise without date | Remove until it exists |
| "Why FOXREX" vague claims (Speed, Research, Data) and "AI Intelligence — In development" | Unverified capability claims | Nothing until verified (§7); `/technology/` (P1) lists verified statuses only |
| Duplicated signals explainer on Home | Duplicate of `/signals/` | One line + link to methodology |
| Static "What moves gold" copy on `/gold/` that duplicates a lesson | Duplicate content | Link to `/learn/gold-and-yields/` |
| `/foxrex-studio.html` stub | Legacy | 301 to `/studio/` or delete |
| Internal docs served from the Pages root (verify) | Hygiene and exposure | Exclude from the Pages artifact |
| Arabic tagline inside the English hero («تداول أذكى... فرص أكبر») | **Owner decision 3:** no mixed-language branding decoration | English-only hero on `/`; the Arabic tagline belongs to the Arabic-native hero on `/ar/` |
| Homepage "How FOXREX works" / technology showcase | Brand promotion on a publication front page; unverified claims | Footer link to `/technology/` (P1), verified statuses only |

## 5. KEEP (good and already true)

- The honest data posture: freshness states, "never fabricate", no performance claims.
- The bilingual architecture (`/ar/` mirror, RTL, typography rules).
- The 5 REX lessons (become permalinks).
- The About principles (no fake data, risk first, people review AI, education not advice) and Meet REX.
- The signal contract: entry, stop on the correct side, targets, risk message, context, results recorded incl. losses.
- The Studio lifecycle, approval gate, dry run, idempotency, audit trail, and "AI-generated news is never publishable".
- The approved FOXREX identity and REX-MASTER, unchanged. REX appears only where he explains, teaches or interprets.

## 6. Legal and trust items (owner input required)

| Item | Status |
|---|---|
| Legal entity / company name | **TBD — OWNER INPUT REQUIRED** |
| Registration | **TBD — OWNER INPUT REQUIRED** |
| Regulator / licence / regulatory status | **TBD — OWNER INPUT REQUIRED** |
| Jurisdiction / governing law | **TBD — OWNER INPUT REQUIRED** |
| Office / registered address | **TBD — OWNER INPUT REQUIRED** |
| Conflict-of-interest statement (staff trading, broker affiliations) | **TBD — OWNER INPUT REQUIRED** |
| Signals commercial model (free / member / premium) | **TBD — OWNER DECISION.** No paywall, no pricing claims |

None of these may be invented or implied by the website, Studio templates or generated copy. The legal pages stay in
**draft** until owner/legal review.

## 7. Capability status (evidence-based)

Sources inspected (2026-10-04): `main` (site, `studio/`, `worker/src`, `README.md`, `SECURITY.md`, `docs/`), and every
remote branch, including PR #6 (`claude/landing-admin-login`, `docs/MARKET-DATA.md`) and PR #7.

| Capability | Repository evidence | Status |
|---|---|---|
| Trading engine | None found in any branch | **STATUS REQUIRES SYSTEM VERIFICATION** |
| Decision system | None found (the WAIT → BUY discipline is an editorial rule, not a system) | **STATUS REQUIRES SYSTEM VERIFICATION** |
| ML | None found | **STATUS REQUIRES SYSTEM VERIFICATION** |
| AI reasoning (market analysis) | None found for market analysis. What exists: optional **local** creative-ideation reasoning in the worker (Ollama, off by default) and AI-drafted translations that can only be DRAFTs | **STATUS REQUIRES SYSTEM VERIFICATION** for any market-analysis claim. Supportable public wording today: "AI may assist drafting; a person reviews everything before publication" |
| Risk engine | None found. Studio *validation* enforces a stop-loss, risk message and stop placement on signals; that is a content rule, not a risk engine | **STATUS REQUIRES SYSTEM VERIFICATION**. Never call validation a "risk engine" |
| Execution | None found; no broker or order integration | **STATUS REQUIRES SYSTEM VERIFICATION**. Out of scope for the website |
| Market-data infrastructure | Implemented and tested in **unmerged PR #6**; `PROVIDER_CONNECTION=BLOCKED_MISSING_CREDENTIALS`; no live provider | **STATUS REQUIRES SYSTEM VERIFICATION** before any public label. Factually: built, not merged, not connected, **not LIVE** |
| Studio CMS + publishing engine (internal) | Merged (PR #5), test suite present; `REAL_PUBLICATION=NOT_STARTED` | Internal tool; not a public capability claim |

Systems that might exist outside this repository (e.g. on the owner's machines) cannot be verified from here. The
public site describes **none** of the above as LIVE, BETA, RESEARCH or PLANNED until each is verified. The current
homepage line "AI Intelligence — In development" should be replaced by the supportable wording above.
