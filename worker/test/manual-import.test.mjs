import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('external image import retains prompt provenance and enters review without any provider call', async () => {
  const html = fs.readFileSync(new URL('../../studio/index.html', import.meta.url), 'utf8');
  const code = html.slice(html.indexOf('async function onFile(e)'), html.indexOf('/* ---------------- SEED'));
  const it = { id: 'manual-content', family: 'education', format: 'post', char: { required: false }, prompts: [{ v: 3, text: 'Operator-approved prompt' }], jobs: [], generations: [] };
  const snapshot = { mode: 'manual', brief: { facts: [] }, reviewState: 'draft' };
  let id = 0, saves = 0;
  const ctx = { DB: { assets: [] }, cur: () => it, uid: () => `fixture-${++id}`, FAM: { education: { ar: 'Education' } }, FORMATS: { post: { ar: 'Post', ar_: '4:5' } },
    creativeSnapshot: () => snapshot, readAsset: async () => ({ type: 'image', name: 'fixture.png', src: 'data:image/png;base64,fixture' }),
    save: () => saves++, render() {}, toast() {}, fetch() { throw new Error('Unexpected network request'); } };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  await ctx.onFile({ target: { files: [{ name: 'fixture.png' }], dataset: { actFile: 'gen' } } });
  assert.equal(it.status, 'IN_REVIEW'); assert.equal(it.generations[0].status, 'review');
  assert.equal(it.jobs[0].provider, 'MANUAL_CLAUDE'); assert.equal(it.jobs[0].prompt_version_id, 'manual-content:v3');
  assert.equal(ctx.DB.assets[0].approval, 'pending'); assert.equal(ctx.DB.assets[0].prompt, 'Operator-approved prompt');
  assert.equal(ctx.DB.assets[0].lineage.creative, snapshot); assert.equal(saves, 1);
});
