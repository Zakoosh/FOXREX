#!/usr/bin/env node
/* FOXREX production commissioning — operator command, run on the control-plane host.
   Asks the RUNNING worker (same .env) for its readiness and runs the commissioning dry run:
   publishing clone → branch → clean → fetch → current → push authorization (git push --dry-run to a probe
   ref; nothing is created) → feed regeneration → schema + integrity + site tests → no-mutation check.
   Creates no editorial record, no commit and no push. Never prints the token.
   Usage: node scripts/commission.mjs [--json] [--actor "Name"] */
import { CONFIG } from '../src/config.js';

const args = process.argv.slice(2);
const json = args.includes('--json');
const actor = args.includes('--actor') ? args[args.indexOf('--actor') + 1] : 'commissioning';
const base = `http://${CONFIG.host === '0.0.0.0' ? '127.0.0.1' : CONFIG.host}:${CONFIG.port}`;

if (!CONFIG.token) { console.error('STUDIO_WORKER_TOKEN is NOT SET — the CMS/publishing API is disabled. Set it in worker/.env.'); process.exit(2); }
const call = async (method, p) => {
  const r = await fetch(base + p, { method, headers: { Authorization: 'Bearer ' + CONFIG.token, 'Content-Type': 'application/json', 'X-Foxrex-Actor': actor }, body: method === 'POST' ? '{}' : undefined });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${p} → HTTP ${r.status}: ${body.error || ''}`);
  return body;
};

try {
  const health = await fetch(base + '/health').then(r => r.json());
  const status = await call('GET', '/api/system/status');
  const commission = await call('POST', '/api/publish/commission');
  if (json) { console.log(JSON.stringify({ health, status, commission }, null, 2)); process.exit(commission.result === 'COMMISSION_OK' ? 0 : 1); }
  console.log(`Worker ${health.ok ? 'HEALTHY' : 'UNHEALTHY'} · token SET (length ${CONFIG.token.length}) · publish mode ${status.readiness.publishing.modeLabel}`);
  for (const [k, v] of Object.entries(status.readiness)) console.log(`  ${k.padEnd(15)} ${v.state}`);
  console.log(`\nCommissioning: ${commission.result}  (head ${commission.head || '-'})`);
  for (const c of commission.checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.detail ? ' — ' + String(c.detail).split('\n')[0].slice(0, 160) : ''}`);
  process.exit(commission.result === 'COMMISSION_OK' ? 0 : 1);
} catch (e) {
  console.error(`Could not commission via ${base}: ${e.message}\nStart the worker first (npm start) with the same .env.`);
  process.exit(2);
}
