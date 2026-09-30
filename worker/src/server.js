/* FOXREX Studio generation worker — HTTP API. Run behind the FOXREX backend (same-origin proxy) in production. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { CONFIG } from "./config.js";
import { DEFAULT_POLICY } from "./policy.js";
import { JobStore, TERMINAL } from "./jobs.js";
import { Runner } from "./runner.js";
import { selectProvider } from "./router.js";
import { HiggsfieldCliProvider } from "./providers/higgsfield-cli.js";
import { HiggsfieldMcpProvider } from "./providers/higgsfield-mcp.js";
import { ManualClaudeProvider } from "./providers/manual-claude.js";
import { HiggsfieldApiProvider, ClaudeApiProvider } from "./providers/paid-disabled.js";
import { download, sniff, pickUrls } from "./providers/util.js";
import { CreativeService, validateCreativeRequest, validateOutput, validateBrief } from './creative.js';
import { chooseModel } from './models.js';

export function buildRegistry(config = CONFIG) {
  return {
    HIGGSFIELD_MCP: new HiggsfieldMcpProvider(),
    HIGGSFIELD_CLI: new HiggsfieldCliProvider({ bin: config.higgsfieldBin, timeoutMs: config.cliTimeoutMs, enableVideo: config.enableVideo }),
    MANUAL_CLAUDE: new ManualClaudeProvider(),
    HIGGSFIELD_API: HiggsfieldApiProvider(),
    CLAUDE_API: ClaudeApiProvider()
  };
}

export function createServer({ config = CONFIG, registry = buildRegistry(config), policy = DEFAULT_POLICY, autoRun = true, creativeProvider } = {}) {
  const store = new JobStore(config.dataDir); store.recover();
  const creative = new CreativeService(config, creativeProvider);
  const reconciling = new Set();
  const blockingJob = contentId => contentId && Object.values(store.jobs).find(j => j.content_id === contentId && j.status !== 'COMPLETED' && !j.reconciled_no_output &&
    (!TERMINAL.has(j.status) || j.submission_started_at || j.provider_job_id || ['SUBMISSION_UNCONFIRMED', 'WORKER_RESTARTED'].includes(j.failure_code) || j.failure_message === 'CLI did not return a job id'));
  const runner = new Runner({ store, registry, config, policy }); if (autoRun) runner.start();
  let healthCache = { at: 0, data: {} };
  async function health(force) {
    if (!force && Date.now() - healthCache.at < 30000) return healthCache.data;
    const data = {}; for (const [id, p] of Object.entries(registry)) data[id] = await p.healthCheck();
    healthCache = { at: Date.now(), data }; return data;
  }
  const send = (res, code, body, headers = {}) => { res.writeHead(code, { "Content-Type": "application/json", ...cors(res.fxOrigin), ...headers }); res.end(JSON.stringify(body)); };
  // ALLOWED_ORIGIN may list several exact origins, comma-separated (e.g. https://foxrex.co,https://zakoosh.github.io).
  const origins = String(config.allowedOrigin || "").split(",").map(o => o.trim().replace(/\/+$/, "")).filter(Boolean);
  const cors = origin => {
    if (!origins.length) return {};
    const allow = origins.length === 1 ? origins[0] : origins.includes(origin) ? origin : null;
    return allow ? { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Vary": "Origin" } : { "Vary": "Origin" };
  };
  const authed = req => !config.token || req.headers.authorization === `Bearer ${config.token}`;
  const body = req => new Promise((ok, bad) => { let d = ""; req.on("data", c => { d += c; if (d.length > 30e6) { bad(new Error("too large")); req.destroy(); } }); req.on("end", () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { bad(e); } }); });

  function validate(b) {
    const errs = [];
    if (typeof b.prompt !== "string" || !b.prompt.trim() || b.prompt.length > 20000) errs.push("prompt");
    if (!["image", "video"].includes(b.type || "image")) errs.push("type");
    if (!/^\d+:\d+$/.test(b.aspectRatio || "")) errs.push("aspectRatio");
    const v = +(b.variations || 1); if (!Number.isInteger(v) || !(v >= 1 && v <= 3)) errs.push("variations");
    if (!Array.isArray(b.references || []) || (b.references || []).length > 4 || (b.references || []).some(r => !r || typeof r !== 'object' || (r.dataUrl && !/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(r.dataUrl)))) errs.push("references");
    return errs;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x"); const p = url.pathname; res.fxOrigin = req.headers.origin;
      if (req.method === "OPTIONS") { res.writeHead(204, cors(res.fxOrigin)); return res.end(); }
      if (p.startsWith("/assets/")) {
        const name = p.slice(8); if (!/^[a-f0-9-]{36}\.(png|jpg|webp|mp4)$/.test(name)) return send(res, 404, { error: "not found" });
        const f = path.join(config.dataDir, "assets", name); if (!fs.existsSync(f)) return send(res, 404, { error: "not found" });
        res.writeHead(200, { "Content-Type": { png: "image/png", jpg: "image/jpeg", webp: "image/webp", mp4: "video/mp4" }[name.split(".").pop()], "Cache-Control": "private, max-age=31536000, immutable", ...cors(res.fxOrigin) });
        return fs.createReadStream(f).pipe(res);
      }
      if (p === '/' && req.method === 'GET') return send(res, 200, { service: 'foxrex-studio-generation-worker', message: 'This port is the worker API, not the Studio UI.', health: '/health', studio: 'https://foxrex.co/studio/' });
      if (p === "/health") return send(res, 200, { ok: true, service: "foxrex-studio-generation-worker", version: "0.1.0", allowedOrigin: config.allowedOrigin, authenticationRequired: !!config.token });
      if (!authed(req)) return send(res, 401, { error: "unauthorized" });
      if (p === '/creative/status' && req.method === 'GET') return send(res, 200, await creative.status());
      if (p === '/creative/revisions' && req.method === 'GET') return send(res, 200, creative.data.revisions.filter(r => r.contentId === url.searchParams.get('contentId')));
      if (/^\/creative\/(ideate|plan|critique)$/.test(p) && req.method === 'POST') return send(res, 200, await creative.run(p.split('/')[2], await body(req)));
      if (p === '/creative/validate' && req.method === 'POST') {
        const b = await body(req);
        if (b.stage === 'facts') validateBrief({ ...b.input.brief, facts: b.output });
        else if (['ideate', 'plan'].includes(b.stage)) validateOutput(b.stage, b.output, b.input);
        else return send(res, 400, { error: 'Unknown validation stage' });
        return send(res, 200, { valid: true });
      }
      if (p === '/jobs/quote' && req.method === 'POST') {
        const b = await body(req), errs = validate(b);
        if (errs.length) return send(res, 400, { error: 'invalid', fields: errs });
        if (b.type === 'video') return send(res, 400, { error: 'Only image reference frames are verified; rendered video is unavailable' });
        if (b.creative) validateCreativeRequest(b.creative);
        const blocked = blockingJob(b.contentId);
        if (blocked) return send(res, 409, { error: `Existing job ${blocked.id} must finish or be reconciled before another request`, jobId: blocked.id });
        const pick = selectProvider({ registry, health: await health(), policy, type: 'image', explicit: b.provider === 'MANUAL_CLAUDE' ? b.provider : null });
        const model = chooseModel({ type: 'image', aspectRatio: b.aspectRatio, refs: (b.references || []).length, preferred: config.imageModels });
        if (!model) return send(res, 422, { error: 'Unsupported image specification' });
        // Write references for accurate read-only estimation, never call generate here.
        const id = crypto.randomUUID();
        const refs = runner.writeReferences({ id, input_assets: b.references || [] });
        let credits = null;
        try { if (config.estimateCost && pick.provider.capabilities.costEstimate) credits = await pick.provider.estimate(model, { prompt: b.prompt, aspectRatio: b.aspectRatio, referencePaths: refs }); }
        finally { for (const f of refs) fs.rmSync(f, { force: true }); }
        const request = { ...b, type: 'image', variations: 1 };
        const q = { id, request, provider: pick.provider.id, routing: pick.tried, model: model.id, modelParams: model.params, costMode: pick.provider.costMode, estimatedCredits: credits, createdAt: Date.now(), expiresAt: Date.now() + 15 * 60000 };
        creative.data.quotes[id] = q; creative.persist();
        return send(res, 200, { ...q, request: { ...request, references: (request.references || []).map(({ dataUrl, ...r }) => r) } });
      }
      if (p === "/policy" && req.method === "GET") return send(res, 200, policy);
      if (p === "/providers" && req.method === "GET") {
        const h = await health(url.searchParams.get("refresh") === "1");
        return send(res, 200, Object.values(registry).map(pr => ({ id: pr.id, name: pr.name, costMode: pr.costMode, implemented: pr.implemented,
          priority: policy.providerOrder.indexOf(pr.id) + 1 || null, capabilities: pr.capabilities, status: h[pr.id] })));
      }
      if (p === "/jobs" && req.method === "POST") {
        const submitted = await body(req);
        const quote = creative.data.quotes[submitted.quoteId];
        if (!quote || submitted.approved !== true) return send(res, 409, { error: 'Preview /jobs/quote and approve the exact request first' });
        const prior = Object.values(store.jobs).find(j => j.quote_id === quote.id);
        if (prior) return send(res, 200, publicJob(prior));
        if (Date.now() > quote.expiresAt) return send(res, 409, { error: 'Quote expired; preview again' });
        const b = quote.request; const errs = validate(b); if (errs.length) return send(res, 400, { error: "invalid", fields: errs });
        const blocked = blockingJob(b.contentId);
        if (blocked) return send(res, 409, { error: `Existing job ${blocked.id} must finish or be reconciled first`, jobId: blocked.id });
        const type = b.type || "image";
        // No await between idempotency lookup and durable creation. Pin the reviewed provider/model.
        const pick = { provider: registry[quote.provider], manual: !!registry[quote.provider]?.manual, tried: quote.routing };
        const job = store.create({
          quote_id: quote.id, approved_request: { ...b, references: (b.references || []).map(({ dataUrl, ...r }) => r) }, creative: b.creative || null,
          approved_model: quote.model, approved_model_params: quote.modelParams, estimated_cost: quote.estimatedCredits === null ? null : { credits: quote.estimatedCredits }, approved_at: new Date().toISOString(),
          content_id: b.contentId || null, provider: pick.provider.id, generation_type: type, prompt_version_id: b.promptVersionId || null, prompt_text: b.prompt,
          character_asset_id: b.characterAssetId || null, cost_mode: pick.provider.costMode,
          input_assets: (b.references || []).map(r => ({ asset_id: r.assetId, role: r.role || "character_reference", dataUrl: r.dataUrl })),
          parameters: { aspectRatio: b.aspectRatio, variations: +(b.variations || 1), format: b.format || null, contentType: b.contentType || null },
          routing: pick.tried
        });
        if (pick.manual) store.update(job.id, { status: "MANUAL_REQUIRED", failure_code: "NO_SUBSCRIPTION_PROVIDER",
          failure_message: "Automatic generation is unavailable through the current subscription provider." });
        return send(res, 201, publicJob(store.get(job.id)));
      }
      const m = /^\/jobs\/([a-f0-9-]{36})(\/(cancel|retry|reconcile))?$/.exec(p);
      if (m) {
        const job = store.get(m[1]); if (!job) return send(res, 404, { error: "not found" });
        if (!m[3] && req.method === "GET") return send(res, 200, publicJob(job));
        if (m[3] === "cancel" && req.method === "POST") {
          if (job.status !== 'QUEUED' && job.status !== 'CANCELLED') return send(res, 409, { error: 'Only queued jobs can be cancelled. A running CLI job may already consume credits.' });
          store.update(job.id, { status: 'CANCELLED' }); return send(res, 200, publicJob(store.get(job.id)));
        }
        if (m[3] === "reconcile" && req.method === "POST") {
          if (job.status === 'COMPLETED') return send(res, 200, publicJob(job));
          const uncertain = job.failure_code === "SUBMISSION_UNCONFIRMED" ||
            job.submission_started_at || job.provider_job_id || job.failure_code === 'WORKER_RESTARTED' ||
            (job.failure_code === "PROVIDER_ERROR" && job.failure_message === "CLI did not return a job id");
          if (!uncertain || !['FAILED', 'MANUAL_REQUIRED', 'CANCELLED'].includes(job.status) || job.provider !== "HIGGSFIELD_CLI") return send(res, 409, { error: "not an uncertain CLI submission" });
          const { providerJobId } = await body(req);
          if (!/^[a-f0-9-]{36}$/i.test(providerJobId || "")) return send(res, 400, { error: "invalid provider job id" });
          if (reconciling.has(providerJobId) || reconciling.has(job.id)) return send(res, 409, { error: 'Reconciliation in progress' });
          reconciling.add(providerJobId); reconciling.add(job.id);
          try {
          // The CLI history normalizes job_type and params.prompt. Require the
          // supplied id to be the only CLI job near this Studio submission.
          const history = await registry.HIGGSFIELD_CLI.listJobs();
          const entries = Array.isArray(history) ? history : history.jobs || history.data || [];
          const startedAt = Date.parse(job.submission_started_at || job.started_at || job.created_at);
          const nearby = Array.isArray(entries) ? entries.filter(x => Number.isFinite(Date.parse(x.created_at)) &&
            Math.abs(Date.parse(x.created_at) - startedAt) <= 30 * 1000) : [];
          const knownId = (job.provider_job_ids || []).includes(providerJobId) || job.provider_job_id === providerJobId;
          if (!knownId && (!Number.isFinite(startedAt) || nearby.length !== 1 || nearby[0].id !== providerJobId))
            return send(res, 409, { error: "CLI job does not match the Studio request" });
          if (Object.values(store.jobs).some(j => j.id !== job.id && (j.provider_job_ids || []).includes(providerJobId))) return send(res, 409, { error: 'Provider job is already linked' });
          // The list response already includes result_url on CLI v1.1.26.
          // Fall back to get only if that read-only history entry lacks a URL.
          const listed = entries.find(x => x.id === providerJobId) || {};
          let urls = String(listed.status).toLowerCase() === "completed" ? pickUrls({ result_url: listed.result_url }) : [];
          if (!urls.length) {
            const remote = await registry.HIGGSFIELD_CLI.getJobStatus(providerJobId);
            if (remote.status === "completed") urls = remote.urls;
            else if (['failed', 'cancelled', 'rejected'].includes(remote.status)) return send(res, 200, publicJob(store.update(job.id, {
              status: 'FAILED', reconciled_no_output: true, provider_job_id: providerJobId, provider_job_ids: [providerJobId], reconciled_at: new Date().toISOString(), failure_message: 'Provider confirmed no completed output. A new generation needs a new approved quote.'
            })));
          }
          if (!urls.length) return send(res, 409, { error: "CLI job has no completed output" });
          const outputs = [];
          for (const url of urls) {
            const temporary = path.join(runner.assetsDir, `${crypto.randomUUID()}.tmp`);
            try {
              await download(url, temporary);
              const kind = sniff(temporary);
              if (!kind || !kind.mime.startsWith("image/")) return send(res, 409, { error: "CLI output is not a valid image" });
              const name = `${crypto.randomUUID()}.${kind.ext}`;
              fs.renameSync(temporary, path.join(runner.assetsDir, name));
              outputs.push({ file: name, url: `/assets/${name}`, mime: kind.mime, bytes: fs.statSync(path.join(runner.assetsDir, name)).size,
                variation: 1, provider_job_id: providerJobId, source_url: url });
            } finally { fs.rmSync(temporary, { force: true }); }
          }
          const repaired = store.update(job.id, { status: "COMPLETED", provider_job_id: providerJobId, provider_job_ids: [providerJobId],
            output_assets: outputs, completed_at: new Date().toISOString(), failure_code: null, failure_message: null,
            reconciled_at: new Date().toISOString(), reconciliation_method: "unique_job_within_30_seconds" });
          return send(res, 200, publicJob(repaired));
          } finally { reconciling.delete(providerJobId); reconciling.delete(job.id); }
        }
        if (m[3] === "retry" && req.method === "POST") {
          if (!['FAILED', 'MANUAL_REQUIRED'].includes(job.status) || job.submission_started_at || job.provider_job_id)
            return send(res, 409, { error: 'Reconcile the existing submission. A new generation requires a new reviewed quote.' });
          if (job.failure_code === "SUBMISSION_UNCONFIRMED" ||
              (job.failure_code === "PROVIDER_ERROR" && job.failure_message === "CLI did not return a job id"))
            return send(res, 409, { error: "Reconcile the existing Higgsfield job before creating another" });
          return send(res, 409, { error: 'Preview and approve a new quote before retrying' });
        }
      }
      if (p === "/jobs" && req.method === "GET") return send(res, 200, store.list(Infinity).filter(j => (!url.searchParams.get("content_id") || j.content_id === url.searchParams.get("content_id")) && (!url.searchParams.get('quote_id') || j.quote_id === url.searchParams.get('quote_id'))).map(publicJob));
      send(res, 404, { error: "not found" });
    } catch (e) { send(res, e.status || 500, { error: e.status ? e.message : 'internal', message: e.message }); }
  });
  return { server, store, runner, registry, health, creative };
}
/** Never return reference image bytes or internals to the client. */
const publicJob = j => { const { input_assets, ...rest } = j; return { ...rest, input_assets: (input_assets || []).map(({ dataUrl, ...a }) => a) }; };

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  if (!CONFIG.token && !["127.0.0.1", "localhost", "::1"].includes(CONFIG.host)) { console.error("Refusing to listen on a public interface without STUDIO_WORKER_TOKEN"); process.exit(1); }
  const { server } = createServer();
  server.listen(CONFIG.port, CONFIG.host, () => console.log(`FOXREX generation worker on http://${CONFIG.host}:${CONFIG.port} — paid APIs: DISABLED`));
}
