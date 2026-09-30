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
        │  data/content.json → checks → commit → git push (machine's own credentials, never forced)
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

## Content types → destinations

Defined once in `studio/cms-model.js` (`TYPES`), used by Studio, the engine and the tests.

| Type | Website section | Pages |
|---|---|---|
| MORNING_BRIEF · US_OPEN · MARKET_RECAP | Daily Desk slot | home |
| GOLD_FOCUS | Gold Focus (+ Daily Desk gold slot) | home, gold |
| EVENT | Daily Desk + News | home, news |
| ANALYSIS | Latest Analysis | home, analysis |
| NEWS | Market News | home, news |
| SIGNAL · SIGNAL_RESULT | Signals / Recent results | signals |
| LEARN · REX_EXPLAINS · REX_NOTE · ASK_REX | Learn / REX | learn |
| REEL · STORY · CAROUSEL · CAMPAIGN | social only — never on the website | — |

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
- **Dry run** — `PUBLISH_MODE=dry-run` (default) and the Studio "Dry run" button: validation, candidate feed, schema + site tests, diff preview; no write, commit or push.
- **Optimistic concurrency** — Studio sends the feed version it previewed; if `data/content.json` changed, the engine answers `409 CONFLICT` ("Published content changed since this item was loaded. Refresh before publishing.") and writes nothing.
- **Idempotency** — each request carries `Idempotency-Key: publish:<id>@r<revision>`; a repeated successful request returns the original publication and creates no commit or duplicate entry.
- **Transactional** — the repo must be on `PUBLISH_BRANCH`, clean, and fast-forwardable. Failed checks, commit or push restore the previous HEAD; the record stays APPROVED for retry and the failure is logged.
- **Versioning** — every publication increments `publishVersion`; editing a published item creates a new DRAFT while the live version keeps serving until republished.
- **Audit** — per-record history plus a publication log (`publicationId`, content, language, type, version, requested/published times, commit SHA, actor, destinations, result, error). Commits carry `Content-Id`, `Publish-Version`, `Publication-Id`, `Approved-By`, `Published-By` trailers.
- **Deployment status** — `PUBLISHING → COMMITTED → PUSHED → DEPLOYING → LIVE`. LIVE is set only after the public feed at `PUBLIC_FEED_URL` actually contains the new version ("Check deployment" in the Publication Center; the worker also polls every 30 s for up to 15 min). If the public feed cannot be read, the status is **DEPLOYED_UNVERIFIED**, never LIVE. The GitHub Pages run status is recorded when it is readable.

- **Preflight**: the preview modal runs `POST /api/publish/preflight` and shows `READY TO PUBLISH` or every blocker. Publish stays disabled until the preflight is ready **and** the worker is in live mode.
- **Rollback**: Editor → Publishing → *Published versions* → **Republish vN…** calls `POST /api/republish`. It writes the stored public entry of vN back as a **new** version in a new corrective commit with a `Rollback-To-Version: N` trailer. History is never rewritten. **Unpublish** removes the item with a new commit.
- **Expiry**: `expiresAt` (optional, UTC). Expired items cannot be published or republished as current. The public renderer drops expired items from the Daily Desk and Gold Focus and labels them *Expired* in lists.
- **Commissioning**: `POST /api/publish/commission`, also available from Studio → System Status and `node scripts/commission.mjs`. It proves repo → fetch → push authorization (`git push --dry-run` to a probe ref) → feed regeneration → tests → no mutation, with no record, commit or push. Evidence: docs/COMMISSIONING.md.

## Scheduling

Scheduled items store `scheduledAt` in UTC (entered in Istanbul time), are never placed in the public feed before that time (the feed never carries future items), and appear under *Ready to publish* once due. **Automatic execution is BLOCKED by default** (`SCHEDULER_ENABLED=false`): the worker runs on the operator's machine, not an always-on server, and a public-repo queue would leak unpublished content. Enable the built-in scheduler only on an always-on host (docs/ALWAYS-ON.md).

When enabled, due items are re-validated at execution time and published with the idempotency key `schedule:<id>@<scheduledAt>`, so there is no double publish after a restart. The scheduler never auto-publishes:
- **MISSED** items: time-sensitive types more than 15 min late (`SCHEDULE_GRACE_MINUTES`), or other types more than 24 h late;
- **EXPIRED** items;
- **STALE** items, whose content changed after scheduling;
- **INVALID** items.

Such items are flagged in the library and editor, audited, and wait for an explicit operator publish or reschedule.

## First bilingual Gold Focus (workflow)

1. Content → Editorial → **Gold Focus جديد ثنائي اللغة (EN + AR)** creates an empty EN draft and an empty, linked AR draft. Nothing is generated or invented.
2. Fill each language from the operator's own analysis:
   - bias (BULLISH / BEARISH / NEUTRAL);
   - support and resistance rows, and the important level;
   - bullish and bearish scenarios;
   - invalidation;
   - summary;
   - at least one real source;
   - optionally a price, only with its source and observation time;
   - optionally an expiry.
3. Follow the *Gold Focus checklist* panel until every line is ✓. Submit → approve **each language separately**.
4. Preview & publish → **Preflight** shows `READY TO PUBLISH` → Dry run → (live mode) Publish → Publication Center → *Check deployment* until **LIVE**.

## Before the FIRST real publication (operator checklist)

0. `node scripts/commission.mjs` on the control-plane host prints `COMMISSION_OK`.
1. On the publishing machine: `git clone git@github.com:Zakoosh/FOXREX.git foxrex-publish` (a dedicated clean clone). Confirm `git -C foxrex-publish push --dry-run` works with this machine's credentials.
2. In `worker/.env`: `PUBLISH_REPO_DIR=/path/to/foxrex-publish`, `PUBLISH_MODE=dry-run`, a strong `STUDIO_WORKER_TOKEN`, `ALLOWED_ORIGIN=https://foxrex.co`. Restart the worker (`npm start`).
3. Studio → Settings: worker URL `http://127.0.0.1:8787`, the token, and **operator name**.
4. Create the real item (e.g. today's Gold Focus) in Content → Editorial, fill every required field and real sources, save, submit, approve.
5. **Preview & publish → Dry run.** Read the diff. Fix anything reported.
6. Only then set `PUBLISH_MODE=live`, restart the worker, reopen the preview, **Publish…**, confirm.
7. Publication Center → *Check deployment* until **LIVE**, then open the public page. Never publish TEST/fixture items — the engine and the site tests reject them.

## Local verification

`npm test` in `worker/` runs the end-to-end suite against an isolated temporary git repository with a local bare remote (never GitHub): create → review → approve → dry run → publish → idempotent replay → conflict → EN/AR isolation → v2 → unpublish, plus failure, auth, CORS, AI and scheduling cases.
