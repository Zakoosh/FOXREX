# REX processed candidates (generated, gitignored)

Written by `experience/tools/rex_ingest.py`: one folder per shot and variant (`R-01/<variant>/`) with the
web-ready file, poster, preview, `meta.json` (SHA-256, probe results, Higgsfield ids) and a candidate
`manifest.json`, plus `index.json` (read by `/experience/rex-review/`) and `ingest-report.txt`.
Safe to delete; the next ingest rebuilds it from the inbox.
