# FOXREX Studio

FOXREX Studio preview and its generation worker.

## Project layout

- `foxrex-studio.html` — standalone Studio preview. Open this file in a browser to view the interface.
- `worker/` — Node.js generation worker. See [worker/README.md](worker/README.md) for setup and API routes.
- `GENERATION.md` — generation architecture, policy, and lifecycle.

## Run the worker

Requires Node.js 18.17 or newer. From `worker/`:

```bash
cp .env.example .env
npm test
npm start
```

Set `STUDIO_WORKER_TOKEN` and `ALLOWED_ORIGIN` in the local `.env` before connecting the Studio. For Higgsfield generation, follow the authentication and workspace setup in [worker/README.md](worker/README.md). Keep `.env` and generated assets out of Git.
