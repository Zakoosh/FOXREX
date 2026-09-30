# Verification record — 2026-09-28

> Note: the Studio has since moved to `studio/index.html` and `studio/creative-studio.js` (served at `https://foxrex.co/studio/`). URLs below are historical evidence.

## Checks

- `cd worker; npm test`: 45 passed, zero failures/skips. All charged-generation coverage uses mocks.
- `npm run check`: worker, tests, helper scripts, creative UI and inline JavaScript parse successfully.
- Focused regressions cover API root/health/auth/exact CORS, non-overwriting setup, and persistence of creative inputs before blur/rerender.
- Existing coverage includes immutable previews, concurrent/repeated approvals, restart recovery, lost provider IDs, cancellation, reconciliation, increased cost, schema/fact validation, migration and external-import lineage.

## Connectivity investigation

Windows HTTP checks initially returned `/health` 200, authenticated `/policy` 200, and `/` 404. The existing Chrome root tab confirmed that the API root had been opened. The root was never a Studio HTML server. It now returns 200 JSON explaining the API and naming the health and Studio URLs.

The configuration allowed `http://localhost:5173`, while the live page origin was `https://zakoosh.github.io`. The Studio worker URL was correct but its token field was empty. The worker had the public example token, consistent with copying the example; no previous-secret backup was available, so historical token values cannot be reconstructed. DATA_DIR still resolved to the existing worker/data directory. Local reasoning was already enabled with qwen3:4b.

The existing private configuration was backed up, its placeholder token rotated without displaying it, and only the origin changed to the exact Pages origin. DATA_DIR and reasoning settings were preserved. The worker was restarted on 127.0.0.1:8787. Post-fix Windows requests to root, health, authenticated policy, providers, creative/status and jobs all returned 200 with the exact Pages CORS header. The production job file remained byte-for-byte identical.

A fresh Chrome health navigation reported ERR_BLOCKED_BY_CLIENT, as did the supported in-app browser at port 8787. The live Studio connection button reported offline; its captured Console did not provide a more specific request error. No security setting or URL-identification check was bypassed. This evidence does not establish an authenticated Pages-to-worker browser connection or identify which client component blocks the port. The rotated token still needs to be entered privately in the live Studio Settings after the browser block is resolved.

## Real Ollama and local browser

`node scripts/verify-local.mjs` successfully called installed local qwen3:4b: five concepts and a three-scene plan. Real responses remain in ignored worker/data/verification, not this repository's committed evidence.

A fresh end-to-end test used the actual updated Studio HTML and JavaScript in the supported in-app browser at `http://127.0.0.1:5174/foxrex-studio.html`. This isolated server has temporary storage and only MANUAL_CLAUDE registered; it cannot submit Higgsfield jobs.

Verified connection diagnostics, reasoning provider status, a real educational FOXREX brief, live concept generation, choosing another concept, live three-scene planning, editing caption and prompts, saving revisions, explicit manual preview/save, and retaining the edited caption, audience, three scenes and manual-required status after reload. DOM/accessibility evidence and a screenshot were inspected. No app Console errors were reported in the completed flow.

Model output contained no market prices, signals, performance figures or invented source references in the inspected example, but some directions requested handwriting and some copy was placeholder text. The UI now flags those editorial issues. The tested draft was manually corrected: actual Arabic overlay copy, blank journal surfaces, cleaned image prompts, and an editable caption. This is usable structured planning with operator review, not a claim of publication-ready model output or comprehensive factual verification.

Browser testing discovered creative text fields could lose input before a change/blur event; input is now persisted before rerender, with a focused regression test. Screenshot inspection also caught missing text-input styling; explicit input types now use the Studio theme.

Earlier Chrome testing also covered invalid fact-reference rejection and manual import handler provenance. Automated browser file upload was blocked by the extension's file URL permission; permission was not changed. Actual import is unit-tested, but that Chrome file-picker operation remains unverified.

## Production records and cost safety

Both recovered production jobs remain COMPLETED, with matching provider/output lineage and their original local PNG files. Their job file is unchanged across restart and testing. Detailed IDs, checksums, model responses and local data remain private/ignored. There were no new Higgsfield generations and no credits spent by this verification.

Repeated approval of one quote returns its existing job. A persisted submission marker prevents re-execution after uncertain outcomes; unresolved submissions block new quotes for the same content. Retry returns 409 and never launches a charged job. These guarantees assume one worker per data directory; they are not distributed locking or provider-wide exactly-once guarantees.

## Deployment distinction

The live URL `https://zakoosh.github.io/FOXREX/foxrex-studio.html` returned HTTP 200 but did not load creative-studio.js; that script URL returned 404. The fetched remote main branch also lacked these uncommitted features. There is no custom build workflow or bundler in this repository. Changes are prepared as a review branch and PR; they are not deployed or merged by this task. Pages publishing settings could not be freshly inspected because the browser call timed out. Merge/publish through the repository's configured Pages workflow and verify the deployed result separately.

## Deployed GitHub Pages verification — follow-up, 2026-09-28

Run in the operator's normal Chrome 153 profile against the deployed page and the existing worker on 127.0.0.1:8787 (HOST unchanged, port unchanged).

- Browser block: not reproducible in this profile. A fetch from the Pages origin and a direct navigation to `/health` both returned 200. Chrome stores a `loopback_network` Allow for `https://zakoosh.github.io` (granted 2026-09-27 20:34 UTC). No policy restricts local network access. The earlier ERR_BLOCKED_BY_CLIENT came from the automation clients used then: the in-app browser loaded port 5174 but not 8787 on the same host, which rules out Chrome's local-network check or a worker fault. The only active network-blocking extension here, AdBlock, contains no rule matching this origin → 127.0.0.1 (its EasyPrivacy localhost rules are scoped to named third-party sites). No setting was changed.
- The stored Pages token was stale (policy 401). The rotated token was pasted privately from `.env` via the clipboard, then the clipboard was cleared. Settings' own check reported health 200, authenticated policy 200 and provider status loaded.
- On a labelled test item: ideation (3 concepts, OLLAMA_LOCAL qwen3:4b), selecting a non-recommended concept, planning, operator plan edit validated by the worker, reload persistence of all fields and revisions, and the manual path (MANUAL_CLAUDE quote without estimate → MANUAL_REQUIRED job).
- The two recovered Higgsfield jobs are byte-identical before and after; both PNGs are served to the Pages origin at their on-disk sizes. Their content item was created in the in-app browser's temporary storage and does not exist in the Pages origin's storage, so the live Studio has no item to show them under.
- Defect found and fixed: editing a text field and then clicking straight into the next field dropped the next input's typing, because the blur-time `change` handler re-rendered and replaced the clicked field. The render is now deferred until focus has moved, and focus and caret are returned to the same field. Regression tests were added; the fix was confirmed in Chrome.
- Local inference was stopped and the model unloaded, at the host's request, while the FX market is open. The optional critique step was not run.

## Files and remaining limits

Changes cover the Studio HTML/creative module; worker configuration, creative service, server, runner and job recovery; setup/check/live-verification scripts; focused tests; README, worker README and GENERATION documentation. All prior working-tree changes were continued in place.

Remaining limits: recovered Higgsfield jobs are not attached to a content item in the Pages origin, external browser upload permission, no rendered video/audio, no pixel-aware critique, no social publishing, and no multi-user persistence. Paid APIs stay disabled with a zero budget. .env, its backup, job data and detailed verification evidence are ignored and excluded from the commit.
