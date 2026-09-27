import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from '../src/server.js';
import { cfg, tmp } from './helpers.mjs';

async function boot(t) {
  const dir = tmp(); process.env.FAKE_HF_DIR = dir; process.env.FAKE_HF_MODE = 'ok';
  const w = createServer({ config: cfg(dir), autoRun: false });
  await new Promise(r => w.server.listen(0, '127.0.0.1', r));
  t.after(() => { w.server.closeAllConnections(); w.server.close(); });
  const api = (p,b) => fetch(`http://127.0.0.1:${w.server.address().port}${p}`, { method: b ? 'POST' : 'GET', headers: { Authorization: 'Bearer t0k', 'Content-Type': 'application/json' }, ...(b ? { body: JSON.stringify(b) } : {}) });
  const quote = async (contentId = 'same-content') => (await api('/jobs/quote', { prompt: 'Approved visual direction', aspectRatio: '4:5', contentId })).json();
  const submit = q => api('/jobs', { quoteId: q.id, approved: true });
  return { w, dir, api, quote, submit };
}
test('two previews cannot produce concurrent jobs for the same content', async t => {
  const b = await boot(t), q1 = await b.quote(), q2 = await b.quote();
  assert.equal((await b.submit(q1)).status, 201);
  assert.equal((await b.submit(q2)).status, 409);
  assert.equal(Object.keys(b.w.store.jobs).length, 1);
});
test('crash, lost ID and timeout block fresh quotes and retry without charged creates', async t => {
  const b = await boot(t);
  for (const code of ['WORKER_RESTARTED', 'SUBMISSION_UNCONFIRMED', 'GENERATION_TIMEOUT']) {
    const j = b.w.store.create({ content_id: code, provider: 'HIGGSFIELD_CLI', status: 'FAILED', submission_started_at: new Date().toISOString(), failure_code: code });
    assert.equal((await b.api('/jobs/quote', { prompt: 'same prompt', aspectRatio: '4:5', contentId: code })).status, 409);
    assert.equal((await b.api(`/jobs/${j.id}/retry`, {})).status, 409);
    await b.w.runner.execute(j);
  }
  assert.ok(!fs.existsSync(b.dir + '/calls.log'), 'no CLI call, including no charged create');
});
test('cost increase stops before submission; a new preview requires approval', async t => {
  const b = await boot(t), q = await b.quote();
  const j = await (await b.submit(q)).json();
  b.w.registry.HIGGSFIELD_CLI.estimate = async () => q.estimatedCredits + 5;
  await b.w.runner.tick();
  assert.equal(b.w.store.get(j.id).failure_code, 'COST_CHANGED');
  assert.equal(b.w.store.get(j.id).submission_started_at, undefined);
  assert.ok(!fs.readFileSync(b.dir + '/calls.log', 'utf8').includes('"create"'));
});
test('cancel only queued jobs; repeat execution and repeat reconciliation cannot charge again', async t => {
  const b = await boot(t), q = await b.quote();
  const j = await (await b.submit(q)).json();
  b.w.store.update(j.id, { status: 'PREPARING' });
  assert.equal((await b.api(`/jobs/${j.id}/cancel`, {})).status, 409);
  b.w.store.update(j.id, { status: 'QUEUED' });
  await b.w.runner.tick();
  await b.w.runner.execute(b.w.store.get(j.id));
  assert.equal((await b.api(`/jobs/${j.id}/reconcile`, {})).status, 200);
  assert.equal(fs.readFileSync(b.dir + '/calls.log', 'utf8').match(/"create"/g).length, 1);
});
test('expired quotes and malformed references fail before any submission', async t => {
  const b = await boot(t), q = await b.quote();
  b.w.creative.data.quotes[q.id].expiresAt = 0;
  assert.equal((await b.submit(q)).status, 409);
  assert.equal((await b.api('/jobs/quote', { prompt: 'p', aspectRatio: '4:5', references: {} })).status, 400);
  assert.equal((await b.api('/jobs/quote', { prompt: 'p', aspectRatio: '4:5', references: [null] })).status, 400);
  assert.ok(!fs.readFileSync(b.dir + '/calls.log', 'utf8').includes('"create"'));
});
