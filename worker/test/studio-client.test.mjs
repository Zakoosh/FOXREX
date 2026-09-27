/* Cost safety on the Studio side: extracts the delimited router block from foxrex-studio.html and runs it in a sandbox. */
import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path"; import vm from "node:vm"; import { fileURLToPath } from "node:url";
const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../foxrex-studio.html"), "utf8");
const block = html.slice(html.indexOf("/* @@ROUTER_START"), html.indexOf("/* @@ROUTER_END */"));
const ctx = {}; vm.createContext(ctx); vm.runInContext(block + ";this.out={CLIENT_POLICY,PROVIDER_DEFS,clientRoute,jobRequest};", ctx);
const { CLIENT_POLICY, clientRoute, jobRequest, PROVIDER_DEFS } = ctx.out;
const up = (id, costMode, extra = {}) => ({ id, costMode, implemented: true, priority: 1, capabilities: { image: true }, status: { available: true }, ...extra });

test("client policy: paid off, $0", () => { assert.equal(CLIENT_POLICY.allowPaidApi, false); assert.equal(CLIENT_POLICY.monthlyApiBudget, 0); assert.equal(CLIENT_POLICY.paidFallback, false); assert.ok(Object.isFrozen(CLIENT_POLICY)); });
test("client never routes to a paid provider even if the worker reported one available", () => {
  assert.equal(clientRoute([up("CLAUDE_API", "PAID_API"), up("HIGGSFIELD_API", "PAID_API")]).mode, "manual");
  assert.equal(clientRoute([up("HIGGSFIELD_API", "PAID_API"), up("HIGGSFIELD_CLI", "SUBSCRIPTION_CREDITS", { priority: 2 })]).provider, "HIGGSFIELD_CLI");
});
test("worker offline / no providers → manual", () => { assert.equal(clientRoute(null).mode, "manual"); assert.equal(clientRoute([up("HIGGSFIELD_CLI", "SUBSCRIPTION_CREDITS", { status: { available: false } })]).mode, "manual"); });
test("job requests never name a paid provider", () => {
  const r = jobRequest({ prompt: "p", aspectRatio: "4:5", variations: 9 }); assert.equal(r.provider, undefined); assert.equal(r.variations, 3);
  assert.equal(jobRequest({ prompt: "p", aspectRatio: "4:5", manual: true }).provider, "MANUAL_CLAUDE");
  assert.ok(!/fetch\(|XMLHttpRequest|anthropic|api\.higgsfield/.test(block), "router block has no network code");
});
test("paid providers have no priority in the UI", () => { for (const p of PROVIDER_DEFS.filter(p => p.costMode === "PAID_API")) assert.equal(p.priority, null); });
test("Studio contains no calls to paid endpoints", () => { assert.ok(!/api\.anthropic\.com|cloud\.higgsfield|platform\.higgsfield/.test(html)); });
