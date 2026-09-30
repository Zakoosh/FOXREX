# FOXREX production commissioning — evidence

- **Date:** 2026-09-30
- **Base:** `main` @ `2bf61c6908043dc194928890e24fbb558f996bb4`
- **Environment:** an ephemeral cloud container, not the operator's machine. It has the git credentials of the Claude GitHub integration.

**Result:** `COMMISSIONING=PASS (DRY RUN)` · `REAL_PUBLICATION=NOT_STARTED`

Commissioning proves the whole production path without an editorial record, a commit or a push:

1. repository
2. branch
3. clean tree
4. fetch
5. up to date
6. push authorization
7. feed generation
8. schema and tests
9. no mutation

Run it on any control-plane host with:

```bash
cd worker && npm start &            # same .env as production
node scripts/commission.mjs         # prints readiness + checks; exit 0 only on COMMISSION_OK
```

It is also available in Studio under **System Status → Commissioning**.

## 1. Dedicated publishing clone

- **Clone:** `git clone https://github.com/Zakoosh/FOXREX foxrex-publish`
- **State:** branch `main`, tracking `origin/main`, clean, HEAD = origin/main = `2bf61c6`.
- **Worker settings:**
  - `PUBLISH_REPO_DIR` pointed at this clone, never at a working copy;
  - `PUBLISH_MODE=dry-run`;
  - `ALLOWED_ORIGIN=https://foxrex.co`;
  - `STUDIO_WORKER_TOKEN`: generated, 43 characters, never printed or logged;
  - scheduler and AI disabled.

## 2. Worker readiness (`/api/system/status`)

```
Worker HEALTHY · token SET (length 43) · publish mode DRY RUN
  cms             READY
  publishingRepo  READY
  git             READY      (2.43.0)
  github          READY      (git ls-remote authorized)
  ai              DISABLED   (manual CMS and publishing do not depend on AI)
  publishing      READY
  scheduler       DISABLED   (not an always-on host)
  backups         READY
  audit           READY
```

## 3. Commissioning dry run (`POST /api/publish/commission`)

```
Commissioning: COMMISSION_OK  (head 2bf61c690804)
  PASS  Dedicated publishing clone present
  PASS  On main — main
  PASS  Working tree clean
  PASS  git fetch origin
  PASS  Local clone current, no divergence — Up to date
  PASS  GitHub push authorization — Push authorized (dry-run to a probe ref; nothing created)
  PASS  Current public feed parses — 0 item(s), version 40eb9af4c80a68b7
  PASS  Schema, integrity and site tests on the regenerated feed — node tools/site/check-feed.mjs {feed} ; node --test worker/test/site.test.mjs
  PASS  No commit, no push, no file change
```

## 4. Independent no-mutation checks

These were run outside the worker:

- **Clone:** HEAD was `2bf61c6…` before and after. `git status --porcelain` shows 0 lines.
- **Remote:** a SHA-256 of the full `git ls-remote` output was identical before and after. There is no `foxrex-push-capability-probe` ref on GitHub.
- **Worker logs:** 0 occurrences of the token. The startup line reports it only as SET with its length.
- **Content:** no editorial record was created during commissioning.

## 5. Security probes against the running worker

| Probe | Result |
|---|---|
| `/api/system/status` without a token / with a wrong token | 401 / 401 |
| CORS preflight from `https://evil.example` | no `Access-Control-Allow-Origin` header at all |
| CORS preflight from `https://foxrex.co` | `Access-Control-Allow-Origin: https://foxrex.co` |
| Form-encoded POST to `/api/publish` (CSRF shape) | 415 |
| `POST /api/system/mode {"mode":"live"}` | 404: no endpoint can change the publish mode |
| `/api/system/status` scanned for `/home/` or `/tmp/` | no paths leaked |
| SIGTERM | "shutting down" → "stopped", with a final backup written |

## 6. Backup / restore drill (scratch data directory)

- `cms-backup.mjs` wrote a checksummed snapshot.
- `cms-restore.mjs <file>` without `--yes` verified the checksum and changed nothing.
- `cms-restore.mjs <file> --yes` **while the worker ran** was refused: "The worker is running on this data directory — stop it first".
- The same command **after SIGTERM** restored the data and saved the previous state as a safety snapshot.

## 7. Studio browser QA (Chromium, local static server + dry-run worker)

- **System Status:** 10 component rows with their states.
- **DRY RUN banner:** dashed blue with the label `DRY RUN`. LIVE is solid red with `LIVE PUBLISHING`. Covered by unit tests.
- **Operations:** Commissioning gave `COMMISSION_OK` with 9/9 checks. Backup and audit-chain verification both worked.
- **Gold Focus template:** the "New bilingual Gold Focus (EN + AR)" template created an empty EN draft and an empty linked AR draft. No text was generated.
- **Gold Focus editor:**
  - BULLISH / BEARISH / NEUTRAL bias;
  - repeatable support and resistance rows;
  - price, source and time fields;
  - expiry;
  - a 15-item first-publication checklist;
  - a card preview.
- **Preflight on a scratch `TEST` record:**
  - Status **BLOCKED**, from the "Not a TEST fixture" check and the candidate-feed tests.
  - Publish is disabled in DRY RUN with an explanation.
  - A dry run reported "Content blocked: TEST fixture".
  - The scratch data lived only in the container's temporary directory. It was never committed and the publishing clone stayed unchanged.
- **Layout:** no horizontal scroll at 390 px or 768 px.
- **Page errors:** 0.
- **Public pages:** `/`, `/ar/`, `/gold/` and `/ar/gold/` return 200 with the Gold Focus component present.

## 8. Items this environment cannot verify

| Item | Status | Evidence |
|---|---|---|
| Production site / public feed | UNVERIFIED from this container | The egress proxy rejects CONNECT to `foxrex.co:443` (organization policy). Deployment is checked through the GitHub Pages workflow run instead. |
| Ollama | `UNAVAILABLE_WITH_EVIDENCE` | `ollama` binary not installed; `127.0.0.1:11434` connection refused (curl exit 7). No model was downloaded. |
| Cloudflare Access | `OPERATOR_ACTION_REQUIRED` | No `cloudflared` binary, and no Zero Trust / Access tooling is available here. DNS must not be changed from this work. Steps: docs/CLOUDFLARE-ACCESS.md. |
| Always-on host | `READY_NOT_DEPLOYED` | No VM in the operator's account. Unit validated with `systemd-analyze verify`; plist validated with `xmllint`. See docs/ALWAYS-ON.md. |
| Docker image | not built | No Docker daemon in this container. |
