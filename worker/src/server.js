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
import { download, sniff } from "./providers/util.js";

export function buildRegistry(config = CONFIG) {
  return {
    HIGGSFIELD_MCP: new HiggsfieldMcpProvider(),
    HIGGSFIELD_CLI: new HiggsfieldCliProvider({ bin: config.higgsfieldBin, timeoutMs: config.cliTimeoutMs, enableVideo: config.enableVideo }),
    MANUAL_CLAUDE: new ManualClaudeProvider(),
    HIGGSFIELD_API: HiggsfieldApiProvider(),
    CLAUDE_API: ClaudeApiProvider()
  };
}

export function createServer({ config = CONFIG, registry = buildRegistry(config), policy = DEFAULT_POLICY, autoRun = true } = {}) {
  const store = new JobStore(config.dataDir); store.recover();
  const runner = new Runner({ store, registry, config, policy }); if (autoRun) runner.start();
  let healthCache = { at: 0, data: {} };
  async function health(force) {
    if (!force && Date.now() - healthCache.at < 30000) return healthCache.data;
    const data = {}; for (const [id, p] of Object.entries(registry)) data[id] = await p.healthCheck();
    healthCache = { at: Date.now(), data }; return data;
  }
  const send = (res, code, body, headers = {}) => { res.writeHead(code, { "Content-Type": "application/json", ...cors(), ...headers }); res.end(JSON.stringify(body)); };
  const cors = () => config.allowedOrigin ? { "Access-Control-Allow-Origin": config.allowedOrigin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Vary": "Origin" } : {};
  const authed = req => !config.token || req.headers.authorization === `Bearer ${config.token}`;
  const body = req => new Promise((ok, bad) => { let d = ""; req.on("data", c => { d += c; if (d.length > 30e6) { bad(new Error("too large")); req.destroy(); } }); req.on("end", () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { bad(e); } }); });

  function validate(b) {
    const errs = [];
    if (typeof b.prompt !== "string" || !b.prompt.trim() || b.prompt.length > 20000) errs.push("prompt");
    if (!["image", "video"].includes(b.type || "image")) errs.push("type");
    if (!/^\d+:\d+$/.test(b.aspectRatio || "")) errs.push("aspectRatio");
    const v = +(b.variations || 1); if (!(v >= 1 && v <= 3)) errs.push("variations");
    if ((b.references || []).length > 4) errs.push("references");
    return errs;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x"); const p = url.pathname;
      if (req.method === "OPTIONS") { res.writeHead(204, cors()); return res.end(); }
      if (p.startsWith("/assets/")) {
        const name = p.slice(8); if (!/^[a-f0-9-]{36}\.(png|jpg|webp|mp4)$/.test(name)) return send(res, 404, { error: "not found" });
        const f = path.join(config.dataDir, "assets", name); if (!fs.existsSync(f)) return send(res, 404, { error: "not found" });
        res.writeHead(200, { "Content-Type": { png: "image/png", jpg: "image/jpeg", webp: "image/webp", mp4: "video/mp4" }[name.split(".").pop()], "Cache-Control": "private, max-age=31536000, immutable", ...cors() });
        return fs.createReadStream(f).pipe(res);
      }
      if (p === "/health") return send(res, 200, { ok: true, service: "foxrex-studio-generation-worker", version: "0.1.0" });
      if (!authed(req)) return send(res, 401, { error: "unauthorized" });
      if (p === "/policy" && req.method === "GET") return send(res, 200, policy);
      if (p === "/providers" && req.method === "GET") {
        const h = await health(url.searchParams.get("refresh") === "1");
        return send(res, 200, Object.values(registry).map(pr => ({ id: pr.id, name: pr.name, costMode: pr.costMode, implemented: pr.implemented,
          priority: policy.providerOrder.indexOf(pr.id) + 1 || null, capabilities: pr.capabilities, status: h[pr.id] })));
      }
      if (p === "/jobs" && req.method === "POST") {
        const b = await body(req); const errs = validate(b); if (errs.length) return send(res, 400, { error: "invalid", fields: errs });
        const type = b.type || "image";
        const pick = selectProvider({ registry, health: await health(), policy, type, explicit: b.provider === "MANUAL_CLAUDE" ? "MANUAL_CLAUDE" : null });
        const job = store.create({
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
        if (m[3] === "cancel" && req.method === "POST") { if (!TERMINAL.has(job.status)) store.update(job.id, { status: "CANCELLED" }); return send(res, 200, publicJob(store.get(job.id))); }
        if (m[3] === "reconcile" && req.method === "POST") {
          const uncertain = job.failure_code === "SUBMISSION_UNCONFIRMED" ||
            (job.failure_code === "PROVIDER_ERROR" && job.failure_message === "CLI did not return a job id");
          if (!uncertain || job.status !== "FAILED" || job.provider !== "HIGGSFIELD_CLI") return send(res, 409, { error: "not an uncertain CLI submission" });
          const { providerJobId } = await body(req);
          if (!/^[a-f0-9-]{36}$/i.test(providerJobId || "")) return send(res, 400, { error: "invalid provider job id" });
          // The CLI history normalizes job_type and params.prompt. Require the
          // supplied id to be the only CLI job near this Studio submission.
          const history = await registry.HIGGSFIELD_CLI.listJobs();
          const entries = Array.isArray(history) ? history : history.jobs || history.data || [];
          const startedAt = Date.parse(job.started_at || job.created_at);
          const nearby = Array.isArray(entries) ? entries.filter(x => Number.isFinite(Date.parse(x.created_at)) &&
            Math.abs(Date.parse(x.created_at) - startedAt) <= 30 * 1000) : [];
          if (!Number.isFinite(startedAt) || nearby.length !== 1 || nearby[0].id !== providerJobId)
            return send(res, 409, { error: "CLI job does not match the Studio request" });
          const remote = await registry.HIGGSFIELD_CLI.getJobStatus(providerJobId);
          if (remote.status !== "completed" || !remote.urls.length) return send(res, 409, { error: "CLI job has no completed output" });
          const outputs = [];
          for (const url of remote.urls) {
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
        }
        if (m[3] === "retry" && req.method === "POST") {
          if (job.failure_code === "SUBMISSION_UNCONFIRMED" ||
              (job.failure_code === "PROVIDER_ERROR" && job.failure_message === "CLI did not return a job id"))
            return send(res, 409, { error: "Reconcile the existing Higgsfield job before creating another" });
          healthCache.at = 0; const h = await health(true);
          const pick = selectProvider({ registry, health: h, policy, type: job.generation_type });
          const { id: _i, created_at: _c, updated_at: _u, ...prev } = job;
          const nj = store.create({ ...prev, status: "QUEUED", provider: pick.provider.id, cost_mode: pick.provider.costMode, provider_job_id: null, provider_job_ids: [],
            output_assets: [], failure_code: null, failure_message: null, failed_at: null, completed_at: null, started_at: null, retry_of: job.id, routing: pick.tried });
          if (pick.manual) store.update(nj.id, { status: "MANUAL_REQUIRED", failure_code: "NO_SUBSCRIPTION_PROVIDER", failure_message: "Automatic generation is unavailable through the current subscription provider." });
          return send(res, 201, publicJob(store.get(nj.id)));
        }
      }
      if (p === "/jobs" && req.method === "GET") return send(res, 200, store.list().filter(j => !url.searchParams.get("content_id") || j.content_id === url.searchParams.get("content_id")).map(publicJob));
      send(res, 404, { error: "not found" });
    } catch (e) { send(res, 500, { error: "internal", message: e.message }); }
  });
  return { server, store, runner, registry, health };
}
/** Never return reference image bytes or internals to the client. */
const publicJob = j => { const { input_assets, ...rest } = j; return { ...rest, input_assets: (input_assets || []).map(({ dataUrl, ...a }) => a) }; };

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  if (!CONFIG.token && !["127.0.0.1", "localhost", "::1"].includes(CONFIG.host)) { console.error("Refusing to listen on a public interface without STUDIO_WORKER_TOKEN"); process.exit(1); }
  const { server } = createServer();
  server.listen(CONFIG.port, CONFIG.host, () => console.log(`FOXREX generation worker on http://${CONFIG.host}:${CONFIG.port} — paid APIs: DISABLED`));
}
