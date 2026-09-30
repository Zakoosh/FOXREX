/* Append-only, hash-chained audit journal (DATA_DIR/cms/audit.jsonl).
   Every CMS and publication action appends one line: seq, time, action, actor, content id, language,
   version, result, commit, deployment — never content bodies or secrets. Each line carries the SHA-256
   of the previous line, so a silent edit or deletion is detected by verify(). */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const AUDIT_ACTIONS = ['CREATE', 'EDIT', 'SUBMIT', 'APPROVE', 'REJECT', 'SCHEDULE', 'UNSCHEDULE', 'PUBLISH', 'UNPUBLISH', 'REPUBLISH', 'ARCHIVE', 'RESTORE',
  'START', 'TRANSLATE', 'DUPLICATE', 'DEPLOYMENT', 'SCHEDULE_MISSED', 'SCHEDULE_EXPIRED', 'SCHEDULE_SKIPPED', 'COMMISSION', 'BACKUP'];
const FIELDS = ['action', 'actor', 'contentId', 'language', 'contentType', 'version', 'revision', 'result', 'commitSha', 'deployment', 'publicationId', 'from', 'to', 'note'];
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

export class AuditJournal {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'cms', 'audit.jsonl'); fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const lines = fs.existsSync(this.file) ? fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean) : [];
    const last = lines.length ? JSON.parse(lines[lines.length - 1]) : null;
    this.seq = last ? last.seq : 0; this.prev = last ? last.hash : '0'.repeat(64);
  }
  append(event) {
    if (!AUDIT_ACTIONS.includes(event.action)) throw new Error(`Unknown audit action ${event.action}`);
    const rec = { seq: this.seq + 1, at: new Date().toISOString() };
    for (const k of FIELDS) if (event[k] != null && event[k] !== '') rec[k] = typeof event[k] === 'string' ? event[k].slice(0, 200) : event[k];
    rec.prev = this.prev;
    rec.hash = sha(JSON.stringify(rec));
    const fd = fs.openSync(this.file, 'a', 0o600);
    try { fs.writeSync(fd, JSON.stringify(rec) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    this.seq = rec.seq; this.prev = rec.hash;
    return rec;
  }
  read(limit = 500, filter = {}) {
    if (!fs.existsSync(this.file)) return [];
    return fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
      .filter(e => (!filter.contentId || e.contentId === filter.contentId) && (!filter.action || e.action === filter.action)).slice(-limit).reverse();
  }
  /** Recompute the chain. Returns { ok, entries, brokenAt }. */
  verify() {
    if (!fs.existsSync(this.file)) return { ok: true, entries: 0 };
    let prev = '0'.repeat(64), n = 0;
    for (const line of fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean)) {
      n++;
      let rec; try { rec = JSON.parse(line); } catch { return { ok: false, entries: n, brokenAt: n, reason: 'unparseable line' }; }
      const { hash, ...body } = rec;
      if (rec.prev !== prev || sha(JSON.stringify(body)) !== hash || rec.seq !== n) return { ok: false, entries: n, brokenAt: n, reason: 'hash chain mismatch' };
      prev = hash;
    }
    return { ok: true, entries: n };
  }
}
