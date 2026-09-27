import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { JobStatus } from "./jobs.js";
import { assertCostSafe, DEFAULT_POLICY } from "./policy.js";
import { chooseModel } from "./models.js";
import { download, sniff } from "./providers/util.js";
import { UNAVAILABLE_CODES } from "./providers/higgsfield-cli.js";

export class Runner {
  constructor({ store, registry, config, policy = DEFAULT_POLICY }) {
    Object.assign(this, { store, registry, config, policy, busy: false, timer: null });
    this.assetsDir = path.join(config.dataDir, "assets"); this.inputsDir = path.join(config.dataDir, "inputs");
    fs.mkdirSync(this.assetsDir, { recursive: true }); fs.mkdirSync(this.inputsDir, { recursive: true });
  }
  start(ms = 1000) { this.timer = setInterval(() => this.tick(), ms); }
  stop() { clearInterval(this.timer); }
  async tick() { if (this.busy) return; const job = this.store.next(); if (!job) return; this.busy = true; try { await this.execute(job); } finally { this.busy = false; } }

  writeReferences(job) {
    return (job.input_assets || []).filter(a => a.dataUrl).map((a, i) => {
      const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(a.dataUrl);
      if (!m) throw Object.assign(new Error("Invalid reference image"), { code: "INVALID_INPUT" });
      const file = path.join(this.inputsDir, `${job.id}-ref${i}.${m[1] === "jpeg" ? "jpg" : m[1]}`);
      fs.writeFileSync(file, Buffer.from(m[2], "base64")); return file;
    });
  }

  async execute(job) {
    if (job.status !== JobStatus.QUEUED || job.submission_started_at || job.provider_job_id) return;
    const S = (status, patch = {}) => this.store.update(job.id, { status, ...patch });
    const provider = this.registry[job.provider];
    try {
      assertCostSafe(provider, this.policy); // defence in depth: router already filtered
      if (provider.manual) { S(JobStatus.MANUAL_REQUIRED, { failure_code: "MANUAL_SELECTED", failure_message: "Manual generation selected." }); return; }
      S(JobStatus.PREPARING, { started_at: new Date().toISOString() });
      const refs = this.writeReferences(job);
      const model = job.approved_model ? { id: job.approved_model, params: job.approved_model_params || {} } : chooseModel({ type: job.generation_type, aspectRatio: job.parameters.aspectRatio, refs: refs.length, preferred: this.config.imageModels });
      if (!model) throw Object.assign(new Error(`No model supports ${job.generation_type} ${job.parameters.aspectRatio} with ${refs.length} refs`), { code: "MODEL_UNAVAILABLE" });
      const limitations = [];
      if (job.character_asset_id && !refs.length) limitations.push("Character reference not attached; consistency not guaranteed.");
      const req = { prompt: job.prompt_text, aspectRatio: job.parameters.aspectRatio, referencePaths: refs };
      const before = provider.capabilities.creditsBalance ? await provider.credits() : null;
      const estimated = this.config.estimateCost && provider.capabilities.costEstimate ? await provider.estimate(model, req) : null;
      if (job.quote_id && job.estimated_cost?.credits != null && (estimated == null || estimated > job.estimated_cost.credits))
        throw Object.assign(new Error('Credit estimate changed or became unavailable. Review a new quote before submission.'), { code: 'COST_CHANGED' });
      S(JobStatus.PREPARING, { model: model.id, limitations, estimated_cost: estimated != null ? { credits: estimated * job.parameters.variations } : null, parameters: { ...job.parameters, model: model.id, modelParams: model.params } });

      const outputs = [];
      for (let v = 1; v <= job.parameters.variations; v++) {
        if (this.store.get(job.id).status === JobStatus.CANCELLED) return;
        // Durable marker precedes the charged call, including timeout/crash paths.
        S(JobStatus.SUBMITTED, { submission_started_at: new Date().toISOString() });
        const sub = job.generation_type === "video" ? await provider.generateVideo(model, req) : await provider.generateImage(model, req);
        const ids = [...this.store.get(job.id).provider_job_ids, sub.providerJobId];
        S(JobStatus.GENERATING, { provider_job_id: ids[0], provider_job_ids: ids });
        const res = await provider.waitJob(sub.providerJobId);
        if (res.status && /fail|error|nsfw|reject|cancel/.test(res.status)) throw Object.assign(new Error(`Provider job ${sub.providerJobId} ended as ${res.status}`), { code: "GENERATION_REJECTED" });
        if (!res.urls.length) throw Object.assign(new Error("Provider returned no output URL"), { code: "INVALID_OUTPUT" });
        S(JobStatus.RETRIEVING);
        for (const url of res.urls) {
          const tmp = path.join(this.assetsDir, `${crypto.randomUUID()}.tmp`);
          await download(url, tmp);
          S(JobStatus.VALIDATING);
          const kind = sniff(tmp);
          if (!kind) { fs.rmSync(tmp, { force: true }); throw Object.assign(new Error("Output is not a valid image/video file"), { code: "INVALID_OUTPUT" }); }
          const name = `${crypto.randomUUID()}.${kind.ext}`; fs.renameSync(tmp, path.join(this.assetsDir, name));
          outputs.push({ file: name, url: `/assets/${name}`, mime: kind.mime, bytes: fs.statSync(path.join(this.assetsDir, name)).size, variation: v, provider_job_id: sub.providerJobId, source_url: url });
        }
      }
      const after = before != null ? await provider.credits() : null;
      S(JobStatus.COMPLETED, { output_assets: outputs, completed_at: new Date().toISOString(),
        credits_used: before != null && after != null ? Math.max(0, before - after) : null, actual_cost: 0 });
    } catch (e) {
      const code = e.code || "PROVIDER_ERROR";
      const manual = UNAVAILABLE_CODES.has(code) || code === "PAID_API_DISABLED" || code === "NOT_CONFIGURED";
      S(manual ? JobStatus.MANUAL_REQUIRED : JobStatus.FAILED, { failure_code: code, failure_message: e.message, failed_at: new Date().toISOString() });
    }
  }
}
