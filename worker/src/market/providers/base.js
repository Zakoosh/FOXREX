/* MarketDataProvider — provider-independent adapter interface.

     connect()                 → verify configuration/credentials (no quote fabrication)
     disconnect()
     getQuotes(symbols)        → canonical quotes (pre-gate) for the symbols this provider maps
     getQuote(symbol)
     getStatus()               → { name, state, configured, realtime, ... } (never credentials or URLs)
     subscribe(symbols, cb)    → streaming, only when supportsStreaming (none of the current adapters)

   Errors are ProviderError with a kind (AUTH, RATE_LIMIT, HTTP, NETWORK, TIMEOUT, BAD_RESPONSE,
   NOT_CONFIGURED) and a message built from status codes only — never from URLs, headers or bodies that
   could echo an API key. */
import { normalize } from '../quality.js';

export class ProviderError extends Error {
  constructor(kind, message, { retryAfterMs = null, status = null } = {}) { super(message); this.kind = kind; this.retryAfterMs = retryAfterMs; this.status = status; }
}

export class MarketDataProvider {
  constructor({ name, label, registry, fetcher = (...a) => fetch(...a), timeoutMs = 8000, realtime = true, minPollMs = 5000, maxBatch = 50 }) {
    Object.assign(this, { name, label, registry, fetcher, timeoutMs, realtime, minPollMs, maxBatch });
    this.supportsStreaming = false; this.connected = false;
  }
  configured() { return true; }
  missing() { return []; }
  async connect() { if (!this.configured()) throw new ProviderError('NOT_CONFIGURED', `${this.label}: missing ${this.missing().join(', ')}`); this.connected = true; }
  async disconnect() { this.connected = false; }
  covers(symbol) { return !!this.registry.providerSymbol(symbol, this.name); }
  async getQuote(symbol) { return (await this.getQuotes([symbol]))[0] || null; }
  async getQuotes() { throw new ProviderError('NOT_CONFIGURED', 'not implemented'); }
  subscribe() { throw new ProviderError('NOT_SUPPORTED', `${this.label} does not support streaming; the service polls instead`); }
  getStatus() { return { name: this.name, label: this.label, configured: this.configured(), missing: this.missing(), realtime: this.realtime, streaming: this.supportsStreaming }; }

  quote(symbol, raw, receivedAt) { return normalize(raw, { symbol, provider: this.name, providerSymbol: this.registry.providerSymbol(symbol, this.name), receivedAt, realtime: this.realtime }); }

  /** GET JSON with timeout and error classification. `url` is never included in error messages. */
  async getJson(url, headers = {}) {
    let r;
    try { r = await this.fetcher(url, { headers: { Accept: 'application/json', 'User-Agent': 'foxrex-market-service', ...headers }, signal: AbortSignal.timeout(this.timeoutMs) }); }
    catch (e) { throw new ProviderError(e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'TIMEOUT' : 'NETWORK', `${this.label}: ${e && e.name === 'TimeoutError' ? 'request timed out' : 'network error'}`); }
    const ra = r.headers && typeof r.headers.get === 'function' ? r.headers.get('retry-after') : null;
    if (r.status === 429) throw new ProviderError('RATE_LIMIT', `${this.label}: rate limited (HTTP 429)`, { retryAfterMs: ra ? Math.max(1, +ra || 60) * 1000 : null, status: 429 });
    if (r.status === 401 || r.status === 403) throw new ProviderError('AUTH', `${this.label}: authentication rejected (HTTP ${r.status})`, { status: r.status });
    if (!r.ok) throw new ProviderError('HTTP', `${this.label}: HTTP ${r.status}`, { status: r.status });
    try { return await r.json(); } catch { throw new ProviderError('BAD_RESPONSE', `${this.label}: response was not JSON`); }
  }
}
