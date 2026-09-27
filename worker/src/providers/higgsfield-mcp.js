/* HIGGSFIELD_MCP — official hosted MCP server (https://mcp.higgsfield.ai/mcp), OAuth 2.0 + PKCE with dynamic
   client registration. Designed for MCP agent clients (Claude, Claude Code, Cursor). Running it inside this
   worker requires an MCP client with a stored OAuth refresh token; that is NOT configured or verified here,
   so the adapter reports unavailable and the router moves on to HIGGSFIELD_CLI. */
import { CostMode } from "../policy.js";
import { ProviderError } from "./higgsfield-cli.js";
export class HiggsfieldMcpProvider {
  constructor() { this.id = "HIGGSFIELD_MCP"; this.name = "Higgsfield MCP"; this.costMode = CostMode.SUBSCRIPTION_CREDITS;
    this.implemented = false; this.capabilities = { image: true, video: true, references: true, variations: true, creditsBalance: true, costEstimate: false, cancel: false }; }
  async healthCheck() { return { available: false, code: "NOT_CONFIGURED", message: "MCP OAuth client not configured in the worker. The CLI adapter is the verified server-side path." }; }
  async generateImage() { throw new ProviderError("NOT_CONFIGURED", "HIGGSFIELD_MCP adapter not configured"); }
  async generateVideo() { throw new ProviderError("NOT_CONFIGURED", "HIGGSFIELD_MCP adapter not configured"); }
  async getJobStatus() { throw new ProviderError("NOT_CONFIGURED", "HIGGSFIELD_MCP adapter not configured"); }
  async cancelJob() { throw new ProviderError("NOT_CONFIGURED", "HIGGSFIELD_MCP adapter not configured"); }
}
