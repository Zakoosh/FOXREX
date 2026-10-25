# Editorial presentation, Turkish edition and themes

Owner request, 26 October 2026 (Istanbul): no public editor/AI byline; professional illustrated articles with subheadings and CTA; dark/light modes; Turkish edition; fix language issues.

- The canonical feed now supports `en`, `ar`, `tr`. Permanent paths use `/`, `/ar/`, `/tr/`; each translation preserves its group and route. Hreflang advertises only published translations, with an English x-default when available.
- Public article pages display publication/update dates and reading time, without editor/AI labels. Internal provenance is retained. Structured data uses the FOXREX organization rather than an invented individual author.
- Plain-text article blocks with a short first line and a following paragraph become escaped H2 sections with a table of contents. No raw HTML is accepted. Covers, relevant calendar/Telegram CTA, source panel and risk statement share the brand design.
- Turkish static/UI translations live in `data/locales/tr.json`; generated `scripts/public/tr.js` also serves runtime labels. Article translations are separate records, not browser translation. Calendar titles, country names and coverage have explicit Turkish values. Dates are localized, while timestamps remain UTC and the editorial timezone stays Europe/Istanbul.
- `styles/themes.css` overrides semantic colors for the light edition. Theme is chosen before paint from `foxrex-theme` or the system preference; the accessible header button persists it across pages/languages. Studio has its own theme and is unchanged.
- Existing article identity and source evidence are preserved by the idempotent, validated `tools/editorial/enrich.mjs` migration and `content-ops/updates/2026-10-26-tr-presentation.json`.
- The daily task now requires all three languages, owned covers, subheadings, CTAs and no public byline. See `docs/DAILY-EDITORIAL.md`.

## Owned cover assets

Built-in image generation was used, then the project assets were encoded as optimized WebP. Original PNGs were retained. Neither cover is a data chart or evidence of an actual event; descriptive alt text makes no institutional identification.

- `assets/media/gold-editorial-v1.webp`: gold bullion, midnight navy, emerald reflections, restrained gold.
- `assets/media/macro-editorial-v1.webp`: generic financial architecture at dusk, emerald lighting, navy shadows and gold highlights.

Prompt set: premium 16:9 financial magazine photography for FOXREX; midnight navy #0B1320, emerald #00D4A7, restrained warm gold. Gold cover: three detailed bullion bars on a navy architectural plinth, brushed-metal texture, depth of field and negative space. Macro cover: generic neoclassical financial facade at dusk, low cinematic angle, emerald-lit columns and gold reflections. Both: no text, logos, numbers, data charts, identifiable people or watermark; standalone covers, not UI mockups.
