/* Resource guard for NON_CRITICAL work (FIONERA control-plane contract §7, decision D45).

   FOXREX Studio shares a Windows host with the live MT5 terminal, the FIONERA MT5 worker and the
   production VM. Trading has absolute priority. Before FOXREX starts NEW heavy local work (an Ollama
   model load / local reasoning, a generation job) it asks this guard. A "no" means: do not start,
   queue and retry later.

   Sources, in order:
     1. The control-plane API, POST <controlUrl>/api/control/v1/agent/guard_non_critical, used
        automatically as soon as the agent token file exists AND its ACL is private (current user,
        SYSTEM, Administrators only). The token value is never logged, returned or stored elsewhere.
     2. Local fallback: the SRE host sample file (host-free-mem.json, written every 30 s), judged with
        the §7 memory thresholds. Blind means closed: with the FX market open, missing, stale (> 90 s)
        or unreadable data denies.

   The guard never terminates, stops or signals any process (FIONERA, MT5, Ollama, its own children or
   this worker) and never stops running work. It only answers allow/deny for work that has not started.
   Every deny and every read failure is logged and counted. */
import fs from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";

export const GuardState = Object.freeze({
  BLOCKED_TRADING_PRIORITY: "BLOCKED_TRADING_PRIORITY", // market open and trading health not OK / relay stale / guard blind
  WAITING_FOR_RESOURCES: "WAITING_FOR_RESOURCES",       // memory thresholds
  QUEUED_RESOURCE_GUARD: "QUEUED_RESOURCE_GUARD"        // the work was queued and will be retried with backoff
});
export const GUARD_KINDS = Object.freeze(["ollama", "generation", "batch", "build"]);

/** §7 thresholds (control-plane d4b22a8b). Mirrored from packages/shared/src/control/guard.ts; keep in step. */
export const GUARD_THRESHOLDS = Object.freeze({
  freeMemConsecutiveMb: 800,
  freeMemSingleMb: 600,
  ollamaFreeMemMb: 1700,
  /** The SRE file is written every 30 s; older than this is UNKNOWN. */
  fileStaleMs: 90_000,
  /** Two samples further apart than this are not "consecutive". */
  consecutiveGapMs: 180_000
});

export const DEFAULT_HOST_MEM_FILE = "C:\\ProgramData\\fionera-sre\\host-free-mem.json";
export const GUARD_PATH = "/api/control/v1/agent/guard_non_critical";

/** Retry schedule for denied work: 60 s, 120 s, 240 s, then every 300 s. Never a busy loop. */
export function retryDelayMs(attempt) { return Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 300_000); }

/** FX market hours: open from Sunday 21:00 UTC to Friday 21:00 UTC (simple calendar, no holidays). */
export function marketOpen(t = Date.now()) {
  const d = new Date(t), day = d.getUTCDay(), hour = d.getUTCHours();
  if (day === 6) return false;
  if (day === 5) return hour < 21;
  if (day === 0) return hour >= 21;
  return true;
}

/** A deny whose reasons are all memory pressure waits for resources; anything else is trading priority. */
export function classify(reasons) {
  if (!reasons.length) return null;
  return reasons.every(r => /^FREE_MEMORY_LOW/.test(r)) ? GuardState.WAITING_FOR_RESOURCES : GuardState.BLOCKED_TRADING_PRIORITY;
}

/** Pure §7 local rule over the parsed SRE file. `data` null + `readError` set = unreadable/missing. */
export function evaluateLocal({ kind, data, readError = null, now }) {
  const t = GUARD_THRESHOLDS, open = marketOpen(now);
  const base = { source: "local-fallback", kind, at: now, marketOpen: open };
  let problem = readError, latest = null, previous = null;
  if (!problem) {
    const at = Date.parse(data?.at);
    if (!Number.isFinite(at)) problem = "host sample file has no valid 'at'";
    else if (now - at > t.fileStaleMs || at - now > t.fileStaleMs) problem = `host sample file is stale (at ${data.at}, ${Math.round((now - at) / 1000)} s old)`;
  }
  if (!problem) {
    const samples = Array.isArray(data.samples) ? data.samples.filter(s => Array.isArray(s) && Number.isFinite(Date.parse(s[0])) && Number.isFinite(s[1])) : [];
    const last = samples[samples.length - 1], prev = samples[samples.length - 2];
    if (last && now - Date.parse(last[0]) <= t.fileStaleMs) {
      latest = last[1];
      if (prev && Date.parse(last[0]) - Date.parse(prev[0]) <= t.consecutiveGapMs) previous = prev[1];
    } else if (Number.isFinite(data.free_mb)) latest = data.free_mb;
    if (latest === null) problem = "host sample file has no fresh free-memory sample";
  }
  if (!open) return { ...base, allow: true, state: null, reasons: [], reason: problem ? `market closed (guard data unavailable: ${problem})` : "market closed", readProblem: problem, freeMb: latest };
  const reasons = [];
  if (problem) reasons.push(`RESOURCE_SAMPLES_UNAVAILABLE: ${problem}`);
  else {
    if (latest < t.freeMemSingleMb) reasons.push(`FREE_MEMORY_LOW: ${latest} MB < ${t.freeMemSingleMb} MB`);
    else if (latest < t.freeMemConsecutiveMb) {
      // Conservative: with no usable previous sample, one reading under 800 MB is enough to wait.
      if (previous === null) reasons.push(`FREE_MEMORY_LOW: ${latest} MB < ${t.freeMemConsecutiveMb} MB (previous sample unavailable)`);
      else if (previous < t.freeMemConsecutiveMb) reasons.push(`FREE_MEMORY_LOW: ${latest} and ${previous} MB < ${t.freeMemConsecutiveMb} MB on 2 consecutive samples`);
    }
    if (kind === "ollama" && latest < t.ollamaFreeMemMb) reasons.push(`FREE_MEMORY_LOW_FOR_MODEL_LOAD: ${latest} MB < ${t.ollamaFreeMemMb} MB`);
  }
  const state = classify(reasons);
  return { ...base, allow: !state, state, reasons, reason: state ? reasons.join("; ") : "market open; host memory within limits", readProblem: problem, freeMb: latest };
}

/** Parses `icacls <file>` output into principals that are GRANTED access (DENY entries are ignored). */
export function parseIcacls(output, file) {
  const principals = [];
  for (const raw of String(output).split(/\r?\n/)) {
    let line = raw;
    if (file && line.toLowerCase().startsWith(file.toLowerCase())) line = line.slice(file.length);
    line = line.trim();
    if (!line || /^Successfully processed/i.test(line)) continue;
    const m = /^(.+?):(\(.*\))$/.exec(line);
    if (!m) continue;
    if (/\(DENY\)/i.test(m[2])) continue;
    principals.push(m[1].trim());
  }
  return principals;
}

export function currentUserPrincipals() {
  const user = os.userInfo().username, names = new Set();
  for (const d of [process.env.USERDOMAIN, process.env.COMPUTERNAME, os.hostname()]) if (d) names.add(`${d}\\${user}`.toLowerCase());
  return names;
}
const ALWAYS_ALLOWED = new Set(["nt authority\\system", "builtin\\administrators"]);

/** Principals beyond the current user, SYSTEM and Administrators. Empty = private. */
export function widePrincipals(principals, userPrincipals = currentUserPrincipals()) {
  return principals.filter(p => !ALWAYS_ALLOWED.has(p.toLowerCase()) && !userPrincipals.has(p.toLowerCase()));
}

/* No execFile timeout: node would terminate the child on expiry. A slow icacls is abandoned, not ended. */
const runIcaclsDefault = file => Promise.race([
  new Promise((ok, bad) => execFile("icacls", [file], { windowsHide: true }, (e, stdout) => e ? bad(e) : ok(stdout))),
  new Promise((_, bad) => { const t = setTimeout(() => bad(new Error("icacls did not answer in 5 s")), 5000); t.unref?.(); })
]);

/**
 * Reads the agent token only if the file is private. Returns {status, token?, detail}:
 * ABSENT | OK | REFUSED_WIDE_ACL | ACL_UNREADABLE | EMPTY. `token` is present only for OK.
 */
export async function readPrivateToken(file, { platform = process.platform, runIcacls = runIcaclsDefault, userPrincipals } = {}) {
  if (!file || !fs.existsSync(file)) return { status: "ABSENT", detail: "no token file" };
  try {
    if (platform === "win32") {
      const principals = parseIcacls(await runIcacls(file), file);
      if (!principals.length) return { status: "ACL_UNREADABLE", detail: "icacls listed no access entries" };
      const wide = widePrincipals(principals, userPrincipals);
      if (wide.length) return { status: "REFUSED_WIDE_ACL", detail: `token file ACL also grants: ${wide.join(", ")}` };
    } else if (fs.statSync(file).mode & 0o077) return { status: "REFUSED_WIDE_ACL", detail: "token file is readable by group/others" };
  } catch (e) { return { status: "ACL_UNREADABLE", detail: `could not verify the token file ACL: ${e.message}` }; }
  let token = "";
  try { token = fs.readFileSync(file, "utf8").trim(); } catch (e) { return { status: "ACL_UNREADABLE", detail: `could not read the token file: ${e.code || "read error"}` }; }
  if (!token) return { status: "EMPTY", detail: "token file is empty" };
  return { status: "OK", token, detail: "token file is private" };
}

export class ResourceGuard {
  constructor({ controlUrl = "", tokenFile = "", hostMemFile = DEFAULT_HOST_MEM_FILE, machine = os.hostname(), cacheMs = 30_000,
    fetchImpl = globalThis.fetch, now = Date.now, readFile = f => fs.readFileSync(f, "utf8"), readToken = f => readPrivateToken(f), log = console.warn } = {}) {
    Object.assign(this, { controlUrl: controlUrl.replace(/\/$/, ""), tokenFile, hostMemFile, machine, cacheMs, fetchImpl, now, readFile, readToken, log });
    this.cache = new Map(); this.pending = new Map(); this.lastTokenNote = null; this.tokenStatus = null;
    this.counters = { checks: 0, allows: 0, denials: 0, deniedTradingPriority: 0, deniedResources: 0, readFailures: 0, apiFailures: 0, tokenRefusals: 0 };
    this.last = null;
  }

  /** Never throws. Answers {allow, state, reason, reasons, source, kind, at, marketOpen}. Cached briefly per kind. */
  async check(kind = "generation") {
    if (!GUARD_KINDS.includes(kind)) kind = "generation";
    const hit = this.cache.get(kind);
    if (hit && this.now() - hit.at < this.cacheMs) return hit;
    if (!this.pending.has(kind)) this.pending.set(kind, this.evaluate(kind).catch(e => this.failClosed(kind, e)).finally(() => this.pending.delete(kind)));
    return this.pending.get(kind);
  }

  failClosed(kind, e) {
    this.counters.readFailures++;
    this.log(`[resource-guard] guard evaluation failed: ${e.message}`);
    return this.record(evaluateLocal({ kind, data: null, readError: `guard error: ${e.message}`, now: this.now() }));
  }

  async evaluate(kind) {
    const tok = await this.readToken(this.tokenFile);
    this.tokenStatus = tok.status;
    if (tok.status !== "OK" && tok.status !== "ABSENT") {
      if (tok.status === "REFUSED_WIDE_ACL") this.counters.tokenRefusals++; else this.counters.readFailures++;
      if (this.lastTokenNote !== tok.detail) { this.lastTokenNote = tok.detail; this.log(`[resource-guard] not using the control token (${tok.status}): ${tok.detail}; using the local fallback`); }
    }
    if (tok.status === "OK" && this.controlUrl) {
      try { return this.record(await this.askApi(kind, tok.token)); }
      catch (e) { this.counters.apiFailures++; this.log(`[resource-guard] control API guard failed (${e.message}); using the local fallback`); }
    }
    return this.record(this.local(kind));
  }

  async askApi(kind, token) {
    const r = await this.fetchImpl(`${this.controlUrl}${GUARD_PATH}`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind, machine: this.machine })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json();
    const g = body?.result;
    if (body?.ok !== true || typeof g?.allow !== "boolean") throw new Error("unexpected guard answer shape");
    const reasons = Array.isArray(g.reasons) ? g.reasons.map(String) : [];
    const state = g.allow ? null : (classify(reasons) || GuardState.BLOCKED_TRADING_PRIORITY);
    return { allow: g.allow, state, reason: String(g.reason || (g.allow ? "control plane allows" : "control plane denies")), reasons, source: "control-api", kind, at: this.now(), marketOpen: typeof g.marketOpen === "boolean" ? g.marketOpen : marketOpen(this.now()) };
  }

  local(kind) {
    let data = null, readError = null;
    try { data = JSON.parse(this.readFile(this.hostMemFile)); }
    catch (e) { readError = e.code === "ENOENT" ? `host sample file missing (${this.hostMemFile})` : `host sample file unreadable: ${e.message}`; }
    const answer = evaluateLocal({ kind, data, readError, now: this.now() });
    if (answer.readProblem) { this.counters.readFailures++; this.log(`[resource-guard] guard read failure: ${answer.readProblem}${answer.allow ? " (market closed: allowing)" : ""}`); }
    return answer;
  }

  record(answer) {
    this.counters.checks++;
    if (answer.allow) this.counters.allows++;
    else {
      this.counters.denials++;
      if (answer.state === GuardState.WAITING_FOR_RESOURCES) this.counters.deniedResources++; else this.counters.deniedTradingPriority++;
      this.log(`[resource-guard] DENY ${answer.kind} -> ${answer.state}: ${answer.reason} (${answer.source})`);
    }
    this.cache.set(answer.kind, answer); this.last = answer;
    return answer;
  }

  /** Safe to expose to an authenticated client: no token value. */
  snapshot() {
    const mode = this.tokenStatus === "OK" && this.controlUrl ? "control-api" : "local-fallback";
    return { enabled: true, mode, tokenStatus: this.tokenStatus, controlUrl: this.controlUrl || null, hostMemFile: this.hostMemFile, last: this.last, counters: { ...this.counters } };
  }
}

/** Only a config OBJECT (tests) can disable the guard; the environment cannot. */
export const ALLOW_ALL = Object.freeze({
  check: async kind => ({ allow: true, state: null, reason: "resource guard disabled (test config)", reasons: [], source: "disabled", kind, at: Date.now() }),
  snapshot: () => ({ enabled: false }), last: null, counters: {}
});

export function buildGuard(config) {
  if (config.resourceGuard === "off") return ALLOW_ALL;
  return new ResourceGuard({ controlUrl: config.controlUrl || "", tokenFile: config.controlTokenFile || "", hostMemFile: config.hostMemFile || DEFAULT_HOST_MEM_FILE });
}
