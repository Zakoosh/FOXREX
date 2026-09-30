/* FOXREX publishing engine (trusted side of the Studio → website boundary).
   Runs only inside the operator's worker / always-on control plane. Browser code never sees Git
   credentials: pushes use the host's own git authentication (SSH key or credential helper) for
   PUBLISH_REPO_DIR — a dedicated clean clone, never a developer working tree.

   publish   = approval gate → preflight → optimistic concurrency (feed version) → idempotency
               → candidate feed → schema/integrity/site checks → commit → push → deployment verification.
   republish = roll back to a stored published version with a NEW corrective commit (never history rewrite).
   Any failure leaves the repository as it was and the CMS record unchanged (retryable).
   PUBLISH_MODE=dry-run (default) performs every step except writing, committing and pushing. The mode is
   server configuration only — no request can switch it. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { CMS } from './cms.js';
import { atomicWrite } from './fsx.js';
import { logger } from './logger.js';

const FEED = 'data/content.json';
const PROBE_REF = 'refs/heads/foxrex-push-capability-probe';
const log = logger('publisher');
const httpError = (status, message, extra) => Object.assign(new Error(message), { status, ...extra });
export const feedVersion = raw => crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
const FAKE_MARKERS = /\b(lorem ipsum|placeholder|TBD|TODO|XXX|dummy|sample data|fake data)\b|\[insert/i;
const SECRETISH = /(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{10,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|Bearer\s+[A-Za-z0-9._-]{12,})/;

function run(cmd, args, cwd, timeout = 120000) {
  return new Promise((resolve, reject) => execFile(cmd, args, { cwd, timeout, maxBuffer: 8 << 20, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
    (err, stdout, stderr) => err ? reject(Object.assign(err, { stdout: String(stdout), stderr: String(stderr) })) : resolve(String(stdout).trim())));
}
const splitCmd = c => c.trim().split(/\s+/);
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export class PublicationLog {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'cms', 'publications.json'); fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { schemaVersion: 1, publications: [] };
  }
  persist() { atomicWrite(this.file, JSON.stringify(this.data, null, 2)); }
  add(p) { this.data.publications.unshift(p); if (this.data.publications.length > 2000) this.data.publications.length = 2000; this.persist(); return p; }
  update(p) { this.persist(); return p; }
  get(id) { return this.data.publications.find(p => p.publicationId === id); }
  byKey(key) { return this.data.publications.find(p => p.idempotencyKey === key && p.result === 'SUCCESS' && p.mode === 'live'); }
  list(filter = {}) { return this.data.publications.filter(p => !filter.contentId || p.contentId === filter.contentId); }
  last(pred) { return this.data.publications.find(pred) || null; }
}

export class Publisher {
  constructor({ config, store, log: pubLog, journal, git = 'git', fetcher = (...a) => fetch(...a) }) {
    this.cfg = { mode: 'dry-run', repoDir: process.cwd(), branch: 'main', remote: 'origin', checks: [], publicFeedUrl: 'https://foxrex.co/data/content.json', publicOrigin: 'https://foxrex.co', ...(config.publish || {}) };
    this.githubRepo = config.githubRepo || null; this.token = config.token || '';
    this.store = store; this.log = pubLog; this.journal = journal || null; this.git = git; this.fetcher = fetcher;
    this.queue = Promise.resolve(); this.watchers = new Set(); this.ghCache = { at: 0, ok: null };
  }
  get mode() { return this.cfg.mode === 'live' ? 'live' : 'dry-run'; }
  /** One publication at a time: the feed is a single file. */
  serial(fn) { const p = this.queue.then(fn, fn); this.queue = p.catch(() => {}); return p; }
  g(...args) { return run(this.git, args, this.cfg.repoDir); }
  audit(e) { try { this.journal && this.journal.append(e); } catch { /* journal errors are surfaced by verify */ } }

  readFeed() {
    const file = path.join(this.cfg.repoDir, FEED);
    const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    return { raw, version: feedVersion(raw), feed: CMS.normalizeFeed(raw ? JSON.parse(raw) : null) };
  }
  async feedStatus() {
    let version = null, items = null;
    try { const f = this.readFeed(); version = f.version; items = f.feed.items.length; } catch { /* repo missing */ }
    let head = null, branch = null, clean = null;
    try { head = await this.g('rev-parse', '--short', 'HEAD'); branch = await this.g('rev-parse', '--abbrev-ref', 'HEAD'); clean = !(await this.g('status', '--porcelain')); } catch { /* not a git repo */ }
    return { mode: this.mode, version, items, head, branch, clean, expectedBranch: this.cfg.branch, publicFeedUrl: this.cfg.publicFeedUrl };
  }

  /** Repository state for readiness/preflight. Never returns filesystem paths. */
  async repoState({ fetch: doFetch = true } = {}) {
    const s = { isRepo: false, branch: null, onBranch: false, clean: false, head: null, fetchOk: null, remoteHead: null, upToDate: false, diverged: false, error: null };
    try {
      if (!fs.existsSync(path.join(this.cfg.repoDir, '.git'))) { s.error = 'Publishing repository not found (PUBLISH_REPO_DIR)'; return s; }
      s.isRepo = true;
      s.branch = await this.g('rev-parse', '--abbrev-ref', 'HEAD'); s.onBranch = s.branch === this.cfg.branch;
      s.clean = !(await this.g('status', '--porcelain'));
      s.head = await this.g('rev-parse', 'HEAD');
      if (doFetch) { try { await this.g('fetch', '--quiet', this.cfg.remote, this.cfg.branch); s.fetchOk = true; } catch (e) { s.fetchOk = false; s.error = 'Cannot reach the remote (git fetch failed)'; } }
      try { s.remoteHead = await this.g('rev-parse', `${this.cfg.remote}/${this.cfg.branch}`); } catch { /* no remote ref yet */ }
      if (s.remoteHead) {
        s.upToDate = s.head === s.remoteHead;
        const base = await this.g('merge-base', 'HEAD', s.remoteHead).catch(() => '');
        s.diverged = !s.upToDate && base !== s.head; // local has commits the remote lacks
      }
    } catch (e) { s.error = s.error || (e.stderr || e.message || '').trim().slice(0, 200); }
    return s;
  }
  async githubAuth(force = false) {
    if (!force && Date.now() - this.ghCache.at < 5 * 60e3 && this.ghCache.ok !== null) return this.ghCache;
    try { await this.g('ls-remote', '--heads', this.cfg.remote, this.cfg.branch); this.ghCache = { at: Date.now(), ok: true }; }
    catch (e) { this.ghCache = { at: Date.now(), ok: false, error: 'git ls-remote failed' }; }
    return this.ghCache;
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
  contentScan(entry) {
    const text = JSON.stringify(entry || {});
    // FOXREX_ALLOW_TEST_CONTENT=1 exists only for isolated test repositories; production never sets it.
    return { fixture: !!entry && CMS.isFixture(entry) && process.env.FOXREX_ALLOW_TEST_CONTENT !== '1', fake: FAKE_MARKERS.test(text), secret: SECRETISH.test(text) || (this.token && this.token.length >= 8 && text.includes(this.token)) };
  }

  async checks(feedFile) {
    const out = [];
    for (const c of this.cfg.checks.filter(Boolean)) {
      const [cmd, ...args] = splitCmd(c);
      // The candidate feed is passed explicitly so dry runs validate what WOULD be published.
      const env = { ...process.env, FOXREX_FEED_PATH: feedFile };
      await new Promise((resolve, reject) => execFile(cmd === 'node' ? process.execPath : cmd, args.map(a => a === '{feed}' ? feedFile : a), { cwd: this.cfg.repoDir, timeout: 180000, env, maxBuffer: 8 << 20 },
        (err, so, se) => { out.push({ command: c, ok: !err, output: (String(so) + String(se)).slice(-4000) }); err ? reject(httpError(422, `Check failed: ${c}`, { code: 'CHECKS_FAILED', checks: out })) : resolve(); }));
    }
    return out;
  }
  async withCandidate(json, fn) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'foxrex-feed-')); const candidate = path.join(tmp, 'content.json');
    fs.writeFileSync(candidate, json);
    try { return await fn(candidate); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  async preview(r) {
    const errors = this.gate(r);
    const { version, feed } = this.readFeed();
    const entry = errors.length ? null : this.entryFor(r, nowIso());
    return { errors, entry, feedVersion: version, mode: this.mode, destinations: CMS.destinations(r.type).map(p => ({ page: p, url: CMS.pageUrl(p, r.language, this.cfg.publicOrigin) })),
      alreadyLive: !!r.live, currentItems: feed.items.length };
  }

  /** One place that answers "can this be published right now?" — READY or the exact blockers. */
  async preflight(r, { expectedVersion, actor, runChecks = true } = {}) {
    const checks = []; const add = (id, label, ok, detail) => checks.push({ id, label, ok: !!ok, detail: detail || null });
    add('operator', 'Operator identified', !!actor, actor ? null : 'Set your operator name in Studio Settings');
    add('approved', 'Content approved', CMS.PUBLISHABLE_FROM.includes(r.status) && r.audit && r.audit.approvedBy, `Status ${r.status}`);
    const errs = this.gate(r);
    add('validation', 'Content validation', !errs.length, errs.map(e => e.message).join(' · '));
    add('expiry', 'Not expired', !(r.expiresAt && Date.parse(r.expiresAt) <= Date.now()), r.expiresAt ? `Expires ${r.expiresAt}` : null);
    const repo = await this.repoState({ fetch: true });
    add('repo', 'Publishing repository present', repo.isRepo, repo.isRepo ? null : repo.error);
    add('branch', `On ${this.cfg.branch}`, repo.onBranch, repo.branch);
    add('clean', 'Publishing repository clean', repo.clean, repo.clean ? null : 'Uncommitted changes in the publishing clone');
    add('origin', 'Remote reachable', repo.fetchOk === true, repo.fetchOk ? null : repo.error);
    add('current', 'Local clone current (fast-forwardable, no divergence)', repo.isRepo && !repo.diverged && !!repo.remoteHead, repo.diverged ? 'Local branch has commits the remote does not' : repo.upToDate ? 'Up to date' : 'Behind remote — will fast-forward before publishing');
    let feedOk = false, version = null, feed = null;
    try { const f = this.readFeed(); version = f.version; feed = f.feed; feedOk = true; } catch (e) { add('feed', 'Current public feed readable', false, e.message); }
    if (feedOk) add('feed', 'Current public feed readable', true, `${feed.items.length} item(s)`);
    add('version', 'Feed version current', !expectedVersion || expectedVersion === version, expectedVersion && expectedVersion !== version ? 'Published content changed since this item was loaded. Refresh before publishing.' : null);
    const entry = errs.length ? null : this.entryFor(r, nowIso());
    const scan = this.contentScan(entry);
    add('fixture', 'Not a TEST fixture', !scan.fixture); add('fake', 'No placeholder / fake-data markers', !scan.fake); add('secrets', 'No secret-like values in content', !scan.secret);
    if (runChecks && entry && feedOk) {
      const json = JSON.stringify({ $schema: './content.schema.json', ...CMS.applyToFeed(feed, entry, { id: 'pub_preflight00', at: entry.publishedAt, contentId: r.id, action: 'publish', version: entry.publishVersion }) }, null, 2) + '\n';
      try { const out = await this.withCandidate(json, c => this.checks(c)); add('tests', 'Schema, integrity and site tests on the candidate feed', true, `${out.length} check(s) passed`); }
      catch (e) { add('tests', 'Schema, integrity and site tests on the candidate feed', false, ((e.checks || []).find(c => !c.ok) || {}).output?.slice(-600) || e.message); }
    } else add('tests', 'Schema, integrity and site tests on the candidate feed', false, 'Skipped until the blockers above are fixed');
    const ready = checks.every(c => c.ok);
    return { ready, status: ready ? 'READY TO PUBLISH' : 'BLOCKED', mode: this.mode, feedVersion: version, checks, entry };
  }

  publish(opts) { return this.serial(() => this.#execute('publish', opts)); }
  unpublish(opts) { return this.serial(() => this.#execute('unpublish', opts)); }
  republish(opts) { return this.serial(() => this.#execute('republish', opts)); }

  async #execute(action, { contentId, expectedVersion, actor, dryRun, idempotencyKey, version: targetVersion }) {
    if (!actor) throw httpError(400, 'Operator name is required (Studio Settings → operator)');
    const r = this.store.get(contentId);
    const mode = dryRun || this.mode === 'dry-run' ? 'dry-run' : 'live';
    const key = idempotencyKey || `${action}:${contentId}@r${r.revision}${targetVersion ? '@v' + targetVersion : ''}`;
    // Idempotency: the same request (key) that already succeeded is answered from the log, never re-applied.
    const prior = mode === 'live' && this.log.byKey(key);
    if (prior) return { ...prior, idempotentReplay: true };

    const now = nowIso();
    const pub = {
      publicationId: 'pub_' + crypto.randomBytes(8).toString('hex'), action, contentId, language: r.language, contentType: r.type,
      version: action === 'unpublish' ? (r.live && r.live.publishVersion) || 0 : (r.publishing.publishVersion || 0) + 1,
      republishOf: action === 'republish' ? targetVersion : undefined,
      contentRevision: r.revision, idempotencyKey: key, requestedAt: now, publishedAt: null, commitSha: null, actor, mode,
      destinations: CMS.destinations(r.type), liveUrls: CMS.destinations(r.type).map(p => CMS.pageUrl(p, r.language, this.cfg.publicOrigin)),
      result: 'PENDING', deployment: 'PUBLISHING', error: null, errors: [], checks: [], feedVersionBefore: null, feedVersionAfter: null
    };
    const fail = (result, status, message, extra = {}) => {
      Object.assign(pub, { result, deployment: result === 'CONFLICT' ? null : 'FAILED', error: message }, extra);
      this.log.add(pub);
      this.audit({ action: action.toUpperCase(), actor, contentId, language: r.language, contentType: r.type, version: pub.version, result, publicationId: pub.publicationId, note: message });
      log.warn('publication failed', { publicationId: pub.publicationId, contentId, action, result, mode });
      throw httpError(status, message, { publication: pub, code: result, errors: pub.errors });
    };

    let entry = null;
    if (action === 'publish') {
      const errs = this.gate(r, Date.parse(now));
      if (errs.length) { pub.errors = errs; return fail('FAILED', 422, 'Content is not publishable', {}); }
      entry = this.entryFor(r, now);
    } else if (action === 'republish') {
      const snap = (r.publishedVersions || []).find(v => v.version === +targetVersion);
      if (!snap) return fail('FAILED', 404, `Version ${targetVersion} of this item was never published`);
      if (snap.entry.expiresAt && Date.parse(snap.entry.expiresAt) <= Date.parse(now)) return fail('FAILED', 422, 'That version has expired and cannot be republished as current');
      entry = { ...snap.entry, publishVersion: pub.version, updatedAt: now, publishedAt: now };
    } else if (!r.live) return fail('FAILED', 409, 'This item is not live on the website');
    if (entry) { const scan = this.contentScan(entry); if (scan.fixture || scan.fake || scan.secret) return fail('FAILED', 422, `Content blocked: ${[scan.fixture && 'TEST fixture', scan.fake && 'placeholder/fake-data marker', scan.secret && 'secret-like value'].filter(Boolean).join(', ')}`); }

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

      const publication = { id: pub.publicationId, at: now, contentId, action: action === 'unpublish' ? 'unpublish' : 'publish', version: pub.version };
      let next;
      if (entry) {
        if (action === 'publish' && feed.items.find(i => i.id === r.id) && r.live && r.live.revision === r.revision) return fail('FAILED', 409, 'This exact version is already live');
        next = CMS.applyToFeed(feed, entry, publication);
      } else next = CMS.removeFromFeed(feed, r.id, publication);
      const json = JSON.stringify({ $schema: './content.schema.json', ...next }, null, 2) + '\n';
      pub.feedVersionAfter = feedVersion(json);

      // Validate the candidate feed (schema + integrity + site tests) before anything is written to the repo.
      try { pub.checks = await this.withCandidate(json, c => this.checks(c)); }
      catch (e) { pub.checks = e.checks || []; return fail('FAILED', 422, e.message); }

      if (mode === 'dry-run') {
        pub.diff = unifiedDiff(raw, json).slice(0, 20000);
        Object.assign(pub, { result: 'DRY_RUN_OK', deployment: null });
        this.log.add(pub);
        log.info('dry run ok', { publicationId: pub.publicationId, contentId, action });
        return pub;
      }

      fs.writeFileSync(path.join(repo, FEED), json);
      const verb = { publish: 'publish', unpublish: 'unpublish', republish: `republish v${targetVersion} as` }[action];
      const title = `${r.language === 'ar' ? 'Arabic' : 'English'} ${CMS.TYPES[r.type].label[0]}`;
      const msg = `content: ${verb} ${title} ${CMS.editorialDate(now)} — ${r.slug}\n\nContent-Id: ${r.id}\nPublish-Version: ${pub.version}\nPublication-Id: ${pub.publicationId}\n${action === 'republish' ? `Rollback-To-Version: ${targetVersion}\n` : ''}Approved-By: ${r.audit.approvedBy || '-'}\nPublished-By: ${actor}\n`;
      try {
        await this.g('add', '--', FEED);
        await this.g('commit', '--quiet', '-m', msg, '--', FEED);
        pub.commitSha = await this.g('rev-parse', 'HEAD'); pub.deployment = 'COMMITTED';
      } catch (e) { await this.#restore(prevHead); return fail('FAILED', 500, `git commit failed: ${(e.stderr || e.message).trim()}`); }
      try { await this.g('push', '--quiet', this.cfg.remote, `HEAD:refs/heads/${this.cfg.branch}`); pub.deployment = 'PUSHED'; }
      catch (e) { const sha = pub.commitSha; await this.#restore(prevHead); pub.commitSha = null; return fail('FAILED', 502, `git push failed; local commit ${sha.slice(0, 7)} was undone: ${(e.stderr || e.message).trim()}`); }

      pub.publishedAt = now; pub.result = 'SUCCESS';
      if (action === 'unpublish') this.store.markUnpublished(r.id, pub, actor); else this.store.markPublished(r.id, { ...pub, entry }, actor);
      this.log.add(pub);
      log.info('published', { publicationId: pub.publicationId, contentId, action, version: pub.version, commit: pub.commitSha.slice(0, 12) });
      this.watchDeployment(pub.publicationId);
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

  /** Infrastructure commissioning: proves repo → fetch → push authorization → feed generation → schema → tests
      → diff, WITHOUT any editorial record, commit or push. */
  async commission({ actor }) {
    if (!actor) throw httpError(400, 'Operator name is required');
    const checks = []; const add = (id, label, ok, detail) => checks.push({ id, label, ok: !!ok, detail: detail || null });
    const repo = await this.repoState({ fetch: true });
    add('repo', 'Dedicated publishing clone present', repo.isRepo, repo.error);
    add('branch', `On ${this.cfg.branch}`, repo.onBranch, repo.branch);
    add('clean', 'Working tree clean', repo.clean);
    add('fetch', 'git fetch origin', repo.fetchOk === true, repo.error);
    add('current', 'Local clone current, no divergence', repo.isRepo && !repo.diverged && !!repo.remoteHead, repo.upToDate ? 'Up to date' : repo.diverged ? 'Diverged' : 'Behind (fast-forwardable)');
    let pushOk = false, pushDetail = null;
    try { await this.g('push', '--dry-run', '--quiet', this.cfg.remote, `HEAD:${PROBE_REF}`); pushOk = true; pushDetail = 'Push authorized (dry-run to a probe ref; nothing created)'; }
    catch (e) { pushDetail = (e.stderr || e.message || '').trim().slice(0, 300); }
    add('push', 'GitHub push authorization', pushOk, pushDetail);
    let raw = '', feed = null, diff = '';
    try { const f = this.readFeed(); raw = f.raw; feed = f.feed; add('feed', 'Current public feed parses', true, `${feed.items.length} item(s), version ${f.version}`); }
    catch (e) { add('feed', 'Current public feed parses', false, e.message); }
    if (feed) {
      // Regenerate the feed exactly as the engine would, with no editorial change: proves generation + checks.
      const json = JSON.stringify({ $schema: './content.schema.json', ...feed }, null, 2) + '\n';
      diff = raw === json ? '(no change — regeneration is byte-identical)' : unifiedDiff(raw, json).slice(0, 4000);
      try { const out = await this.withCandidate(json, c => this.checks(c)); add('tests', 'Schema, integrity and site tests on the regenerated feed', true, out.map(c => c.command).join(' ; ')); }
      catch (e) { add('tests', 'Schema, integrity and site tests on the regenerated feed', false, ((e.checks || []).find(c => !c.ok) || {}).output?.slice(-600) || e.message); }
    }
    const headAfter = repo.isRepo ? await this.g('rev-parse', 'HEAD').catch(() => null) : null;
    const cleanAfter = repo.isRepo ? !(await this.g('status', '--porcelain').catch(() => 'x')) : false;
    add('nomutation', 'No commit, no push, no file change', repo.head === headAfter && cleanAfter);
    const ok = checks.every(c => c.ok);
    const pub = { publicationId: 'pub_' + crypto.randomBytes(8).toString('hex'), action: 'commission', contentId: null, requestedAt: nowIso(), actor, mode: 'dry-run',
      result: ok ? 'COMMISSION_OK' : 'COMMISSION_FAILED', deployment: null, checks, diff, head: repo.head && repo.head.slice(0, 12), publishMode: this.mode };
    this.log.add(pub); this.audit({ action: 'COMMISSION', actor, result: pub.result, publicationId: pub.publicationId });
    return pub;
  }

  /** PUSHED → DEPLOYING → LIVE. LIVE only when the served public feed contains the version;
      DEPLOYED_UNVERIFIED when the public site cannot be read. GitHub Pages run status is recorded when readable. */
  async deploymentStatus(id) {
    const pub = this.log.get(id); if (!pub) throw httpError(404, 'Publication not found');
    if (pub.result !== 'SUCCESS' || pub.mode !== 'live' || pub.deployment === 'LIVE') return pub;
    const before = pub.deployment;
    if (this.githubRepo && pub.commitSha) {
      try {
        const r = await this.fetcher(`https://api.github.com/repos/${this.githubRepo}/actions/runs?head_sha=${pub.commitSha}&per_page=5`, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'foxrex-worker' } });
        if (r.ok) { const d = await r.json(); const run = (d.workflow_runs || []).find(w => /pages/i.test(w.name || '')); if (run) pub.pagesRun = { id: run.id, status: run.status, conclusion: run.conclusion, url: run.html_url }; }
      } catch { /* optional signal */ }
    }
    try {
      const r = await this.fetcher(`${this.cfg.publicFeedUrl}?v=${Date.now()}`, { signal: AbortSignal.timeout(10000), redirect: 'follow', headers: { 'Cache-Control': 'no-cache' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const feed = await r.json();
      const item = (feed.items || []).find(i => i.id === pub.contentId);
      const live = pub.action === 'unpublish' ? !item : !!(item && item.publishVersion >= pub.version);
      pub.deployment = live ? 'LIVE' : 'DEPLOYING';
      pub.deploymentNote = live ? null : `Pushed; the public feed does not show this version yet${pub.pagesRun ? ` (GitHub Pages run: ${pub.pagesRun.status}${pub.pagesRun.conclusion ? '/' + pub.pagesRun.conclusion : ''})` : ''}.`;
    } catch (e) {
      pub.deployment = 'DEPLOYED_UNVERIFIED';
      pub.deploymentNote = `Could not read the public feed (${e.message}); deployment is not confirmed${pub.pagesRun ? ` — GitHub Pages run ${pub.pagesRun.status}${pub.pagesRun.conclusion ? '/' + pub.pagesRun.conclusion : ''}` : ''}.`;
    }
    pub.checkedAt = new Date().toISOString();
    this.log.update(pub);
    if (pub.deployment !== before) this.audit({ action: 'DEPLOYMENT', actor: 'worker', contentId: pub.contentId, language: pub.language, version: pub.version, deployment: pub.deployment, publicationId: pub.publicationId, commitSha: pub.commitSha });
    return pub;
  }
  /** Background verification after a push: every 30 s for up to 15 minutes, until LIVE. */
  watchDeployment(id, { intervalMs = 30e3, maxMs = 15 * 60e3 } = {}) {
    const started = Date.now();
    const tick = async () => {
      this.watchers.delete(t);
      const p = await this.deploymentStatus(id).catch(() => null);
      if (p && p.deployment !== 'LIVE' && Date.now() - started < maxMs) { t = setTimeout(tick, intervalMs); t.unref?.(); this.watchers.add(t); }
    };
    let t = setTimeout(tick, intervalMs); t.unref?.(); this.watchers.add(t);
  }
  stop() { for (const t of this.watchers) clearTimeout(t); this.watchers.clear(); }

  due(now = Date.now()) { return this.store.list().filter(r => r.status === 'SCHEDULED' && r.scheduledAt && Date.parse(r.scheduledAt) <= now); }
}

function unifiedDiff(a, b) {
  const A = a.split('\n'), B = b.split('\n'); let i = 0; while (i < A.length && i < B.length && A[i] === B[i]) i++;
  let j = 0; while (j < A.length - i && j < B.length - i && A[A.length - 1 - j] === B[B.length - 1 - j]) j++;
  const ctx = 3, from = Math.max(0, i - ctx);
  return [`--- a/${FEED}`, `+++ b/${FEED}`, `@@ -${from + 1} +${from + 1} @@`, ...A.slice(from, i).map(l => ' ' + l),
    ...A.slice(i, A.length - j).map(l => '-' + l), ...B.slice(i, B.length - j).map(l => '+' + l), ...A.slice(A.length - j, A.length - j + ctx).map(l => ' ' + l)].join('\n');
}
