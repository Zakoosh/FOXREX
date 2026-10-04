# REX inbox (local, gitignored)

Put downloaded Higgsfield REX files here (full-resolution PNG / MP4 / WebM; not the `_min.webp` preview).

- Keep the Higgsfield file name (`hf_YYYYMMDD_HHMMSS_<job-id>.png`); the job id identifies the shot through
  `../higgsfield-generations.json`. Or name files `R-01_<anything>.png`, or map them in `manifest.json`:
  `{ "files": { "my-file.png": { "shot": "R-01", "variant": "eyes-a" } } }`.
- An optional matte for a video goes next to it as `<same-name>_matte.mp4`.

Then run, from the repository folder:

    powershell -ExecutionPolicy Bypass -File experience\ingest-rex.ps1

Everything in this folder except this README is ignored by git and is never uploaded, published or committed.
