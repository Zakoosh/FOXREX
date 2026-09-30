/* FOXREX publishing engine (trusted side of the Studio → website boundary).
   Runs only inside the operator's worker. Browser code never sees Git credentials: pushes use the
   operator machine's own git authentication (SSH key or credential helper) for PUBLISH_REPO_DIR.

   publish = approval gate → validation → repo state check → optimistic concurrency (feed version)
             → idempotency → write data/content.json → schema/integrity/site checks → commit → push.
   Any failure leaves the repository as it was and the CMS record APPROVED (retryable).
   PUBLISH_MODE=dry-run (default) performs every step except writing, committing and pushing. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { CMS } from './cms.js';

const FEED = 'data/content.json';
const httpError = (status, message, extra) => Object.assign(new Error(message), { status, ...extra });
export const feedVersion = raw => crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);

function run(cmd, args, cwd, timeout = 120000) {
  return new Promise((resolve, reject) => execFile(cmd, args, { cwd, timeout, maxBuffer: 8 << 20, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
    (err, stdout, stderr) => err ? reject(Object.assign(err, { stdout: String(stdout), stderr: String(stderr) })) : resolve(String(stdout).trim())));
}
const splitCmd = c => c.trim().split(/\s+/);

export class PublicationLog {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'cms', 'publications.json'); fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { schemaVersion: 1, publications: [] };
  }
  persist() { fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data, null, 2)); fs.renameSync(this.file + '.tmp', this.file); }
  add(p) { this.data.publications.unshift(p); if (this.data.publications.length > 2000) this.data.publications.length = 2000; this.persist(); return p; }
  update(p) { this.persist(); return p; }
  get(id) { return this.data.publications.find(p => p.publicationId === id); }
  byKey(key) { return this.data.publications.find(p => p.idempotencyKey === key && p.result === 'SUCCESS' && p.mode === 'live'); }
  list(filter = {}) { return this.data.publications.filter(p => !filter.contentId || p.contentId === filter.contentId); }
}

export class Publisher {
  constructor({ config, store, log, git = 'git' }) {
    this.cfg = { mode: 'dry-run', repoDir: process.cwd(), branch: 'main', remote: 'origin', checks: [], publicFeedUrl: 'https://foxrex.co/data/content.json', publicOrigin: 'https://foxrex.co', ...(config.publish || {}) };
    this.store = store; this.log = log; this.git = git; this.queue = Promise.resolve();
  }
  get mode() { return this.cfg.mode === 'live' ? 'live' : 'dry-run'; }
  /** One publication at a time: the feed is a single file. */
  serial(fn) { const p = this.queue.then(fn, fn); this.queue = p.catch(() => {}); return p; }
  g(...args) { return run(this.git, args, this.cfg.repoDir); }

  readFeed() {
    const file = path.join(this.cfg.repoDir, FEED);
    const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    return { raw, version: feedVersion(raw), feed: CMS.normalizeFeed(raw ? JSON.parse(raw) : null) };
  }
  async feedStatus() {
    const { version, feed } = this.readFeed();
    let head = null, branch = null, clean = null;
    try { head = await this.g('rev-parse', '--short', 'HEAD'); branch = await this.g('rev-parse', '--abbrev-ref', 'HEAD'); clean = !(await this.g('status', '--porcelain')); } catch { /* not a git repo */ }
    return { mode: this.mode, version, items: feed.items.length, head, branch, clean, expectedBranch: this.cfg.branch, publicFeedUrl: this.cfg.publicFeedUrl };
  }

  /** Server-side gate: approval + validation + references. Returns error list. */
  gate(r, now = Date.now()) {
    const errors = CMS.publishGate(r, now);
    if (r.type === 'SIGNAL_RESULT') {
      const sig = this.store.data.records[r.fields && r.fields.signalId];
      if (!sig || sig.type !== 'SIGNAL') errors.push({ field: 'fields.signalId', message: 'Referenced signal does not exist in FOXREX Studio' });
      else if (!(sig.publishing && sig.publishing.publishVersion > 0)) errors.push({ field: 'fields.signalId', message: 'Referenced signal was never published — results must reference a real published signal' });
    }
    return errors;
  }
  entryFor(r, at) { return CMS.toFeedEntry(r, at, (r.publishing.publishVersion || 0) + 1); }

  async checks(feedFile, dryRun) {
    const cmds = this.cfg.checks.filter(Boolean);
    const out = [];
    for (const c of cmds) {
      const [cmd, ...args] = splitCmd(c);
      // The candidate feed is passed explicitly so dry runs validate what WOULD be published.
      const env = { ...process.env, FOXREX_FEED_PATH: feedFile };
      await new Promise((resolve, reject) => execFile(cmd === 'node' ? process.execPath : cmd, args.map(a => a === '{feed}' ? feedFile : a), { cwd: this.cfg.repoDir, timeout: 180000, env, maxBuffer: 8 << 20 },
        (err, so, se) => { out.push({ command: c, ok: !err, output: (String(so) + String(se)).slice(-4000) }); err ? reject(httpError(422, `Check failed: ${c}`, { code: 'CHECKS_FAILED', checks: out })) : resolve(); }));
    }
    return out;
  }

  async preview(r) {
    const errors = this.gate(r);
    const { version, feed } = this.readFeed();
    const at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const entry = errors.length ? null : this.entryFor(r, at);
    return { errors, entry, feedVersion: version, mode: this.mode, destinations: CMS.destinations(r.type).map(p => ({ page: p, url: CMS.pageUrl(p, r.language, this.cfg.publicOrigin) })),
      alreadyLive: !!r.live, currentItems: feed.items.length };
  }

  publish(opts) { return this.serial(() => this.#execute('publish', opts)); }
  unpublish(opts) { return this.serial(() => this.#execute('unpublish', opts)); }

  async #execute(action, { contentId, expectedVersion, actor, dryRun, idempotencyKey }) {
    if (!actor) throw httpError(400, 'Operator name is required (Studio Settings → operator)');
    const r = this.store.get(contentId);
    const mode = dryRun || this.mode === 'dry-run' ? 'dry-run' : 'live';
    const key = idempotencyKey || `${action}:${contentId}@r${r.revision}`;
    // Idempotency: the same request (key) that already succeeded is answered from the log, never re-applied.
    const prior = mode === 'live' && this.log.byKey(key);
    if (prior) return { ...prior, idempotentReplay: true };

    const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const pub = {
      publicationId: 'pub_' + crypto.randomBytes(8).toString('hex'), action, contentId, language: r.language, contentType: r.type,
      version: action === 'publish' ? (r.publishing.publishVersion || 0) + 1 : (r.live && r.live.publishVersion) || 0,
      contentRevision: r.revision, idempotencyKey: key, requestedAt: now, publishedAt: null, commitSha: null, actor, mode,
      destinations: CMS.destinations(r.type), liveUrls: CMS.destinations(r.type).map(p => CMS.pageUrl(p, r.language, this.cfg.publicOrigin)),
      result: 'PENDING', deployment: 'PUBLISHING', error: null, errors: [], checks: [], feedVersionBefore: null, feedVersionAfter: null
    };
    const fail = (result, status, message, extra = {}) => {
      Object.assign(pub, { result, deployment: result === 'CONFLICT' ? null : 'FAILED', error: message }, extra);
      this.log.add(pub);
      throw httpError(status, message, { publication: pub, code: result, errors: pub.errors });
    };

    if (action === 'publish') {
      const errs = this.gate(r, Date.parse(now));
      if (errs.length) { pub.errors = errs; return fail('FAILED', 422, 'Content is not publishable', {}); }
    } else if (!r.live) return fail('FAILED', 409, 'This item is not live on the website');

    const repo = this.cfg.repoDir;
    let prevHead = null;
    try {
      if (mode === 'live') {
        const branch = await this.g('rev-parse', '--abbrev-ref', 'HEAD');
        if (branch !== this.cfg.branch) return fail('FAILED', 409, `Publishing repository is on "${branch}", expected "${this.cfg.branch}"`);
        if (await this.g('status', '--porcelain')) return fail('FAILED', 409, 'Publishing repository has uncommitted changes. Commit or discard them first; the engine never commits unrelated work.');
        await this.g('fetch', '--quiet', this.cfg.remote, this.cfg.branch);
        try { await this.g('merge', '--ff-only', '--quiet', `${this.cfg.remote}/${this.cfg.branch}`); }
        catch { return fail('FAILED', 409, 'Local publishing branch has diverged from the remote. Resolve it manually; the engine never rewrites history.'); }
        prevHead = await this.g('rev-parse', 'HEAD');
      }
      const { raw, version, feed } = this.readFeed();
      pub.feedVersionBefore = version;
      if (!expectedVersion) return fail('FAILED', 428, 'expectedVersion (the feed version you previewed) is required');
      if (expectedVersion !== version) return fail('CONFLICT', 409, 'Published content changed since this item was loaded. Refresh before publishing.', { currentVersion: version });

      const publication = { id: pub.publicationId, at: now, contentId, action, version: pub.version };
      let next;
      if (action === 'publish') {
        const entry = this.entryFor(r, now);
        // Content already live at this exact revision → nothing to change (deterministic no-op).
        const live = feed.items.find(i => i.id === r.id);
        if (live && r.live && r.live.revision === r.revision) return fail('FAILED', 409, 'This exact version is already live');
        next = CMS.applyToFeed(feed, entry, publication);
      } else next = CMS.removeFromFeed(feed, r.id, publication);
      const json = JSON.stringify({ $schema: './content.schema.json', ...next }, null, 2) + '\n';
      pub.feedVersionAfter = feedVersion(json);

      // Validate the candidate feed (schema + integrity + site tests) before anything is written to the repo.
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'foxrex-feed-')); const candidate = path.join(tmp, 'content.json');
      fs.writeFileSync(candidate, json);
      try { pub.checks = await this.checks(candidate); }
      catch (e) { pub.checks = e.checks || []; return fail('FAILED', 422, e.message); }
      finally { fs.rmSync(tmp, { recursive: true, force: true }); }

      if (mode === 'dry-run') {
        pub.diff = unifiedDiff(raw, json).slice(0, 20000);
        Object.assign(pub, { result: 'DRY_RUN_OK', deployment: null });
        this.log.add(pub);
        return pub;
      }

      fs.writeFileSync(path.join(repo, FEED), json);
      const title = `${r.language === 'ar' ? 'Arabic' : 'English'} ${CMS.TYPES[r.type].label[0]}`;
      const msg = `content: ${action} ${title} ${CMS.editorialDate(now)} — ${r.slug}\n\nContent-Id: ${r.id}\nPublish-Version: ${pub.version}\nPublication-Id: ${pub.publicationId}\nApproved-By: ${r.audit.approvedBy || '-'}\nPublished-By: ${actor}\n`;
      try {
        await this.g('add', '--', FEED);
        await this.g('commit', '--quiet', '-m', msg, '--', FEED);
        pub.commitSha = await this.g('rev-parse', 'HEAD'); pub.deployment = 'COMMITTED';
      } catch (e) { await this.#restore(prevHead); return fail('FAILED', 500, `git commit failed: ${(e.stderr || e.message).trim()}`); }
      try { await this.g('push', '--quiet', this.cfg.remote, `HEAD:refs/heads/${this.cfg.branch}`); pub.deployment = 'PUSHED'; }
      catch (e) { const sha = pub.commitSha; await this.#restore(prevHead); pub.commitSha = null; return fail('FAILED', 502, `git push failed; local commit ${sha.slice(0, 7)} was undone: ${(e.stderr || e.message).trim()}`); }

      pub.publishedAt = now; pub.result = 'SUCCESS';
      if (action === 'publish') this.store.markPublished(r.id, pub, actor); else this.store.markUnpublished(r.id, pub, actor);
      this.log.add(pub);
      return pub;
    } catch (e) {
      if (e.publication) throw e;
      if (prevHead) await this.#restore(prevHead);
      return fail('FAILED', e.status || 500, e.message);
    }
  }
  async #restore(prevHead) {
    if (!prevHead) return;
    try { await this.g('reset', '--quiet', '--hard', prevHead); } catch { /* reported by caller */ }
  }

  /** PUSHED → DEPLOYING → LIVE, confirmed only by reading the public feed from the website. */
  async deploymentStatus(id, fetcher = fetch) {
    const pub = this.log.get(id); if (!pub) throw httpError(404, 'Publication not found');
    if (pub.result !== 'SUCCESS' || pub.mode !== 'live') return pub;
    if (pub.deployment === 'LIVE') return pub;
    try {
      const r = await fetcher(`${this.cfg.publicFeedUrl}?v=${Date.now()}`, { signal: AbortSignal.timeout(10000), redirect: 'follow', headers: { 'Cache-Control': 'no-cache' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const feed = await r.json();
      const item = (feed.items || []).find(i => i.id === pub.contentId);
      const live = pub.action === 'publish' ? !!(item && item.publishVersion >= pub.version) : !item;
      pub.deployment = live ? 'LIVE' : 'DEPLOYING'; pub.checkedAt = new Date().toISOString(); pub.deploymentNote = live ? null : 'Pushed; the public feed does not show this version yet (GitHub Pages usually deploys within a few minutes).';
    } catch (e) { pub.deployment = 'DEPLOYING'; pub.deploymentNote = `Could not read the public feed (${e.message}); status unconfirmed.`; }
    this.log.update(pub); return pub;
  }

  /** Scheduled items whose time has come. Executed only when SCHEDULER_ENABLED=true (see SECURITY.md). */
  due(now = Date.now()) { return this.store.list().filter(r => r.status === 'SCHEDULED' && r.scheduledAt && Date.parse(r.scheduledAt) <= now); }
}

function unifiedDiff(a, b) {
  const A = a.split('\n'), B = b.split('\n'); let i = 0; while (i < A.length && i < B.length && A[i] === B[i]) i++;
  let j = 0; while (j < A.length - i && j < B.length - i && A[A.length - 1 - j] === B[B.length - 1 - j]) j++;
  const ctx = 3, from = Math.max(0, i - ctx);
  return [`--- a/${FEED}`, `+++ b/${FEED}`, `@@ -${from + 1} +${from + 1} @@`, ...A.slice(from, i).map(l => ' ' + l),
    ...A.slice(i, A.length - j).map(l => '-' + l), ...B.slice(i, B.length - j).map(l => '+' + l), ...A.slice(A.length - j, A.length - j + ctx).map(l => ' ' + l)].join('\n');
}
