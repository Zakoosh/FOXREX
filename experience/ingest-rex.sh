#!/usr/bin/env bash
# FOXREX experience — LOCAL REX ASSET INGEST (macOS / Linux, development only). Windows: ingest-rex.ps1.
#   ./experience/ingest-rex.sh [--no-open] [--dry-run] [--no-media]
# Never uploads, publishes or commits anything; inbox/processed/approved are gitignored.
set -euo pipefail
PORT="${PORT:-5180}"
XP="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(dirname "$XP")"
OPEN=1; ARGS=()
for a in "$@"; do case "$a" in --no-open) OPEN=0 ;; --dry-run) OPEN=0; ARGS+=(--dry-run) ;; *) ARGS+=("$a") ;; esac; done
PY="$(command -v python3 || command -v python)"
cd "$ROOT"
"$PY" "$XP/tools/rex_ingest.py" ${ARGS[@]+"${ARGS[@]}"}
[ "$OPEN" = 1 ] || exit 0
URL="http://localhost:${PORT}/experience/rex-review/"
if ! curl -fsS -o /dev/null "http://localhost:${PORT}/__rex/ping" 2>/dev/null; then
  if curl -fsS -o /dev/null "http://localhost:${PORT}/experience/" 2>/dev/null; then
    echo "WARNING: port ${PORT} is served by another (read-only) server; stop it and run again so decisions can be saved."
  else
    nohup "$PY" "$XP/tools/rex_review_server.py" --port "$PORT" >"${TMPDIR:-/tmp}/foxrex-rex-review.log" 2>&1 &
    echo "Review server started (pid $!) → stop later with: kill $!"; sleep 1
  fi
fi
case "$(uname -s)" in Darwin) open "$URL" ;; *) xdg-open "$URL" >/dev/null 2>&1 || true ;; esac
echo "Review: $URL"
