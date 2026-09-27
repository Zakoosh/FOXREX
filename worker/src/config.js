import path from "node:path";
const env = process.env;
export const CONFIG = Object.freeze({
  port: +(env.PORT || 8787),
  host: env.HOST || "127.0.0.1",
  token: env.STUDIO_WORKER_TOKEN || "",
  allowedOrigin: env.ALLOWED_ORIGIN || "",
  dataDir: path.resolve(env.DATA_DIR || "./data"),
  higgsfieldBin: env.HIGGSFIELD_BIN || "higgsfield",
  imageModels: (env.HF_IMAGE_MODELS || "nano_banana_2,gpt_image_2_5").split(",").map(s => s.trim()).filter(Boolean),
  enableVideo: env.ENABLE_VIDEO === "true",
  estimateCost: env.ESTIMATE_COST !== "false",
  cliTimeoutMs: +(env.CLI_TIMEOUT_MS || 12 * 60 * 1000)
});
