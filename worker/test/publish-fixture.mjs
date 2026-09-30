/* Shared fixture for publishing/operations tests: an ISOLATED temporary git repository with a local bare
   "remote". Nothing here touches GitHub or the production feed. Fixture content is marked TEST. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server.js';
import { cfg, tmp } from './helpers.mjs';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
export const TOKEN = 'fx-test-token-7f3a9c1e5b2d4086';

export function makeRepo() {
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

/** Boot a worker against an isolated repo. Returns { app, repo, api, base, dataDir, config, restart }. */
export async function boot(t, extra = {}, publish = {}, { repo = makeRepo(), dataRoot = tmp(), creativeProvider, market } = {}) {
  const config = cfg(dataRoot, { token: TOKEN, publish: { mode: 'live', repoDir: repo.work, branch: 'main', remote: 'origin', checks: ['node tools/site/check-feed.mjs {feed}'], publicFeedUrl: 'http://127.0.0.1:9/none', publicOrigin: 'https://foxrex.co', ...publish }, backup: { keep: 5, minIntervalMs: 60e3 }, ...extra });
  const app = createServer({ config, registry: {}, autoRun: false, creativeProvider, market });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; app.server.closeAllConnections(); app.server.close(); app.cms.stop(); };
  t.after(stop);
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const api = async (method, p, body, headers = {}) => {
    const r = await fetch(base + p, { method, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', 'X-Foxrex-Actor': 'Editor One', ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, headers: r.headers, body: await r.json().catch(() => ({})) };
  };
  return { app, repo, api, base, config, dataRoot, stop };
}

export const goldEN = {
  type: 'GOLD_FOCUS', language: 'en', title: 'TEST Gold Focus — fixture', summary: 'TEST fixture: gold holds structure above support.', status: 'DRAFT',
  bias: 'neutral', image: { src: 'assets/media/test-gold.png', alt: 'TEST gold chart' }, riskDisclosure: 'TEST risk disclosure.',
  sourceReferences: [{ name: 'TEST desk notes' }],
  fields: { marketState: 'Range-bound', keySupport: ['2350'], keyResistance: ['2400'], importantLevel: '2375', bullishScenario: 'Break above 2400 opens room.', bearishScenario: 'Loss of 2350 shifts bias lower.', invalidation: 'Daily close below 2340.', price: null, priceSource: '', priceTime: null }
};

export async function approve(api, id) {
  const r = (await api('GET', `/api/content/${id}`)).body;
  let s = await api('POST', `/api/content/${id}/transition`, { action: 'submit', expectedRevision: r.revision }); assert.equal(s.status, 200, JSON.stringify(s.body));
  s = await api('POST', `/api/content/${id}/transition`, { action: 'approve', expectedRevision: s.body.revision }); assert.equal(s.status, 200, JSON.stringify(s.body));
  return s.body;
}
export const feedOf = repo => JSON.parse(fs.readFileSync(path.join(repo.work, 'data/content.json'), 'utf8'));
export const remoteLog = repo => git(repo.remote, 'log', '--format=%H %s', 'main').split('\n');
