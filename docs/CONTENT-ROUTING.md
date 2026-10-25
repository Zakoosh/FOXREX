# FOXREX Content Routing — permanent URLs, EN/AR, SEO

Implemented in `studio/cms-model.js` (`routeFor`, `pathFor`, `canonicalUrl`, `ROUTE_RE`), `worker/src/content-v3.js`
(identity at publication), `scripts/content/select.js` (`translationOf`, `alternatesFor`) and
`tools/site/content-pages.mjs` (pages).

## 1. Identity

- **`id`** = `<translationGroupId>-<lang>`.
  - It is created once, when the Studio record is created, from type, date and slug.
  - It is never derived from the title and never changes.
  - A title edit changes nothing about identity.
- **`translationGroupId`** links the EN and AR records. Each language is a separate record, with its own title,
  summary, body, approval, status and timestamps.
- **`slug`** is lowercase Latin `[a-z0-9-]`, and the EN and AR records share it. The CMS store (`SLUG_LOCKED`) and the
  publisher both lock it after first publication.
- **`urlPath`** is computed by the publisher at the **first** publication of the translation group, then reused for
  ever: on republication, after a title change, for the other language, and after a withdrawal and restore.

## 2. Route rules (deterministic)

| Type | Path | Notes |
|---|---|---|
| Morning Brief | `desk/<date>/morning-brief/` | one per editorial day |
| Event of the Day | `desk/<date>/event/` | one per editorial day |
| US Session Preview | `desk/<date>/us-session-preview/` | one per editorial day |
| Market Recap | `desk/<date>/market-recap/` | one per editorial day |
| REX Note (`REX_EXPLAINS` format `note`) | `desk/<date>/rex-note/` | one per editorial day |
| Gold Focus | `gold/<date>/` | one per editorial day |
| Analysis, Weekly Outlook | `analysis/<slug>/` | |
| News | `news/<slug>/` | |
| Trading Idea, Signal | `signals/<slug>/` | |
| Signal Result | `signals/results/<slug>/` | |
| REX lesson / explainer / Q&A | `learn/<slug>/` | |

- **Dates:** `<date>` is the **Istanbul** editorial date (`YYYY-MM-DD`) of the group's first publication. A recap
  published at 00:30 IST belongs to the new day.
- **Arabic:** the same path under `/ar/`. There is no query-string localisation and no `?lang=`.
- **Reserved slugs:**
  - `analysis/weekly-outlook`
  - `signals/results`
  - `signals/methodology`
  - `learn/glossary`
- **Collisions are refused, not renamed.** Each case returns `409 ROUTE_COLLISION`:
  - another translation group already owns the path (published or withdrawn);
  - a second Morning Brief or Gold Focus for the same day ("update the existing item instead");
  - an EN/AR slug mismatch.
- **Social-only types** have no route.

## 3. EN ↔ AR

- **Hreflang:** an item page carries `hreflang` alternates only for languages that are actually **published**.
  `x-default` (pointing to English) appears only when both exist.
- **Language switch:** it goes to the published translation. If there is none, it goes to the other language's
  **hub** for that section, not to a 404 and not to an invented URL.
- **Independent translations:** an AR item can be published, updated and withdrawn independently. Withdrawing one
  language removes the relationship from the other page on the next build.
- **No machine translation at runtime:** a missing translation simply does not exist on the site.

## 4. Generated pages

| Page | Exists when | Indexed |
|---|---|---|
| Item page at `/<urlPath>` and `/ar/<urlPath>` | the item is published in that language | yes, and listed in the sitemap |
| Withdrawn notice at the same URL | the item was unpublished and nothing else holds the path | **noindex**, not in the sitemap |
| `desk/` | at least one desk piece in that language | yes |
| `archive/` and `archive/<yyyy-mm>/` | at least one item that month in that language | yes |
| `analysis/weekly-outlook/` | at least one Weekly Outlook in that language | yes |
| `signals/results/` | at least one Signal Result in that language | yes |

- **No empty archives:** with no qualifying content the page is not built and not in the sitemap.
- **Discoverability:** a published item is reachable from:
  - its canonical URL;
  - its section hub (client-rendered list, with the title linking to the permanent page);
  - the monthly archive and, where it applies, the desk, weekly-outlook or results archive;
  - `sitemap.xml`, with `lastmod` and alternates.
- **Tags:** tag pages are not generated (the information architecture treats tags as filters). The `latestByTag`
  selector serves those filters.

## 5. SEO contract (item pages)

**On every item page:**
- **Canonical:** absolute `https://foxrex.co/…`, Arabic under `/ar/`.
- **Title:** the SEO title or the item title, followed by "— FOXREX".
- **Description:** the SEO description or the summary, at most 200 characters.
- **Language:** `<html lang dir>`, with `og:locale` (and `og:locale:alternate` only when a translation exists).
- **Open Graph:** `og:type=article`, title, description, url and image.
- **Twitter:** card, title, description and image.
- **Article times:** `article:published_time` (first publication), `article:modified_time` and `article:section`.

**Structured data** is added only where it is accurate:
- `NewsArticle` for News and `Article` for the other editorial types.
- `author` is the FOXREX organisation, or an editor-entered byline. It is never an invented person.
- `publisher` is the FOXREX organisation with its logo.
- There is **no** structured data on signals, ideas or results.
- There are no legal-entity, address or licence claims (the legal entity is TBD, pending owner input).

**Escaping:** all text is escaped at build time, and Arabic Latin runs are isolated in `<bdi class="lt">`. Only
https source URLs are linked.

## 6. Hubs and the client renderer

The section hubs remain the existing pages, filled client-side by `scripts/public/content.js` from the same feed.
Titles now link to the permanent page (`urlPath` is validated before it is linked). Hubs and the homepage are not
redesigned in this phase.
