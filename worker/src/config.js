import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOST_MEM_FILE } from "./guard.js";

// Load the local worker settings without requiring an additional dependency.
// Explicit process environment values take precedence over .env.
const workerDir = fileURLToPath(new URL('../', import.meta.url));
const envFile = path.join(workerDir, '.env');
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
  creativeProvider: env.CREATIVE_PROVIDER || 'disabled',
  creativeModel: env.CREATIVE_MODEL || '',
  creativeUrl: env.CREATIVE_URL || 'http://127.0.0.1:11434',
  port: +(env.PORT || 8787),
  host: env.HOST || "127.0.0.1",
  token: env.STUDIO_WORKER_TOKEN || "",
  allowedOrigin: env.ALLOWED_ORIGIN || "",
  dataDir: path.resolve(workerDir, env.DATA_DIR || "./data"),
  higgsfieldBin: configuredBin || (process.platform === "win32" ? findWindowsHiggsfield(env.Path || env.PATH || "") : null) || "higgsfield",
  imageModels: (env.HF_IMAGE_MODELS || "nano_banana_2,gpt_image_2_5").split(",").map(s => s.trim()).filter(Boolean),
  enableVideo: env.ENABLE_VIDEO === "true",
  estimateCost: env.ESTIMATE_COST !== "false",
  cliTimeoutMs: +(env.CLI_TIMEOUT_MS || 12 * 60 * 1000),
  // FIONERA control plane resource guard (D45). Always on for the running worker; no env switch disables it.
  // The API is used automatically once the private token file exists; until then the SRE host file decides.
  controlUrl: env.FIONERA_CONTROL_URL || "https://fionera.net",
  controlTokenFile: env.FIONERA_CONTROL_TOKEN_FILE || path.join(os.homedir(), ".fionera-control", "foxrex-studio.token"),
  hostMemFile: env.FIONERA_HOST_MEM_FILE || DEFAULT_HOST_MEM_FILE
});
