#!/usr/bin/env node
/* Test double for the Higgsfield CLI. Spends nothing. Mirrors documented commands/flags of CLI v1.1.26.
   FAKE_HF_MODE: ok | auth | nocredits | reject | noworkspace   FAKE_HF_DIR: state dir */
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
const dir = process.env.FAKE_HF_DIR; const mode = process.env.FAKE_HF_MODE || "ok";
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, "calls.log"), JSON.stringify(args) + "\n");
const stateF = path.join(dir, "state.json"); const st = fs.existsSync(stateF) ? JSON.parse(fs.readFileSync(stateF)) : { credits: 100 };
const save = () => fs.writeFileSync(stateF, JSON.stringify(st));
const out = o => { process.stdout.write(JSON.stringify(o)); process.exit(0); };
const fail = (msg, code = 1) => { process.stderr.write(msg + "\n"); process.exit(code); };
if (mode === "auth") fail("Error: Not authenticated.\nHint: Run: hf auth login", 2);
if (mode === "noworkspace") fail("Error: No workspace selected.\nHint: Run: hf workspace set <workspace_id>", 4);
const [a, b] = args;
if (a === "account" && b === "status") out({ email: "owner@foxrex.test", plan: "Plus", credits: st.credits });
if (a === "generate" && b === "cost") out({ credits: 2 });
if (a === "generate" && b === "create") {
  if (mode === "nocredits") fail("Error: Insufficient credits for this generation.");
  const id = crypto.randomUUID(); st.credits -= 2;
  st.jobs = [...(st.jobs || []), { id, status: "completed", job_type: args[2],
    params: { prompt: args[args.indexOf("--prompt") + 1] }, created_at: new Date().toISOString() }];
  save(); out(mode === "noid" || mode === "noid-unlisted" ? { submitted: true } : { id, status: "queued" });
}
if (a === "generate" && b === "list") out(mode === "noid-unlisted" ? [] : st.jobs || []);
if (a === "generate" && (b === "wait" || b === "get")) {
  if (mode === "reject") out({ id: args[2], status: "failed" });
  // 1x1 PNG
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const f = path.join(dir, `${args[2]}.${process.env.FAKE_HF_IMAGE ? "jpg" : "png"}`);
  if (process.env.FAKE_HF_IMAGE) fs.copyFileSync(process.env.FAKE_HF_IMAGE, f); else fs.writeFileSync(f, png);
  out({ id: args[2], status: "completed", result_url: "file://" + f });
}
fail("unknown command " + args.join(" "));
