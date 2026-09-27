// Explicit opt-in live reasoning check. Never loads a Higgsfield adapter.
// --serve provides an isolated browser test origin with manual-only asset generation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { CreativeService } from '../src/creative.js';
import { createServer } from '../src/server.js';
import { ManualClaudeProvider } from '../src/providers/manual-claude.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foxrex-live-check-'));
const config = { dataDir, creativeProvider: 'ollama', creativeModel: process.env.CREATIVE_MODEL || 'qwen3:4b', creativeUrl: 'http://127.0.0.1:11434', token: '', allowedOrigin: '', imageModels: ['nano_banana_2'], enableVideo: false, estimateCost: false };
if (process.argv.includes('--serve')) {
  const worker = createServer({ config, registry: { MANUAL_CLAUDE: new ManualClaudeProvider() }, autoRun: false });
  const files = { '/': 'index.html', '/index.html': 'index.html', '/foxrex-studio.html': 'foxrex-studio.html', '/creative-studio.js': 'creative-studio.js' };
  http.createServer((req, res) => {
    const name = files[new URL(req.url, 'http://localhost').pathname];
    if (!name) return worker.server.emit('request', req, res);
    res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.createReadStream(path.join(root, name)).pipe(res);
  }).listen(5174, '127.0.0.1', () => console.log(`Isolated verification: http://127.0.0.1:5174/foxrex-studio.html\nLocal Ollama ${config.creativeModel}; MANUAL asset provider only. Data: ${dataDir}`));
} else {
  const service = new CreativeService(config);
  console.log(JSON.stringify(await service.status()));
  const brief = { objective: 'Education', audience: 'Beginner traders', platform: 'Instagram', format: 'carousel', message: 'Encourage a learning journal without forecasts, prices, signals or performance claims.', tone: 'Calm and curious', language: 'en', brandAssets: [], references: [], facts: [] };
  const ideas = await service.run('ideate', { contentId: 'local-verification', brief });
  const concept = ideas.output.concepts.find(c => c.id === ideas.output.recommendedId);
  console.log(JSON.stringify({ stage: 'ideate', titles: ideas.output.concepts.map(c => c.title), recommended: concept.id }));
  const plan = await service.run('plan', { contentId: 'local-verification', brief, concept, feedback: 'Create three distinct slides with editable text overlays. Keep prompts free of text and numbers.' });
  const evidenceDir = fileURLToPath(new URL('../data/verification/', import.meta.url));
  fs.mkdirSync(evidenceDir, { recursive: true });
  const evidence = path.join(evidenceDir, 'ollama-live.json');
  fs.writeFileSync(evidence, JSON.stringify({ checkedAt: new Date().toISOString(), brief, ideas, plan }, null, 2));
  console.log(JSON.stringify({ stage: 'plan', provider: plan.provider, model: plan.model, scenes: plan.output.scenes.length, caption: plan.output.caption, evidence }));
}
