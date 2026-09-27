/* HIGGSFIELD_CLI — official Higgsfield CLI (npm @higgsfield/cli). Consumes the account's plan credits.
   Auth: `higgsfield auth login` (OAuth 2.0 PKCE) run once by an operator on the worker host.
   Verified against CLI v1.1.26 help output. The JSON response schema is NOT formally documented,
   so responses are read defensively (see util.js) and must be confirmed on a live account. */
import { CostMode } from "../policy.js";
import { run, parseJson, pickId, pickStatus, pickUrls, pickCredits } from "./util.js";

const ERR = [
  [/not authenticated|session expired|unauthori[sz]ed|token.*expired|auth login/i, "AUTH_EXPIRED"],
  [/no workspace selected|workspace set/i, "WORKSPACE_NOT_SELECTED"],
  [/insufficient credits|not enough credits|out of credits|balance/i, "INSUFFICIENT_CREDITS"],
  [/unknown model|model.*(not found|unavailable)/i, "MODEL_UNAVAILABLE"],
  [/rate.?limit|too many requests|429/i, "RATE_LIMITED"],
  [/nsfw|moderation|rejected|policy violation|content.*blocked/i, "GENERATION_REJECTED"],
  [/TIMEOUT/, "GENERATION_TIMEOUT"]
];
export const UNAVAILABLE_CODES = new Set(["CLI_NOT_INSTALLED", "AUTH_EXPIRED", "WORKSPACE_NOT_SELECTED", "INSUFFICIENT_CREDITS", "PROVIDER_UNAVAILABLE", "RATE_LIMITED"]);

export class ProviderError extends Error { constructor(code, message) { super(message); this.code = code; } }

export function classify(r) {
  if (r.notFound) return new ProviderError("CLI_NOT_INSTALLED", "Higgsfield CLI not found on the worker host. Install @higgsfield/cli.");
  if (r.timedOut) return new ProviderError("GENERATION_TIMEOUT", "Higgsfield CLI timed out.");
  const text = `${r.stderr}\n${r.stdout}`;
  for (const [re, code] of ERR) if (re.test(text)) return new ProviderError(code, text.trim().split("\n").slice(0, 3).join(" "));
  return new ProviderError("PROVIDER_ERROR", text.trim().slice(0, 400) || `CLI exited with code ${r.code}`);
}

export class HiggsfieldCliProvider {
  constructor({ bin = "higgsfield", timeoutMs = 600000, enableVideo = false } = {}) {
    this.id = "HIGGSFIELD_CLI"; this.name = "Higgsfield CLI"; this.costMode = CostMode.SUBSCRIPTION_CREDITS;
    this.implemented = true; this.bin = bin; this.timeoutMs = timeoutMs;
    this.capabilities = { image: true, video: enableVideo, references: true, variations: true, creditsBalance: true, costEstimate: true, cancel: false };
  }
  async exec(args, timeoutMs) {
    const r = await run(this.bin, [...args, "--json", "--no-color"], { timeoutMs: timeoutMs || this.timeoutMs });
    if (r.code !== 0) throw classify(r);
    return parseJson(r.stdout) ?? { raw: r.stdout };
  }
  async healthCheck() {
    try { const a = await this.exec(["account", "status"], 30000);
      return { available: true, credits: pickCredits(a), plan: a.plan || a.subscription || null, checkedAt: new Date().toISOString() };
    } catch (e) { return { available: false, code: e.code || "PROVIDER_UNAVAILABLE", message: e.message, checkedAt: new Date().toISOString() }; }
  }
  async credits() { try { return pickCredits(await this.exec(["account", "status"], 30000)); } catch { return null; } }
  buildArgs(verb, model, req) {
    const a = ["generate", verb, model.id, "--prompt", req.prompt, "--aspect_ratio", req.aspectRatio];
    for (const [k, v] of Object.entries({ ...model.params, ...(req.modelParams || {}) })) a.push(`--${k}`, String(v));
    for (const ref of req.referencePaths || []) a.push(model.startImage ? "--start-image" : "--image-references", ref);
    return a;
  }
  async estimate(model, req) { try { return pickCredits(await this.exec(this.buildArgs("cost", model, req), 60000)); } catch { return null; } }
  async generateImage(model, req) {
    const submittedAt = Date.now();
    const out = await this.exec(this.buildArgs("create", model, req), 120000);
    let id = pickId(out);
    if (!id) {
      // The CLI create JSON schema is not documented. A read-only history lookup
      // recovers a unique match without issuing another billable create request.
      for (let attempt = 0; attempt < 3 && !id; attempt++) {
        try {
          const history = await this.listJobs();
          const entries = Array.isArray(history) ? history : history.jobs || history.data || [];
          // History may normalize both job_type and params.prompt. Require a
          // single new job in the tightly bounded submission window instead.
          const matches = Array.isArray(entries) ? entries.filter(x => Number.isFinite(Date.parse(x.created_at)) &&
            Date.parse(x.created_at) >= submittedAt - 5000 && Date.parse(x.created_at) <= Date.now() + 5000) : [];
          if (matches.length === 1) id = matches[0].id;
          if (matches.length > 1) break;
        } catch { /* The submission may still have succeeded; never retry create here. */ }
        if (!id && attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    if (!id) throw new ProviderError("SUBMISSION_UNCONFIRMED", "CLI accepted the request but did not return a recognized job id. Check Higgsfield history before generating again.");
    return { providerJobId: id, raw: out };
  }
  async listJobs() { return this.exec(["generate", "list"], 30000); }
  async generateVideo(model, req) {
    if (!this.capabilities.video) throw new ProviderError("VIDEO_DISABLED", "Video generation is Phase 3 and disabled (ENABLE_VIDEO=false).");
    return this.generateImage(model, req);
  }
  async waitJob(providerJobId) {
    const out = await this.exec(["generate", "wait", providerJobId, "--timeout", `${Math.round(this.timeoutMs / 60000)}m`, "--quiet"]);
    return { status: pickStatus(out), urls: pickUrls(out), raw: out };
  }
  async getJobStatus(providerJobId) { const out = await this.exec(["generate", "get", providerJobId], 30000); return { status: pickStatus(out), urls: pickUrls(out), raw: out }; }
  async cancelJob() { throw new ProviderError("NOT_SUPPORTED", "The Higgsfield CLI does not expose job cancellation."); }
}
