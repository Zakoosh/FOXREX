import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
import { createServer } from "../src/server.js"; import { tmp, cfg, REF } from "./helpers.mjs";

async function boot(mode, extra) {
  const dir = tmp(); process.env.FAKE_HF_DIR = dir; process.env.FAKE_HF_MODE = mode;
  const w = createServer({ config: cfg(dir, extra), autoRun: false });
  await new Promise(r => w.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const api = async (p, o = {}) => {
    if (p === '/jobs' && o.method === 'POST') {
      const quoted = await api('/jobs/quote', o); if (!quoted.ok) return quoted;
      const q = await quoted.json(); o = { ...o, body: JSON.stringify({ quoteId: q.id, approved: true }) };
    }
    return fetch(base + p, { ...o, headers: { Authorization: "Bearer t0k", "Content-Type": "application/json", ...(o.headers || {}) } });
  };
  return { dir, w, base, api, close: () => { w.server.closeAllConnections(); w.server.close(); } };
}
const drain = async w => { while (w.store.next()) await w.runner.tick(); };
const job = { prompt: "FOXREX analytical scene", aspectRatio: "4:5", variations: 2, contentId: "c1", promptVersionId: "c1:v1", characterAssetId: "master",
  references: [{ assetId: "master", role: "character_reference", dataUrl: REF }] };

test("rejects unauthenticated calls", async () => { const t = await boot("ok"); const r = await fetch(t.base + "/providers"); assert.equal(r.status, 401); t.close(); });

test("happy path: CLI job with character reference → outputs, lineage, credits", async () => {
  const t = await boot("ok");
  const prov = await (await t.api("/providers")).json();
  assert.equal(prov.find(p => p.id === "HIGGSFIELD_CLI").status.available, true);
  assert.equal(prov.find(p => p.id === "HIGGSFIELD_CLI").status.credits, 100);
  const created = await (await t.api("/jobs", { method: "POST", body: JSON.stringify(job) })).json();
  assert.equal(created.provider, "HIGGSFIELD_CLI"); assert.equal(created.cost_mode, "SUBSCRIPTION_CREDITS"); assert.equal(created.status, "QUEUED");
  assert.ok(!JSON.stringify(created).includes("base64"), "reference bytes never echoed");
  await drain(t.w);
  const done = await (await t.api(`/jobs/${created.id}`)).json();
  assert.equal(done.status, "COMPLETED"); assert.equal(done.output_assets.length, 1); assert.equal(done.model, "nano_banana_2");
  assert.equal(done.credits_used, 2); assert.deepEqual(done.estimated_cost, { credits: 2 }); assert.equal(done.actual_cost, 0);
  assert.equal(done.prompt_version_id, "c1:v1"); assert.equal(done.character_asset_id, "master"); assert.equal(done.provider_job_ids.length, 1);
  const calls = fs.readFileSync(path.join(t.dir, "calls.log"), "utf8");
  assert.match(calls, /"--image-references"/); assert.match(calls, /"--aspect_ratio","4:5"/);
  const img = await fetch(t.base + done.output_assets[0].url); assert.equal(img.status, 200); assert.equal(img.headers.get("content-type"), "image/png");
  t.close();
});

for (const [mode, code] of [["auth", "AUTH_EXPIRED"], ["noworkspace", "WORKSPACE_NOT_SELECTED"]]) {
  test(`provider unavailable (${mode}) → MANUAL_REQUIRED at creation, never paid`, async () => {
    const t = await boot(mode);
    const j = await (await t.api("/jobs", { method: "POST", body: JSON.stringify(job) })).json();
    assert.equal(j.status, "MANUAL_REQUIRED"); assert.equal(j.provider, "MANUAL_CLAUDE"); assert.notEqual(j.cost_mode, "PAID_API");
    assert.ok(j.routing.some(r => r.id === "HIGGSFIELD_CLI" && r.reason === code));
    t.close();
  });
}
test("insufficient credits mid-job → MANUAL_REQUIRED with explicit failure code", async () => {
  const t = await boot("ok");
  const j = await (await t.api("/jobs", { method: "POST", body: JSON.stringify({ ...job, variations: 1 }) })).json();
  process.env.FAKE_HF_MODE = "nocredits"; await t.w.runner.tick();
  const d = await (await t.api(`/jobs/${j.id}`)).json();
  assert.equal(d.status, "MANUAL_REQUIRED"); assert.equal(d.failure_code, "INSUFFICIENT_CREDITS"); t.close();
});
test("provider rejection after submission blocks charged retry", async () => {
  const t = await boot("ok");
  const j = await (await t.api("/jobs", { method: "POST", body: JSON.stringify({ ...job, variations: 1 }) })).json();
  process.env.FAKE_HF_MODE = "reject"; await t.w.runner.tick();
  const d = await (await t.api(`/jobs/${j.id}`)).json(); assert.equal(d.status, "FAILED"); assert.equal(d.failure_code, "GENERATION_REJECTED");
  process.env.FAKE_HF_MODE = "ok";
  const r = await t.api(`/jobs/${j.id}/retry`, { method: "POST" }); assert.equal(r.status, 409);
  assert.equal(fs.readFileSync(path.join(t.dir, 'calls.log'), 'utf8').match(/"create"/g)?.length, 1); t.close();
});
test("missing create id is recovered from read-only CLI history", async () => {
  const t = await boot("noid");
  const j = await (await t.api("/jobs", { method: "POST", body: JSON.stringify({ ...job, variations: 1 }) })).json();
  await drain(t.w);
  const done = await (await t.api(`/jobs/${j.id}`)).json();
  assert.equal(done.status, "COMPLETED"); assert.equal(done.output_assets.length, 1);
  assert.equal(fs.readFileSync(path.join(t.dir, "calls.log"), "utf8").match(/"create"/g)?.length, 1);
  t.close();
});
test("unconfirmed submission can be reconciled without creating another billable job", async () => {
  const t = await boot("noid-unlisted");
  const j = await (await t.api("/jobs", { method: "POST", body: JSON.stringify({ ...job, variations: 1 }) })).json();
  await drain(t.w);
  const failed = await (await t.api(`/jobs/${j.id}`)).json();
  assert.equal(failed.status, "FAILED"); assert.equal(failed.failure_code, "SUBMISSION_UNCONFIRMED");
  const stateFile = path.join(t.dir, "state.json");
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const cliJob = state.jobs[0];
  process.env.FAKE_HF_MODE = "ok";
  assert.equal((await t.api(`/jobs/${j.id}/retry`, { method: "POST" })).status, 409);
  assert.equal((await t.api(`/jobs/${j.id}/reconcile`, { method: "POST", body: JSON.stringify({ providerJobId: crypto.randomUUID() }) })).status, 409);
  state.jobs.push({ ...cliJob, id: crypto.randomUUID() });
  fs.writeFileSync(stateFile, JSON.stringify(state));
  assert.equal((await t.api(`/jobs/${j.id}/reconcile`, { method: "POST", body: JSON.stringify({ providerJobId: cliJob.id }) })).status, 409,
    "ambiguous same-window jobs must not be linked");
  state.jobs.pop(); fs.writeFileSync(stateFile, JSON.stringify(state));
  const response = await t.api(`/jobs/${j.id}/reconcile`, { method: "POST", body: JSON.stringify({ providerJobId: cliJob.id }) });
  assert.equal(response.status, 200);
  const repaired = await response.json();
  assert.equal(repaired.status, "COMPLETED"); assert.equal(repaired.provider_job_id, cliJob.id);
  assert.equal(repaired.output_assets.length, 1);
  const calls = fs.readFileSync(path.join(t.dir, "calls.log"), "utf8");
  assert.equal(calls.match(/"create"/g)?.length, 1);
  assert.ok(!calls.includes('"get"'), "completed list entry should supply the output URL");
  t.close();
});
test("explicit manual provider request → MANUAL_REQUIRED without calling the CLI generate", async () => {
  const t = await boot("ok");
  const j = await (await t.api("/jobs", { method: "POST", body: JSON.stringify({ ...job, provider: "MANUAL_CLAUDE" }) })).json();
  assert.equal(j.status, "MANUAL_REQUIRED");
  assert.ok(!fs.readFileSync(path.join(t.dir, "calls.log"), "utf8").includes('"create"')); t.close();
});
test("input validation", async () => {
  const t = await boot("ok");
  const r = await t.api("/jobs", { method: "POST", body: JSON.stringify({ prompt: "", aspectRatio: "x", variations: 9 }) });
  assert.equal(r.status, 400); assert.deepEqual((await r.json()).fields, ["prompt", "aspectRatio", "variations"]); t.close();
});
test("unverified video generation cannot be quoted", async () => {
  const t = await boot("ok");
  const j = await (await t.api("/jobs", { method: "POST", body: JSON.stringify({ ...job, type: "video", aspectRatio: "9:16" }) })).json();
  assert.match(j.error, /rendered video is unavailable/); t.close();
});
test("worker restart never leaves a job stuck in GENERATING", async () => {
  const t = await boot("ok");
  const j = t.w.store.create({ provider: "HIGGSFIELD_CLI", status: "GENERATING", prompt_text: "x", parameters: { aspectRatio: "4:5", variations: 1 } });
  t.w.store.recover(); assert.equal(t.w.store.get(j.id).status, "FAILED"); assert.equal(t.w.store.get(j.id).failure_code, "WORKER_RESTARTED"); t.close();
});
