/* Persistent generation jobs (JSON file store, atomic writes). Swap for Postgres table
   `studio_generation_jobs` when the FOXREX backend is available — the shape is identical. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const JobStatus = Object.freeze({
  QUEUED: "QUEUED", PREPARING: "PREPARING", SUBMITTED: "SUBMITTED", GENERATING: "GENERATING",
  RETRIEVING: "RETRIEVING", VALIDATING: "VALIDATING", COMPLETED: "COMPLETED", FAILED: "FAILED",
  CANCELLED: "CANCELLED", MANUAL_REQUIRED: "MANUAL_REQUIRED"
});
export const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "MANUAL_REQUIRED"]);

export class JobStore {
  constructor(dir) {
    this.file = path.join(dir, "jobs.json");
    fs.mkdirSync(dir, { recursive: true });
    this.jobs = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, "utf8")) : {};
  }
  persist() {
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.jobs, null, 2));
    fs.renameSync(tmp, this.file);
  }
  create(fields) {
    const now = new Date().toISOString();
    const job = {
      id: crypto.randomUUID(), content_id: null, provider: null, provider_job_id: null, provider_job_ids: [],
      generation_type: "image", model: null, status: JobStatus.QUEUED, prompt_version_id: null,
      character_asset_id: null, input_assets: [], output_assets: [], parameters: {}, cost_mode: null,
      estimated_cost: null, actual_cost: 0, credits_used: null, started_at: null, completed_at: null,
      failed_at: null, failure_code: null, failure_message: null, created_by: "studio", limitations: [],
      created_at: now, updated_at: now, ...fields
    };
    this.jobs[job.id] = job; this.persist(); return job;
  }
  get(id) { return this.jobs[id] || null; }
  update(id, patch) { const j = this.jobs[id]; if (!j) return null; Object.assign(j, patch, { updated_at: new Date().toISOString() }); this.persist(); return j; }
  next() { return Object.values(this.jobs).filter(j => j.status === JobStatus.QUEUED).sort((a, b) => a.created_at.localeCompare(b.created_at))[0] || null; }
  list(limit = 50) { return Object.values(this.jobs).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit); }
  /** On restart, jobs interrupted mid-flight must not stay "GENERATING" forever. */
  recover() { for (const j of Object.values(this.jobs)) if (!TERMINAL.has(j.status) && j.status !== "QUEUED")
    Object.assign(j, { status: "FAILED", failure_code: "WORKER_RESTARTED", failure_message: "Worker restarted during the job. Retry it.", failed_at: new Date().toISOString() }); this.persist(); }
}
