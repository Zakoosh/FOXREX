import { execFile } from "node:child_process";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

/** Run a binary without a shell (no injection surface). Never throws; returns {code, stdout, stderr}. */
export function run(bin, args, { timeoutMs = 600000, env } = {}) {
  return new Promise(resolve => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      if (err && err.code === "ENOENT") return resolve({ code: -1, stdout: "", stderr: "ENOENT", notFound: true });
      if (err && err.killed) return resolve({ code: -2, stdout: stdout || "", stderr: (stderr || "") + "\nTIMEOUT", timedOut: true });
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

export function parseJson(text) {
  const t = (text || "").trim(); if (!t) return null;
  try { return JSON.parse(t); } catch {}
  // Some CLIs print progress lines before JSON: take the last JSON-looking block.
  const i = Math.max(t.lastIndexOf("\n{"), t.lastIndexOf("\n["));
  if (i >= 0) { try { return JSON.parse(t.slice(i + 1)); } catch {} }
  return null;
}

/** Defensive readers: the CLI's JSON schema is not formally documented, so read common field names. */
export const pickId = o => !o ? null : Array.isArray(o) ? pickId(o[0]) :
  o.id || o.job_id || o.jobId || (o.job && pickId(o.job)) || (o.jobs && pickId(o.jobs)) || (o.data && pickId(o.data)) || null;
export const pickStatus = o => { if (!o) return null; if (Array.isArray(o)) return pickStatus(o[0]);
  const s = o.status || o.state || (o.job && o.job.status) || (o.data && o.data.status); return s ? String(s).toLowerCase() : null; };
export function pickUrls(o, out = new Set()) {
  if (!o) return [...out];
  if (typeof o === "string") { if (/^(https?|file):\/\//.test(o) && /\.(png|jpe?g|webp|mp4|mov|webm)(\?|$)/i.test(o)) out.add(o); return [...out]; }
  if (Array.isArray(o)) { o.forEach(x => pickUrls(x, out)); return [...out]; }
  if (typeof o === "object") for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string" && /^(result_url|url|output_url|image_url|video_url|raw_url)$/i.test(k) && /^(https?|file):\/\//.test(v)) out.add(v);
    else pickUrls(v, out);
  }
  return [...out];
}
export const pickCredits = o => { if (!o) return null; const v = o.credits ?? o.balance ?? o.available_credits ?? (o.account && pickCredits(o.account)) ?? (o.data && pickCredits(o.data));
  const n = Number(v); return Number.isFinite(n) ? n : null; };

export async function download(url, dest) {
  if (url.startsWith("file://")) { fs.copyFileSync(new URL(url), dest); return; }
  if (!/^https:\/\//.test(url)) throw Object.assign(new Error("Refusing non-https output URL"), { code: "INVALID_OUTPUT" });
  const res = await fetch(url);
  if (!res.ok) throw Object.assign(new Error(`Download failed: HTTP ${res.status}`), { code: "DOWNLOAD_FAILED" });
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
}

/** Validate a retrieved file by magic bytes (never trust extensions). */
export function sniff(file) {
  const b = fs.readFileSync(file).subarray(0, 16);
  if (b.length < 8) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (b[0] === 0xff && b[1] === 0xd8) return { mime: "image/jpeg", ext: "jpg" };
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (b.subarray(4, 8).toString() === "ftyp") return { mime: "video/mp4", ext: "mp4" };
  return null;
}
