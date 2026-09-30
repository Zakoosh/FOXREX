# FOXREX security boundary

## Surfaces

| Surface | URL | Hosting | Access control |
|---|---|---|---|
| Public website | `https://foxrex.co/` | GitHub Pages (static) | Public by design |
| FOXREX Studio (admin) | `https://foxrex.co/studio/` | GitHub Pages (static) | **None at the host.** See below. |
| Generation worker | `http://127.0.0.1:8787` | Operator's own machine | Bearer token + exact `ALLOWED_ORIGIN` + loopback bind |

## What the Studio page is — and is not

GitHub Pages serves every file in this repository to anyone who requests it. An unlinked URL is not authentication, and a password check written in browser JavaScript is not authentication either (its logic and any hash ship to every visitor). An earlier client-side login was therefore **removed**; the Studio states plainly in its sidebar and Settings that it is a static admin surface.

This is acceptable today because the static Studio contains no privileged capability on its own:

- **No secrets ship in the bundle.** No API keys, tokens, passwords, private keys or provider credentials exist in `studio/`, `scripts/`, `styles/` or any public page. `worker/test/site.test.mjs` fails the build if a bearer token, private key or common secret pattern appears.
- **Studio data lives in the operator's browser** (`localStorage`, key `foxrex-studio-v4`). A visitor opening `/studio/` sees an empty Studio, not the operator's content.
- **The worker token is entered by the operator** in Settings, stored only in that browser, and sent only to the worker URL the operator configured.
- **Privileged operations run only through the local worker**: image generation (Higgsfield CLI credentials stay on the worker machine), local AI reasoning (Ollama, loopback only), job history and assets. The worker requires `STUDIO_WORKER_TOKEN`, answers CORS only for origins listed in `ALLOWED_ORIGIN`, and binds to `127.0.0.1`.
- Paid API routes are disabled in code.

## Publishing boundary

Publishing to foxrex.co is a privileged operation and happens **only in the worker** (`worker/src/publisher.js`), never in browser code:

- The CMS and publishing API (`/api/...`) refuses to run without `STUDIO_WORKER_TOKEN`, requires the bearer token, `Content-Type: application/json` (blocks form-post CSRF) and a named operator (`X-Foxrex-Actor`) on every write. CORS answers only the exact origins in `ALLOWED_ORIGIN` — never `*`.
- Approval is recorded server-side with the approver's name; the engine re-checks approval and full validation before any write. AI can only create DRAFT translations.
- Git pushes use the operator machine's own credentials for `PUBLISH_REPO_DIR`. No GitHub token, PAT or Git credential exists in Studio, the public site or this repository; `worker/test/cms.test.mjs` and `site.test.mjs` fail if one appears in shipped files.
- The engine never force-pushes or rewrites history, refuses a dirty or diverged working tree, commits only `data/content.json`, and restores the previous HEAD if checks, commit or push fail.
- CMS records and the publication log live in `worker/data/cms/` (git-ignored). The repository is public, so unpublished content is never committed.
- Default `PUBLISH_MODE=dry-run`: nothing is written until the operator deliberately switches to `live`.

See `docs/PUBLISHING.md` for the full model.

## Adding real access control to /studio/

To stop the public from loading the Studio UI at all, put an identity check in front of the path at the edge. With the domain on Cloudflare:

1. Proxy the `foxrex.co` DNS records through Cloudflare (orange cloud) once GitHub Pages has issued its certificate, with SSL/TLS mode **Full**.
2. Cloudflare Zero Trust → Access → Applications → **Self-hosted**: domain `foxrex.co`, path `studio/*` (add `foxrex-studio.html` too).
3. Policy: *Allow* → emails of the FOXREX operators (one-time PIN or an identity provider).

Detailed, ready-to-apply steps: `docs/CLOUDFLARE-ACCESS.md`. The worker token stays required after Access is enabled (defence in depth).

The Studio code needs no change for this; it already treats authentication as an outer layer. When a hosted FOXREX backend replaces the local worker, the same Access identity (the `Cf-Access-Jwt-Assertion` header) can authorise API calls server-side.

## Reporting

Report suspected vulnerabilities privately to the FOXREX team via the channels on https://foxrex.co/contact/ — do not open a public issue.
