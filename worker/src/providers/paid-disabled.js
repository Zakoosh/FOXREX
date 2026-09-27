/* Architecture placeholders for paid APIs. DELIBERATELY contain no network code and no credentials handling.
   Every operation throws PaidProviderDisabledError. Enabling a paid provider later requires writing a real
   adapter AND an administrator changing the server-side policy (allowPaidApi + positive monthlyApiBudget). */
import { CostMode, PaidProviderDisabledError } from "../policy.js";
function disabled(id, name) {
  const fail = async () => { throw new PaidProviderDisabledError(id); };
  return Object.freeze({ id, name, costMode: CostMode.PAID_API, implemented: false, capabilities: Object.freeze({ image: false, video: false }),
    healthCheck: async () => ({ available: false, code: "PAID_API_DISABLED", message: "Disabled by policy" }),
    generateImage: fail, generateVideo: fail, getJobStatus: fail, waitJob: fail, cancelJob: fail, estimate: fail, credits: fail });
}
export const HiggsfieldApiProvider = () => disabled("HIGGSFIELD_API", "Higgsfield API (paid)");
export const ClaudeApiProvider = () => disabled("CLAUDE_API", "Claude API (paid)");
