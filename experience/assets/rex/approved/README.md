# REX approved assets (generated, gitignored)

When a variant is APPROVED in `/experience/rex-review/`, the next ingest copies its web-ready files here
(`R-01/`, with `approved.json` recording the decision and the source SHA-256) and points
`../rex-assets.json` at them, so `/experience/` uses the approved REX.
Committing an approved asset to git is a separate, explicit owner decision (`git add -f`), never automatic.
