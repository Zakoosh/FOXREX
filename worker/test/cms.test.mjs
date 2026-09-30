/* FOXREX CMS + publishing engine, end to end, against an ISOLATED temporary git repository with a local
   bare "remote". Nothing here touches GitHub or the production feed. Fixture content is marked TEST. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from '../src/server.js';
import { cfg, tmp } from './helpers.mjs';
import { checkFeed } from '../../tools/site/check-feed.mjs';

const require = createRequire(import.meta.url);
// Isolated temp repos only: lets the engine's checks accept TEST-marked fixtures there. Production never sets this.
process.env.FOXREX_ALLOW_TEST_CONTENT = '1';
const CMS = require('../../studio/cms-model.js');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** Isolated publishing repo: bare remote + working clone with the files the engine needs. */
function makeRepo() {
  const base = tmp(), remote = path.join(base, 'remote.git'), work = path.join(base, 'work');
  git(base, 'init', '--quiet', '--bare', '-b', 'main', remote);
  git(base, 'clone', '--quiet', remote, work);
  for (const f of ['data/content.json', 'data/content.schema.json', 'studio/cms-model.js', 'tools/site/check-feed.mjs', 'tools/site/jsonschema.mjs']) {
    fs.mkdirSync(path.dirname(path.join(work, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(work, f));
  }
  fs.mkdirSync(path.join(work, 'assets/media'), { recursive: true }); fs.writeFileSync(path.join(work, 'assets/media/test-gold.png'), PNG);
  git(work, 'config', 'user.email', 'test@foxrex.invalid'); git(work, 'config', 'user.name', 'FOXREX test'); git(work, 'checkout', '--quiet', '-b', 'main');
  git(work, 'add', '-A'); git(work, 'commit', '--quiet', '-m', 'fixture repo'); git(work, 'push', '--quiet', 'origin', 'main');
  return { remote, work };
}
async function boot(t, extra = {}, publish = {}) {
  const repo = makeRepo();
  const app = createServer({ config: cfg(tmp(), { publish: { mode: 'live', repoDir: repo.work, branch: 'main', remote: 'origin', checks: ['node tools/site/check-feed.mjs {feed}'], publicFeedUrl: 'http://127.0.0.1:9/none', publicOrigin: 'https://foxrex.co', ...publish }, ...extra }), registry: {}, autoRun: false });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  t.after(() => { app.server.closeAllConnections(); app.server.close(); app.cms.stop(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const api = async (method, p, body, headers = {}) => {
    const r = await fetch(base + p, { method, headers: { Authorization: 'Bearer t0k', 'Content-Type': 'application/json', 'X-Foxrex-Actor': 'Editor One', ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return { app, repo, api, base };
}
const goldEN = {
  type: 'GOLD_FOCUS', language: 'en', title: 'TEST Gold Focus — fixture', summary: 'TEST fixture: gold holds structure above support.', status: 'DRAFT',
  bias: 'neutral', image: { src: 'assets/media/test-gold.png', alt: 'TEST gold chart' },
  sourceReferences: [{ name: 'TEST desk notes' }],
  fields: { marketState: 'Range-bound', keySupport: ['2350'], keyResistance: ['2400'], importantLevel: '2375', bullishScenario: 'Break above 2400 opens room.', bearishScenario: 'Loss of 2350 shifts bias lower.', invalidation: 'Daily close below 2340.', price: null, priceSource: '', priceTime: null }
};
async function approve(api, id) {
  let r = (await api('GET', `/api/content/${id}`)).body;
  let s = await api('POST', `/api/content/${id}/transition`, { action: 'submit', expectedRevision: r.revision }); assert.equal(s.status, 200, JSON.stringify(s.body));
  s = await api('POST', `/api/content/${id}/transition`, { action: 'approve', expectedRevision: s.body.revision }); assert.equal(s.status, 200, JSON.stringify(s.body));
  return s.body;
}
const feedOf = repo => JSON.parse(fs.readFileSync(path.join(repo.work, 'data/content.json'), 'utf8'));
const remoteLog = repo => git(repo.remote, 'log', '--format=%H %s', 'main').split('\n');

test('schema + integrity: valid entries of every website type pass; broken ones fail', () => {
  const at = '2026-09-30T08:00:00Z';
  const mk = (type, extra) => ({ ...CMS.toFeedEntry({ ...CMS.blankRecord(type, 'en', at, 'x'), id: `${type.toLowerCase().replace(/_/g, '-')}-x-en`, translationGroupId: `${type.toLowerCase().replace(/_/g, '-')}-x`, slug: 'x', title: 'Title', summary: 'Summary', body: 'Body', ...extra }, at, 1) });
  const good = [
    mk('MORNING_BRIEF'), mk('US_OPEN'), mk('MARKET_RECAP'), mk('LEARN'), mk('REX_EXPLAINS'), mk('REX_NOTE'), mk('ASK_REX'),
    mk('EVENT', { sourceReferences: [{ name: 'BLS', url: 'https://www.bls.gov/cpi/' }], fields: { importance: 'HIGH', affectedMarkets: ['XAUUSD'] } }),
    mk('NEWS', { category: 'central-banks', sourceReferences: [{ name: 'Fed', url: 'https://www.federalreserve.gov/' }], fields: { importance: 'HIGH', affectedMarkets: ['DXY'] } }),
    mk('GOLD_FOCUS', { bias: 'neutral', riskDisclosure: 'Risk.', fields: { ...goldEN.fields } }),
    mk('ANALYSIS', { symbol: 'EURUSD', category: 'fx', bias: 'bullish', riskDisclosure: 'Risk.', fields: { timeframe: 'H4', keyLevels: ['1.1000'] } }),
    mk('SIGNAL', { symbol: 'XAUUSD', riskDisclosure: 'Risk.', fields: { direction: 'BUY', entry: '2380', stopLoss: '2360', targets: ['2400'], riskMessage: 'Risk 1%.', analysisContext: 'Context.' } }),
    mk('SIGNAL_RESULT', { symbol: 'XAUUSD', fields: { signalId: 'signal-x-en', direction: 'BUY', entry: '2380', exit: '2400', outcome: 'TARGET_HIT', closedAt: at, resultNotes: 'Closed at target.' } })
  ];
  const feed = { schemaVersion: 2, updated: at, publication: null, items: good };
  assert.deepEqual(checkFeed(feed, { root: ROOT, now: Date.parse(at) }), []);
  const bad = (entry, re) => assert.ok(checkFeed({ ...feed, items: [entry] }, { root: ROOT, now: Date.parse(at) }).some(e => re.test(e)), `expected ${re}`);
  bad({ ...good[8], sources: [] }, /sources/);
  const sig = { ...good[11] }; delete sig.stopLoss; bad(sig, /stopLoss|stop-loss/);
  const sig2 = { ...good[11] }; delete sig2.riskMessage; bad(sig2, /riskMessage|risk message/);
  bad({ ...good[9], price: 2380 }, /priceSource|price without source/);
  bad({ ...good[0], title: '<script>alert(1)</script>' }, /markup/);
  bad({ ...good[0], image: { src: 'data:image/png;base64,AAAA', alt: 'x' } }, /assets\/media/);
  bad({ ...good[0], language: 'fr' }, /language/);
  bad({ ...good[0], publishedAt: '2099-01-01T00:00:00Z', updatedAt: '2099-01-01T00:00:00Z' }, /future/);
  assert.ok(checkFeed({ ...feed, items: [good[0], good[0]] }, { root: ROOT, now: Date.parse(at) }).some(e => /duplicate/.test(e)));
  assert.ok(checkFeed({ ...feed, items: [{ ...good[0], title: 'TEST fixture' }] }, { root: ROOT, now: Date.parse(at), allowTestContent: false }).some(e => /fixture/.test(e)), 'fixtures blocked outside isolated repos');
  assert.deepEqual(checkFeed({ ...feed, items: [{ ...good[0], title: 'Gold tests 2400 resistance' }] }, { root: ROOT, now: Date.parse(at), allowTestContent: false }), [], 'ordinary editorial wording is not mistaken for a fixture');
});

test('workflow gates: drafts cannot be approved or published; edits clear approval; revisions conflict', async t => {
  const { api } = await boot(t);
  let r = await api('POST', '/api/content', { ...goldEN, fields: { ...goldEN.fields, invalidation: '' } }); assert.equal(r.status, 201);
  const id = r.body.id; assert.match(id, /-en$/); assert.equal(r.body.status, 'DRAFT');
  assert.equal((await api('POST', `/api/content/${id}/transition`, { action: 'approve', expectedRevision: 1 })).status, 422, 'DRAFT cannot be approved directly');
  const sub = await api('POST', `/api/content/${id}/transition`, { action: 'submit', expectedRevision: 1 });
  assert.equal(sub.status, 422); assert.ok(sub.body.errors.some(e => e.field === 'fields.invalidation'));
  assert.equal((await api('POST', '/api/publish', { contentId: id, expectedVersion: 'x', confirm: true })).status, 422, 'DRAFT cannot be published');
  r = await api('PUT', `/api/content/${id}`, { expectedRevision: 1, record: { fields: goldEN.fields } }); assert.equal(r.status, 200); assert.equal(r.body.revision, 2);
  assert.equal((await api('PUT', `/api/content/${id}`, { expectedRevision: 1, record: { title: 'stale' } })).status, 409, 'stale revision rejected');
  const ok = await approve(api, id); assert.equal(ok.status, 'APPROVED'); assert.equal(ok.audit.approvedBy, 'Editor One');
  r = await api('PUT', `/api/content/${id}`, { expectedRevision: ok.revision, record: { summary: 'TEST changed after approval' } });
  assert.equal(r.body.status, 'DRAFT', 'editing approved content returns it to DRAFT'); assert.equal(r.body.audit.approvedBy, null);
  assert.equal((await api('POST', '/api/content', { ...goldEN, title: '<img src=x onerror=alert(1)>' })).status, 422, 'markup rejected');
});

test('publish pipeline: preview → dry run (no commit) → live publish → idempotent replay → conflict → EN/AR isolation → version 2 → unpublish', async t => {
  const { api, repo } = await boot(t);
  const created = await api('POST', '/api/content', goldEN); const id = created.body.id;
  await approve(api, id);
  const pv = await api('POST', '/api/publish/preview', { contentId: id });
  assert.equal(pv.status, 200); assert.deepEqual(pv.body.errors, []); assert.equal(pv.body.entry.symbol, 'XAUUSD');
  assert.deepEqual(pv.body.destinations.map(d => d.url), ['https://foxrex.co/', 'https://foxrex.co/gold/']);
  const headBefore = git(repo.work, 'rev-parse', 'HEAD');

  assert.equal((await api('POST', '/api/publish', { contentId: id, expectedVersion: pv.body.feedVersion })).status, 400, 'confirmation is mandatory');
  const dry = await api('POST', '/api/publish', { contentId: id, expectedVersion: pv.body.feedVersion, confirm: true, dryRun: true });
  assert.equal(dry.status, 200, JSON.stringify(dry.body)); assert.equal(dry.body.result, 'DRY_RUN_OK'); assert.match(dry.body.diff, /\+.*"GOLD_FOCUS"/);
  assert.equal(git(repo.work, 'rev-parse', 'HEAD'), headBefore, 'dry run never commits');
  assert.equal(feedOf(repo).items.length, 0, 'dry run never writes the feed');
  assert.equal((await api('GET', `/api/content/${id}`)).body.status, 'APPROVED', 'dry run does not mark published');

  const pub = await api('POST', '/api/publish', { contentId: id, expectedVersion: pv.body.feedVersion, confirm: true }, { 'Idempotency-Key': 'k-gold-1' });
  assert.equal(pub.status, 200, JSON.stringify(pub.body)); assert.equal(pub.body.result, 'SUCCESS'); assert.equal(pub.body.deployment, 'PUSHED'); assert.match(pub.body.commitSha, /^[0-9a-f]{40}$/);
  assert.match(remoteLog(repo)[0], /content: publish English Gold Focus .* — test-gold-focus-fixture/);
  assert.match(git(repo.remote, 'log', '-1', '--format=%B', 'main'), new RegExp(`Content-Id: ${id}[\\s\\S]*Publish-Version: 1[\\s\\S]*Approved-By: Editor One`));
  let feed = feedOf(repo); assert.equal(feed.items.length, 1); assert.equal(feed.items[0].publishVersion, 1); assert.deepEqual(checkFeed(feed, { root: repo.work }), []);
  let rec = (await api('GET', `/api/content/${id}`)).body; assert.equal(rec.status, 'PUBLISHED'); assert.equal(rec.live.publishVersion, 1);

  const replay = await api('POST', '/api/publish', { contentId: id, expectedVersion: pv.body.feedVersion, confirm: true }, { 'Idempotency-Key': 'k-gold-1' });
  assert.equal(replay.body.publicationId, pub.body.publicationId); assert.equal(replay.body.idempotentReplay, true);
  assert.equal(remoteLog(repo).length, 2, 'replay created no second commit'); assert.equal(feedOf(repo).items.length, 1, 'no duplicate public entry');

  // Arabic translation is a separate DRAFT: never approved or published by the English approval.
  const tr = await api('POST', `/api/content/${id}/translate`, { mode: 'blank' });
  assert.equal(tr.status, 201); const arId = tr.body.record.id; assert.equal(arId, id.replace(/-en$/, '-ar')); assert.equal(tr.body.record.status, 'DRAFT');
  assert.equal(tr.body.record.translationGroupId, created.body.translationGroupId);
  assert.equal((await api('POST', '/api/publish', { contentId: arId, expectedVersion: feedOf(repo) && (await api('GET', '/api/feed')).body.version, confirm: true })).status, 422, 'unapproved translation cannot publish');
  let ar = (await api('PUT', `/api/content/${arId}`, { expectedRevision: 1, record: { title: 'TEST تركيز الذهب', summary: 'اختبار: الذهب XAUUSD يحافظ على بنيته فوق 2350.', image: { src: 'assets/media/test-gold.png', alt: 'اختبار' },
    fields: { ...goldEN.fields, marketState: 'نطاق عرضي', bullishScenario: 'اختراق 2400 يفتح المجال.', bearishScenario: 'كسر 2350 يغيّر الاتجاه.', invalidation: 'إغلاق يومي تحت 2340.' } } })).body;
  await approve(api, arId);

  // Stale feed version → 409 CONFLICT, nothing written.
  const conflict = await api('POST', '/api/publish', { contentId: arId, expectedVersion: pv.body.feedVersion, confirm: true });
  assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'CONFLICT'); assert.match(conflict.body.error, /changed since this item was loaded/);
  const fv = (await api('GET', '/api/feed')).body.version;
  const pubAr = await api('POST', '/api/publish', { contentId: arId, expectedVersion: fv, confirm: true });
  assert.equal(pubAr.body.result, 'SUCCESS', JSON.stringify(pubAr.body));
  feed = feedOf(repo); assert.deepEqual(feed.items.map(i => i.language).sort(), ['ar', 'en']);
  assert.equal(feed.items.find(i => i.language === 'ar').summary, 'اختبار: الذهب XAUUSD يحافظ على بنيته فوق 2350.', 'Arabic text and Latin tokens preserved byte-for-byte');

  // Correction workflow: edit published → DRAFT (live v1 still served) → review → approve → republish v2.
  rec = (await api('GET', `/api/content/${id}`)).body;
  const ed = await api('PUT', `/api/content/${id}`, { expectedRevision: rec.revision, record: { summary: 'TEST corrected summary.' } });
  assert.equal(ed.body.status, 'DRAFT'); assert.equal(ed.body.live.publishVersion, 1);
  assert.equal(feedOf(repo).items.find(i => i.id === id).summary, goldEN.summary, 'live version unchanged until republished');
  await approve(api, id);
  const v2 = await api('POST', '/api/publish', { contentId: id, expectedVersion: (await api('GET', '/api/feed')).body.version, confirm: true });
  assert.equal(v2.body.version, 2); assert.equal(feedOf(repo).items.find(i => i.id === id).publishVersion, 2);
  assert.equal(feedOf(repo).items.find(i => i.id === id).summary, 'TEST corrected summary.');

  // Unpublish: removed from the public feed, record ARCHIVED, audit + publication history kept.
  const un = await api('POST', '/api/unpublish', { contentId: id, expectedVersion: (await api('GET', '/api/feed')).body.version, confirm: true });
  assert.equal(un.body.result, 'SUCCESS'); assert.ok(!feedOf(repo).items.some(i => i.id === id));
  rec = (await api('GET', `/api/content/${id}`)).body; assert.equal(rec.status, 'ARCHIVED'); assert.equal(rec.live, null);
  assert.deepEqual(rec.history.map(h => h.action).filter(a => ['publish', 'unpublish'].includes(a)), ['publish', 'publish', 'unpublish']);
  const pubs = (await api('GET', `/api/publications?contentId=${id}`)).body;
  assert.deepEqual(pubs.map(p => p.result), ['SUCCESS', 'SUCCESS', 'SUCCESS', 'DRY_RUN_OK']);
  assert.ok(pubs.every(p => p.actor === 'Editor One' && p.requestedAt));
  assert.ok((await api('GET', '/api/publications')).body.some(p => p.result === 'CONFLICT'), 'conflict is in the audit log');
});

test('failures are transactional: push failure or failing checks never mark PUBLISHED and leave the repo unchanged', async t => {
  const { api, repo } = await boot(t);
  const id = (await api('POST', '/api/content', goldEN)).body.id; await approve(api, id);
  const head = git(repo.work, 'rev-parse', 'HEAD');
  git(repo.work, 'remote', 'set-url', 'origin', path.join(repo.remote, 'missing.git'));
  const fv = (await api('GET', '/api/feed')).body.version;
  const f = await api('POST', '/api/publish', { contentId: id, expectedVersion: fv, confirm: true });
  assert.ok(f.status >= 400); assert.equal(f.body.publication.result, 'FAILED');
  assert.equal(git(repo.work, 'rev-parse', 'HEAD'), head, 'local state restored');
  assert.equal(feedOf(repo).items.length, 0); assert.equal(git(repo.work, 'status', '--porcelain'), '');
  assert.equal((await api('GET', `/api/content/${id}`)).body.status, 'APPROVED', 'item stays APPROVED for retry');

  const { api: api2, repo: repo2 } = await boot(t, {}, { checks: ['node -e process.exit(3)'] });
  const id2 = (await api2('POST', '/api/content', goldEN)).body.id; await approve(api2, id2);
  const f2 = await api2('POST', '/api/publish', { contentId: id2, expectedVersion: (await api2('GET', '/api/feed')).body.version, confirm: true });
  assert.equal(f2.status, 422); assert.match(f2.body.error, /Check failed/);
  assert.equal(remoteLog(repo2).length, 1, 'nothing pushed'); assert.equal((await api2('GET', `/api/content/${id2}`)).body.status, 'APPROVED');

  fs.writeFileSync(path.join(repo2.work, 'UNRELATED.txt'), 'x');
  const { api: api3 } = { api: api2 };
  const f3 = await api3('POST', '/api/publish', { contentId: id2, expectedVersion: (await api3('GET', '/api/feed')).body.version, confirm: true });
  assert.equal(f3.status, 409); assert.match(f3.body.error, /uncommitted changes/, 'never commits unrelated work');
});

test('type rules: news needs sources, signals need stop-loss and risk, results need a real published signal', async t => {
  const { api } = await boot(t);
  const news = (await api('POST', '/api/content', { type: 'NEWS', language: 'en', title: 'TEST news', summary: 'TEST', category: 'fx', fields: { importance: 'HIGH', affectedMarkets: ['EURUSD'] } })).body;
  const s1 = await api('POST', `/api/content/${news.id}/transition`, { action: 'submit', expectedRevision: news.revision });
  assert.equal(s1.status, 422); assert.ok(s1.body.errors.some(e => e.field === 'sourceReferences'));
  const sig = (await api('POST', '/api/content', { type: 'SIGNAL', language: 'en', title: 'TEST signal', summary: 'TEST', symbol: 'XAUUSD', fields: { direction: 'BUY', entry: '2380', stopLoss: '', targets: ['2400'], riskMessage: '', analysisContext: 'ctx' } })).body;
  const s2 = await api('POST', `/api/content/${sig.id}/transition`, { action: 'submit', expectedRevision: sig.revision });
  assert.ok(s2.body.errors.some(e => e.field === 'fields.stopLoss')); assert.ok(s2.body.errors.some(e => e.field === 'fields.riskMessage'));
  const bad = (await api('PUT', `/api/content/${sig.id}`, { expectedRevision: sig.revision, record: { fields: { ...sig.fields, stopLoss: '2390', riskMessage: 'Risk' } } })).body;
  const s3 = await api('POST', `/api/content/${sig.id}/transition`, { action: 'submit', expectedRevision: bad.revision });
  assert.ok(s3.body.errors.some(e => /below entry/.test(e.message)), 'BUY stop-loss must be below entry');
  const res = (await api('POST', '/api/content', { type: 'SIGNAL_RESULT', language: 'en', title: 'TEST result', summary: 'TEST', symbol: 'XAUUSD', fields: { signalId: sig.id, direction: 'BUY', entry: '2380', exit: '2400', outcome: 'TARGET_HIT', closedAt: '2026-09-30T08:00:00Z', resultNotes: 'TEST' } })).body;
  const ok = await approve(api, res.id);
  const pv = await api('POST', '/api/publish/preview', { contentId: ok.id });
  assert.ok(pv.body.errors.some(e => /never published/.test(e.message)), 'result must reference a published signal');
});

test('auth, CORS and AI boundaries', async t => {
  const { api, base } = await boot(t, { allowedOrigin: 'https://foxrex.co' });
  assert.equal((await fetch(base + '/api/content')).status, 401, 'no token → 401');
  assert.equal((await api('POST', '/api/content', goldEN, { 'X-Foxrex-Actor': '' })).status, 400, 'writes need a named operator');
  assert.equal((await api('POST', '/api/content', goldEN, { 'Content-Type': 'text/plain' })).status, 415, 'form-style posts refused');
  const pre = await fetch(base + '/api/publish', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://foxrex.co', 'single configured origin only, never *');
  assert.notEqual(pre.headers.get('access-control-allow-origin'), '*');
  const id = (await api('POST', '/api/content', goldEN)).body.id;
  const ai = await api('POST', `/api/content/${id}/translate`, { mode: 'ai' });
  assert.equal(ai.status, 503, 'AI unavailable is reported, manual path unaffected'); assert.match(ai.body.error, /Blank translation draft/);
  for (const action of ['publish', 'verify']) assert.equal((await api('POST', `/api/content/${id}/transition`, { action, expectedRevision: 1 })).status, 422, `no "${action}" transition exists for operators or AI`);

  const noTok = createServer({ config: cfg(tmp(), { token: '' }), registry: {}, autoRun: false });
  await new Promise(r => noTok.server.listen(0, '127.0.0.1', r)); t.after(() => { noTok.server.closeAllConnections(); noTok.server.close(); });
  assert.equal((await fetch(`http://127.0.0.1:${noTok.server.address().port}/api/content`)).status, 403, 'CMS disabled without a worker token');
});

test('AI translation produces a DRAFT with token warnings, never an approval', async t => {
  const fakeProvider = { id: 'FAKE_LOCAL', model: 'fake', base: 'http://127.0.0.1:1', health: async () => ({ available: true }),
    fetcher: async () => ({ ok: true, json: async () => ({ message: { content: JSON.stringify({ title: 'تركيز الذهب', summary: 'الذهب يحافظ على بنيته', body: '', fields: { marketState: 'نطاق' } }) } }) }) };
  const { api, app } = await boot(t);
  app.creative.provider = fakeProvider;
  const id = (await api('POST', '/api/content', { ...goldEN, summary: 'Gold XAUUSD holds 2350 into 15:30.' })).body.id;
  const r = await api('POST', `/api/content/${id}/translate`, { mode: 'ai' });
  assert.equal(r.status, 201); assert.equal(r.body.record.status, 'DRAFT'); assert.equal(r.body.record.language, 'ar');
  assert.equal(r.body.record.aiGenerated.provider, 'FAKE_LOCAL'); assert.equal(r.body.record.audit.approvedBy, null);
  assert.ok(r.body.warnings.some(w => /XAUUSD/.test(w)) && r.body.warnings.some(w => /15:30/.test(w)), 'missing symbols/times are flagged');
});

test('scheduling: future time required, not publishable early, executed only by the enabled scheduler', async t => {
  const { api, app, repo } = await boot(t);
  const id = (await api('POST', '/api/content', goldEN)).body.id; const ok = await approve(api, id);
  assert.equal((await api('POST', `/api/content/${id}/transition`, { action: 'schedule', expectedRevision: ok.revision, scheduledAt: '2020-01-01T00:00:00Z' })).status, 422, 'past schedule rejected');
  const at = new Date(Date.now() + 3600e3).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const sc = await api('POST', `/api/content/${id}/transition`, { action: 'schedule', expectedRevision: ok.revision, scheduledAt: at });
  assert.equal(sc.body.status, 'SCHEDULED');
  const early = await api('POST', '/api/publish', { contentId: id, expectedVersion: (await api('GET', '/api/feed')).body.version, confirm: true });
  assert.equal(early.status, 422); assert.ok(early.body.errors.some(e => e.field === 'scheduledAt'), 'not before scheduledAt');
  assert.equal(app.cms.publisher.due().length, 0);
  app.cms.store.data.records[id].scheduledAt = '2020-01-01T00:00:00Z'; // simulate time passing
  assert.equal(app.cms.publisher.due().length, 1);
  await app.cms.runDue();
  assert.equal(feedOf(repo).items.length, 1); assert.equal((await api('GET', `/api/content/${id}`)).body.status, 'PUBLISHED');
  assert.equal((await api('GET', '/api/publications')).body[0].actor, 'scheduler');
});

test('no Git credentials or publishing internals ship to the browser', () => {
  const shipped = ['studio/index.html', 'studio/cms-studio.js', 'studio/cms-model.js', 'scripts/public/content.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  assert.ok(!/ghp_|github_pat_|x-access-token|PUBLISH_REPO_DIR|git push|Authorization: token/i.test(shipped));
  assert.ok(!/api\.github\.com/.test(shipped), 'browser never calls GitHub directly');
});
