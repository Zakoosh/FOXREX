# FOXREX

FOXREX has two surfaces served from this repository by GitHub Pages (`main` / root, custom domain `foxrex.co`):

- **Public website** — English at `https://foxrex.co/`, Arabic edition at `https://foxrex.co/ar/` (every page has an Arabic equivalent: `/ar/markets/`, `/ar/gold/`, …). Each edition is real HTML with its own `lang`/`dir`, canonical, `hreflang`, titles and Open Graph; the Arabic edition is composed for Arabic (`styles/ar.css`), not toggled.
- **FOXREX Studio** — `https://foxrex.co/studio/`: the admin content operating system (editable AI-directed planning, manual prompts/import and reviewed image generation). Paid APIs and automatic publishing remain disabled. The old `/foxrex-studio.html` URL redirects here; browser data is kept because the origin is unchanged.

**Publishing:** Studio → Content → Editorial is the CMS. Content moves IDEA → DRAFT → REVIEW → APPROVED → PUBLISHED through the local worker's publishing engine, which validates, commits `data/content.json` and pushes (dry-run by default). See [docs/PUBLISHING.md](docs/PUBLISHING.md).

Read [SECURITY.md](SECURITY.md) for the admin boundary: the Studio is static and not access-controlled at the host, ships no secrets, and runs every privileged operation through the local worker.

## Project layout

- `index.html`, `markets/`, `gold/`, `analysis/`, `news/`, `learn/`, `signals/`, `about/`, `contact/`, `privacy/`, `terms/`, `risk-disclosure/`, `robots.txt`, `sitemap.xml`, `site.webmanifest` — **generated** public site. Edit `tools/site/content.mjs` (copy) or `tools/site/build.mjs` (layout and both editions), then run `node tools/site/build.mjs`. `node tools/site/build.mjs --check` fails if committed output is stale.
- `data/content.json` — the public content feed (schema v2, `items[]`), written **only** by the publishing engine from approved Studio records and rendered at runtime by `scripts/public/content.js` per language. Strict schema: `data/content.schema.json`; checker: `node tools/site/check-feed.mjs`. Never edit it by hand, never add estimated prices, unverified performance or test fixtures.
- `studio/cms-model.js` — the single editorial rule set (types, destinations, lifecycle, validation, feed mapping) shared by Studio and the worker. `studio/cms-studio.js` — library, editor, preview, publication center. `worker/src/cms.js`, `publisher.js`, `cms-routes.js` — CMS store and publishing engine.
- `scripts/public/market.js` — market ticker. No data is bundled; a verified feed is connected by registering an adapter (documented in the file). Until then the ticker says "Market feed not connected".
- `styles/tokens.css` — FOXREX design tokens (colours, spacing, and separate EN/AR typography scales `--en-*` / `--ar-*`), shared by the site and Studio. `fonts.css` self-hosts Inter and IBM Plex Sans Arabic (`assets/fonts/`, OFL). `base.css`, `components.css`, `public.css`, `ar.css`, `studio.css` build on them.
- `docs/ARABIC-BRAND-TYPOGRAPHY.md` — the canonical Arabic typography system for the website, social formats, Telegram, reports and Studio.
- `tools/site/text.mjs` — Arabic bidi helper: isolates symbols, prices, percentages and times in Inter LTR inside Arabic text.
- `assets/brand/` (mark, lockup, favicons, OpenGraph image) and `assets/rex/` (REX mascot).
- `studio/index.html` and `studio/creative-studio.js` — browser Studio. Serve both together; existing data is migrated additively.
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

Serve this directory with a static HTTP server, for example `python -m http.server 5173 --bind 127.0.0.1`, and open `http://localhost:5173/studio/`. Use that exact origin in `ALLOWED_ORIGIN`. Keep the same browser origin to retain local data; export/import JSON when moving origins.

For local AI direction, set `CREATIVE_PROVIDER=ollama` and `CREATIVE_MODEL=qwen3:4b` in the worker's `.env`, using an installed Ollama model. Otherwise the manual workflow remains available. Every image needs an exact request/cost preview and separate approval. Reels are storyboards and reference images, not rendered videos.

See [GENERATION.md](GENERATION.md) for capabilities and limitations, and [VERIFICATION.md](VERIFICATION.md) for evidence. Run `npm test` and `npm run check` from `worker/`; no bundler build is required.

## Windows connection procedure

Keep the worker terminal running after `npm start`. Test `Invoke-RestMethod http://127.0.0.1:8787/health`: `ok: true` confirms the API process. Port 8787 does not serve the Studio HTML; `/` explains the API and links to `/health`.

Open `https://foxrex.co/studio/`, then Settings. Set the worker base URL to `http://127.0.0.1:8787` and privately copy `STUDIO_WORKER_TOKEN` from `worker/.env` into its password field. For this page use `ALLOWED_ORIGIN=https://foxrex.co` (no path or trailing slash). To keep the old address working as well, list both: `ALLOWED_ORIGIN=https://foxrex.co,https://zakoosh.github.io`. Browser data is stored per origin, so use Settings → Export/Import once when moving from `zakoosh.github.io` to `foxrex.co`. Keep `HOST=127.0.0.1`. Restart the worker after editing configuration. The updated connection check verifies health, authentication and provider status separately.

HTTP 401 means a missing/mismatched bearer token. A fetch rejection can be CORS, stopped process, mixed-content/local-network policy or a browser extension: inspect Console and open health directly. `ERR_BLOCKED_BY_CLIENT` requires resolving the browser-side block; do not disable security or expose the worker publicly. No automatic local-network permission grant is attempted. A healthy PowerShell request does not prove Pages can connect.

`.env` and relative `DATA_DIR` are resolved against `worker/` even when Node starts elsewhere. Preserve `worker/data/` and existing records. If an example overwrote the token, restore a private backup or rotate it and update Settings; never reset jobs. Browser data belongs to its origin; export/import when moving between Pages and a local preview.

This repository has no bundler or custom deployment workflow: GitHub Pages publishes `main` / root as-is. The public site is pre-generated with `node tools/site/build.mjs` and committed; a review branch or PR does not deploy anything until it is merged to `main`.
