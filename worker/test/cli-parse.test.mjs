import test from "node:test"; import assert from "node:assert/strict";
import { pickId, pickStatus, pickUrls, pickCredits, parseJson } from "../src/providers/util.js";
import { classify } from "../src/providers/higgsfield-cli.js";
import { chooseModel } from "../src/models.js";
test("defensive JSON readers", () => {
  assert.equal(pickId([{ job_id: "a" }]), "a"); assert.equal(pickId({ jobs: [{ id: "b" }] }), "b");
  assert.equal(pickStatus({ job: { status: "COMPLETED" } }), "completed");
  assert.deepEqual(pickUrls({ results: [{ raw: { url: "https://cdn.x/a.png" } }], result_url: "https://cdn.x/a.png" }), ["https://cdn.x/a.png"]);
  assert.equal(pickCredits({ data: { balance: "42" } }), 42);
  assert.deepEqual(parseJson("progress...\n{\"id\":\"z\"}"), { id: "z" });
});
test("CLI error classification", () => {
  assert.equal(classify({ code: 2, stderr: "Error: Not authenticated.", stdout: "" }).code, "AUTH_EXPIRED");
  assert.equal(classify({ code: 4, stderr: "Error: No workspace selected.", stdout: "" }).code, "WORKSPACE_NOT_SELECTED");
  assert.equal(classify({ notFound: true }).code, "CLI_NOT_INSTALLED");
  assert.equal(classify({ timedOut: true, stderr: "", stdout: "" }).code, "GENERATION_TIMEOUT");
});
test("capability routing", () => {
  assert.equal(chooseModel({ type: "image", aspectRatio: "4:5", refs: 1, preferred: ["nano_banana_2"] }).id, "nano_banana_2");
  assert.equal(chooseModel({ type: "image", aspectRatio: "4:5", refs: 0, preferred: ["seedream_v5_lite"] }).id, "nano_banana_2");
  assert.equal(chooseModel({ type: "image", aspectRatio: "7:3" }), null);
});
