# FOXREX — Sitemap (EN + AR)

**Status:** final URL structure, revised after owner decisions, 2026-10-04. Not implemented.
**P0** = launch, **P1** = next once its data or content exists, **P2** = later. "Exists" means the page is live today.

## 1. URL rules

1. **English at the root, Arabic under `/ar/`**, with the same path: `/gold/` ↔ `/ar/gold/`.
2. **Slugs are Latin, lowercase, `[a-z0-9-]`, identical in both editions.** This keeps the language switch to "add or
   remove `/ar`", keeps links stable and avoids encoded Arabic URLs. The Arabic *title* is Arabic; only the slug is Latin.
3. **Trailing slash, directory-style** (`/news/<slug>/index.html`), matching the current static build.
4. **Dates are `yyyy-mm-dd` in Istanbul time.**
5. **A published URL is permanent** (see `FOXREX-STUDIO-PUBLISHING-MAP.md` §5).
6. Every page carries `<link rel="alternate" hreflang="en|ar|x-default">` for its pair, and `x-default` is English.
   If only one language of an item exists, there is no hreflang pair, and the language switch goes to the section
   page in the other edition.
7. Filters are query parameters (`/news/?f=central-banks`), not pages, and are `noindex`.
8. **No empty archives.** An archive or listing URL (`/desk/`, `/signals/results/`, `/analysis/weekly-outlook/`,
   `/markets/<symbol>/`) is generated only once it has real items; until then it is not in the build or the sitemap.
9. **Extensible coverage.** `/markets/<symbol>/` and instrument filters come from the symbol registry, so indices,
   crypto, commodities and other markets need no new URL pattern.
10. **Access tiers do not change URLs.** If Signals later become MEMBER or PREMIUM, the permalink stays the same and
    the page shows what the tier allows. At launch everything is PUBLIC.
11. **Layers in the URL space:** Market Data [A] lives at `/markets/`; Market Intelligence [B] at `/news/`,
    `/analysis/`, `/desk/` and `/learn/`; Trading Intelligence [C] at `/signals/`. `/gold/` is the flagship that
    spans all three.

## 2. Full URL list

| EN | AR | Page | Priority | Today |
|---|---|---|---|---|
| `/` | `/ar/` | Home: Today at FOXREX | **P0** | exists (rebuild content) |
| `/markets/` | `/ar/markets/` | Markets overview | **P0** | exists |
| `/markets/<symbol>/` | `/ar/markets/<symbol>/` | Instrument page (xauusd, eurusd, gbpusd, usdjpy, btcusd, dxy…) | P1 | — |
| `/calendar/` | `/ar/calendar/` | Economic calendar | P1 (needs data source) | — |
| `/gold/` | `/ar/gold/` | Gold hub | **P0** | exists |
| `/gold/<yyyy-mm-dd>/` | `/ar/gold/<yyyy-mm-dd>/` | Daily Gold Focus permalink | **P0** | — |
| `/analysis/` | `/ar/analysis/` | Analysis list + filters | **P0** | exists |
| `/analysis/<slug>/` | `/ar/analysis/<slug>/` | Analysis article | **P0** | — |
| `/analysis/weekly-outlook/` | `/ar/analysis/weekly-outlook/` | Weekly Outlook archive | P1 | — |
| `/news/` | `/ar/news/` | News That Matters list + filters | **P0** | exists |
| `/news/<slug>/` | `/ar/news/<slug>/` | News story | **P0** | — |
| `/signals/` | `/ar/signals/` | Active signals and ideas + recent outcomes | **P0** | exists |
| `/signals/methodology/` | `/ar/signals/methodology/` | How signals work + risk methodology | **P0** | — (content exists on `/signals/`) |
| `/signals/<id>/` | `/ar/signals/<id>/` | One signal with its update history | P1 | — |
| `/signals/results/` | `/ar/signals/results/` | Every closed result, losses included | P1 (after first results) | — |
| `/learn/` | `/ar/learn/` | Learn with REX hub | **P0** | exists |
| `/learn/what-is-cpi/` | `/ar/learn/what-is-cpi/` | Lesson | **P0** | content exists (inline) |
| `/learn/gold-and-yields/` | `/ar/learn/gold-and-yields/` | Lesson | **P0** | content exists (inline) |
| `/learn/what-is-a-breakout/` | `/ar/learn/what-is-a-breakout/` | Lesson | **P0** | content exists (inline) |
| `/learn/market-structure/` | `/ar/learn/market-structure/` | Lesson | **P0** | content exists (inline) |
| `/learn/risk-reward/` | `/ar/learn/risk-reward/` | Lesson | **P0** | content exists (inline) |
| `/learn/<slug>/` | `/ar/learn/<slug>/` | Further lessons / promoted REX notes / Ask REX answers | **P0** (template) | — |
| `/learn/glossary/` | `/ar/learn/glossary/` | Glossary | P2 | — |
| `/desk/` | `/ar/desk/` | Desk archive by date | P1 | — |
| `/desk/<yyyy-mm-dd>/` | `/ar/desk/<yyyy-mm-dd>/` | One day's desk | P1 | — |
| `/desk/<yyyy-mm-dd>/morning-brief/` | `/ar/desk/<yyyy-mm-dd>/morning-brief/` | Morning Brief | **P0** | — |
| `/desk/<yyyy-mm-dd>/event/` | `/ar/desk/<yyyy-mm-dd>/event/` | Event of the Day | P1 | — |
| `/desk/<yyyy-mm-dd>/us-session-preview/` | `/ar/desk/<yyyy-mm-dd>/us-session-preview/` | US Session Preview | P1 | — |
| `/desk/<yyyy-mm-dd>/rex-note/` | `/ar/desk/<yyyy-mm-dd>/rex-note/` | REX Note | P1 | — |
| `/desk/<yyyy-mm-dd>/market-recap/` | `/ar/desk/<yyyy-mm-dd>/market-recap/` | Market Recap | **P0** | — |
| `/about/` | `/ar/about/` | About + Meet REX | **P0** | exists |
| `/methodology/` | `/ar/methodology/` | Editorial, data and AI methodology | P1 | — |
| `/technology/` | `/ar/technology/` | Capabilities with LIVE/BETA/RESEARCH/PLANNED | P1 | — |
| `/contact/` | `/ar/contact/` | Contact | **P0** | exists |
| `/risk-disclosure/` | `/ar/risk-disclosure/` | Risk Disclosure | **P0** (draft until owner/legal review) | exists |
| `/terms/` | `/ar/terms/` | Terms of Use | **P0** (draft until owner/legal review) | exists |
| `/privacy/` | `/ar/privacy/` | Privacy Policy | **P0** (draft until owner/legal review) | exists |
| `/404.html` | (shared) | Not found | **P0** | exists |
| `/sitemap.xml` | (includes `/ar/`) | XML sitemap | **P0** | — |
| `/feed.xml` · `/ar/feed.xml` | | RSS of desk + analysis + news | P2 | — |

**Not public pages:** `/studio/` (operator tool, behind Cloudflare Access per `CLOUDFLARE-ACCESS.md`; `noindex`) and
`/experience/` (PR #7, unmerged, out of scope).

**Remove / redirect:** `/foxrex-studio.html` → 301 to `/studio/` (or delete). Internal docs at the Pages root
(`GENERATION.md`, `VERIFICATION.md`, `docs/`, `worker/`) should not be served publicly; verify and exclude them from the
Pages artifact.

## 3. Language pairing

- An EN and an AR item that share a `translationGroupId` **share a `urlPath`**, so the pair is `/x/` ↔ `/ar/x/`.
- The Arabic edition is **a first-class edition, not a literal translation.** It uses the same facts, levels, sources and
  times, with Arabic-native headlines, framing and examples. It may publish minutes later than English (or earlier).
- Arabic typography rules stay as they are (`ARABIC-BRAND-TYPOGRAPHY.md`): IBM Plex Sans Arabic + Inter, Latin
  runs (symbols, numbers, levels) in `<bdi class="lt">`, RTL layout. Symbols and levels are never translated or
  re-typed. Protected tokens are checked by the existing translation check.
- Times are shown in IST in both editions ("09:00 IST" / "09:00 بتوقيت إسطنبول").

## 4. Count at launch (P0)

- **Section/static pages:** 13 × 2 languages = 26 (home, markets, gold, analysis, news, signals, signals/methodology,
  learn, about, contact, risk-disclosure, terms, privacy), plus the 404.
- **Lessons:** 5 × 2 = 10.
- **Templates that generate permalinks as content is published:** Gold Focus (date), Morning Brief, Market Recap,
  analysis, news, lessons.
- **No P0 page exists without content:** the only new static page is `/signals/methodology/`, and its content already exists.
