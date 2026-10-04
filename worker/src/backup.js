/* CMS backups — the editorial database is NOT in Git (the repository is public), so it is snapshotted
   locally: timestamped, SHA-256 checksummed, atomically written, with retention. Default location
   DATA_DIR/backups (private, git-ignored); BACKUP_DIR can point to another private disk.
   Restore: node scripts/cms-restore.mjs <backup> (worker stopped). */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWrite } from './fsx.js';

const FILES = ['records.json', 'publications.json', 'audit.jsonl'];
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export class BackupService {
  constructor({ dataDir, dir, keep = 72, minIntervalMs = 10 * 60e3 }) {
    this.cmsDir = path.join(dataDir, 'cms'); this.dir = dir || path.join(dataDir, 'backups'); this.keep = keep; this.minIntervalMs = minIntervalMs;
    this.timer = null; this.lastAt = 0; this.last = null;
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const newest = this.list()[0]; if (newest) { this.last = newest; this.lastAt = Date.parse(newest.createdAt) || 0; }
  }
  bundle() {
    const files = {};
    for (const f of FILES) { const p = path.join(this.cmsDir, f); files[f] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; }
    const body = JSON.stringify(files);
    return { format: 'foxrex-cms-backup/1', createdAt: new Date().toISOString(), sha256: sha(body), files };
  }
  /** Take a snapshot now. Returns metadata (file name, time, size) — never contents. */
  snapshot(reason = 'manual') {
    const b = this.bundle(); b.reason = reason;
    const name = `cms-${stamp(new Date(b.createdAt))}-${crypto.randomBytes(3).toString('hex')}.json`;
    const data = JSON.stringify(b);
    atomicWrite(path.join(this.dir, name), data);
    this.lastAt = Date.now(); this.last = { file: name, createdAt: b.createdAt, bytes: data.length, reason, sha256: b.sha256 };
    this.prune();
    return this.last;
  }
  /** Debounced automatic backup after CMS mutations. */
  schedule() {
    if (this.timer) return;
    const wait = Math.max(0, this.minIntervalMs - (Date.now() - this.lastAt));
    this.timer = setTimeout(() => { this.timer = null; try { this.snapshot('auto'); } catch { /* reported via status */ } }, wait);
    this.timer.unref?.();
  }
  stop() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  list() {
    return fs.readdirSync(this.dir).filter(f => /^cms-\d{8}T\d{6}Z-[0-9a-f]{6}\.json$/.test(f)).sort().reverse()
      .map(f => { const st = fs.statSync(path.join(this.dir, f)); return { file: f, createdAt: fromStamp(f), bytes: st.size }; });
  }
  prune() { for (const b of this.list().slice(this.keep)) fs.unlinkSync(path.join(this.dir, b.file)); }
}
const fromStamp = f => { const m = /^cms-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(f); return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null; };

/** Validate a backup file; throws on bad format or checksum mismatch. */
export function readBackup(file) {
  const b = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (b.format !== 'foxrex-cms-backup/1' || !b.files) throw new Error('Not a FOXREX CMS backup');
  if (sha(JSON.stringify(b.files)) !== b.sha256) throw new Error('Backup checksum mismatch — file is corrupted or was modified');
  for (const [f, v] of Object.entries(b.files)) if (v != null && f.endsWith('.json')) JSON.parse(v);
  return b;
}
/** Restore into dataDir/cms. Takes a safety snapshot of the current state first. */
export function restoreBackup(file, dataDir, { backupDir } = {}) {
  const b = readBackup(file);
  const svc = new BackupService({ dataDir, dir: backupDir });
  const safety = svc.snapshot('pre-restore');
  const cms = path.join(dataDir, 'cms');
  for (const [f, v] of Object.entries(b.files)) { const p = path.join(cms, f); if (v == null) { if (fs.existsSync(p)) fs.unlinkSync(p); } else atomicWrite(p, v); }
  return { restoredFrom: path.basename(file), createdAt: b.createdAt, safetySnapshot: safety.file };
}
