/* HARD REQUIREMENT: with allowPaidApi=false there is no code path that creates paid provider usage. */
import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { DEFAULT_POLICY, assertCostSafe, CostMode } from "../src/policy.js";
import { selectProvider } from "../src/router.js";
import { buildRegistry } from "../src/server.js";
import { HiggsfieldApiProvider, ClaudeApiProvider } from "../src/providers/paid-disabled.js";
const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src");

test("default policy: paid off, budget $0, no paid fallback, paid not in provider order", () => {
  assert.equal(DEFAULT_POLICY.allowPaidApi, false); assert.equal(DEFAULT_POLICY.monthlyApiBudget, 0); assert.equal(DEFAULT_POLICY.paidFallback, false);
  assert.ok(!DEFAULT_POLICY.providerOrder.includes("HIGGSFIELD_API")); assert.ok(!DEFAULT_POLICY.providerOrder.includes("CLAUDE_API"));
  assert.ok(Object.isFrozen(DEFAULT_POLICY));
});
test("assertCostSafe rejects paid providers under default policy and even with allowPaidApi but $0 budget", () => {
  for (const p of [HiggsfieldApiProvider(), ClaudeApiProvider()]) {
    assert.throws(() => assertCostSafe(p), /disabled/);
    assert.throws(() => assertCostSafe(p, { ...DEFAULT_POLICY, allowPaidApi: true, monthlyApiBudget: 0 }), /disabled/);
  }
});
test("paid adapters throw on every operation", async () => {
  for (const p of [HiggsfieldApiProvider(), ClaudeApiProvider()]) {
    for (const fn of ["generateImage", "generateVideo", "getJobStatus", "waitJob", "cancelJob", "estimate", "credits"]) await assert.rejects(p[fn](), { code: "PAID_API_DISABLED" });
    assert.equal((await p.healthCheck()).available, false);
  }
});
test("paid adapter source contains no network code", () => {
  const code = fs.readFileSync(path.join(src, "providers/paid-disabled.js"), "utf8");
  for (const bad of ["fetch(", "http", "axios", "execFile", "spawn", "process.env"]) assert.ok(!code.includes(bad), `paid-disabled.js must not contain ${bad}`);
});
test("router never selects a paid provider, even when explicitly requested and reported healthy", () => {
  const registry = buildRegistry({ higgsfieldBin: "x", cliTimeoutMs: 1000, enableVideo: false });
  const allHealthy = Object.fromEntries(Object.keys(registry).map(k => [k, { available: true }]));
  for (const explicit of [null, "HIGGSFIELD_API", "CLAUDE_API"]) {
    const { provider } = selectProvider({ registry, health: allHealthy, explicit });
    assert.notEqual(provider.costMode, CostMode.PAID_API);
  }
  const hacked = { ...DEFAULT_POLICY, providerOrder: ["CLAUDE_API", "HIGGSFIELD_API"] };
  assert.equal(selectProvider({ registry, health: allHealthy, policy: hacked }).provider.id, "MANUAL_CLAUDE");
});
test("when subscription providers are down the router falls back to MANUAL, not paid", () => {
  const registry = buildRegistry({ higgsfieldBin: "x", cliTimeoutMs: 1000, enableVideo: false });
  const health = { HIGGSFIELD_MCP: { available: false }, HIGGSFIELD_CLI: { available: false, code: "AUTH_EXPIRED" }, MANUAL_CLAUDE: { available: true }, HIGGSFIELD_API: { available: true }, CLAUDE_API: { available: true } };
  const r = selectProvider({ registry, health }); assert.equal(r.provider.id, "MANUAL_CLAUDE"); assert.equal(r.manual, true);
});
