/* MANUAL_CLAUDE — fallback. The Studio shows Copy Prompt + Upload. No network calls, no cost. */
import { CostMode } from "../policy.js";
export class ManualClaudeProvider {
  constructor() { this.id = "MANUAL_CLAUDE"; this.name = "Manual (Claude)"; this.costMode = CostMode.EXISTING_SUBSCRIPTION_MANUAL;
    this.implemented = true; this.manual = true; this.capabilities = { image: true, video: true, references: false, variations: false, creditsBalance: false, costEstimate: false, cancel: true }; }
  async healthCheck() { return { available: true }; }
}
