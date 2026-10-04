# FOXREX Publishing Engine & Studio CMS

Studio is the editorial control plane; the public site is the presentation layer. Nothing reaches foxrex.co without a named operator approving it and explicitly confirming publication.

```
FOXREX Studio (browser, /studio/)          — library, editor, review, preview, confirmation
        │  HTTPS→localhost, bearer token, X-Foxrex-Actor
        ▼
Worker (operator machine, 127.0.0.1:8787)  — authoritative CMS store + publishing engine
        │  worker/data/cms/records.json · publications.json   (git-ignored, never public)
        ▼
PUBLISH_REPO_DIR (clean clone of Zakoosh/FOXREX)
        │  data/content.json (v3) → checks → generate permanent pages (tools/site/build.mjs) → one commit → git push (machine's own credentials, never forced)
        ▼
GitHub Pages → https://foxrex.co/  and  https://foxrex.co/ar/   (static; visitors never call the worker)
```

## Lifecycle

`IDEA → DRAFT → REVIEW → APPROVED → (SCHEDULED) → PUBLISHED → ARCHIVED`

| Action | From | Who |
|---|---|---|
| Save draft | IDEA, DRAFT (edits to REVIEW/APPROVED/SCHEDULED/PUBLISHED return the item to **DRAFT** and clear approval) | operator |
| Submit for review | IDEA, DRAFT — full validation must pass | operator |
| Approve / Request changes | REVIEW | operator (recorded as `approvedBy`) |
| Schedule / Unschedule | APPROVED ↔ SCHEDULED (future Istanbul time, stored UTC) | operator |
| **Publish** | APPROVED, or SCHEDULED once due — preview + explicit confirmation | operator via engine |
| Unpublish | live items → removed from feed, ARCHIVED, history kept | operator via engine |
| Archive / Restore | not-live items ↔ ARCHIVED | operator |

Save ≠ Approve ≠ Publish. AI can only create **DRAFT** translations; there is no AI or automatic approval path. Each language is its own record (`language` = `en` | `ar`, shared `translationGroupId`, e.g. `gold-focus-2026-09-30-xauusd-en` / `-ar`) and needs its own review and approval.

## Content types → permanent URLs (content model v3)

Defined once in `studio/cms-model.js` (`TYPES`, `routeFor`) and used by Studio, the engine, the site generator and the
tests. Every published item gets a permanent page: English at `/<urlPath>`, Arabic at `/ar/<urlPath>`. The full rules
are in `CONTENT-ROUTING.md`; the model is in `CONTENT-BACKBONE-V3.md`.

| Type (layer) | Permanent path | Also listed on |
|---|---|---|
| MORNING_BRIEF · US_SESSION_PREVIEW (legacy US_OPEN) · MARKET_RECAP · EVENT (Market Intelligence) | `desk/<date>/<slot>/` | home desk, `desk/` archive, (EVENT: news) |
| GOLD_FOCUS (Trading + Market Intelligence) | `gold/<date>/` | home, gold, `desk/` archive |
| ANALYSIS · WEEKLY_OUTLOOK (Market Intelligence) | `analysis/<slug>/` | home, analysis, (`analysis/weekly-outlook/`) |
| NEWS (Market Intelligence) | `news/<slug>/` | home, news |
| TRADING_IDEA · SIGNAL (Trading Intelligence) | `signals/<slug>/` | home, signals |
| SIGNAL_RESULT (Trading Intelligence) | `signals/results/<slug>/` | signals, `signals/results/` |
| REX_EXPLAINS (legacy LEARN · REX_NOTE · ASK_REX) (Market Intelligence) | note → `desk/<date>/rex-note/`, else `learn/<slug>/` | learn |
| REEL · STORY · CAROUSEL · CAMPAIGN | social only — never on the website, no URL | — |

The URL is fixed at first publication. Titles can change, but the slug cannot (`SLUG_LOCKED`). EN and AR share the
path. A path held by another item, or a second desk piece for the same day, is refused with `409 ROUTE_COLLISION`.
Unpublishing leaves a noindex "withdrawn" notice at the URL and removes the item from every listing and from the
sitemap.

## Validation (enforced in Studio **and** again server-side)

- Plain text only — any HTML, `javascript:` or event handler is rejected; the public renderer escapes everything anyway.
- NEWS and EVENT need at least one source with a name and `https://` URL. AI-generated news is never publishable.
- Any price needs `priceSource` and `priceTime` — never an unsourced current price.
- SIGNAL needs direction, entry, **stop-loss** (on the correct side of entry), targets, **risk message** and analysis context.
- SIGNAL_RESULT must reference a signal that exists and was published; closed time cannot be in the future.
- GOLD_FOCUS needs bias, market state, support, resistance, both scenarios and invalidation; ANALYSIS needs symbol, category and bias; both need a risk disclosure.
- Images: `assets/media/…(png|jpg|webp)` with alt text — no `data:` URIs; the file must exist in the repo.
- Feed: JSON Schema `data/content.schema.json` (per-type `oneOf`) + integrity rules (unique IDs, no future `publishedAt`, no test fixtures) via `node tools/site/check-feed.mjs`.

## Publishing guarantees

- **Approval gate** — only APPROVED (or due SCHEDULED) records with a recorded approver and passing validation.
- **Dry run** — `PUBLISH_MODE=dry-run` (default) and the Studio "Dry run" button: validation, permanent URL, candidate feed, schema + site tests, diff preview and the list of pages that would be generated; no write, commit or push.
- **Optimistic concurrency** — Studio sends the feed version it previewed; if `data/content.json` changed, the engine answers `409 CONFLICT` ("Published content changed since this item was loaded. Refresh before publishing.") and writes nothing.
- **Idempotency** — each request carries `Idempotency-Key: publish:<id>@r<revision>`; a repeated successful request returns the original publication and creates no commit or duplicate entry.
- **Transactional** — the repo must be on `PUBLISH_BRANCH`, clean, and fast-forwardable. The feed and the pages generated from it are committed together (`Permanent-Url` trailer). Failed checks, generation, commit or push restore the previous HEAD and remove the generated files; the record stays APPROVED for retry and the failure is logged.
- **Versioning** — every publication increments `publishVersion`; editing a published item creates a new DRAFT while the live version keeps serving until republished.
- **Audit** — per-record history plus a publication log (`publicationId`, content, language, type, version, requested/published times, commit SHA, actor, destinations, result, error). Commits carry `Content-Id`, `Publish-Version`, `Publication-Id`, `Approved-By`, `Published-By` trailers.
- **Deployment status** — `PUBLISHING → COMMITTED → PUSHED → DEPLOYING → LIVE`. LIVE is set only after the public feed at `PUBLIC_FEED_URL` actually contains the new version ("Check deployment" in the Publication Center).

## Scheduling

Scheduled items store `scheduledAt` in UTC (entered in Istanbul time), are never placed in the public feed before that time (the feed never carries future items), and appear under *Ready to publish* once due. **Automatic execution is BLOCKED by default** (`SCHEDULER_ENABLED=false`): the worker runs on the operator's machine, not an always-on server, and a public-repo queue would leak unpublished content. Enable the built-in scheduler only on an always-on host.

## Before the FIRST real publication (operator checklist)

1. On the publishing machine: `git clone git@github.com:Zakoosh/FOXREX.git foxrex-publish` (a dedicated clean clone). Confirm `git -C foxrex-publish push --dry-run` works with this machine's credentials.
2. In `worker/.env`: `PUBLISH_REPO_DIR=/path/to/foxrex-publish`, `PUBLISH_MODE=dry-run`, a strong `STUDIO_WORKER_TOKEN`, `ALLOWED_ORIGIN=https://foxrex.co`. Restart the worker (`npm start`).
3. Studio → Settings: worker URL `http://127.0.0.1:8787`, the token, and **operator name**.
4. Create the real item (e.g. today's Gold Focus) in Content → Editorial, fill every required field and real sources, save, submit, approve.
5. **Preview & publish → Dry run.** Read the diff. Fix anything reported.
6. Only then set `PUBLISH_MODE=live`, restart the worker, reopen the preview, **Publish…**, confirm.
7. Publication Center → *Check deployment* until **LIVE**, then open the public page. Never publish TEST/fixture items — the engine and the site tests reject them.

## Local verification

`npm test` in `worker/` runs the end-to-end suite against an isolated temporary git repository with a local bare remote (never GitHub): create → review → approve → dry run → publish → idempotent replay → conflict → EN/AR isolation → v2 → unpublish, plus failure, auth, CORS, AI and scheduling cases.
