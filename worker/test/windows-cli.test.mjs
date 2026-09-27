import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findWindowsHiggsfield } from "../src/config.js";

test("Windows npm shim resolves to the native Higgsfield executable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foxrex-cli-"));
  try {
    const binary = path.join(dir, "node_modules", "@higgsfield", "cli", "vendor", "hf.exe");
    fs.mkdirSync(path.dirname(binary), { recursive: true });
    fs.writeFileSync(path.join(dir, "higgsfield.cmd"), "shim");
    fs.writeFileSync(binary, "exe");
    assert.equal(findWindowsHiggsfield(`missing;${dir}`), binary);
    fs.unlinkSync(binary);
    assert.equal(findWindowsHiggsfield(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
