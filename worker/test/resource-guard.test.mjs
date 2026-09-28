/* D45 resource guard. No real network, no Ollama, no live host file: every source is injected. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ResourceGuard, GuardState, GUARD_PATH, evaluateLocal, marketOpen, parseIcacls, readPrivateToken, retryDelayMs, buildGuard, ALLOW_ALL } from "../src/guard.js";
import { Runner } from "../src/runner.js";
import { JobStore } from "../src/jobs.js";
import { CreativeService } from "../src/creative.js";
import { createServer } from "../src/server.js";
import { cfg, tmp } from "./helpers.mjs";

const OPEN = Date.parse("2026-09-30T12:00:00Z");   // Wednesday: FX open
const CLOSED = Date.parse("2026-10-03T12:00:00Z"); // Saturday: FX closed
const iso = t => new Date(t).toISOString();
/** The SRE file shape: {at, free_mb, samples:[[at, MB], ...oldest first]}. */
const hostFile = (now, prev, latest, ageMs = 5000) => JSON.stringify({ at: iso(now - ageMs), free_mb: latest, samples: [[iso(now - ageMs - 32000), prev], [iso(now - ageMs), latest]], pooler_rtt_median_ms: 310 });
const ABSENT = async () => ({ status: "ABSENT", detail: "no token file" });
function guardWith({ now = OPEN, file, readToken = ABSENT, fetchImpl = async () => { throw new Error("network must not be used"); } } = {}) {
  const logs = [];
  const g = new ResourceGuard({ controlUrl: "https://control.test", tokenFile: "unused", hostMemFile: "host.json", machine: "studio-box", now: () => now,
    readFile: () => { if (file instanceof Error) throw file; return file; }, readToken, fetchImpl, log: m => logs.push(m) });
  return { g, logs };
}
const enoent = () => Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });

test("market calendar: Sunday 21:00Z to Friday 21:00Z", () => {
  assert.equal(marketOpen(OPEN), true); assert.equal(marketOpen(CLOSED), false);
  assert.equal(marketOpen(Date.parse("2026-10-04T20:59:00Z")), false); assert.equal(marketOpen(Date.parse("2026-10-04T21:00:00Z")), true);
  assert.equal(marketOpen(Date.parse("2026-10-02T20:59:00Z")), true); assert.equal(marketOpen(Date.parse("2026-10-02T21:00:00Z")), false);
});

test("allow: market open, fresh file, memory above every threshold", async () => {
  const { g, logs } = guardWith({ file: hostFile(OPEN, 2100, 1900) });
  for (const kind of ["generation", "ollama"]) {
    const a = await g.check(kind);
    assert.equal(a.allow, true); assert.equal(a.state, null); assert.equal(a.source, "local-fallback"); assert.equal(a.kind, kind);
  }
  assert.equal(g.counters.denials, 0); assert.equal(logs.length, 0);
});

test("deny WAITING_FOR_RESOURCES: < 600 MB on the latest sample", () => {
  const a = evaluateLocal({ kind: "generation", data: JSON.parse(hostFile(OPEN, 2000, 590)), now: OPEN });
  assert.equal(a.allow, false); assert.equal(a.state, GuardState.WAITING_FOR_RESOURCES); assert.match(a.reason, /FREE_MEMORY_LOW: 590 MB < 600 MB/);
});

test("deny WAITING_FOR_RESOURCES: < 800 MB on the last 2 samples; one dip alone is allowed", () => {
  const both = evaluateLocal({ kind: "generation", data: JSON.parse(hostFile(OPEN, 780, 700)), now: OPEN });
  assert.equal(both.allow, false); assert.equal(both.state, GuardState.WAITING_FOR_RESOURCES); assert.match(both.reason, /2 consecutive samples/);
  const dip = evaluateLocal({ kind: "generation", data: JSON.parse(hostFile(OPEN, 900, 700)), now: OPEN });
  assert.equal(dip.allow, true);
});

test("deny WAITING_FOR_RESOURCES: kind=ollama needs 1,700 MB; generation on the same data is allowed", () => {
  const data = JSON.parse(hostFile(OPEN, 1650, 1600));
  const ollama = evaluateLocal({ kind: "ollama", data, now: OPEN });
  assert.equal(ollama.allow, false); assert.equal(ollama.state, GuardState.WAITING_FOR_RESOURCES); assert.match(ollama.reason, /FREE_MEMORY_LOW_FOR_MODEL_LOAD: 1600 MB < 1700 MB/);
  assert.equal(evaluateLocal({ kind: "generation", data, now: OPEN }).allow, true);
});

test("market open: stale, missing or unreadable file denies (BLOCKED_TRADING_PRIORITY), is logged and counted", async () => {
  const cases = [hostFile(OPEN, 2000, 2000, 120_000), enoent(), "{not json"];
  const logs = []; let failures = 0, denials = 0;
  for (const file of cases) {
    const { g, logs: l } = guardWith({ file });
    const a = await g.check("generation");
    assert.equal(a.allow, false); assert.equal(a.state, GuardState.BLOCKED_TRADING_PRIORITY); assert.match(a.reason, /^RESOURCE_SAMPLES_UNAVAILABLE/);
    failures += g.counters.readFailures; denials += g.counters.denials; logs.push(...l);
  }
  assert.equal(failures, 3); assert.equal(denials, 3);
  assert.equal(logs.filter(m => /guard read failure/.test(m)).length, 3);
  assert.equal(logs.filter(m => /DENY generation -> BLOCKED_TRADING_PRIORITY/.test(m)).length, 3);
});

test("market closed: missing data allows, but the read failure is still logged and counted", async () => {
  const { g, logs } = guardWith({ now: CLOSED, file: enoent() });
  const a = await g.check("ollama");
  assert.equal(a.allow, true); assert.match(a.reason, /market closed \(guard data unavailable/);
  assert.equal(g.counters.readFailures, 1); assert.ok(logs.some(m => /guard read failure.*market closed: allowing/.test(m)));
});

test("answers are cached per kind for 30 s; no re-read inside the window", async () => {
  let reads = 0, now = OPEN;
  const g = new ResourceGuard({ hostMemFile: "h", now: () => now, readFile: () => { reads++; return hostFile(now, 2000, 2000); }, readToken: ABSENT, log: () => {} });
  await g.check("generation"); await g.check("generation"); assert.equal(reads, 1);
  await g.check("ollama"); assert.equal(reads, 2);
  now += 31_000; await g.check("generation"); assert.equal(reads, 3);
});

/* Token file handling: a real temp file, icacls output injected. */
const TOKEN = "tok-SECRET-value-123";
function tokenFile() { const f = path.join(tmp(), "foxrex-studio.token"); fs.writeFileSync(f, TOKEN + "\n"); return f; }
const icacls = (file, ...aces) => `${file} ${aces[0]}\n${aces.slice(1).map(a => " ".repeat(file.length + 1) + a).join("\n")}\n\nSuccessfully processed 1 files; Failed processing 0 files\n`;
const ME = new Set(["studio-box\\me"]);
const PRIVATE = ["NT AUTHORITY\\SYSTEM:(F)", "BUILTIN\\Administrators:(F)", "STUDIO-BOX\\me:(F)"];

test("parseIcacls reads granted principals, including inherited ones, and ignores DENY entries", () => {
  const f = "C:\\Users\\me\\.fionera-control\\foxrex-studio.token";
  assert.deepEqual(parseIcacls(icacls(f, "NT AUTHORITY\\SYSTEM:(I)(F)", "BUILTIN\\Users:(DENY)(R)", "STUDIO-BOX\\me:(I)(F)"), f), ["NT AUTHORITY\\SYSTEM", "STUDIO-BOX\\me"]);
});

test("API path: a private token file switches the guard to POST guard_non_critical (mocked fetch)", async () => {
  const file = tokenFile(), calls = [];
  const readToken = f => readPrivateToken(f, { platform: "win32", runIcacls: async x => icacls(x, ...PRIVATE), userPrincipals: ME });
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ ok: true, result: { allow: false, reason: "RELAY_STALE: 14 s > 10 s", reasons: ["RELAY_STALE: 14 s > 10 s"], marketOpen: true } }) }; };
  const logs = [];
  const g = new ResourceGuard({ controlUrl: "https://control.test/", tokenFile: file, hostMemFile: "h", machine: "studio-box", now: () => OPEN,
    readFile: () => hostFile(OPEN, 3000, 3000), readToken, fetchImpl, log: m => logs.push(m) });
  const a = await g.check("ollama");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://control.test" + GUARD_PATH);
  assert.equal(calls[0].opts.method, "POST");
  assert.equal(calls[0].opts.headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(JSON.parse(calls[0].opts.body), { kind: "ollama", machine: "studio-box" });
  // The API answer wins over a healthy local file.
  assert.equal(a.allow, false); assert.equal(a.source, "control-api"); assert.equal(a.state, GuardState.BLOCKED_TRADING_PRIORITY);
  assert.equal(g.snapshot().mode, "control-api");
  // The token is never logged, never in an answer, never in the snapshot.
  assert.ok(!JSON.stringify([logs, a, g.snapshot()]).includes(TOKEN));

  const mem = new ResourceGuard({ controlUrl: "https://control.test", tokenFile: file, now: () => OPEN, readToken, log: () => {},
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, result: { allow: false, reason: "x", reasons: ["FREE_MEMORY_LOW_FOR_MODEL_LOAD: 1500 MB < 1700 MB"] } }) }) });
  assert.equal((await mem.check("ollama")).state, GuardState.WAITING_FOR_RESOURCES);
});

test("API failure (endpoint not deployed) falls back to the local file, counted and logged", async () => {
  const file = tokenFile();
  const logs = [];
  const g = new ResourceGuard({ controlUrl: "https://control.test", tokenFile: file, now: () => OPEN, readFile: () => hostFile(OPEN, 2500, 2500),
    readToken: f => readPrivateToken(f, { platform: "win32", runIcacls: async x => icacls(x, ...PRIVATE), userPrincipals: ME }),
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }), log: m => logs.push(m) });
  const a = await g.check("generation");
  assert.equal(a.allow, true); assert.equal(a.source, "local-fallback"); assert.equal(g.counters.apiFailures, 1);
  assert.ok(logs.some(m => /control API guard failed \(HTTP 404\)/.test(m)));
});

test("a token file whose ACL grants anyone else is refused: no API call, local fallback, counted", async () => {
  const file = tokenFile();
  for (const extra of ["Everyone:(R)", "BUILTIN\\Users:(RX)", "NT AUTHORITY\\Authenticated Users:(M)", "OTHER-PC\\someone:(R)"]) {
    const r = await readPrivateToken(file, { platform: "win32", runIcacls: async x => icacls(x, ...PRIVATE, extra), userPrincipals: ME });
    assert.equal(r.status, "REFUSED_WIDE_ACL", extra); assert.equal(r.token, undefined);
  }
  let fetched = 0; const logs = [];
  const g = new ResourceGuard({ controlUrl: "https://control.test", tokenFile: file, now: () => OPEN, readFile: () => hostFile(OPEN, 700, 500),
    readToken: f => readPrivateToken(f, { platform: "win32", runIcacls: async x => icacls(x, ...PRIVATE, "Everyone:(R)"), userPrincipals: ME }),
    fetchImpl: async () => { fetched++; throw new Error("must not be called"); }, log: m => logs.push(m) });
  const a = await g.check("generation");
  assert.equal(fetched, 0); assert.equal(a.source, "local-fallback"); assert.equal(a.state, GuardState.WAITING_FOR_RESOURCES);
  assert.equal(g.counters.tokenRefusals, 1); assert.equal(g.snapshot().mode, "local-fallback");
  assert.ok(logs.some(m => /REFUSED_WIDE_ACL.*Everyone/.test(m))); assert.ok(!logs.join("\n").includes(TOKEN));
  // An unverifiable ACL is not trusted either.
  assert.equal((await readPrivateToken(file, { platform: "win32", runIcacls: async () => { throw new Error("icacls failed"); } })).status, "ACL_UNREADABLE");
});

test("without a token file the API is not used", async () => {
  let fetched = 0;
  const g = new ResourceGuard({ controlUrl: "https://control.test", tokenFile: path.join(tmp(), "absent.token"), now: () => OPEN, readFile: () => hostFile(OPEN, 2000, 2000), fetchImpl: async () => { fetched++; }, log: () => {} });
  assert.equal((await g.check("generation")).allow, true); assert.equal(fetched, 0); assert.equal(g.snapshot().tokenStatus, "ABSENT");
});

test("the environment cannot switch the guard off; only an explicit test config object can", () => {
  assert.equal(buildGuard({ resourceGuard: "off" }), ALLOW_ALL);
  assert.ok(buildGuard({}) instanceof ResourceGuard);
  assert.ok(buildGuard({ resourceGuard: "on" }) instanceof ResourceGuard);
});

/* Integration: the two FOXREX paths that start heavy local work. */
function fakeGuard(answer) { return { calls: [], answer, async check(kind) { this.calls.push(kind); return { kind, source: "test", reasons: [], ...this.answer }; }, snapshot() { return { enabled: true, test: true }; } }; }
const DENY_MEM = { allow: false, state: GuardState.WAITING_FOR_RESOURCES, reason: "FREE_MEMORY_LOW: 500 MB < 600 MB" };
const DENY_TRADING = { allow: false, state: GuardState.BLOCKED_TRADING_PRIORITY, reason: "RESOURCE_SAMPLES_UNAVAILABLE: host sample file is stale" };
const ALLOW = { allow: true, state: null, reason: "ok" };

test("runner: a denied generation stays QUEUED_RESOURCE_GUARD, backs off 60 s, never busy-loops, starts when allowed", async () => {
  const dir = tmp(), store = new JobStore(path.join(dir, "data")); let now = OPEN;
  const guard = fakeGuard(DENY_TRADING), started = [];
  const runner = new Runner({ store, registry: { HIGGSFIELD_CLI: { capabilities: {} }, MANUAL_CLAUDE: { manual: true } }, config: cfg(dir), guard, now: () => now, log: () => {} });
  runner.execute = async job => { started.push(job.id); store.update(job.id, { status: "COMPLETED" }); };
  const job = store.create({ provider: "HIGGSFIELD_CLI", prompt_text: "p" });
  await runner.tick();
  let j = store.get(job.id);
  assert.equal(j.status, "QUEUED"); assert.equal(j.guard_state, GuardState.QUEUED_RESOURCE_GUARD); assert.equal(j.guard_blocked_by, GuardState.BLOCKED_TRADING_PRIORITY);
  assert.equal(j.guard_attempts, 1); assert.equal(Date.parse(j.guard_retry_at) - now, 60_000); assert.deepEqual(started, []);
  for (let i = 0; i < 5; i++) await runner.tick(); // 1 s ticks inside the backoff: the guard is not asked again
  assert.equal(guard.calls.length, 1);
  now += 61_000; await runner.tick();
  j = store.get(job.id); assert.equal(j.guard_attempts, 2); assert.equal(Date.parse(j.guard_retry_at) - now, 120_000);
  assert.equal(retryDelayMs(10), 300_000);
  guard.answer = ALLOW; now += 121_000; await runner.tick();
  assert.deepEqual(started, [job.id]); assert.equal(store.get(job.id).guard_state, null);
  // Manual production does not use local compute and is not guarded.
  guard.answer = DENY_MEM; const manual = store.create({ provider: "MANUAL_CLAUDE", prompt_text: "m" }); const before = guard.calls.length;
  await runner.tick(); assert.deepEqual(started, [job.id, manual.id]); assert.equal(guard.calls.length, before);
});

test("creative (Ollama): a deny sends nothing to the model, queues QUEUED_RESOURCE_GUARD, retries with backoff, runs when allowed", async () => {
  const dir = tmp(); const c = cfg(dir); fs.mkdirSync(c.dataDir); let now = OPEN;
  const ideas = { concepts: ["a", "b", "c"].map(id => ({ id, title: id, hook: "h " + id, angle: id, narrative: "n", visualDirection: "v" })), recommendedId: "a", rationale: "r", claims: [] };
  const brief = { objective: "Educate", audience: "A", platform: "Instagram", format: "post", message: "M", tone: "Calm", brandAssets: [], references: [], facts: [] };
  let generated = 0; const provider = { id: "TEST", model: "mock", costMode: "LOCAL_COMPUTE", generate: async () => { generated++; return ideas; } };
  const guard = fakeGuard(DENY_MEM);
  const svc = new CreativeService(c, provider, { guard, now: () => now, autoRetry: false, log: () => {} });
  const err = await svc.run("ideate", { brief, contentId: "item" }).then(() => null, e => e);
  assert.equal(err.status, 503); assert.equal(err.retryAfterSec, 60);
  assert.equal(err.body.state, GuardState.QUEUED_RESOURCE_GUARD); assert.equal(err.body.blockedBy, GuardState.WAITING_FOR_RESOURCES); assert.equal(err.body.queued, true);
  assert.deepEqual(guard.calls, ["ollama"]); assert.equal(generated, 0);
  await svc.processQueue(); assert.equal(guard.calls.length, 1); // not due yet
  now += 61_000; await svc.processQueue();
  let q = svc.listQueue()[0]; assert.equal(q.state, GuardState.QUEUED_RESOURCE_GUARD); assert.equal(q.attempts, 2); assert.equal(Date.parse(q.nextAttemptAt) - now, 120_000); assert.equal(generated, 0);
  assert.equal(q.input, undefined); // the queue listing does not echo the brief
  guard.answer = ALLOW; now += 121_000; await svc.processQueue();
  q = svc.listQueue()[0]; assert.equal(q.state, "COMPLETED"); assert.equal(generated, 1);
  assert.equal(svc.data.revisions.find(r => r.id === q.revisionId).contentId, "item");
});

test("server: denied reasoning answers 503 with the state and Retry-After; /guard never exposes a token", async t => {
  const dir = tmp(); const guard = fakeGuard(DENY_TRADING);
  const provider = { id: "TEST", model: "mock", costMode: "LOCAL_COMPUTE", generate: async () => { throw new Error("must not run"); } };
  const w = createServer({ config: cfg(dir), autoRun: false, guard, creativeProvider: provider, registry: {} });
  await new Promise(r => w.server.listen(0, "127.0.0.1", r));
  t.after(() => { w.creative.stopQueue(); w.server.closeAllConnections(); w.server.close(); });
  const base = `http://127.0.0.1:${w.server.address().port}`, auth = { Authorization: "Bearer t0k", "Content-Type": "application/json" };
  const brief = { objective: "Educate", audience: "A", platform: "Instagram", format: "post", message: "M", tone: "Calm", brandAssets: [], references: [], facts: [] };
  const r = await fetch(`${base}/creative/ideate`, { method: "POST", headers: auth, body: JSON.stringify({ brief, contentId: "x" }) });
  assert.equal(r.status, 503); assert.equal(r.headers.get("retry-after"), "60");
  const b = await r.json();
  assert.equal(b.state, GuardState.QUEUED_RESOURCE_GUARD); assert.equal(b.blockedBy, GuardState.BLOCKED_TRADING_PRIORITY); assert.match(b.error, /^QUEUED_RESOURCE_GUARD: /);
  const queued = await (await fetch(`${base}/creative/queue/${b.queueId}`, { headers: auth })).json();
  assert.equal(queued.state, GuardState.QUEUED_RESOURCE_GUARD);
  const cancelled = await (await fetch(`${base}/creative/queue/${b.queueId}/cancel`, { method: "POST", headers: auth })).json();
  assert.equal(cancelled.state, "CANCELLED");
  assert.equal((await fetch(`${base}/guard`)).status, 401);
  assert.deepEqual(await (await fetch(`${base}/guard`, { headers: auth })).json(), { enabled: true, test: true });
});

test("the guard and its callers contain no process-termination code", () => {
  for (const f of ["guard.js", "runner.js", "creative.js"]) {
    const src = fs.readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /process\.kill|\.kill\(|taskkill|Stop-Process|SIGTERM|SIGKILL|process\.exit/, f);
  }
});
