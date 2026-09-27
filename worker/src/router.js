import { DEFAULT_POLICY, CostMode, assertCostSafe } from "./policy.js";

/** Pick the provider for a request. Paid providers are never returned while the policy disables them.
    If no automated subscription provider is available, returns MANUAL_CLAUDE with a reason. */
export function selectProvider({ registry, health, policy = DEFAULT_POLICY, type = "image", explicit = null }) {
  const tried = [];
  const order = explicit ? [explicit] : policy.providerOrder;
  for (const id of order) {
    const p = registry[id]; if (!p) continue;
    if (p.costMode === CostMode.PAID_API) { try { assertCostSafe(p, policy); } catch { tried.push({ id, reason: "PAID_API_DISABLED" }); continue; } }
    if (!p.implemented) { tried.push({ id, reason: "NOT_CONFIGURED" }); continue; }
    if (!p.capabilities[type]) { tried.push({ id, reason: "CAPABILITY_MISSING" }); continue; }
    const h = health[id]; if (!h || !h.available) { tried.push({ id, reason: h?.code || "UNAVAILABLE" }); continue; }
    return { provider: p, tried, manual: !!p.manual };
  }
  return { provider: registry.MANUAL_CLAUDE, tried, manual: true };
}
