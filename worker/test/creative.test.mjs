import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { CreativeService, OllamaCreativeProvider, validateOutput } from '../src/creative.js';
import { createServer } from '../src/server.js';
import { cfg, tmp } from './helpers.mjs';

const brief = { objective: 'Educate', audience: 'New traders', platform: 'Instagram', format: 'post', message: 'Understand uncertainty', tone: 'Calm', brandAssets: [], references: [], facts: [] };
const ideas = { concepts: ['uncertainty', 'patience', 'risk'].map((id, i) => ({ id, title: id, hook: 'Consider ' + id, angle: id, narrative: 'Narrative ' + i, visualDirection: 'Visual ' + i })), recommendedId: 'risk', rationale: 'Relevant to beginners', claims: [] };
const plan = { conceptId: 'risk', caption: 'Think before acting', visualDirection: 'Quiet', composition: 'Space for overlays', assetRequirements: [], cover: 'Cover direction', editingInstructions: 'Add approved logo as overlay', scenes: [{ id: 'one', title: 'Opening', duration: 'N/A', copy: 'Pause', voiceover: 'None', onScreenText: 'Pause', visualDirection: 'Abstract', prompt: 'Abstract sculpture in a navy studio with soft teal light, generous negative space on the left and no text, numbers or logos.', factIds: [] }], claims: [] };
test('structured concepts reject duplicates, invented fact references and malformed fields', () => {
  assert.deepEqual(validateOutput('ideate', ideas, { brief }), ideas);
  assert.throws(() => validateOutput('ideate', { ...ideas, recommendedId: 'missing' }, { brief }));
  assert.throws(() => validateOutput('ideate', { ...ideas, concepts: [ideas.concepts[0], ideas.concepts[0], ideas.concepts[0]] }, { brief }));
  assert.throws(() => validateOutput('ideate', { ...ideas, claims: [{ text: 'Guaranteed profit', factIds: ['invented'] }] }, { brief }));
  assert.throws(() => validateOutput('ideate', { ...ideas, rationale: null }, { brief }));
  assert.throws(() => validateOutput('plan', plan, { brief, concept: { id: 'wrong' } }));
  assert.equal(validateOutput('plan', plan, { brief, concept: { id: 'risk' } }).scenes.length, 1);
});
test('creative provider disabled and paid providers cannot masquerade as free creativity', async () => {
  const c = cfg(tmp()); fs.mkdirSync(c.dataDir);
  const disabled = new CreativeService(c);
  assert.equal((await disabled.status()).available, false);
  await assert.rejects(disabled.run('ideate', { brief }), /not configured/);
  const paid = new CreativeService(c, { costMode: 'PAID_API' });
  await assert.rejects(paid.run('ideate', { brief }), /disabled/);
});
test('mock reasoning produces durable revisions; invalid revisions do not overwrite valid work', async () => {
  const c = cfg(tmp()); fs.mkdirSync(c.dataDir);
  const provider = { id: 'TEST', model: 'mock', costMode: 'LOCAL_COMPUTE', generate: async () => ideas };
  const service = new CreativeService(c, provider);
  const r = await service.run('ideate', { brief, contentId: 'item' });
  assert.equal(r.reviewState, 'draft'); assert.equal(r.provider, 'TEST');
  assert.equal(new CreativeService(c).data.revisions[0].id, r.id);
  provider.generate = async () => ({ mock: true });
  await assert.rejects(service.run('plan', { brief }));
  assert.equal(service.data.revisions.length, 1);
});
test('Ollama uses structured JSON, rejects cloud/remote endpoints and malformed output', async () => {
  const requests = [];
  const fake = async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => url.endsWith('/api/tags') ? { models: [{ name: 'qwen3:4b' }] } : { message: { content: JSON.stringify(ideas) } } }; };
  const p = new OllamaCreativeProvider({ creativeModel: 'qwen3:4b' }, fake);
  assert.deepEqual(await p.generate({ stage: 'ideate', input: { brief }, schema: {} }), ideas);
  assert.equal(JSON.parse(requests[1].options.body).stream, false);
  assert.throws(() => new OllamaCreativeProvider({ creativeModel: 'x:cloud' }).checkLocal());
  assert.throws(() => new OllamaCreativeProvider({ creativeModel: 'x', creativeUrl: 'https://remote.test' }).checkLocal());
});
test('migration backs up and preserves prompts, assets, jobs, statuses and unknown user fields', () => {
  const source = fs.readFileSync(new URL('../../creative-studio.js', import.meta.url), 'utf8');
  const old = { items: [{ id: 'old', status: 'APPROVED', prompts: [{ text: 'Legacy' }], jobs: [{ id: 'job' }], custom: 'keep' }], assets: [{ id: 'asset' }], settings: {} };
  const memory = new Map(); const context = { DB: structuredClone(old), LS: 'studio', S: {}, localStorage: { getItem: k => memory.get(k), setItem: (k,v) => memory.set(k,v) }, save() {}, newItem() {}, genPanel() {}, ingest() {}, VIEWS: { item() {} }, ACT: {}, document: { addEventListener() {} } };
  vm.createContext(context); vm.runInContext(source + ';installCreativeStudio();', context);
  assert.deepEqual(JSON.parse(memory.get('studio:before-creative-v5')), old);
  assert.equal(context.DB.items[0].custom, 'keep'); assert.equal(context.DB.items[0].prompts[0].text, 'Legacy');
  assert.equal(context.DB.items[0].creative.manualPrompt, ''); assert.equal(context.DB.items[0].status, 'APPROVED');
  vm.runInContext('installCreativeStudio()', context);
  assert.deepEqual(JSON.parse(memory.get('studio:before-creative-v5')), old);
});
test('approved quote is pinned, idempotent across concurrency/restart, and never accepts replacement prompt', async t => {
  const dir = tmp(); process.env.FAKE_HF_DIR = dir; process.env.FAKE_HF_MODE = 'ok';
  const config = cfg(dir); let w = createServer({ config, autoRun: false });
  const listen = () => new Promise(r => w.server.listen(0, '127.0.0.1', r)); await listen();
  const call = (route, body) => fetch(`http://127.0.0.1:${w.server.address().port}${route}`, { method: 'POST', headers: { Authorization: 'Bearer t0k', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  t.after(() => { w.server.closeAllConnections(); w.server.close(); });
  assert.equal((await call('/jobs', { prompt: 'unapproved' })).status, 409);
  const q = await (await call('/jobs/quote', { prompt: 'Approved prompt', aspectRatio: '4:5', variations: 3 })).json();
  assert.equal(q.request.variations, 1); assert.equal(q.estimatedCredits, 2);
  assert.ok(!fs.readFileSync(dir + '/calls.log', 'utf8').includes('"create"'));
  const jobs = await Promise.all([1,2,3].map(async () => (await call('/jobs', { quoteId: q.id, approved: true, prompt: 'injected' })).json()));
  assert.equal(new Set(jobs.map(j => j.id)).size, 1); assert.equal(jobs[0].prompt_text, 'Approved prompt');
  await w.runner.tick(); assert.equal(w.store.get(jobs[0].id).status, 'COMPLETED');
  await new Promise(r => { w.server.closeAllConnections(); w.server.close(r); });
  w = createServer({ config, autoRun: false }); await listen();
  assert.equal((await (await call('/jobs', { quoteId: q.id, approved: true })).json()).id, jobs[0].id);
  assert.equal((await call(`/jobs/${jobs[0].id}/retry`, {})).status, 409);
  assert.equal(fs.readFileSync(dir + '/calls.log', 'utf8').match(/"create"/g).length, 1);
});
