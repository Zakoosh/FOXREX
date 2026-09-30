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
  // Serve the repository's static site (public pages + /studio/) and fall through to the worker API.
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
  http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(root, '.' + rel);
    const relPath = path.relative(root, file);
    const inside = !relPath.startsWith('..') && !path.isAbsolute(relPath) && !/^(worker|\.git|tools|node_modules)([\\/]|$)/.test(relPath);
    if (req.method !== 'GET' || !inside || !fs.existsSync(file) || !fs.statSync(file).isFile()) return worker.server.emit('request', req, res);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  }).listen(5174, '127.0.0.1', () => console.log(`Isolated verification: http://127.0.0.1:5174/studio/\nLocal Ollama ${config.creativeModel}; MANUAL asset provider only. Data: ${dataDir}`));
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
