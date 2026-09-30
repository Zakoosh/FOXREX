import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from '../src/server.js';
import { cfg, tmp } from './helpers.mjs';

test('API root explains UI location; health is public while policy requires token and exact CORS origin', async t => {
  const app = createServer({ config: cfg(tmp(), { allowedOrigin: 'https://zakoosh.github.io' }), registry: {}, autoRun: false });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  t.after(() => { app.server.closeAllConnections(); app.server.close(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  assert.match((await (await fetch(base)).json()).message, /API, not the Studio/);
  const h = await fetch(base + '/health');
  assert.equal(h.status, 200); assert.equal((await h.json()).authenticationRequired, true);
  assert.equal((await fetch(base + '/policy')).status, 401);
  const r = await fetch(base + '/policy', { headers: { Authorization: 'Bearer t0k', Origin: 'https://zakoosh.github.io' } });
  assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), 'https://zakoosh.github.io');
  const pre = await fetch(base + '/policy', { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example' } });
  assert.notEqual(pre.headers.get('access-control-allow-origin'), 'https://untrusted.example');
});

test('ALLOWED_ORIGIN accepts a comma-separated list and echoes only a listed origin', async t => {
  const app = createServer({ config: cfg(tmp(), { allowedOrigin: 'https://foxrex.co, https://zakoosh.github.io/' }), registry: {}, autoRun: false });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  t.after(() => { app.server.closeAllConnections(); app.server.close(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  for (const o of ['https://foxrex.co', 'https://zakoosh.github.io']) {
    const r = await fetch(base + '/policy', { headers: { Authorization: 'Bearer t0k', Origin: o } });
    assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), o);
  }
  const bad = await fetch(base + '/policy', { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example' } });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
});

test('setup generates a secret once and preserves existing configuration byte for byte', () => {
  const dir = tmp(); fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(new URL('../scripts/setup.mjs', import.meta.url), path.join(dir, 'scripts/setup.mjs'));
  fs.writeFileSync(path.join(dir, '.env.example'), 'STUDIO_WORKER_TOKEN=change-me-long-random-string\nDATA_DIR=./preserved\n');
  const run = () => spawnSync(process.execPath, [path.join(dir, 'scripts/setup.mjs')], { encoding: 'utf8' });
  assert.equal(run().status, 0);
  const original = fs.readFileSync(path.join(dir, '.env'), 'utf8');
  assert.match(original, /STUDIO_WORKER_TOKEN=[a-f0-9]{64}/);
  const second = run(); assert.equal(second.status, 0);
  assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), original);
  assert.ok(!second.stdout.includes(original.split('\n')[0].split('=')[1]));
});
