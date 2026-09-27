import fs from "node:fs";
import path from "node:path";

// Load the local worker settings without requiring an additional dependency.
// Explicit process environment values take precedence over .env.
const envFile = path.resolve(process.cwd(), ".env");
const fileEnv = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) fileEnv[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}
const env = { ...fileEnv, ...process.env };

// npm installs the Higgsfield CLI as a .cmd shim on Windows. execFile cannot
// launch that shim without a shell, so use the package's native binary.
export function findWindowsHiggsfield(pathValue = "") {
  for (const dir of pathValue.split(";")) {
    if (!dir) continue;
    const shim = path.join(dir, "higgsfield.cmd");
    const binary = path.join(dir, "node_modules", "@higgsfield", "cli", "vendor", "hf.exe");
    if (fs.existsSync(shim) && fs.existsSync(binary)) return binary;
  }
  return null;
}
const configuredBin = env.HIGGSFIELD_BIN && env.HIGGSFIELD_BIN !== "higgsfield" ? env.HIGGSFIELD_BIN : null;
export const CONFIG = Object.freeze({
  port: +(env.PORT || 8787),
  host: env.HOST || "127.0.0.1",
  token: env.STUDIO_WORKER_TOKEN || "",
  allowedOrigin: env.ALLOWED_ORIGIN || "",
  dataDir: path.resolve(env.DATA_DIR || "./data"),
  higgsfieldBin: configuredBin || (process.platform === "win32" ? findWindowsHiggsfield(env.Path || env.PATH || "") : null) || "higgsfield",
  imageModels: (env.HF_IMAGE_MODELS || "nano_banana_2,gpt_image_2_5").split(",").map(s => s.trim()).filter(Boolean),
  enableVideo: env.ENABLE_VIDEO === "true",
  estimateCost: env.ESTIMATE_COST !== "false",
  cliTimeoutMs: +(env.CLI_TIMEOUT_MS || 12 * 60 * 1000)
});
