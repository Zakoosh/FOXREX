/* Structured, secret-safe logging. One JSON object per line on stdout (captured by systemd-journald /
   launchd / Task Scheduler wrappers). Optional LOG_FILE with size-based rotation for hosts without a
   log manager. Keys that look secret are redacted; request logs never include headers or bodies. */
import fs from 'node:fs';

const SECRET_KEY = /authorization|token|secret|password|cookie|credential|apikey|api_key/i;
const SECRET_VALUE = /\b(Bearer\s+\S+|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,})/g;
let sink = { file: null, max: 5 << 20, keep: 5 };
export const captured = [];
let capture = false;

export function configureLogging({ file = null, maxBytes = 5 << 20, keep = 5, captureForTests = false } = {}) { sink = { file, max: maxBytes, keep }; capture = captureForTests; captured.length = 0; }

export function redact(v, depth = 0) {
  if (typeof v === 'string') return v.replace(SECRET_VALUE, '[REDACTED]');
  if (!v || typeof v !== 'object' || depth > 4) return v;
  if (Array.isArray(v)) return v.map(x => redact(x, depth + 1));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_KEY.test(k) ? '[REDACTED]' : redact(x, depth + 1)]));
}

function rotate() {
  try {
    if (!sink.file || !fs.existsSync(sink.file) || fs.statSync(sink.file).size < sink.max) return;
    for (let i = sink.keep - 1; i >= 1; i--) if (fs.existsSync(`${sink.file}.${i}`)) fs.renameSync(`${sink.file}.${i}`, `${sink.file}.${i + 1}`);
    fs.renameSync(sink.file, `${sink.file}.1`);
    if (fs.existsSync(`${sink.file}.${sink.keep + 1}`)) fs.unlinkSync(`${sink.file}.${sink.keep + 1}`);
  } catch { /* logging must never crash the worker */ }
}

export function log(level, component, msg, fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, component, msg, ...redact(fields) });
  if (capture) { captured.push(line); return; }
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
  if (sink.file) { rotate(); try { fs.appendFileSync(sink.file, line + '\n', { mode: 0o600 }); } catch { /* ignore */ } }
}
export const logger = component => ({
  info: (m, f) => log('info', component, m, f), warn: (m, f) => log('warn', component, m, f), error: (m, f) => log('error', component, m, f)
});
