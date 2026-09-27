/* Central generation & cost policy.
   HARD RULE: paid API providers can never run while allowPaidApi === false.
   The policy is server-side only; clients cannot change it through the HTTP API. */
export const CostMode = Object.freeze({
  SUBSCRIPTION_CREDITS: "SUBSCRIPTION_CREDITS",
  EXISTING_SUBSCRIPTION_MANUAL: "EXISTING_SUBSCRIPTION_MANUAL",
  PAID_API: "PAID_API"
});

export const DEFAULT_POLICY = Object.freeze({
  preferredCostMode: CostMode.SUBSCRIPTION_CREDITS,
  allowPaidApi: false,
  monthlyApiBudget: 0,
  paidFallback: false,
  currentApiSpend: 0,
  providerOrder: Object.freeze(["HIGGSFIELD_MCP", "HIGGSFIELD_CLI", "MANUAL_CLAUDE"])
});

export class PaidProviderDisabledError extends Error {
  constructor(id) { super(`Paid provider ${id} is disabled by policy`); this.code = "PAID_API_DISABLED"; }
}

/** Throws unless the provider is allowed to run under the policy. Called by the router AND by the runner. */
export function assertCostSafe(provider, policy = DEFAULT_POLICY) {
  if (provider.costMode === CostMode.PAID_API) {
    // Even if a future admin sets allowPaidApi=true, budget must be positive and paid adapters must be implemented.
    if (!policy.allowPaidApi || !(policy.monthlyApiBudget > 0) || policy.currentApiSpend >= policy.monthlyApiBudget)
      throw new PaidProviderDisabledError(provider.id);
  }
  return true;
}
