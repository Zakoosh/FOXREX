/* Production-commissioning and always-on control-plane tests: preflight, dry-run safety, server-only
   live mode, health vs readiness, backups/restore, scheduler policy, deployment verification, rollback,
   rate limits, audit hash chain, secret-safe logging, Gold Focus rules and the Studio status panel.
   Every publishing test runs against an isolated temporary repository (never GitHub, never production). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { boot, approve, goldEN, feedOf, remoteLog, git, makeRepo, TOKEN, ROOT } from './publish-fixture.mjs';
import { tmp } from './helpers.mjs';
import { captured } from '../src/logger.js';
import { BackupService, readBackup, restoreBackup } from '../src/backup.js';
import { AuditJournal } from '../src/audit.js';
import { Scheduler } from '../src/scheduler.js';

process.env.FOXREX_ALLOW_TEST_CONTENT = '1'; // isolated temp repos only — production never sets this
const require = createRequire(import.meta.url);
const CMS = require('../../studio/cms-model.js');
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

async function approvedGold(api, extra = {}) {
  const c = await api('POST', '/api/content', { ...goldEN, ...extra }); assert.equal(c.status, 201, JSON.stringify(c.body));
  return approve(api, c.body.id);
}
async function schedule(api, id, at) {
  const r = (await api('GET', `/api/content/${id}`)).body;
  const s = await api('POST', `/api/content/${id}/transition`, { action: 'schedule', expectedRevision: r.revision, scheduledAt: at });
  assert.equal(s.status, 200, JSON.stringify(s.body)); return s.body;
}

/* ---------- preflight ---------- */
test('preflight: approved, valid content in a clean current repo is READY TO PUBLISH', async t => {
  const { api } = await boot(t);
  const r = await approvedGold(api);
  const f = await api('GET', '/api/feed');
  const pf = await api('POST', '/api/publish/preflight', { contentId: r.id, expectedVersion: f.body.version });
  assert.equal(pf.status, 200);
  assert.equal(pf.body.status, 'READY TO PUBLISH', JSON.stringify(pf.body.checks.filter(c => !c.ok)));
  for (const id of ['operator', 'approved', 'validation', 'repo', 'branch', 'clean', 'origin', 'current', 'feed', 'version', 'tests']) assert.ok(pf.body.checks.find(c => c.id === id && c.ok), id);
});

test('preflight: a dirty publishing repo, unapproved content or a stale feed version are BLOCKED with the reason', async t => {
  const { api, repo } = await boot(t);
  const r = await approvedGold(api);
  fs.writeFileSync(path.join(repo.work, 'stray.txt'), 'uncommitted');
  const f = await api('GET', '/api/feed');
  let pf = (await api('POST', '/api/publish/preflight', { contentId: r.id, expectedVersion: f.body.version })).body;
  assert.equal(pf.status, 'BLOCKED'); assert.equal(pf.ready, false);
  assert.equal(pf.checks.find(c => c.id === 'clean').ok, false);
  fs.unlinkSync(path.join(repo.work, 'stray.txt'));
  pf = (await api('POST', '/api/publish/preflight', { contentId: r.id, expectedVersion: 'deadbeef0000' })).body;
  assert.equal(pf.checks.find(c => c.id === 'version').ok, false);
  const d = await api('POST', '/api/content', { ...goldEN, title: 'TEST draft only', slug: 'test-draft-only' });
  pf = (await api('POST', '/api/publish/preflight', { contentId: d.body.id })).body;
  assert.equal(pf.checks.find(c => c.id === 'approved').ok, false); assert.equal(pf.status, 'BLOCKED');
  // the live publish endpoint independently refuses the dirty repo
  fs.writeFileSync(path.join(repo.work, 'stray.txt'), 'x');
  const p = await api('POST', '/api/publish', { contentId: r.id, expectedVersion: f.body.version, confirm: true });
  assert.equal(p.status, 409); assert.match(p.body.error, /uncommitted/);
});

/* ---------- dry run + server-only live mode ---------- */
test('dry-run mode: publish validates and diffs but writes, commits and pushes nothing; the browser cannot switch to live', async t => {
  const { api, repo } = await boot(t, {}, { mode: 'dry-run' });
  const r = await approvedGold(api);
  const headBefore = git(repo.work, 'rev-parse', 'HEAD'), remoteBefore = remoteLog(repo), feedBefore = fs.readFileSync(path.join(repo.work, 'data/content.json'), 'utf8');
  const f = await api('GET', '/api/feed');
  const p = await api('POST', '/api/publish', { contentId: r.id, expectedVersion: f.body.version, confirm: true, mode: 'live', publishMode: 'live', dryRun: false }, { 'X-Publish-Mode': 'live' });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.result, 'DRY_RUN_OK'); assert.equal(p.body.mode, 'dry-run'); assert.ok(p.body.diff.includes(r.id));
  assert.equal(git(repo.work, 'rev-parse', 'HEAD'), headBefore); assert.deepEqual(remoteLog(repo), remoteBefore);
  assert.equal(fs.readFileSync(path.join(repo.work, 'data/content.json'), 'utf8'), feedBefore); assert.equal(git(repo.work, 'status', '--porcelain'), '');
  const st = (await api('GET', '/api/system/status')).body;
  assert.equal(st.readiness.publishing.mode, 'dry-run'); assert.equal(st.readiness.publishing.modeLabel, 'DRY RUN');
  for (const [m, p2] of [['POST', '/api/system/mode'], ['PUT', '/api/cms/config'], ['POST', '/api/publish/mode']]) assert.equal((await api(m, p2, { mode: 'live' })).status, 404, p2);
  assert.equal((await api('GET', '/api/system/status')).body.readiness.publishing.mode, 'dry-run');
  assert.equal((await api('GET', `/api/content/${r.id}`)).body.status, 'APPROVED', 'a dry run does not mark content published');
});

test('commissioning proves the full path with no editorial record, no commit, no push and no file change', async t => {
  const { api, repo } = await boot(t, {}, { mode: 'dry-run' });
  const head = git(repo.work, 'rev-parse', 'HEAD'), remote = remoteLog(repo), branches = git(repo.remote, 'branch', '--list');
  const c = await api('POST', '/api/publish/commission', {});
  assert.equal(c.status, 200); assert.equal(c.body.result, 'COMMISSION_OK', JSON.stringify(c.body.checks.filter(x => !x.ok)));
  for (const id of ['repo', 'branch', 'clean', 'fetch', 'current', 'push', 'feed', 'tests', 'nomutation']) assert.ok(c.body.checks.find(x => x.id === id && x.ok), id);
  assert.equal(git(repo.work, 'rev-parse', 'HEAD'), head); assert.deepEqual(remoteLog(repo), remote);
  assert.equal(git(repo.remote, 'branch', '--list'), branches, 'the push probe creates no ref');
  assert.equal((await api('GET', '/api/content')).body.length, 0, 'no editorial record created');
  assert.equal((await api('GET', '/api/system/status')).body.deployment.lastCommission.result, 'COMMISSION_OK');
});

/* ---------- health vs readiness ---------- */
test('health is public liveness; readiness is authenticated, per component, and AI being down does not break CMS/publishing', async t => {
  const down = { name: 'OLLAMA', async status() { return { available: false, code: 'UNAVAILABLE', provider: 'OLLAMA', model: 'qwen' }; } };
  const { api, base, repo, config } = await boot(t, {}, {}, { creativeProvider: down });
  const h = await fetch(base + '/health'); assert.equal(h.status, 200);
  const hb = await h.json(); assert.equal(hb.ok, true);
  assert.ok(!JSON.stringify(hb).includes(TOKEN) && !JSON.stringify(hb).includes(repo.work));
  assert.equal((await fetch(base + '/api/system/status')).status, 401, 'readiness requires the bearer token');
  const st = await api('GET', '/api/system/status');
  assert.equal(st.status, 200); assert.equal(st.body.health.worker, 'HEALTHY');
  assert.equal(st.body.readiness.cms.state, 'READY'); assert.equal(st.body.readiness.publishingRepo.state, 'READY');
  assert.ok(['UNAVAILABLE', 'DISABLED'].includes(st.body.readiness.ai.state));
  const txt = JSON.stringify(st.body);
  for (const bad of [TOKEN, repo.work, config.dataDir, repo.remote]) assert.ok(!txt.includes(bad), 'status must not leak ' + bad);
  // manual CMS work still functions with AI down
  assert.equal((await api('POST', '/api/content', { ...goldEN, slug: 'ai-down' })).status, 201);
});

/* ---------- backups ---------- */
test('backups: checksummed, atomic, retained; restore returns the exact prior state and refuses corrupt files', async t => {
  const dataDir = path.join(tmp(), 'data'); const cmsDir = path.join(dataDir, 'cms'); fs.mkdirSync(cmsDir, { recursive: true });
  fs.writeFileSync(path.join(cmsDir, 'records.json'), JSON.stringify({ records: { a: { id: 'a', title: 'one' } } }));
  const svc = new BackupService({ dataDir, keep: 3 });
  const b1 = svc.snapshot('test'); assert.match(b1.file, /^cms-\d{8}T\d{6}Z-[0-9a-f]{6}\.json$/); assert.ok(b1.sha256);
  assert.equal(readBackup(path.join(svc.dir, b1.file)).files['records.json'].includes('"one"'), true);
  fs.writeFileSync(path.join(cmsDir, 'records.json'), JSON.stringify({ records: { a: { id: 'a', title: 'two' } } }));
  const out = restoreBackup(path.join(svc.dir, b1.file), dataDir);
  assert.ok(out.safetySnapshot, 'a pre-restore safety snapshot is taken');
  assert.match(fs.readFileSync(path.join(cmsDir, 'records.json'), 'utf8'), /"one"/);
  for (let i = 0; i < 5; i++) svc.snapshot('r' + i);
  assert.equal(svc.list().length, 3, 'retention keeps the newest N');
  assert.ok(!fs.readdirSync(svc.dir).some(f => f.includes('.tmp')), 'no partial files left behind');
  const corrupt = path.join(svc.dir, svc.list()[0].file);
  const b = JSON.parse(fs.readFileSync(corrupt, 'utf8')); b.files['records.json'] = '{"records":{}}'; fs.writeFileSync(corrupt, JSON.stringify(b));
  assert.throws(() => readBackup(corrupt), /checksum/);
  assert.throws(() => restoreBackup(corrupt, dataDir), /checksum/);
  assert.match(fs.readFileSync(path.join(cmsDir, 'records.json'), 'utf8'), /"one"/, 'failed restore changes nothing');
});

test('backups via API: manual backup is audited and listed; status shows the last backup', async t => {
  const { api } = await boot(t);
  const b = await api('POST', '/api/system/backups', {}); assert.equal(b.status, 201); assert.ok(b.body.file);
  assert.ok(!JSON.stringify(b.body).includes('/'), 'no filesystem paths in the response');
  const l = await api('GET', '/api/system/backups'); assert.ok(l.body.backups.some(x => x.file === b.body.file));
  assert.equal((await api('GET', '/api/system/status')).body.readiness.backups.state, 'READY');
  assert.ok((await api('GET', '/api/system/audit?action=BACKUP')).body.entries.length >= 1);
});

/* ---------- scheduler ---------- */
test('scheduler: due item publishes once, survives a worker restart, and is idempotent', async t => {
  const repo = makeRepo(), dataRoot = tmp();
  const first = await boot(t, { schedulerEnabled: false }, {}, { repo, dataRoot });
  const r = await approvedGold(first.api);
  await schedule(first.api, r.id, iso(Date.now() + 60e3));
  // simulate time passing while the worker is down: the slot was 1 min ago (within grace), persisted to disk
  const sAt = iso(Date.now() - 60e3); first.app.cms.store.data.records[r.id].scheduledAt = sAt; first.app.cms.store.persist();
  first.stop(); // restart: state must come from the durable store
  const second = await boot(t, { schedulerEnabled: false }, {}, { repo, dataRoot });
  const sch = second.app.cms.scheduler;
  assert.deepEqual(await sch.tick(Date.now() - 5 * 60e3), [], 'not due before its slot');
  const res = await sch.tick(Date.now());
  assert.equal(res.length, 1); assert.equal(res[0].state, 'SUCCESS', JSON.stringify(res));
  assert.equal((await second.api('GET', `/api/content/${r.id}`)).body.status, 'PUBLISHED');
  const commits = remoteLog(repo).length;
  assert.deepEqual(await sch.tick(Date.now()), [], 'nothing is due any more');
  assert.equal(remoteLog(repo).length, commits, 'no double publish');
  // replaying the same schedule idempotency key returns the recorded publication
  const replay = await second.app.cms.publisher.publish({ contentId: r.id, actor: 'scheduler', idempotencyKey: `schedule:${r.id}@${sAt}`, expectedVersion: 'n/a' });
  assert.equal(replay.idempotentReplay, true); assert.equal(remoteLog(repo).length, commits);
});

test('scheduler: missed (late beyond grace) and expired items are never auto-published; they are flagged and audited', async t => {
  const { api, app, repo } = await boot(t, { schedulerEnabled: false, scheduleGraceMinutes: 15 });
  const a = await approvedGold(api, { slug: 'missed-one', title: 'TEST missed' });
  const b = await approvedGold(api, { slug: 'expired-one', title: 'TEST expired' });
  const at = Date.now() + 60e3;
  await schedule(api, a.id, iso(at));
  const bb = (await api('GET', `/api/content/${b.id}`)).body;
  await api('PUT', `/api/content/${b.id}`, { expectedRevision: bb.revision, record: { expiresAt: iso(at + 10 * 60e3) } });
  await approve(api, b.id); await schedule(api, b.id, iso(at));
  const commits = remoteLog(repo).length;
  const res = await app.cms.scheduler.tick(at + 30 * 60e3); // 30 min late, grace 15, b already expired
  const by = Object.fromEntries(res.map(x => [x.id, x.state]));
  assert.equal(by[a.id], 'MISSED'); assert.equal(by[b.id], 'EXPIRED');
  assert.equal(remoteLog(repo).length, commits, 'nothing published');
  const lib = (await api('GET', '/api/content')).body;
  assert.equal(lib.find(x => x.id === a.id).scheduleFlag.state, 'MISSED');
  assert.equal(lib.find(x => x.id === a.id).status, 'SCHEDULED', 'stays scheduled, waiting for the operator');
  const again = await app.cms.scheduler.tick(at + 31 * 60e3);
  assert.ok(again.every(x => x.skipped), 'flagged items are not re-evaluated every tick');
  const audit = (await api('GET', '/api/system/audit')).body.entries.map(e => e.action);
  assert.ok(audit.includes('SCHEDULE_MISSED') && audit.includes('SCHEDULE_EXPIRED'));
  assert.equal((await api('GET', '/api/system/status')).body.readiness.scheduler.missed, 1);
});

test('scheduler decision: stale revision, unapproved/invalid content and non-sensitive grace', () => {
  const now = Date.parse('2026-09-30T10:00:00Z');
  const sch = new Scheduler({ store: {}, publisher: { gate: r => r.bad ? [{ message: 'Content must be approved' }] : [] }, config: { scheduleGraceMinutes: 15, scheduleGraceMinutesOther: 1440 } });
  const base = { type: 'GOLD_FOCUS', scheduledAt: '2026-09-30T09:58:00Z', revision: 5, scheduledRevision: 5 };
  assert.equal(sch.decide(base, now).state, 'PUBLISH');
  assert.equal(sch.decide({ ...base, revision: 6 }, now).state, 'STALE');
  assert.equal(sch.decide({ ...base, bad: true }, now).state, 'INVALID');
  assert.equal(sch.decide({ ...base, scheduledAt: '2026-09-30T09:00:00Z' }, now).state, 'MISSED');
  assert.equal(sch.decide({ ...base, type: 'LEARN', scheduledAt: '2026-09-30T09:00:00Z' }, now).state, 'PUBLISH', 'evergreen types get the longer grace');
  assert.equal(sch.decide({ ...base, expiresAt: '2026-09-30T09:59:00Z' }, now).state, 'EXPIRED');
});

/* ---------- deployment verification ---------- */
test('deployment: PUSHED is not LIVE; LIVE only when the served feed shows the version; unreachable feed is DEPLOYED_UNVERIFIED', async t => {
  const { api, app, repo } = await boot(t);
  const r = await approvedGold(api);
  const f = await api('GET', '/api/feed');
  const p = await api('POST', '/api/publish', { contentId: r.id, expectedVersion: f.body.version, confirm: true });
  assert.equal(p.status, 200, JSON.stringify(p.body)); assert.equal(p.body.deployment, 'PUSHED'); app.cms.publisher.stop();
  const pub = app.cms.publisher;
  pub.fetcher = async () => { throw new Error('ENOTFOUND'); };
  let s = (await api('GET', `/api/publications/${p.body.publicationId}/status`)).body;
  assert.equal(s.deployment, 'DEPLOYED_UNVERIFIED');
  pub.fetcher = async () => ({ ok: true, json: async () => ({ items: [] }) });
  s = (await api('GET', `/api/publications/${p.body.publicationId}/status`)).body;
  assert.equal(s.deployment, 'DEPLOYING');
  pub.fetcher = async () => ({ ok: true, json: async () => feedOf(repo) });
  s = (await api('GET', `/api/publications/${p.body.publicationId}/status`)).body;
  assert.equal(s.deployment, 'LIVE');
  assert.ok((await api('GET', '/api/system/audit?action=DEPLOYMENT')).body.entries.some(e => e.deployment === 'LIVE'));
});

/* ---------- rollback ---------- */
test('rollback: republishing a previous version is a NEW corrective commit on top of history (no rewrite)', async t => {
  const { api, app, repo } = await boot(t);
  const r = await approvedGold(api, { title: 'TEST Gold v1' });
  let f = await api('GET', '/api/feed');
  const p1 = await api('POST', '/api/publish', { contentId: r.id, expectedVersion: f.body.version, confirm: true }); assert.equal(p1.status, 200, JSON.stringify(p1.body));
  let cur = (await api('GET', `/api/content/${r.id}`)).body;
  await api('PUT', `/api/content/${r.id}`, { expectedRevision: cur.revision, record: { title: 'TEST Gold v2' } });
  await approve(api, r.id);
  f = await api('GET', '/api/feed');
  const p2 = await api('POST', '/api/publish', { contentId: r.id, expectedVersion: f.body.version, confirm: true }); assert.equal(p2.status, 200, JSON.stringify(p2.body));
  const before = remoteLog(repo);
  f = await api('GET', '/api/feed');
  const rb = await api('POST', '/api/republish', { contentId: r.id, version: 1, expectedVersion: f.body.version, confirm: true });
  assert.equal(rb.status, 200, JSON.stringify(rb.body)); assert.equal(rb.body.action, 'republish');
  const after = remoteLog(repo);
  assert.equal(after.length, before.length + 1); assert.deepEqual(after.slice(1), before, 'history preserved');
  assert.match(git(repo.remote, 'log', '-1', '--format=%B', 'main'), /Rollback-To-Version: 1/);
  const item = feedOf(repo).items.find(i => i.id === r.id);
  assert.equal(item.title, 'TEST Gold v1'); assert.equal(item.publishVersion, 3);
  assert.equal((await api('POST', '/api/republish', { contentId: r.id, version: 1, expectedVersion: f.body.version })).status, 400, 'confirmation required');
  app.cms.publisher.stop();
});

/* ---------- rate limits ---------- */
test('rate limits: privileged publishing endpoints answer 429 with Retry-After', async t => {
  const { api } = await boot(t, { limits: { publish: { max: 2, windowMs: 60e3 }, ai: { max: 2, windowMs: 60e3 }, write: { max: 100, windowMs: 60e3 } } });
  const r = await approvedGold(api);
  assert.equal((await api('POST', '/api/publish/preflight', { contentId: r.id })).status, 200);
  assert.equal((await api('POST', '/api/publish/preflight', { contentId: r.id })).status, 200);
  const third = await api('POST', '/api/publish/preflight', { contentId: r.id });
  assert.equal(third.status, 429); assert.ok(+third.headers.get('retry-after') > 0);
});

/* ---------- audit ---------- */
test('audit: every editorial and publishing action is hash-chained; tampering is detected', async t => {
  const { api, app } = await boot(t);
  const r = await approvedGold(api);
  const f = await api('GET', '/api/feed');
  await api('POST', '/api/publish', { contentId: r.id, expectedVersion: f.body.version, confirm: true }); app.cms.publisher.stop();
  const a = (await api('GET', '/api/system/audit')).body;
  assert.equal(a.verify.ok, true);
  const acts = a.entries.map(e => e.action);
  for (const x of ['CREATE', 'SUBMIT', 'APPROVE', 'PUBLISH']) assert.ok(acts.includes(x), x);
  const pubEntry = a.entries.find(e => e.action === 'PUBLISH');
  assert.equal(pubEntry.actor, 'Editor One'); assert.match(pubEntry.commitSha, /^[0-9a-f]{40}$/); assert.match(pubEntry.publicationId, /^pub_/); assert.equal(pubEntry.result, 'SUCCESS');
  const file = app.cms.journal.file, lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const tampered = JSON.parse(lines[1]); tampered.actor = 'Somebody Else'; lines[1] = JSON.stringify(tampered);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const v = new AuditJournal(path.dirname(path.dirname(file))).verify();
  assert.equal(v.ok, false); assert.equal(v.brokenAt, 2);
  assert.equal((await api('GET', '/api/system/status')).body.readiness.audit.state, 'DEGRADED');
});

/* ---------- logging ---------- */
test('logs never contain the bearer token, authorization headers or unpublished content bodies', async t => {
  captured.length = 0;
  const { api, base } = await boot(t);
  const secretBody = 'UNPUBLISHED-BODY-7c1d do not log me';
  const c = await api('POST', '/api/content', { ...goldEN, body: secretBody });
  await api('GET', `/api/content/${c.body.id}?token=${TOKEN}`);
  await fetch(base + '/api/content', { headers: { Authorization: 'Bearer wrong-' + TOKEN } });
  const all = captured.join('\n');
  assert.ok(captured.some(l => JSON.parse(l).msg === 'request'), 'requests are logged');
  for (const bad of [TOKEN, 'Bearer ', secretBody]) assert.ok(!all.includes(bad), 'leaked ' + bad);
});

/* ---------- Gold Focus + bilingual ---------- */
test('Gold Focus: structured validation requires bias, levels, scenarios, invalidation and a source', () => {
  const at = '2026-09-30T08:00:00Z';
  const r = { ...CMS.blankRecord('GOLD_FOCUS', 'en', at, 'x'), title: 'Gold', summary: 'S', slug: 'gold' };
  const fields = CMS.validateRecord(r, 'publish').map(e => e.field);
  for (const f of ['bias', 'fields.keySupport', 'fields.keyResistance', 'fields.bullishScenario', 'fields.bearishScenario', 'fields.invalidation', 'sourceReferences']) assert.ok(fields.includes(f), f);
  const ok = { ...r, ...goldEN, id: 'gold-focus-x-en', translationGroupId: 'gold-focus-x', fields: { ...goldEN.fields } };
  assert.deepEqual(CMS.validateRecord(ok, 'publish').filter(e => !/image/.test(e.field)), []);
  assert.ok(CMS.validateRecord({ ...ok, fields: { ...ok.fields, price: 2380.5 } }, 'publish').some(e => /price/i.test(e.field)), 'a price needs its source and time');
  assert.ok(CMS.TIME_SENSITIVE.includes('GOLD_FOCUS'));
});

test('bilingual: EN and AR are approved independently; approving one never approves or publishes the other', async t => {
  const { api } = await boot(t, {}, { mode: 'dry-run' });
  const en = (await api('POST', '/api/content', { ...goldEN })).body;
  const ar = (await api('POST', `/api/content/${en.id}/translate`, { mode: 'blank' })).body.record;
  assert.equal(ar.language, 'ar'); assert.equal(ar.translationGroupId, en.translationGroupId); assert.equal(ar.status, 'DRAFT');
  assert.equal(ar.title, '', 'blank translation: no invented Arabic text');
  await approve(api, en.id);
  assert.equal((await api('GET', `/api/content/${ar.id}`)).body.status, 'DRAFT');
  const pf = (await api('POST', '/api/publish/preflight', { contentId: ar.id })).body;
  assert.equal(pf.status, 'BLOCKED'); assert.equal(pf.checks.find(c => c.id === 'approved').ok, false);
});

/* ---------- Studio UI ---------- */
function studio(sys) {
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const VIEWS = {}, ctx = { window: {}, VIEWS, ACT: {}, S: { cms: { sys, list: [], config: null } }, DB: { settings: { workerUrl: 'http://127.0.0.1:8787', operatorName: 'Zak' } }, document: { addEventListener() {} }, render() {}, go() {}, toast() {}, $: () => null };
  ctx.window.FOXREX_CMS = (() => { const m = { exports: {} }; vm.runInNewContext(read('studio/cms-model.js'), { module: m, self: {} }); return m.exports; })();
  vm.createContext(ctx); vm.runInContext(read('studio/cms-studio.js'), ctx); ctx.window.installCmsStudio();
  return VIEWS;
}
const SYS = mode => ({
  health: { worker: 'HEALTHY', uptimeSeconds: 12, version: '0.2.0' },
  readiness: { cms: { state: 'READY', records: 0 }, publishingRepo: { state: 'READY', branch: 'main', expectedBranch: 'main', clean: true, diverged: false, head: 'abc' }, git: { state: 'READY', version: '2.43' },
    github: { state: 'READY', checkedAt: '2026-09-30T08:00:00Z' }, ai: { state: 'UNAVAILABLE', note: 'Manual CMS and publishing do not depend on AI' }, publishing: { state: 'READY', mode, modeLabel: mode === 'live' ? 'LIVE PUBLISHING' : 'DRY RUN' },
    scheduler: { state: 'DISABLED', scheduled: 0, due: 0, missed: 0, expired: 0, graceMinutes: 15, graceMinutesOther: 1440 }, backups: { state: 'READY', last: { at: '2026-09-30T08:00:00Z' }, count: 1, keep: 72 }, audit: { state: 'READY', entries: 3 } },
  deployment: { lastSuccess: null, lastFailure: null, lastCommission: { result: 'COMMISSION_OK', action: 'commission', at: '2026-09-30T08:00:00Z' } }
});
test('Studio System Status shows every component state, the publishing mode banner and operations', () => {
  let html = studio(SYS('dry-run')).system();
  for (const c of ['Worker (health)', 'CMS', 'Publishing repo', 'Git', 'GitHub auth', 'AI', 'Publishing', 'Scheduler', 'Backups', 'Audit log']) assert.ok(html.includes(`data-component="${c}"`), c);
  assert.match(html, /mode-banner mode-dry/); assert.ok(!/mode-live/.test(html)); assert.match(html, /data-state="UNAVAILABLE"/); assert.match(html, /COMMISSION_OK/);
  assert.match(html, /sys-commission/); assert.match(html, /sys-backup/);
  html = studio(SYS('live')).system();
  assert.match(html, /mode-banner mode-live/); assert.match(html, /LIVE PUBLISHING/);
  html = studio(false).system();
  assert.match(html, /WORKER NOT CONNECTED/);
});

test('public renderer hides expired time-sensitive items from the desk and Gold Focus and labels expired list items', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/public/content.js'), 'utf8');
  assert.match(src, /function expired\(e\)/);
  assert.match(src, /renderGold\(of\('GOLD_FOCUS'\)\.filter\(function \(g\) \{ return !expired\(g\); \}\)\[0\]\)/);
  assert.match(src, /istDate\(x\.publishedAt\) === today && !expired\(x\)/);
});
