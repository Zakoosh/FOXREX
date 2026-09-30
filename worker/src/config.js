import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from 'node:url';

// Load the local worker settings without requiring an additional dependency.
// Explicit process environment values take precedence over .env.
const workerDir = fileURLToPath(new URL('../', import.meta.url));
const envFile = path.join(workerDir, '.env');
const fileEnv = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) fileEnv[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}
const env = { ...fileEnv, ...process.env };

// npm installs the Higgsfield CLI as a .cmd shim on Windows. execFile cannot
// launch that shim without a shell, so use the package's native binary.
export function findWindowsHiggsfield(pathValue = "") {
  for (const dir of pathValue.split(";")) {
    if (!dir) continue;
    const shim = path.join(dir, "higgsfield.cmd");
    const binary = path.join(dir, "node_modules", "@higgsfield", "cli", "vendor", "hf.exe");
    if (fs.existsSync(shim) && fs.existsSync(binary)) return binary;
  }
  return null;
}
const configuredBin = env.HIGGSFIELD_BIN && env.HIGGSFIELD_BIN !== "higgsfield" ? env.HIGGSFIELD_BIN : null;
export const CONFIG = Object.freeze({
  creativeProvider: env.CREATIVE_PROVIDER || 'disabled',
  creativeModel: env.CREATIVE_MODEL || '',
  creativeUrl: env.CREATIVE_URL || 'http://127.0.0.1:11434',
  port: +(env.PORT || 8787),
  host: env.HOST || "127.0.0.1",
  token: env.STUDIO_WORKER_TOKEN || "",
  allowedOrigin: env.ALLOWED_ORIGIN || "",
  dataDir: path.resolve(workerDir, env.DATA_DIR || "./data"),
  higgsfieldBin: configuredBin || (process.platform === "win32" ? findWindowsHiggsfield(env.Path || env.PATH || "") : null) || "higgsfield",
  imageModels: (env.HF_IMAGE_MODELS || "nano_banana_2,gpt_image_2_5").split(",").map(s => s.trim()).filter(Boolean),
  enableVideo: env.ENABLE_VIDEO === "true",
  estimateCost: env.ESTIMATE_COST !== "false",
  cliTimeoutMs: +(env.CLI_TIMEOUT_MS || 12 * 60 * 1000),
  // Publishing engine. Default is DRY RUN: validate + preview only, never commit or push.
  publish: {
    mode: env.PUBLISH_MODE === 'live' ? 'live' : 'dry-run',
    repoDir: path.resolve(workerDir, env.PUBLISH_REPO_DIR || '..'),
    branch: env.PUBLISH_BRANCH || 'main',
    remote: env.PUBLISH_REMOTE || 'origin',
    checks: (env.PUBLISH_CHECKS || 'node tools/site/check-feed.mjs {feed};node --test worker/test/site.test.mjs').split(';').map(s => s.trim()).filter(Boolean),
    publicFeedUrl: env.PUBLIC_FEED_URL || 'https://foxrex.co/data/content.json',
    publicOrigin: env.PUBLIC_ORIGIN || 'https://foxrex.co'
  },
  // Automatic execution of SCHEDULED items. Off unless the worker runs on an always-on host.
  schedulerEnabled: env.SCHEDULER_ENABLED === 'true',
  // Missed-schedule policy: time-sensitive market content is never auto-published later than this.
  scheduleGraceMinutes: +(env.SCHEDULE_GRACE_MINUTES || 15),
  scheduleGraceMinutesOther: +(env.SCHEDULE_GRACE_MINUTES_OTHER || 24 * 60),
  // Private CMS backups (never in the public repository).
  backup: { dir: env.BACKUP_DIR ? path.resolve(workerDir, env.BACKUP_DIR) : null, keep: +(env.BACKUP_KEEP || 72), minIntervalMs: +(env.BACKUP_MIN_INTERVAL_MINUTES || 10) * 60e3 },
  logFile: env.LOG_FILE ? path.resolve(workerDir, env.LOG_FILE) : null,
  // Public repository used to read GitHub Pages deployment runs (no token; read-only).
  githubRepo: env.GITHUB_REPO || 'Zakoosh/FOXREX'
});
