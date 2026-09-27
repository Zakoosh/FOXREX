# FOXREX creative and generation worker

Node.js 18.17+, no package dependencies. Use persistent disk/process and one worker per data directory.

```powershell
cd worker
npm run setup
# Configure token, allowed origin, DATA_DIR and optional local reasoning.
npm test
npm run check
npm start
```

Setup never replaces an existing .env. Do not use Copy-Item or cp to overwrite it. Configuration and relative DATA_DIR resolve against worker/, regardless of shell working directory. Back up data/ before moving an installation. Never delete job records to retry.

For reasoning, install/start Ollama, check ollama list, then set CREATIVE_PROVIDER=ollama and CREATIVE_MODEL=qwen3:4b or another installed local model. On a new machine, ollama pull qwen3:4b installs it. Default reasoning is disabled. No paid AI API or chat subscription credential is used.

For automatic image production, install the official @higgsfield/cli, run higgsfield auth login, select the workspace using higgsfield workspace set <id>, and check higgsfield account status. CLI requests consume plan credits. No generation command is needed for setup verification. Without the CLI, use manual copy/import.

Connect Studio Settings to the worker URL (default http://127.0.0.1:8787) and bearer token. ALLOWED_ORIGIN must exactly match the browser origin, e.g. http://localhost:5173. Restart after .env changes. Keep provider secrets outside browser data.

## API

All API routes except health and asset downloads require the configured bearer token.

- GET /health, /policy, /providers[?refresh=1]
- GET /creative/status, /creative/revisions?contentId=...
- POST /creative/ideate, /creative/plan, /creative/critique: {contentId,brief,concept?,previous?,feedback?,observations?}
- POST /creative/validate: validates operator edits without inference
- POST /jobs/quote: {prompt,aspectRatio,contentId,promptVersionId?,references?,creative?}; preview one image
- POST /jobs: {quoteId,approved:true}; repeated approval returns the original job
- GET /jobs[?content_id=...][&quote_id=...], GET /jobs/:id
- POST /jobs/:id/reconcile: {providerJobId}; read-only recovery, no charged creation
- POST /jobs/:id/cancel: queued jobs only
- POST /jobs/:id/retry: 409; reconcile or explicitly approve a new request
- GET /assets/:file

An unresolved submission blocks another job for its content. Do not work around it by changing IDs. See [GENERATION.md](../GENERATION.md) for schemas, costs, migration and limitations.

npm test uses mocks only. npm run check verifies syntax. node scripts/verify-local.mjs explicitly exercises real Ollama and saves response evidence. Add --serve for an isolated temporary browser environment on port 5174 with only a manual asset provider; it cannot submit to Higgsfield.

## Connection diagnostics

See the root README for the complete Windows procedure. `/` is API information, `/health` is public health, and `/policy` is an authenticated check. Use the Studio base URL field without `/health`. For GitHub Pages the exact allowed origin is `https://zakoosh.github.io`; the URL path is not part of an origin. Never use `*`, public HOST binding or port forwarding to solve browser connectivity.

A copied example contains a publicly known placeholder, not a secure token. `npm run setup` generates a random token for first use; when repairing an existing installation, back up .env privately, rotate only its token and reconnect Settings. Preserve DATA_DIR and all jobs. Health alone does not establish authorization or browser CORS access.

The manual preview button explicitly selects MANUAL_CLAUDE even if Higgsfield is available. Saving that request never calls image generation. External tool costs remain the operator's responsibility.
