#!/usr/bin/env bash
# FOXREX experience — local owner review (development only).
# Serves THIS checkout on http://localhost:5180 and opens /experience/?review=1 in your normal Chrome.
# It never modifies git state, production files or other checkouts.
set -euo pipefail
PORT="${PORT:-5180}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://localhost:${PORT}/experience/?review=1"
cd "$ROOT"
echo "Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')   HEAD: $(git rev-parse HEAD 2>/dev/null || echo '?')"
if curl -fsS -o /dev/null "http://localhost:${PORT}/experience/" 2>/dev/null; then
  echo "Port ${PORT} is already serving /experience/ — reusing it (make sure it is THIS checkout)."
else
  PY="$(command -v python3 || command -v python)"
  nohup "$PY" -m http.server "$PORT" --bind 127.0.0.1 >"${TMPDIR:-/tmp}/foxrex-review-server.log" 2>&1 &
  echo "Server started (pid $!) → leave it running; stop later with: kill $!"
  for _ in $(seq 1 20); do curl -fsS -o /dev/null "http://localhost:${PORT}/experience/" 2>/dev/null && break; sleep 0.25; done
fi
case "$(uname -s)" in
  Darwin) open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL" ;;
  *) for b in google-chrome google-chrome-stable chromium chromium-browser; do command -v "$b" >/dev/null && { nohup "$b" "$URL" >/dev/null 2>&1 & break; }; done || xdg-open "$URL" ;;
esac
echo "Opened: $URL"
echo "Normal (no review panel): http://localhost:${PORT}/experience/"
