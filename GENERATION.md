# FOXREX Studio — Direct Generation Architecture

Status date: 2026-09-27 · Studio v4 · Worker v0.1.0 · Verified against Higgsfield CLI v1.1.26

## 1. What changed

Before: Brief → Prompt → **Copy** → Claude → Download → **Upload**.
Now: Brief → **إنشاء المحتوى** → Preview → Approve / Regenerate → Asset Library.
The prompt compiler still runs (every version is stored); it just moved under *التفاصيل المتقدمة*. Manual Copy/Upload remains as the fallback.

## 2. Architecture

```
FOXREX Studio (browser)                          studio-generation-worker (Node ≥18, zero deps)
 Content Request                                   HTTP API  /providers /jobs /jobs/:id /assets/:file
 ├ Brand rules + Character Director                ├ Policy (server-side, frozen)  ← authoritative
 ├ Data validation (missing = blocked)             ├ Provider Router (capability + availability)
 ├ Prompt Compiler (versioned)                     ├ Job Store  (jobs.json → Postgres later)
 ├ Character reuse check (before spending credits) ├ Runner: PREPARING→SUBMITTED→GENERATING→RETRIEVING→VALIDATING
 └ POST /jobs  ───────────────────────────────▶    └ Providers
      poll GET /jobs/:id                              HIGGSFIELD_MCP  (not configured in worker)
      ingest outputs → Asset Library + lineage        HIGGSFIELD_CLI  → official CLI → plan credits
                                                      MANUAL_CLAUDE   → MANUAL_REQUIRED
                                                      HIGGSFIELD_API / CLAUDE_API → disabled stubs (no network code)
```

## 3. Provider interface

Every adapter exposes: `id, name, costMode, implemented, capabilities, healthCheck(), generateImage(), generateVideo(), getJobStatus(), waitJob(), cancelJob(), estimate(), credits()`.
Provider-specific logic lives only in `worker/src/providers/*`.

| Provider | Cost mode | State |
|---|---|---|
| HIGGSFIELD_MCP | SUBSCRIPTION_CREDITS | Adapter stub. Official hosted MCP uses OAuth 2.0 PKCE + dynamic registration; built for agent clients. Not configured inside the worker. |
| HIGGSFIELD_CLI | SUBSCRIPTION_CREDITS | **Implemented + tested with a CLI test double.** Official `@higgsfield/cli`, OAuth PKCE login, credentials stored locally by the CLI. |
| MANUAL_CLAUDE | EXISTING_SUBSCRIPTION_MANUAL | Implemented. Copy prompt + upload. |
| HIGGSFIELD_API | PAID_API | Disabled placeholder. Every method throws. |
| CLAUDE_API | PAID_API | Disabled placeholder. Every method throws. |

## 4. Routing

Order: `HIGGSFIELD_MCP → HIGGSFIELD_CLI → MANUAL_CLAUDE`. A provider is skipped if paid, not implemented, missing the capability, or unhealthy (health cached 30 s). The skip reasons are stored on the job (`routing`). Model choice is capability-based (`worker/src/models.js`): first configured model supporting the aspect ratio and reference count — default `nano_banana_2` (4:5 + 9:16, up to 14 references), then `gpt_image_2_5`.

## 5. Cost policy (hard requirement)

- `allowPaidApi=false`, `monthlyApiBudget=0`, `paidFallback=false` — frozen, server-side, not changeable over HTTP.
- `assertCostSafe()` runs in the router **and** again in the runner.
- Paid adapters contain no network code (a test greps the file).
- Client mirror (`@@ROUTER_START` block in the HTML) ignores paid providers even if a worker reports them available, and job requests can only name `MANUAL_CLAUDE`.
- When no subscription provider is available: job → `MANUAL_REQUIRED`, UI shows Retry / Copy Prompt / Upload, API spend stays `$0.00`.
- **Credits note:** Higgsfield states MCP/CLI generations always consume plan credits at standard rates; "unlimited" plan generations apply on higgsfield.ai only.

## 6. Job lifecycle

`QUEUED → PREPARING → SUBMITTED → GENERATING → RETRIEVING → VALIDATING → COMPLETED`
Terminal: `COMPLETED | FAILED | CANCELLED | MANUAL_REQUIRED`.
Job fields match the requested `studio_generation_jobs` entity (id, content_id, provider, provider_job_id(s), generation_type, model, status, prompt_version_id, character_asset_id, input_assets, output_assets, parameters, cost_mode, estimated_cost, actual_cost, credits_used, started/completed/failed_at, failure_code/message, created_by/at, updated_at) plus `routing`, `limitations`, `retry_of`.
Credits: estimated via `higgsfield generate cost`; actual = balance before − after (`account status`). Shown only when the CLI returns them.
On restart, in-flight jobs become `FAILED / WORKER_RESTARTED` — never stuck at "Generating…".

## 7. Failure handling

| Code | Result |
|---|---|
| CLI_NOT_INSTALLED, AUTH_EXPIRED, WORKSPACE_NOT_SELECTED, INSUFFICIENT_CREDITS, RATE_LIMITED, NOT_CONFIGURED | MANUAL_REQUIRED |
| GENERATION_REJECTED, GENERATION_TIMEOUT, DOWNLOAD_FAILED, INVALID_OUTPUT, MODEL_UNAVAILABLE, PROVIDER_ERROR | FAILED (Retry) |
| Worker unreachable from the Studio | MANUAL_REQUIRED (WORKER_OFFLINE) |

## 8. Character reference flow

1. Character required → Studio searches the approved Character Library for the same expression + pose → offers **reuse** (zero credits) before generating.
2. Otherwise attaches the **master reference** (Settings → set from Character Library) + the approved pose reference → sent to the worker → written to `data/inputs/` → passed as `--image-references` (CLI auto-uploads).
3. If no reference could be attached, the job records the limitation: *consistency not guaranteed*.
4. Approved character outputs are promoted to the Character Library with lineage.

## 9. Asset lineage

Every generated asset stores: `jobId, providerJobId, promptVersion, contentId, characterRef, provider, model, costMode, variation, scene`. Visible in Asset Library → *السلالة*.

## 10. Review

- Automatic pixel checks (not final): aspect ratio, resolution, dark-background share, neon share, teal accent share, text-safe-zone detail.
- Human confirmation required: identity, expression/pose, no fake logo, no AI text/numbers, brand feel.
- Regenerate asks *why* (11 reasons) → reasons become corrections in the next prompt version automatically.
- Logo, Arabic copy, prices, Entry/SL/TP, dates, stats are never generated — added in the composition layer from verified data.

## 11. Reels

Reel = scenes. The production board tracks Script, Scenes 1–5, Voiceover, Cover, Final Edit. Phase 1 generates **9:16 reference frames per scene** (image jobs). Video generation (`kling3_0` start-image) is coded but gated behind `ENABLE_VIDEO=false` → Phase 3.

## 12. Security

- Higgsfield credentials never leave the worker host (CLI's own credentials file). No provider secret in DB, frontend, logs or job metadata.
- Studio → worker uses an internal bearer token (`STUDIO_WORKER_TOKEN`). In production, proxy the worker behind the FOXREX backend on the same origin and inject the token server-side, so the browser never holds it.
- Worker refuses to bind a public interface without a token; CLI invoked with `execFile` (no shell); reference bytes never echoed back; output files validated by magic bytes; asset names are random UUIDs.

## 13. Deploying the worker

```bash
npm i -g @higgsfield/cli            # official CLI
higgsfield auth login               # once, on the worker host (browser OAuth)
higgsfield workspace list && higgsfield workspace set <id>
higgsfield account status           # confirm plan + credits
cd worker && cp .env.example .env && npm test && npm start
```
Needs a persistent Node process (VPS / container / always-on machine). **Not** a serverless function: the CLI keeps local credentials and jobs run minutes.

## 14. Status matrix

| Area | Status |
|---|---|
| Provider abstraction, router, policy, job model, runner, HTTP API | CODE-COMPLETE, 25 automated tests passing |
| Cost safety (no paid path) | CODE-COMPLETE + tested (worker + client) |
| Studio UX (Simple/Advanced, Generate, variations, results, feedback regen, reuse, reel board, settings, lineage) | CODE-COMPLETE, E2E-tested in Chromium against the worker with a CLI test double |
| Manual fallback | PRODUCTION-READY (no external dependency) |
| Real Higgsfield generation | **NOT VERIFIED LIVE** — requires `higgsfield auth login` on a real host with the FOXREX account |
| CLI JSON response schema | Not formally documented; parsed defensively. Confirm on the first live run |
| CLI token refresh for unattended use | Unverified. CLI docs: tokens are short-lived; on `AUTH_EXPIRED` the Studio falls back to manual |
| HIGGSFIELD_MCP inside the worker | Not implemented (needs an MCP OAuth client with refresh token) |
| Postgres tables / object storage | Not created — no FOXREX backend repo was available. JSON store + local `data/assets` stand in |
| Video / reel scene video | Phase 3, disabled |

## 15. Future provider integration

Add an adapter in `worker/src/providers/`, register it in `buildRegistry()`, add it to `providerOrder`. A paid adapter additionally requires an administrator to change the server-side policy (`allowPaidApi=true` **and** a positive `monthlyApiBudget`) and a spend tracker; the tests in `cost-safety.test.mjs` must be updated deliberately.
