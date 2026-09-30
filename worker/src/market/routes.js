/* Public, read-only FOXREX Market API. No authentication (public prices), no provider credentials,
   no internal connection details. Served from the latest-quote cache only.

     GET /api/market/quotes[?symbols=XAUUSD,EURUSD]   → { asOf, attribution, quotes: [...] }
     GET /api/market/quote/:symbol                    → { asOf, quote }

   CORS: exact origins from MARKET_PUBLIC_ORIGINS (default https://foxrex.co), never "*".
   Cache-Control: short public caching so a CDN can absorb traffic spikes.
   Rate limit: per client IP (CF-Connecting-IP only when MARKET_TRUST_PROXY=cloudflare). */
import http from 'node:http';
import { RateLimiter } from '../ratelimit.js';
import { canonical } from './symbols.js';

export function createMarketRoutes({ service, origins = ['https://foxrex.co'], limiter = new RateLimiter({ market: { max: 240, windowMs: 60e3 } }), trustProxy = '', cacheSeconds = 5 } = {}) {
  const cors = origin => (origin && origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' } : { Vary: 'Origin' });
  const out = (req, res, code, body, extra = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...cors(req.headers.origin), ...extra });
    res.end(JSON.stringify(body));
  };
  const attribution = quotes => [...new Set(quotes.filter(q => q.source).map(q => q.source.attribution))];

  return function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/market/')) return false;
    if (req.method === 'OPTIONS') { res.writeHead(204, cors(req.headers.origin)); res.end(); return true; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { out(req, res, 405, { error: 'Market API is read-only' }, { Allow: 'GET, OPTIONS' }); return true; }
    const ip = (trustProxy === 'cloudflare' && req.headers['cf-connecting-ip']) || req.socket.remoteAddress || 'anon';
    const wait = limiter.check('market', String(ip));
    if (wait) { out(req, res, 429, { error: `Too many requests — wait ${wait}s`, retryAfter: wait }, { 'Retry-After': String(wait) }); return true; }
    const cache = { 'Cache-Control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}` };
    let m;
    if (url.pathname === '/api/market/quotes') {
      const want = url.searchParams.get('symbols');
      const list = want ? [...new Set(want.split(',').map(canonical).filter(s => s && service.symbols.includes(s)))] : service.symbols;
      const snap = service.quotes(list);
      out(req, res, 200, { ...snap, attribution: attribution(snap.quotes) }, cache); return true;
    }
    if ((m = url.pathname.match(/^\/api\/market\/quote\/([A-Za-z0-9/_-]{2,16})$/))) {
      const sym = canonical(decodeURIComponent(m[1]));
      if (!sym || !service.symbols.includes(sym)) { out(req, res, 404, { error: 'Unknown or unsupported symbol' }); return true; }
      const q = service.view(sym);
      out(req, res, 200, { asOf: new Date().toISOString(), quote: q, attribution: attribution([q]) }, cache); return true;
    }
    out(req, res, 404, { error: 'not found' }); return true;
  };
}

/** Optional market-only listener (MARKET_PORT): exposes nothing but /health and /api/market/*,
    so a public tunnel can point here without reaching the CMS or publishing API at all. */
export function createMarketServer(handle) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true,"service":"foxrex-market"}'); }
    if (handle(req, res, url)) return;
    res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"not found"}');
  });
}
