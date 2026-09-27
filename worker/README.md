# studio-generation-worker

Subscription-credit generation for FOXREX Studio via the official Higgsfield CLI. Paid APIs are disabled by design.
See `../GENERATION.md` for architecture, policy, lifecycle and status.

```bash
npm i -g @higgsfield/cli && higgsfield auth login && higgsfield workspace set <id>
cp .env.example .env    # set STUDIO_WORKER_TOKEN, ALLOWED_ORIGIN
npm test                # 25 tests, spends nothing (uses test/fake-higgsfield.mjs)
npm start
```
API: `GET /health` · `GET /policy` · `GET /providers[?refresh=1]` · `POST /jobs` · `GET /jobs[?content_id=]` · `GET /jobs/:id` · `POST /jobs/:id/cancel` · `POST /jobs/:id/retry` · `GET /assets/:file`
