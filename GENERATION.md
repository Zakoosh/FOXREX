# FOXREX Studio: creative direction and asset production

Status: 2026-09-28. Static browser app plus persistent Node worker. Paid APIs, automatic publishing and rendered video remain disabled.

## Workflow

1. Create a draft: objective, audience, platform, format, message, tone, brand assets, references and approved facts.
2. **AI-directed:** a separately configured local Ollama model proposes 3–5 concepts with hooks, angles, narratives, visual directions, recommendation and rationale. Select/edit a concept and request a production plan: caption, composition, asset requirements, cover, editing instructions and per-scene copy, voiceover, on-screen text and image prompts.
3. **Manual:** write a ready image prompt, optionally enter a structured plan, or import an external image. Manual prompt submission can use Higgsfield CLI without any reasoning model. If no automatic asset provider is available, copy the prompt and import the result.
4. Edit and save concepts, facts or plans using JSON editors. Audience, tone, references, manual prompt and feedback have separate fields. Version history retains AI/operator revisions. Invalid model responses are rejected; local inference can make one corrective attempt. There is no hardcoded creative fallback.
5. Review factual accuracy, then preview the exact prompt, references, creative snapshot, provider, model, parameters and estimated credits when available. Approve **one image** separately. Each additional image/scene needs a new preview and approval.
6. Review generated assets. Text-based critique evaluates the plan and operator observations; it cannot inspect pixels. Existing automatic image checks are heuristics; human approval is required. Feedback does not automatically spend credits: revise, preview and approve again.
7. Draft → review → approved → scheduled → published are local editorial states. Marking published records an operator action; no social post is sent.

New production no longer uses the old fixed prompt/caption/storyboard compiler. Legacy records and historical prompts remain intact. Historical helper code remains in the original HTML for compatibility; creative-studio.js replaces production entry points. Fresh storage starts with brand assets and no fabricated campaign records.

## Separate providers

| Integration | Purpose | Availability/cost |
|---|---|---|
| OLLAMA_LOCAL | Ideas, plans, text critique | Implemented; explicitly configured local model; local compute |
| HIGGSFIELD_CLI | Image assets | Official CLI/OAuth; consumes subscription credits |
| HIGGSFIELD_MCP | Image assets | Existing unconfigured stub |
| MANUAL_CLAUDE | External generation/import | Legacy ID; use any external tool; no worker generation call |
| HIGGSFIELD_API, CLAUDE_API | Paid APIs | Disabled stubs, no network code |

Creative adapter contract: id, model, costMode, health(), generate({stage,input,schema}). CreativeService validates and persists successful revisions. Only LOCAL_COMPUTE is currently accepted. New providers require explicit integration, never automatic paid fallback. Existing chat subscription credentials are not treated as API authorization or copied into the worker.

Ollama uses its [documented chat API](https://docs.ollama.com/api/chat) with a JSON schema, non-streamed output and disabled thinking. The adapter accepts loopback HTTP only, rejects redirects, cloud model names and remote model metadata, checks installed models, and times out after 180 seconds per call. A validation repair can add one more call. Models are never downloaded automatically. Small local models can produce weak or invalid drafts; human review is essential.

## Configuration

Run from worker/ so .env and relative DATA_DIR resolve correctly. Defaults:

```dotenv
CREATIVE_PROVIDER=disabled
CREATIVE_MODEL=
CREATIVE_URL=http://127.0.0.1:11434
```

To opt into an installed model:

```dotenv
CREATIVE_PROVIDER=ollama
CREATIVE_MODEL=qwen3:4b
CREATIVE_URL=http://127.0.0.1:11434
```

Check installation with ollama list. On another machine, install Ollama from its official distribution, run ollama pull qwen3:4b, and run ollama serve if the service is not running. Downloads consume disk/network resources. Restart the worker after configuration changes. Browser Settings holds its worker URL/token. Check reasoning provider reports availability. Disabled/offline reasoning leaves manual editing and import available.

## Cost and submission safety

- Frozen server policy: allowPaidApi=false, monthlyApiBudget=0, paidFallback=false. HTTP requests cannot enable paid APIs.
- Asset routing stays MCP → CLI → manual. Preview pins the provider/model instead of rerouting after approval.
- POST /jobs/quote validates and performs a read-only CLI estimate; it never calls generate create. It persists a 15-minute preview. Unknown credits are displayed as unknown, never zero.
- POST /jobs accepts only {quoteId, approved:true}. Replacement prompt/provider fields are ignored. Repeated or concurrent approvals return the same job, including after restart. Existing jobs remain recoverable after quote expiry.
- One image per approved request. The runner rechecks cost; a higher or newly unavailable estimate stops before submission with COST_CHANGED.
- submission_started_at is persisted before the charged call. Restarts, timeouts and missing IDs never silently replay it. /retry creates no replacement job. An unresolved submission blocks another quote/job for that content.
- Only queued jobs can be cancelled; remote CLI cancellation is not verified. A running request may already have consumed credits.
- Do not delete jobs/quotes to retry. Run one worker process per data directory: JSON storage is not a distributed transaction system.

Reported credits_used is the before/after account balance delta, not an invoice; concurrent external activity can affect it. API dollar spend stays zero. Paid integration would require deliberate policy changes and real spend accounting.

## Recovery

Existing completed jobs retain their local/provider IDs, PNG outputs and lineage. Studio refreshes stored failed jobs too, so recovered outputs can be ingested after reload. Private job identifiers and verification responses belong in ignored storage, not this document.

POST /jobs/:id/reconcile accepts {providerJobId}. Known IDs can be retrieved directly. For an unknown ID, history must contain one unique job within 30 seconds of persisted submission time (legacy jobs use start time). Ambiguous candidates and IDs linked elsewhere are rejected. Concurrent reconciliation is locked inside the worker; repeating a completed reconciliation returns the existing job. Provider-confirmed failed/cancelled/rejected output permits a new separately approved request, never an automatic retry.

## Data and migration

- Storage key remains foxrex-studio-v4. Browser schema v5 adds item.creative without replacing existing items, assets, custom fields, prompts, jobs or statuses. A :before-creative-v5 backup is written first. If backup storage is unavailable, migration stops rather than discarding data. Export JSON regularly.
- Existing worker/data/jobs.json, assets/ and inputs/ remain in place. Job fields are additive. creative.json stores reasoning revisions and immutable previews.
- Jobs retain approved request, brief, selected concept, plan, facts/sources, revisions, provider/model, prompt version, job IDs, estimates, balance delta and outputs. Assets retain job lineage. Human review/editorial state remains in browser records.
- Operator edits and imported images are browser-local. This is not a multi-user database or cross-device synchronization system. Large reference images/histories can exhaust localStorage; export before major changes.
- Provider credentials stay on the worker host. The local Studio stores its worker bearer token; production needs a same-origin authenticated backend. Asset URLs are unguessable but not independently bearer-authenticated. Do not expose this preview as a hardened public service.

## Facts, overlays and reels

Facts require {id,text,source,approved:true}; claim/scene factIds must refer only to those approved facts. Financial content requires verified source data and required fields before preview. Structural validation cannot prove prose true or catch every unstated claim. Human fact checking is mandatory; never invent prices, Entry/SL/TP, signals, results or performance figures.

Copy/on-screen text and the official logo stay separate from generated image pixels. Studio has editable copy/plan fields and overlay review checks; final graphic layout/export composition is performed in an external editor. Image-model Arabic typography and financial numbers are not trusted.

Reels support storyboards, voiceover text, on-screen copy, cover direction, editing instructions and reference images. Rendered video, synthesized voice and final reel assembly are unavailable. /jobs/quote rejects video even if legacy ENABLE_VIDEO is set. Carousel slides have independent image approvals.

## Verification and future work

```bash
cd worker
npm test
npm run check
# Explicit real local inference, never Higgsfield:
node scripts/verify-local.mjs
# Temporary browser origin, Ollama plus manual-only asset provider:
node scripts/verify-local.mjs --serve
```

Isolated browser URL: http://127.0.0.1:5174/foxrex-studio.html. Set its worker URL to http://127.0.0.1:5174 with an empty token. This helper uses temporary data and never loads a Higgsfield adapter. Live response evidence is saved under ignored worker/data/verification/ollama-live.json. It fails honestly when local inference or output validation fails.

Automated tests use mocked reasoning and a CLI test double. They cover schema/fact validation, manual requests, cost controls, idempotency, lost IDs, restarts, retries, cancellation, reconciliation, migration and Windows CLI resolution. There is no bundler build; npm run check validates executable and inline JavaScript syntax. See VERIFICATION.md for live/browser evidence.

Future work: separately approved social publishing/account connections, rendered video/audio, visual-model critique, final composition/export renderer, shared database/object storage, multi-user access controls and distributed job locking. No new live Higgsfield generation was used to test this refactor.

## Connection and setup

Follow the Windows procedure in README.md. Use `npm run setup` to preserve existing configuration. Port 8787 is the API; Studio is a separate static page. Settings checks health, authenticated policy and providers, with actionable 401 and browser-network errors. Keep exact-origin CORS and loopback binding. Manual request preview explicitly bypasses subscription generation without bypassing approval or validation.
