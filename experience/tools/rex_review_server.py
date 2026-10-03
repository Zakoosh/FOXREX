#!/usr/bin/env python3
"""FOXREX experience — local review server (development only).

Serves the repository on http://127.0.0.1:<port>/ (loopback only), like `python -m http.server`, plus:
  - correct MIME types for ES modules, WebM, MP4, WebP (Windows registries often map .js to text/plain)
  - HTTP Range requests (video seeking/looping)
  - no-store caching for the local REX review state
  - GET  /__rex/ping      → {"ok": true}
  - POST /__rex/decision  → records an owner decision in experience/assets/rex/review-decisions.json
Nothing is uploaded or published; the decision file is gitignored local metadata.

usage: rex_review_server.py [--port 5180]"""
import argparse, datetime, json, os, re, sys, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

for _s in (sys.stdout, sys.stderr):   # Windows consoles: never crash on non-ASCII output
    try: _s.reconfigure(errors='replace')
    except AttributeError: pass
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DECISIONS = os.path.join(ROOT, 'experience', 'assets', 'rex', 'review-decisions.json')
LOCK = threading.Lock()
SHOT, VARIANT = re.compile(r'R-0[1-9]'), re.compile(r'[A-Za-z0-9_-]{1,64}')


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
                      '.webm': 'video/webm', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webp': 'image/webp',
                      '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.wasm': 'application/wasm'}

    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, fmt, *args):
        if '/__rex/' in (self.path or '') or (args and str(args[1])[:1] in '45'): sys.stderr.write('%s %s\n' % (self.log_date_time_string(), fmt % args))

    def end_headers(self):
        if '/assets/rex/' in self.path or '/__rex/' in self.path: self.send_header('Cache-Control', 'no-store')
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

    def _local_origin(self):
        host = (self.headers.get('Host') or '').split(':')[0]
        origin = self.headers.get('Origin')
        ok_hosts = ('127.0.0.1', 'localhost')
        return host in ok_hosts and (origin is None or re.fullmatch(r'http://(127\.0\.0\.1|localhost)(:\d+)?', origin))

    def do_GET(self):
        if self.path.split('?')[0] == '/__rex/ping': return self._json(200, {'ok': True, 'decisions': os.path.relpath(DECISIONS, ROOT).replace(os.sep, '/')})
        rng = self.headers.get('Range')
        path = self.translate_path(self.path)
        m = re.fullmatch(r'bytes=(\d*)-(\d*)', rng or '')
        if not m or not os.path.isfile(path): return super().do_GET()
        size = os.path.getsize(path)
        start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2) or 0))
        end = min(int(m.group(2)), size - 1) if m.group(1) and m.group(2) else size - 1
        if start >= size or start > end:
            self.send_response(416); self.send_header('Content-Range', f'bytes */{size}'); self.end_headers(); return
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path)); self.send_header('Content-Range', f'bytes {start}-{end}/{size}'); self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        with open(path, 'rb') as f:
            f.seek(start); left = end - start + 1
            while left > 0:
                chunk = f.read(min(1 << 20, left))
                if not chunk: break
                try: self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError): return
                left -= len(chunk)

    def do_POST(self):
        if self.path.split('?')[0] != '/__rex/decision': return self._json(404, {'error': 'not found'})
        if not self._local_origin(): return self._json(403, {'error': 'local review only'})
        try:
            n = int(self.headers.get('Content-Length') or 0)
            if n <= 0 or n > 4096: raise ValueError('bad length')
            d = json.loads(self.rfile.read(n))
            shot, variant, decision, note = d.get('shot'), d.get('variant'), d.get('decision'), str(d.get('note') or '')[:500]
            if not (isinstance(shot, str) and SHOT.fullmatch(shot) and isinstance(variant, str) and VARIANT.fullmatch(variant)): raise ValueError('bad shot/variant')
            if decision not in ('approve', 'reject', 'clear'): raise ValueError('bad decision')
        except (ValueError, json.JSONDecodeError) as e:
            return self._json(400, {'error': str(e)})
        with LOCK:
            try:
                with open(DECISIONS, encoding='utf-8') as f: data = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError): data = {}
            per = data.setdefault(shot, {})
            if decision == 'clear': per.pop(variant, None)
            else: per[variant] = {'decision': decision, 'note': note, 'at': datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')}
            if not per: data.pop(shot, None)
            os.makedirs(os.path.dirname(DECISIONS), exist_ok=True)
            tmp = DECISIONS + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f: json.dump(data, f, indent=2); f.write('\n')
            os.replace(tmp, DECISIONS)
        print(f'decision: {shot} {variant} → {decision}', flush=True)
        return self._json(200, {'ok': True, 'decisions': data})


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--port', type=int, default=int(os.environ.get('PORT', 5180)))
    a = ap.parse_args()
    srv = ThreadingHTTPServer(('127.0.0.1', a.port), Handler)
    print(f'FOXREX local review server: http://localhost:{a.port}/experience/rex-review/  (root {ROOT}; Ctrl+C to stop)', flush=True)
    try: srv.serve_forever()
    except KeyboardInterrupt: pass

if __name__ == '__main__':
    main()
