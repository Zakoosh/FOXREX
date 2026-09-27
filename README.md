# FOXREX Studio

FOXREX Studio: editable AI-directed planning, manual prompts/import, and reviewed image generation. Paid APIs and automatic publishing remain disabled.

## Project layout

- `foxrex-studio.html` and `creative-studio.js` — browser Studio. Serve both together; existing data is migrated additively.
- `worker/` — Node.js generation worker. See [worker/README.md](worker/README.md) for setup and API routes.
- `GENERATION.md` — generation architecture, policy, and lifecycle.

## Run the worker

Requires Node.js 18.17 or newer. From the repository root:

```powershell
cd worker
npm run setup
npm test
npm start
```

Setup generates a secure token only for a new installation and preserves existing `.env` files. Never overwrite `.env` with the example. Set `ALLOWED_ORIGIN` in the local `.env` before connecting the Studio. For Higgsfield generation, follow the authentication and workspace setup in [worker/README.md](worker/README.md). Keep `.env` and generated assets out of Git.

Serve this directory with a static HTTP server, for example `python -m http.server 5173 --bind 127.0.0.1`, and open `http://localhost:5173/foxrex-studio.html`. Use that exact origin in `ALLOWED_ORIGIN`. Keep the same browser origin to retain local data; export/import JSON when moving origins.

For local AI direction, set `CREATIVE_PROVIDER=ollama` and `CREATIVE_MODEL=qwen3:4b` in the worker's `.env`, using an installed Ollama model. Otherwise the manual workflow remains available. Every image needs an exact request/cost preview and separate approval. Reels are storyboards and reference images, not rendered videos.

See [GENERATION.md](GENERATION.md) for capabilities and limitations, and [VERIFICATION.md](VERIFICATION.md) for evidence. Run `npm test` and `npm run check` from `worker/`; no bundler build is required.

## Windows connection procedure

Keep the worker terminal running after `npm start`. Test `Invoke-RestMethod http://127.0.0.1:8787/health`: `ok: true` confirms the API process. Port 8787 does not serve the Studio HTML; `/` explains the API and links to `/health`.

Open `https://zakoosh.github.io/FOXREX/foxrex-studio.html`, then Settings. Set the worker base URL to `http://127.0.0.1:8787` and privately copy `STUDIO_WORKER_TOKEN` from `worker/.env` into its password field. For this page use `ALLOWED_ORIGIN=https://zakoosh.github.io`, without `/FOXREX` or a trailing slash. Keep `HOST=127.0.0.1`. Restart the worker after editing configuration. The updated connection check verifies health, authentication and provider status separately.

HTTP 401 means a missing/mismatched bearer token. A fetch rejection can be CORS, stopped process, mixed-content/local-network policy or a browser extension: inspect Console and open health directly. `ERR_BLOCKED_BY_CLIENT` requires resolving the browser-side block; do not disable security or expose the worker publicly. No automatic local-network permission grant is attempted. A healthy PowerShell request does not prove Pages can connect.

`.env` and relative `DATA_DIR` are resolved against `worker/` even when Node starts elsewhere. Preserve `worker/data/` and existing records. If an example overwrote the token, restore a private backup or rotate it and update Settings; never reset jobs. Browser data belongs to its origin; export/import when moving between Pages and a local preview.

This repository has no bundler or custom deployment workflow. The fetched main branch and live page still contain the older implementation; a review branch/PR does not deploy it. The updated HTML and `creative-studio.js` must both reach the Pages publishing branch before live AI controls appear.
