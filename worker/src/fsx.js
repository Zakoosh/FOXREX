/* Durable file helpers for the worker's JSON stores. */
import fs from 'node:fs';
import path from 'node:path';

/** Write atomically and durably: tmp file → fsync → rename → fsync directory. A crash leaves the old or the new file, never half of one. */
export function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
  try { const d = fs.openSync(path.dirname(file), 'r'); try { fs.fsyncSync(d); } finally { fs.closeSync(d); } } catch { /* directory fsync unsupported on some platforms */ }
}

const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
/** One worker process per data directory: two writers would silently lose updates. */
export function acquireLock(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, '.lock');
  if (fs.existsSync(file)) {
    const pid = +fs.readFileSync(file, 'utf8').trim();
    if (pid && pid !== process.pid && alive(pid)) throw Object.assign(new Error(`Another FOXREX worker (pid ${pid}) is using this data directory. Stop it first.`), { code: 'DATA_LOCKED' });
  }
  fs.writeFileSync(file, String(process.pid));
  return () => { try { if (+fs.readFileSync(file, 'utf8') === process.pid) fs.unlinkSync(file); } catch { /* already gone */ } };
}
