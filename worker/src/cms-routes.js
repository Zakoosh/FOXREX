/* FOXREX CMS + publishing API (/api/...). Mounted behind the worker's bearer-token check and
   origin allowlist. Every mutating call requires:
     - STUDIO_WORKER_TOKEN configured (no anonymous CMS),
     - Content-Type: application/json (blocks form-post CSRF),
     - X-Foxrex-Actor (the named operator, recorded in the audit trail).
   AI endpoints can only ever create DRAFT content. Approval and publication are operator actions. */
import { CmsStore, CMS, cleanActor, aiTranslate } from './cms.js';
import { Publisher, PublicationLog } from './publisher.js';

export function createCms({ config, creative }) {
  const store = new CmsStore(config.dataDir);
  const log = new PublicationLog(config.dataDir);
  const publisher = new Publisher({ config, store, log });
  let timer = null;
  if (config.schedulerEnabled) timer = setInterval(() => runDue().catch(() => {}), 60000);

  async function runDue() {
    for (const r of publisher.due()) {
      const { version } = publisher.readFeed();
      try { await publisher.publish({ contentId: r.id, expectedVersion: version, actor: 'scheduler', idempotencyKey: `schedule:${r.id}@${r.scheduledAt}` }); } catch { /* logged as FAILED */ }
    }
  }

  async function handle(req, res, url, { send, body }) {
    const p = url.pathname; if (!p.startsWith('/api/')) return false;
    if (!config.token) { send(res, 403, { error: 'Set STUDIO_WORKER_TOKEN before enabling the CMS and publishing API' }); return true; }
    const write = req.method !== 'GET';
    if (write && !/^application\/json\b/i.test(req.headers['content-type'] || '')) { send(res, 415, { error: 'Content-Type must be application/json' }); return true; }
    const actor = cleanActor(req.headers['x-foxrex-actor']);
    if (write && !actor) { send(res, 400, { error: 'Set your operator name in Studio Settings (sent as X-Foxrex-Actor)' }); return true; }
    const J = async () => (await body(req)) || {};
    let m;

    if (p === '/api/cms/config' && req.method === 'GET') {
      send(res, 200, { types: CMS.TYPES, states: CMS.STATES, publish: await publisher.feedStatus(), scheduler: { enabled: !!config.schedulerEnabled, due: publisher.due().length }, editorialTimezone: CMS.EDITORIAL_TZ });
      return true;
    }
    if (p === '/api/content' && req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams);
      let list = store.list();
      for (const k of ['type', 'status', 'language', 'symbol', 'category', 'market']) if (q[k]) list = list.filter(r => r[k] === q[k]);
      send(res, 200, list.map(summary)); return true;
    }
    if (p === '/api/content' && req.method === 'POST') { send(res, 201, store.create(await J(), actor)); return true; }
    if ((m = p.match(/^\/api\/content\/([a-z0-9-]+)$/))) {
      if (req.method === 'GET') { const r = store.get(m[1]); send(res, 200, { ...r, translations: store.group(r.translationGroupId).map(summary) }); return true; }
      if (req.method === 'PUT') { const b = await J(); send(res, 200, store.update(m[1], b.record || {}, b.expectedRevision, actor)); return true; }
    }
    if ((m = p.match(/^\/api\/content\/([a-z0-9-]+)\/(transition|duplicate|translate)$/)) && req.method === 'POST') {
      const b = await J();
      if (m[2] === 'transition') { send(res, 200, store.transition(m[1], b.action, b, actor)); return true; }
      if (m[2] === 'duplicate') { send(res, 201, store.duplicate(m[1], actor)); return true; }
      const src = store.get(m[1]);
      if (b.mode === 'ai') {
        const out = await aiTranslate(creative.provider, src);
        const r = store.createTranslation(m[1], out.text, actor, { provider: out.provider, model: out.model, at: new Date().toISOString(), from: src.id, warnings: out.warnings });
        send(res, 201, { record: r, warnings: out.warnings }); return true;
      }
      send(res, 201, { record: store.createTranslation(m[1], null, actor, null), warnings: [] }); return true;
    }
    if (p === '/api/publish/preview' && req.method === 'POST') { const b = await J(); send(res, 200, await publisher.preview(store.get(b.contentId))); return true; }
    if ((p === '/api/publish' || p === '/api/unpublish') && req.method === 'POST') {
      const b = await J();
      if (b.confirm !== true) { send(res, 400, { error: 'Publishing requires explicit confirmation' }); return true; }
      const fn = p === '/api/publish' ? 'publish' : 'unpublish';
      const result = await publisher[fn]({ contentId: b.contentId, expectedVersion: b.expectedVersion, actor, dryRun: b.dryRun === true, idempotencyKey: req.headers['idempotency-key'] || b.idempotencyKey });
      send(res, 200, result); return true;
    }
    if (p === '/api/publications' && req.method === 'GET') { send(res, 200, log.list({ contentId: url.searchParams.get('contentId') }).slice(0, 200)); return true; }
    if ((m = p.match(/^\/api\/publications\/(pub_[a-z0-9]+)\/status$/)) && req.method === 'GET') { send(res, 200, await publisher.deploymentStatus(m[1])); return true; }
    if (p === '/api/feed' && req.method === 'GET') { const { version, feed } = publisher.readFeed(); send(res, 200, { version, feed }); return true; }
    send(res, 404, { error: 'not found' }); return true;
  }
  return { handle, store, log, publisher, runDue, stop: () => timer && clearInterval(timer) };
}

function summary(r) {
  return { id: r.id, type: r.type, status: r.status, language: r.language, translationGroupId: r.translationGroupId, title: r.title, slug: r.slug,
    symbol: r.symbol, market: r.market, category: r.category, revision: r.revision, createdAt: r.createdAt, updatedAt: r.updatedAt, scheduledAt: r.scheduledAt,
    publishedAt: r.publishedAt, approvedAt: r.approvedAt, live: r.live ? { publishVersion: r.live.publishVersion, publishedAt: r.live.publishedAt, mode: r.live.mode } : null,
    aiGenerated: !!r.aiGenerated };
}
