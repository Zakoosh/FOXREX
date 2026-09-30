import { configureLogging } from '../src/logger.js';
configureLogging({ captureForTests: true }); // keep TAP output clean; tests inspect the captured lines
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath } from "node:url";
export const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake-higgsfield.mjs");
export function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "fxw-")); }
export function cfg(dir, extra = {}) { return { port: 0, host: "127.0.0.1", token: "t0k", allowedOrigin: "", dataDir: path.join(dir, "data"),
  higgsfieldBin: FAKE, imageModels: ["nano_banana_2"], enableVideo: false, estimateCost: true, cliTimeoutMs: 20000, ...extra }; }
export const REF = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
