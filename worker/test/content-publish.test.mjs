/* v3 publication end to end: Studio record → approval → dry run (page plan, no write) → live publish that
   commits the feed AND its permanent pages → idempotent replay → title change keeps the URL → AR pairing →
   route collision → stale-version conflict → unpublish (withdrawn notice) → transactional rollback.
   Runs against an ISOLATED temporary git repository with a local bare remote. TEST fixtures only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server.js';
import { cfg, tmp } from './helpers.mjs';
import { GOLD_FIELDS, GOLD_FIELDS_AR } from './fixtures/content-v3.mjs';

process.env.FOXREX_ALLOW_TEST_CONTENT = '1'; // isolated temp repos only
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
const SITE_FILES = ['tools/site/build.mjs', 'tools/site/content.mjs', 'tools/site/text.mjs', 'tools/site/content-pages.mjs', 'tools/site/check-feed.mjs', 'tools/site/jsonschema.mjs',
  'scripts/content/time.js', 'scripts/content/freshness.js', 'scripts/content/select.js', 'studio/cms-model.js', 'data/content.json', 'data/content.schema.json'];

function makeRepo() {
  const base = tmp(), remote = path.join(base, 'remote.git'), work = path.join(base, 'work');
  git(base, 'init', '--quiet', '--bare', '-b', 'main', remote);
  git(base, 'clone', '--quiet', remote, work);
  for (const f of SITE_FILES) { fs.mkdirSync(path.dirname(path.join(work, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(work, f)); }
  execFileSync(process.execPath, ['tools/site/build.mjs'], { cwd: work }); // the committed static site, as in production
  git(work, 'config', 'user.email', 'test@foxrex.invalid'); git(work, 'config', 'user.name', 'FOXREX test'); git(work, 'checkout', '--quiet', '-b', 'main');
  git(work, 'add', '-A'); git(work, 'commit', '--quiet', '-m', 'fixture site'); git(work, 'push', '--quiet', 'origin', 'main');
  return { remote, work };
}
async function boot(t) {
  const repo = makeRepo();
  const app = createServer({ config: cfg(tmp(), { publish: { mode: 'live', repoDir: repo.work, branch: 'main', remote: 'origin', checks: ['node tools/site/check-feed.mjs {feed}'], publicFeedUrl: 'http://127.0.0.1:9/none', publicOrigin: 'https://foxrex.co' } }), registry: {}, autoRun: false });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  t.after(() => { app.server.closeAllConnections(); app.server.close(); app.cms.stop(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const api = async (method, p, body, headers = {}) => {
    const r = await fetch(base + p, { method, headers: { Authorization: 'Bearer t0k', 'Content-Type': 'application/json', 'X-Foxrex-Actor': 'Editor One', ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return { app, repo, api };
}
async function approve(api, id) {
  let r = (await api('GET', `/api/content/${id}`)).body;
  let s = await api('POST', `/api/content/${id}/transition`, { action: 'submit', expectedRevision: r.revision }); assert.equal(s.status, 200, JSON.stringify(s.body));
  s = await api('POST', `/api/content/${id}/transition`, { action: 'approve', expectedRevision: s.body.revision }); assert.equal(s.status, 200, JSON.stringify(s.body));
  return s.body;
}
const fv = async api => (await api('GET', '/api/feed')).body.version;
const exists = (repo, rel) => fs.existsSync(path.join(repo.work, rel));
const read = (repo, rel) => fs.readFileSync(path.join(repo.work, rel), 'utf8');
const feedOf = repo => JSON.parse(read(repo, 'data/content.json'));
const gold = { type: 'GOLD_FOCUS', language: 'en', title: 'TEST Gold Focus — v3 fixture', slug: 'test-gold-v3', summary: 'TEST fixture: gold holds the range.', bias: 'neutral', sourceReferences: [{ name: 'TEST desk notes', sourceType: 'internal-analysis' }], fields: { ...GOLD_FIELDS, price: null, priceSource: '', priceTime: null } };

test('v3 publish: permanent page generated and committed with the feed; identity survives edits; EN/AR pair', async t => {
  const { api, repo } = await boot(t);
  const id = (await api('POST', '/api/content', gold)).body.id;
  await approve(api, id);
  const pv = await api('POST', '/api/publish/preview', { contentId: id });
  assert.deepEqual(pv.body.errors, []);
  const today = pv.body.entry.editorialDate;
  assert.equal(pv.body.urlPath, `gold/${today}/`); assert.equal(pv.body.canonicalUrl, `https://foxrex.co/gold/${today}/`);
  assert.equal(pv.body.entry.layer, 'TRADING_INTELLIGENCE'); assert.equal(pv.body.entry.attribution.byline, 'FOXREX Desk');

  const head0 = git(repo.work, 'rev-parse', 'HEAD');
  const dry = await api('POST', '/api/publish', { contentId: id, expectedVersion: pv.body.feedVersion, confirm: true, dryRun: true });
  assert.equal(dry.body.result, 'DRY_RUN_OK', JSON.stringify(dry.body));
  assert.ok(dry.body.pages.write.includes(`gold/${today}/index.html`) && dry.body.pages.write.includes('sitemap.xml'), 'dry run reports the pages it would generate');
  assert.equal(git(repo.work, 'rev-parse', 'HEAD'), head0); assert.equal(git(repo.work, 'status', '--porcelain'), '', 'dry run writes nothing');
  assert.ok(!exists(repo, `gold/${today}/index.html`));

  const pub = await api('POST', '/api/publish', { contentId: id, expectedVersion: pv.body.feedVersion, confirm: true }, { 'Idempotency-Key': 'k-v3-gold' });
  assert.equal(pub.body.result, 'SUCCESS', JSON.stringify(pub.body));
  assert.equal(pub.body.canonicalUrl, `https://foxrex.co/gold/${today}/`);
  const committed = git(repo.remote, 'show', '--name-only', '--format=', 'main').split('\n');
  for (const f of ['data/content.json', `gold/${today}/index.html`, 'sitemap.xml', 'data/generated-content.json', 'desk/index.html', `archive/${today.slice(0, 7)}/index.html`]) assert.ok(committed.includes(f), `commit contains ${f}`);
  assert.match(git(repo.remote, 'log', '-1', '--format=%B', 'main'), new RegExp(`Permanent-Url: https://foxrex\\.co/gold/${today}/`));
  assert.equal(git(repo.work, 'status', '--porcelain'), '', 'nothing left uncommitted');
  assert.match(read(repo, `gold/${today}/index.html`), /<link rel="canonical" href="https:\/\/foxrex\.co\/gold\/\d{4}-\d{2}-\d{2}\/">/);
  assert.equal(execFileSync(process.execPath, ['tools/site/build.mjs', '--check'], { cwd: repo.work, encoding: 'utf8' }).includes('up to date'), true);

  const replay = await api('POST', '/api/publish', { contentId: id, expectedVersion: pv.body.feedVersion, confirm: true }, { 'Idempotency-Key': 'k-v3-gold' });
  assert.equal(replay.body.idempotentReplay, true); assert.equal(git(repo.remote, 'rev-list', '--count', 'main'), '2', 'replay made no second commit');

  // Title change → same id and URL; first publication time kept; version 2.
  let rec = (await api('GET', `/api/content/${id}`)).body;
  const first = feedOf(repo).items[0];
  const locked = await api('PUT', `/api/content/${id}`, { expectedRevision: rec.revision, record: { slug: 'test-something-else' } });
  assert.equal(locked.status, 409); assert.equal(locked.body.code, 'SLUG_LOCKED');
  await api('PUT', `/api/content/${id}`, { expectedRevision: rec.revision, record: { title: 'TEST Gold Focus — renamed headline' } });
  await approve(api, id);
  const v2 = await api('POST', '/api/publish', { contentId: id, expectedVersion: await fv(api), confirm: true });
  assert.equal(v2.body.result, 'SUCCESS', JSON.stringify(v2.body));
  const after = feedOf(repo).items[0];
  assert.deepEqual([after.id, after.urlPath, after.publishedAt, after.publishVersion], [first.id, first.urlPath, first.publishedAt, 2]);
  assert.equal(after.title, 'TEST Gold Focus — renamed headline'); assert.ok(after.updatedAt >= first.updatedAt);

  // Arabic: separate record, same group and path; EN page gains its hreflang only once AR is published.
  assert.ok(!read(repo, `gold/${today}/index.html`).includes('<link rel="alternate" hreflang="ar"'));
  const tr = await api('POST', `/api/content/${id}/translate`, { mode: 'blank' });
  const arId = tr.body.record.id;
  await api('PUT', `/api/content/${arId}`, { expectedRevision: 1, record: { title: 'TEST تركيز الذهب', summary: 'اختبار: الذهب XAUUSD يحافظ على النطاق.', fields: { ...GOLD_FIELDS_AR, price: null, priceSource: '', priceTime: null } } });
  await approve(api, arId);
  const ar = await api('POST', '/api/publish', { contentId: arId, expectedVersion: await fv(api), confirm: true });
  assert.equal(ar.body.result, 'SUCCESS', JSON.stringify(ar.body)); assert.equal(ar.body.canonicalUrl, `https://foxrex.co/ar/gold/${today}/`);
  assert.ok(exists(repo, `ar/gold/${today}/index.html`));
  assert.ok(read(repo, `gold/${today}/index.html`).includes(`<link rel="alternate" hreflang="ar" href="https://foxrex.co/ar/gold/${today}/">`), 'EN page regenerated with the AR alternate');
});

test('v3 publish: route collision and stale feed version are conflicts; unpublish leaves a withdrawn notice', async t => {
  const { api, repo } = await boot(t);
  const a = (await api('POST', '/api/content', gold)).body.id; await approve(api, a);
  const pv = await api('POST', '/api/publish/preview', { contentId: a });
  assert.equal((await api('POST', '/api/publish', { contentId: a, expectedVersion: pv.body.feedVersion, confirm: true })).body.result, 'SUCCESS');
  const today = feedOf(repo).items[0].editorialDate;

  const b = (await api('POST', '/api/content', { ...gold, title: 'TEST second Gold Focus same day', slug: 'test-gold-second' })).body.id; await approve(api, b);
  const pvb = await api('POST', '/api/publish/preview', { contentId: b });
  assert.ok(pvb.body.errors.some(e => e.code === 'ROUTE_COLLISION'), 'one Gold Focus per editorial day');
  const col = await api('POST', '/api/publish', { contentId: b, expectedVersion: await fv(api), confirm: true });
  assert.equal(col.status, 409); assert.equal(col.body.code, 'CONFLICT');

  const news = (await api('POST', '/api/content', { type: 'NEWS', language: 'en', title: 'TEST news v3', slug: 'test-news-v3', summary: 'TEST', category: 'fx', sourceReferences: [{ name: 'TEST', url: 'https://example.org/n', sourceType: 'news' }], fields: { importance: 'HIGH', affectedMarkets: ['EURUSD'] } })).body.id;
  await approve(api, news);
  const stale = await api('POST', '/api/publish', { contentId: news, expectedVersion: pv.body.feedVersion, confirm: true });
  assert.equal(stale.status, 409); assert.match(stale.body.error, /changed since this item was loaded/);

  const un = await api('POST', '/api/unpublish', { contentId: a, expectedVersion: await fv(api), confirm: true });
  assert.equal(un.body.result, 'SUCCESS', JSON.stringify(un.body));
  assert.match(read(repo, `gold/${today}/index.html`), /<meta name="robots" content="noindex">[\s\S]*withdrawn on/);
  assert.ok(!read(repo, 'sitemap.xml').includes(`gold/${today}/`));
  assert.deepEqual(feedOf(repo).withdrawn.map(w => w.urlPath), [`gold/${today}/`]);
  assert.equal(git(repo.work, 'status', '--porcelain'), '');
});

test('v3 publish is transactional: a generator failure or a push failure leaves no commit and no stray pages', async t => {
  const { api, repo } = await boot(t);
  const id = (await api('POST', '/api/content', gold)).body.id; await approve(api, id);
  const head = git(repo.work, 'rev-parse', 'HEAD');
  git(repo.work, 'remote', 'set-url', 'origin', path.join(repo.remote, 'missing.git'));
  const f = await api('POST', '/api/publish', { contentId: id, expectedVersion: await fv(api), confirm: true });
  assert.ok(f.status >= 400); assert.equal(f.body.publication.result, 'FAILED');
  assert.equal(git(repo.work, 'rev-parse', 'HEAD'), head); assert.equal(git(repo.work, 'status', '--porcelain'), '', 'generated pages removed with the rollback');
  assert.equal((await api('GET', `/api/content/${id}`)).body.status, 'APPROVED', 'stays APPROVED for retry');
  git(repo.work, 'remote', 'set-url', 'origin', repo.remote);

  // Break the generator (committed, so the repo is clean): publication must fail before any commit.
  fs.appendFileSync(path.join(repo.work, 'tools/site/content-pages.mjs'), '\nthrow new Error("TEST generator failure");\n');
  git(repo.work, 'commit', '--quiet', '-am', 'TEST break generator'); git(repo.work, 'push', '--quiet', 'origin', 'main');
  const head2 = git(repo.work, 'rev-parse', 'HEAD');
  const g = await api('POST', '/api/publish', { contentId: id, expectedVersion: await fv(api), confirm: true });
  assert.equal(g.status, 500); assert.match(g.body.error, /Page generation failed/);
  assert.equal(git(repo.work, 'rev-parse', 'HEAD'), head2); assert.equal(git(repo.work, 'status', '--porcelain'), '');
  assert.equal(git(repo.remote, 'rev-parse', 'main'), head2, 'nothing pushed');
  assert.deepEqual(feedOf(repo).items, []);
});
