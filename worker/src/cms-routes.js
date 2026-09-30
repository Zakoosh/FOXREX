/* FOXREX CMS + publishing + operations API (/api/...). Mounted behind the worker's bearer-token check
   and origin allowlist. Every mutating call requires:
     - STUDIO_WORKER_TOKEN configured (no anonymous CMS),
     - Content-Type: application/json (blocks form-post CSRF),
     - X-Foxrex-Actor (the named operator, recorded in the audit trail).
   Publishing mode (dry-run/live) is server configuration only: no endpoint can change it.
   AI endpoints can only ever create DRAFT content. Approval and publication are operator actions.
   Status responses never include filesystem paths, environment values, tokens or credentials. */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { CmsStore, CMS, cleanActor, aiTranslate } from './cms.js';
import { Publisher, PublicationLog } from './publisher.js';
import { Scheduler } from './scheduler.js';
import { AuditJournal } from './audit.js';
import { BackupService } from './backup.js';
import { RateLimiter } from './ratelimit.js';
import { acquireLock } from './fsx.js';
import { logger } from './logger.js';

const log = logger('cms');
const gitVersion = () => new Promise(res => execFile('git', ['--version'], { timeout: 5000 }, (e, so) => res(e ? null : String(so).trim().replace(/^git version /, ''))));

export function createCms({ config, creative, limits }) {
  const releaseLock = acquireLock(path.join(config.dataDir, 'cms'));
  const journal = new AuditJournal(config.dataDir);
  const backups = new BackupService({ dataDir: config.dataDir, dir: config.backup && config.backup.dir, keep: config.backup && config.backup.keep, minIntervalMs: config.backup ? config.backup.minIntervalMs : 10 * 60e3 });
  const store = new CmsStore(config.dataDir, { journal, onChange: () => backups.schedule() });
  const pubLog = new PublicationLog(config.dataDir);
  const publisher = new Publisher({ config, store, log: pubLog, journal });
  const scheduler = new Scheduler({ store, publisher, config });
  const limiter = new RateLimiter(limits);
  const started = Date.now();
  scheduler.start();
  let backupTimer = setInterval(() => { try { backups.snapshot('hourly'); } catch (e) { log.error('backup failed', { error: e.message }); } }, 60 * 60e3); backupTimer.unref?.();
  try { backups.snapshot('startup'); } catch (e) { log.error('startup backup failed', { error: e.message }); }

  async function status() {
    const repo = await publisher.repoState({ fetch: false });
    const gh = await publisher.githubAuth();
    const git = await gitVersion();
    let ai; try { ai = creative && creative.provider ? await creative.status() : { available: false, code: 'NOT_CONFIGURED' }; } catch (e) { ai = { available: false, code: 'UNAVAILABLE' }; }
    let cmsOk = true; try { fs.accessSync(store.dir, fs.constants.W_OK); } catch { cmsOk = false; }
    const lastOk = pubLog.last(p => p.result === 'SUCCESS'), lastFail = pubLog.last(p => ['FAILED', 'CONFLICT'].includes(p.result));
    const lastCommission = pubLog.last(p => p.action === 'commission');
    const pick = p => p && { publicationId: p.publicationId, contentId: p.contentId, language: p.language, action: p.action, version: p.version, at: p.publishedAt || p.requestedAt, result: p.result, deployment: p.deployment, commit: p.commitSha && p.commitSha.slice(0, 12), error: p.error };
    const readyRepo = repo.isRepo && repo.onBranch && repo.clean && !repo.diverged;
    return {
      health: { worker: 'HEALTHY', uptimeSeconds: Math.round((Date.now() - started) / 1000), version: '0.2.0' },
      readiness: {
        cms: { state: cmsOk ? 'READY' : 'UNAVAILABLE', records: store.list().length },
        publishingRepo: { state: !repo.isRepo ? 'UNAVAILABLE' : readyRepo ? 'READY' : 'DEGRADED', branch: repo.branch, expectedBranch: publisher.cfg.branch, clean: repo.clean, diverged: repo.diverged, head: repo.head && repo.head.slice(0, 12) },
        git: { state: git ? 'READY' : 'UNAVAILABLE', version: git },
        github: { state: gh.ok ? 'READY' : 'UNAVAILABLE', checkedAt: new Date(gh.at).toISOString() },
        ai: { state: ai.available ? 'READY' : ai.code === 'NOT_CONFIGURED' ? 'DISABLED' : 'UNAVAILABLE', provider: ai.provider || null, model: ai.model || null, note: ai.available ? null : 'Manual CMS and publishing do not depend on AI' },
        publishing: { state: readyRepo && gh.ok ? 'READY' : 'DEGRADED', mode: publisher.mode, modeLabel: publisher.mode === 'live' ? 'LIVE PUBLISHING' : 'DRY RUN' },
        scheduler: scheduler.status(),
        backups: { state: backups.last ? 'READY' : 'DEGRADED', last: backups.last && { file: backups.last.file, at: backups.last.createdAt, bytes: backups.last.bytes }, count: backups.list().length, keep: backups.keep },
        audit: { state: journal.verify().ok ? 'READY' : 'DEGRADED', entries: journal.seq }
      },
      deployment: { lastSuccess: pick(lastOk), lastFailure: pick(lastFail), lastCommission: pick(lastCommission) }
    };
  }

  async function handle(req, res, url, { send, body, ip }) {
    const p = url.pathname; if (!p.startsWith('/api/')) return false;
    if (!config.token) { send(res, 403, { error: 'Set STUDIO_WORKER_TOKEN before enabling the CMS and publishing API' }); return true; }
    const write = req.method !== 'GET';
    if (write && !/^application\/json\b/i.test(req.headers['content-type'] || '')) { send(res, 415, { error: 'Content-Type must be application/json' }); return true; }
    const actor = cleanActor(req.headers['x-foxrex-actor']);
    if (write && !actor) { send(res, 400, { error: 'Set your operator name in Studio Settings (sent as X-Foxrex-Actor)' }); return true; }
    const J = async () => (await body(req)) || {};
    const limit = (cls) => { const wait = limiter.check(cls, actor || ip || 'anon'); if (wait) { send(res, 429, { error: `Too many requests — wait ${wait}s`, retryAfter: wait }, { 'Retry-After': String(wait) }); return true; } return false; };
    if (write && limit('write')) return true;
    let m;

    if (p === '/api/cms/config' && req.method === 'GET') {
      send(res, 200, { types: CMS.TYPES, states: CMS.STATES, publish: await publisher.feedStatus(), scheduler: scheduler.status(), editorialTimezone: CMS.EDITORIAL_TZ });
      return true;
    }
    if (p === '/api/system/status' && req.method === 'GET') { send(res, 200, await status()); return true; }
    if (p === '/api/system/audit' && req.method === 'GET') { send(res, 200, { verify: journal.verify(), entries: journal.read(+url.searchParams.get('limit') || 200, { contentId: url.searchParams.get('contentId'), action: url.searchParams.get('action') }) }); return true; }
    if (p === '/api/system/backups' && req.method === 'GET') { send(res, 200, { last: backups.last, backups: backups.list().slice(0, 50) }); return true; }
    if (p === '/api/system/backups' && req.method === 'POST') { const b = backups.snapshot('manual'); journal.append({ action: 'BACKUP', actor, note: b.file }); send(res, 201, b); return true; }

    if (p === '/api/content' && req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams);
      let list = store.list();
      for (const k of ['type', 'status', 'language', 'symbol', 'category', 'market']) if (q[k]) list = list.filter(r => r[k] === q[k]);
      send(res, 200, list.map(r => summary(r, store))); return true;
    }
    if (p === '/api/content' && req.method === 'POST') { send(res, 201, store.create(await J(), actor)); return true; }
    if ((m = p.match(/^\/api\/content\/([a-z0-9-]+)$/))) {
      if (req.method === 'GET') { const r = store.get(m[1]); send(res, 200, { ...r, scheduleFlag: store.scheduleFlag(r.id), translations: store.group(r.translationGroupId).map(x => summary(x, store)) }); return true; }
      if (req.method === 'PUT') { const b = await J(); send(res, 200, store.update(m[1], b.record || {}, b.expectedRevision, actor)); return true; }
    }
    if ((m = p.match(/^\/api\/content\/([a-z0-9-]+)\/(transition|duplicate|translate)$/)) && req.method === 'POST') {
      const b = await J();
      if (m[2] === 'transition') { send(res, 200, store.transition(m[1], b.action, b, actor)); return true; }
      if (m[2] === 'duplicate') { send(res, 201, store.duplicate(m[1], actor)); return true; }
      const src = store.get(m[1]);
      if (b.mode === 'ai') {
        if (limit('ai')) return true;
        const out = await aiTranslate(creative.provider, src);
        const r = store.createTranslation(m[1], out.text, actor, { provider: out.provider, model: out.model, at: new Date().toISOString(), from: src.id, warnings: out.warnings });
        send(res, 201, { record: r, warnings: out.warnings }); return true;
      }
      send(res, 201, { record: store.createTranslation(m[1], null, actor, null), warnings: [] }); return true;
    }
    if (p === '/api/publish/preview' && req.method === 'POST') { const b = await J(); send(res, 200, await publisher.preview(store.get(b.contentId))); return true; }
    if (p === '/api/publish/preflight' && req.method === 'POST') {
      if (limit('publish')) return true;
      const b = await J(); send(res, 200, await publisher.preflight(store.get(b.contentId), { expectedVersion: b.expectedVersion, actor })); return true;
    }
    if (p === '/api/publish/commission' && req.method === 'POST') { if (limit('publish')) return true; send(res, 200, await publisher.commission({ actor })); return true; }
    if (['/api/publish', '/api/unpublish', '/api/republish'].includes(p) && req.method === 'POST') {
      if (limit('publish')) return true;
      const b = await J();
      if (b.confirm !== true) { send(res, 400, { error: 'Publishing requires explicit confirmation' }); return true; }
      const fn = p.slice(5);
      // NOTE: b.mode / b.publishMode are ignored on purpose — only server configuration selects live publishing.
      const result = await publisher[fn]({ contentId: b.contentId, expectedVersion: b.expectedVersion, actor, dryRun: b.dryRun === true, version: b.version, idempotencyKey: req.headers['idempotency-key'] || b.idempotencyKey });
      send(res, 200, result); return true;
    }
    if (p === '/api/publications' && req.method === 'GET') { send(res, 200, pubLog.list({ contentId: url.searchParams.get('contentId') }).slice(0, 200)); return true; }
    if ((m = p.match(/^\/api\/publications\/(pub_[a-z0-9]+)\/status$/)) && req.method === 'GET') { send(res, 200, await publisher.deploymentStatus(m[1])); return true; }
    if (p === '/api/feed' && req.method === 'GET') { const { version, feed } = publisher.readFeed(); send(res, 200, { version, feed }); return true; }
    send(res, 404, { error: 'not found' }); return true;
  }

  function stop({ finalBackup = false } = {}) {
    scheduler.stop(); publisher.stop(); backups.stop(); clearInterval(backupTimer);
    if (finalBackup) { try { backups.snapshot('shutdown'); } catch { /* reported in logs */ } }
    releaseLock();
  }
  return { handle, store, log: pubLog, publisher, scheduler, journal, backups, status, runDue: now => scheduler.tick(now), stop, drain: () => publisher.queue };
}

function summary(r, store) {
  return { id: r.id, type: r.type, status: r.status, language: r.language, translationGroupId: r.translationGroupId, title: r.title, slug: r.slug,
    symbol: r.symbol, market: r.market, category: r.category, revision: r.revision, createdAt: r.createdAt, updatedAt: r.updatedAt, scheduledAt: r.scheduledAt, expiresAt: r.expiresAt || null,
    publishedAt: r.publishedAt, approvedAt: r.approvedAt, live: r.live ? { publishVersion: r.live.publishVersion, publishedAt: r.live.publishedAt, mode: r.live.mode } : null,
    scheduleFlag: store ? store.scheduleFlag(r.id) : null, aiGenerated: !!r.aiGenerated };
}
