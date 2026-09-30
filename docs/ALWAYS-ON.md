# FOXREX always-on control plane

**Status: `ALWAYS_ON_DEPLOYMENT=READY_NOT_DEPLOYED`.** The worker, the scheduler and the service configurations are ready and tested. No always-on host exists yet: provisioning one needs the operator's account and payment method, and routing a hostname to it needs a DNS change, which this repository never makes.

## What "control plane" means here

The **public site** is static and stays on GitHub Pages: `foxrex.co`, EN at `/`, AR at `/ar/`, content in `data/content.json`.

The **control plane** is the Node worker in `worker/`. It holds:

- the editorial CMS: records, approvals, audit log and backups;
- the publishing engine, which commits `data/content.json` to `main` in a dedicated clone and pushes it (never a force push);
- the scheduler.

Studio (`/studio/`) is only a browser UI for the worker.

## Hosting decision

| Option | Verdict |
|---|---|
| Operator PC (Windows Task Scheduler / macOS launchd) | Fine for **manual** publishing. **Not** always-on: sleep, reboots and logouts stop it, so `SCHEDULER_ENABLED=false` is required there. |
| Cloudflare Workers / Pages Functions | **Rejected.** They have no git binary and no persistent filesystem. The engine needs a real clone, `git push` and fsync'd local state. |
| GitHub Actions cron | **Rejected.** The repository is public. Unpublished drafts would have to be stored where the runner can read them, which leaks them. |
| **Small Linux VM** (1 vCPU / 1 GB, any provider) under **systemd**, reachable only through **Cloudflare Tunnel + Access** | **Recommended.** Same code as today. Durable disk, deploy key and scheduler. No inbound ports. |
| The same VM using the container image (`deploy/Dockerfile`) | Equivalent alternative if the operator prefers Docker. |

Storage stays as filesystem JSON (records, publication log and hash-chained audit JSONL). This fits the load: one operator, a single-process lock, serialized writes and a small dataset. Every write is fsync'd and atomic (temp file → rename → directory fsync). A SQLite migration is only warranted with several concurrent editors.

## Layout on the VM

```
/opt/foxrex/FOXREX              code (git clone; read-only to the service)
/opt/foxrex/FOXREX/worker/.env  configuration, chmod 600, owner foxrex — never committed
/var/lib/foxrex/data            DATA_DIR (CMS, publication log, audit log, backups/)
/var/lib/foxrex/foxrex-publish  PUBLISH_REPO_DIR — dedicated clean clone of Zakoosh/FOXREX
/var/lib/foxrex/.ssh            deploy key (write access to Zakoosh/FOXREX only)
```

## Install (operator)

```bash
sudo useradd --system --home /var/lib/foxrex --create-home --shell /usr/sbin/nologin foxrex
sudo -u foxrex ssh-keygen -t ed25519 -f /var/lib/foxrex/.ssh/id_ed25519 -N ''   # add the .pub as a GitHub deploy key with write access
sudo -u foxrex git clone git@github.com:Zakoosh/FOXREX.git /var/lib/foxrex/foxrex-publish
sudo git clone https://github.com/Zakoosh/FOXREX.git /opt/foxrex/FOXREX
sudo -u foxrex git -C /var/lib/foxrex/foxrex-publish config user.name  "FOXREX Publisher"
sudo -u foxrex git -C /var/lib/foxrex/foxrex-publish config user.email "publisher@foxrex.co"
# worker/.env: DATA_DIR=/var/lib/foxrex/data  PUBLISH_REPO_DIR=/var/lib/foxrex/foxrex-publish
#              PUBLISH_MODE=dry-run  SCHEDULER_ENABLED=true  ALLOWED_ORIGIN=https://foxrex.co  STUDIO_WORKER_TOKEN=<long random>
sudo cp /opt/foxrex/FOXREX/deploy/systemd/foxrex-worker.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now foxrex-worker
cd /opt/foxrex/FOXREX/worker && sudo -u foxrex node scripts/commission.mjs     # must print COMMISSION_OK
```

Then set up the Cloudflare Tunnel (`deploy/cloudflared/config.example.yml`) and an Access application for the API hostname (docs/CLOUDFLARE-ACCESS.md). In Studio, set the worker URL to that hostname.

## Service files

| File | Use | Validated here |
|---|---|---|
| `deploy/systemd/foxrex-worker.service` | Linux VM (recommended) | `systemd-analyze verify`: clean. It was run with this container's node path, since `/usr/bin/node` is absent here. |
| `deploy/windows/install-foxrex-worker.ps1` | Operator PC, runs at logon, restarts on failure | Not executed (no Windows host) |
| `deploy/macos/co.foxrex.worker.plist` | Operator Mac, launchd agent | `xmllint`: well-formed |
| `deploy/Dockerfile` | Container alternative | Not built (no Docker daemon in this environment) |
| `deploy/cloudflared/config.example.yml` | Tunnel to 127.0.0.1:8787 | Example only |

## Runtime behaviour

- **Startup diagnostics** are one JSON log line. It gives the Node version, bind address, allowed origins and publish mode, plus the token as `SET (n chars)` or `NOT SET`, never its value. It also says whether the publish repo is a git repository, the scheduler state, the AI provider, the backup location and the log target.
- **Refusals at startup:**
  - `ALLOWED_ORIGIN=*`;
  - a public bind address without a token;
  - a second worker on the same data directory (lock file).
- **Graceful shutdown** (SIGTERM or SIGINT):
  1. Stops accepting connections.
  2. Stops the scheduler.
  3. Lets an in-flight publication finish (up to 15 s).
  4. Takes a final backup and releases the lock.
  5. Forces exit after 20 s.

  systemd `TimeoutStopSec=30` and launchd `ExitTimeOut=30` leave room for this.
- **Health vs readiness:**
  - `GET /health` is public liveness and only answers "the process is up".
  - `GET /api/system/status` needs the token. It reports readiness per component: CMS, publishing repo, git, GitHub auth, AI, publishing mode, scheduler, backups and audit chain. It contains no paths or secrets.
  - AI being down never makes publishing unready.
- **Logs** are JSON lines on stdout: journald, launchd or Task Scheduler capture them. `LOG_FILE` adds a rotated file (5 MB × 5). Tokens, authorization headers and content bodies are never logged.

## Scheduler (always-on only)

- Due items are re-validated at execution time. The scheduler publishes them with the idempotency key `schedule:<id>@<scheduledAt>`, so a restart cannot double-publish.
- The scheduler state lives in the durable CMS store. After a restart it catches up immediately, and the missed-schedule policy applies.
- An item is **never** auto-published if it is:
  - **MISSED**: a time-sensitive type (Morning Brief, Gold Focus, Event, US Open, Market Recap) more than `SCHEDULE_GRACE_MINUTES` (15) late, or another type more than `SCHEDULE_GRACE_MINUTES_OTHER` (24 h) late;
  - **EXPIRED**: past its `expiresAt`;
  - **STALE**: its revision changed after scheduling;
  - **INVALID**: it no longer passes the publish gate.
- Such items are flagged in Studio and written to the audit log. They stay SCHEDULED for an explicit operator decision.

## Backups and restore

- **Automatic backups** are taken:
  - at startup;
  - hourly;
  - on CMS change (debounced, `BACKUP_MIN_INTERVAL_MINUTES`);
  - on shutdown;
  - manually from Studio → System Status.
- **Format:** `cms-YYYYMMDDTHHMMSSZ-xxxxxx.json` in `BACKUP_DIR` (default `DATA_DIR/backups`). Each file holds the records, publication log and audit log, with a SHA-256 checksum. Files are written atomically and the newest `BACKUP_KEEP` (72) are kept.
- **Restore** (worker stopped):

  ```bash
  node scripts/cms-restore.mjs <backup-file> --yes
  ```

  It verifies the checksum, takes a pre-restore safety snapshot, then writes atomically.
- Copy `BACKUP_DIR` off the VM regularly, e.g. with a provider snapshot or `rclone` to private storage. The CMS is deliberately **not** in the public Git repository.
