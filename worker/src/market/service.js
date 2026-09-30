/* FOXREX Market Service — the only component that talks to market-data providers.

   Provider ──poll (single-flight, timeout, backoff)──▶ normalize ──▶ quality gate ──▶ latest-quote cache
                                                                                         │
   Public API / Studio / Gold Focus ◀── classify freshness at read time ◀───────────────┘

   Visitors never trigger upstream calls: every request is answered from the cache.
   Resilience: per-provider state machine, exponential backoff with jitter (no request storms),
   Retry-After honoured on 429, authentication failures back off to the maximum and are reported,
   missing credentials are reported as BLOCKED_MISSING_CREDENTIALS without any network call.
   Failover: a symbol is polled from the highest-priority provider that maps it and is healthy.
   A provider outage keeps the last quote internally but it is served as STALE, never LIVE. */
import { buildRegistry } from './symbols.js';
import { isOpen } from './sessions.js';
import { QualityGate, classify, displayPrice } from './quality.js';
import { createProviders } from './providers/adapters.js';
import { logger } from '../logger.js';

const log = logger('market');
const UNHEALTHY = new Set(['DISCONNECTED', 'AUTH_FAILED', 'BLOCKED_MISSING_CREDENTIALS', 'RATE_LIMITED']);
const CONNECTED = new Set(['CONNECTED', 'DEGRADED']);

export class MarketService {
  constructor({ config = {}, env = {}, fetcher, providers } = {}) {
    this.cfg = { symbols: [], providers: [], pollSeconds: {}, baseBackoffMs: 2000, maxBackoffMs: 10 * 60e3, futureToleranceMs: 10e3, timeoutMs: 8000,
      oanda: {}, twelvedata: {}, bridge: {}, ...config };
    this.registry = buildRegistry({ overrides: this.cfg.symbolMap, env });
    this.symbols = (this.cfg.symbols || []).filter(s => this.registry.get(s));
    const built = providers ? { providers, unknown: [] } : createProviders(this.cfg, this.registry, fetcher);
    this.providers = built.providers; this.unknownProviders = built.unknown;
    this.gate = new QualityGate({ registry: this.registry, futureToleranceMs: this.cfg.futureToleranceMs });
    this.cache = new Map();
    this.state = new Map(this.providers.map(p => [p.name, { state: p.configured() ? 'IDLE' : 'BLOCKED_MISSING_CREDENTIALS', failures: 0, lastSuccessAt: null, lastErrorAt: null,
      lastError: p.configured() ? null : `Missing ${p.missing().join(', ')}`, nextAt: null, latencyMs: null, polls: 0, inflight: false,
      pollMs: Math.max(p.minPollMs, (this.cfg.pollSeconds[p.name] || 0) * 1000 || p.minPollMs) }]));
    this.timers = new Map(); this.running = false; this.startedAt = null;
  }

  get enabled() { return this.providers.length > 0; }
  providerFor(symbol) {
    for (const p of this.providers) if (p.covers(symbol) && !UNHEALTHY.has(this.state.get(p.name).state)) return p;
    return null;
  }
  /** Symbols this provider should poll now (primary, or failover when higher-priority providers are unhealthy). */
  symbolsFor(p) { return this.symbols.filter(s => this.providerFor(s) === p); }

  start() {
    if (this.running || !this.enabled) return; this.running = true; this.startedAt = Date.now();
    for (const p of this.providers) {
      if (!p.configured()) { log.warn('provider blocked: missing credentials', { provider: p.name, missing: p.missing() }); continue; }
      this.#schedule(p, 0);
    }
    log.info('market service started', { providers: this.providers.map(p => p.name), symbols: this.symbols });
  }
  stop() { this.running = false; for (const t of this.timers.values()) clearTimeout(t); this.timers.clear(); for (const p of this.providers) p.disconnect().catch(() => {}); }
  #schedule(p, delay) {
    clearTimeout(this.timers.get(p.name));
    const st = this.state.get(p.name); st.nextAt = Date.now() + delay;
    const t = setTimeout(() => this.poll(p).finally(() => { if (this.running) this.#schedule(p, this.nextDelay(p)); }), delay); t.unref?.();
    this.timers.set(p.name, t);
  }
  nextDelay(p) {
    const st = this.state.get(p.name);
    if (st.state === 'BLOCKED_MISSING_CREDENTIALS') return this.cfg.maxBackoffMs;
    if (!st.failures) return st.pollMs;
    const exp = Math.min(this.cfg.maxBackoffMs, this.cfg.baseBackoffMs * 2 ** (st.failures - 1));
    const jitter = 0.8 + Math.random() * 0.4;
    let d = Math.max(st.pollMs, Math.round(exp * jitter));
    if (st.retryAfterMs) d = Math.max(d, st.retryAfterMs);
    if (st.state === 'AUTH_FAILED') d = this.cfg.maxBackoffMs;
    return d;
  }

  /** One poll of one provider (single-flight). Public so tests and the scheduler share one code path. */
  async poll(p, now = () => Date.now()) {
    const st = this.state.get(p.name);
    if (st.inflight) return { skipped: 'inflight' };
    if (!p.configured()) { st.state = 'BLOCKED_MISSING_CREDENTIALS'; return { skipped: 'not-configured' }; }
    const symbols = this.symbolsFor(p).concat(this.#probeSymbols(p));
    if (!symbols.length) return { skipped: 'no-symbols' };
    st.inflight = true; st.polls++;
    const t0 = Date.now();
    try {
      if (!p.connected) { st.state = st.state === 'IDLE' ? 'CONNECTING' : st.state; await p.connect(); }
      const quotes = await p.getQuotes([...new Set(symbols)]);
      st.latencyMs = Date.now() - t0;
      const res = { accepted: 0, rejected: [] };
      for (const q of quotes) {
        const n = now();
        if (q.tradeable === false) q.marketClosedByProvider = true;
        const prev = this.cache.get(q.symbol);
        const g = this.gate.check(q, prev, n);
        if (g.dropPrevious) { this.cache.delete(q.symbol); log.warn('discarded cached quote with a future timestamp', { symbol: q.symbol }); }
        if (g.ok) { this.cache.set(q.symbol, g.quote); res.accepted++; }
        else res.rejected.push({ symbol: q.symbol, reason: g.reason });
      }
      if (res.rejected.length) log.warn('quotes rejected by quality gate', { provider: p.name, rejected: res.rejected });
      Object.assign(st, { state: 'CONNECTED', failures: 0, lastSuccessAt: Date.now(), lastError: null, retryAfterMs: null });
      return res;
    } catch (e) {
      st.failures++; st.lastErrorAt = Date.now(); st.lastError = String(e.message || 'error').slice(0, 160); st.retryAfterMs = e.retryAfterMs || null;
      st.state = e.kind === 'AUTH' ? 'AUTH_FAILED' : e.kind === 'RATE_LIMIT' ? 'RATE_LIMITED' : e.kind === 'NOT_CONFIGURED' ? 'BLOCKED_MISSING_CREDENTIALS' : st.failures >= 3 ? 'DISCONNECTED' : 'DEGRADED';
      p.connected = false;
      log.warn('provider poll failed', { provider: p.name, kind: e.kind || 'ERROR', failures: st.failures, state: st.state });
      return { error: e.kind || 'ERROR' };
    } finally { st.inflight = false; }
  }
  /** While a provider is unhealthy it still needs one probe symbol to discover recovery (reconnect). */
  #probeSymbols(p) {
    const st = this.state.get(p.name);
    if (!UNHEALTHY.has(st.state)) return [];
    const s = this.symbols.find(x => p.covers(x)); return s ? [s] : [];
  }
  /** Poll every configured provider once (tests, startup warm-up). */
  async pollAll(now) { const out = {}; for (const p of this.providers) out[p.name] = await this.poll(p, now); return out; }

  /** Public view of one symbol — read from cache only. */
  view(symbol, now = Date.now()) {
    const reg = this.registry.get(symbol);
    if (!reg) return null;
    const q = this.cache.get(symbol) || null;
    const p = q && this.providers.find(x => x.name === q.provider);
    const st = p && this.state.get(p.name);
    const covered = this.providers.some(x => x.covers(symbol));
    const marketOpen = isOpen(reg.calendar, now) && !(q && q.marketClosedByProvider);
    const fr = this.registry.freshness(symbol);
    const c = classify(q, { now, freshness: fr, marketOpen, providerConnected: !!st && CONNECTED.has(st.state) });
    const base = { symbol, name: reg.name, assetClass: reg.assetClass, decimals: reg.decimals, status: c.status, marketOpen, staleAfterMs: fr.delayedMs, liveWithinMs: fr.liveMs };
    if (!q) return { ...base, reason: !this.enabled ? 'NO_PROVIDER_CONFIGURED' : covered ? 'NO_VALID_QUOTE_YET' : 'NOT_COVERED_BY_PROVIDER', price: null, priceType: null,
      bid: null, ask: null, mid: null, last: null, spread: null, change: null, changePct: null, changeBasis: null, providerTime: null, receivedAt: null, ageMs: null, source: null };
    return { ...base, priceType: q.priceType, price: displayPrice(q), bid: q.bid, ask: q.ask, mid: q.mid, last: q.last, spread: q.spread,
      change: q.change, changePct: q.changePct, changeBasis: q.changeBasis,
      providerTime: new Date(q.providerTime).toISOString(), receivedAt: new Date(q.receivedAt).toISOString(), ageMs: c.ageMs,
      source: { provider: p ? p.label : q.provider, providerSymbol: q.providerSymbol, realtime: q.realtime, attribution: `Data: ${p ? p.label : q.provider}` } };
  }
  quotes(symbols = this.symbols, now = Date.now()) {
    return { asOf: new Date(now).toISOString(), quotes: symbols.map(s => this.view(s, now)).filter(Boolean) };
  }

  /** Studio/system status (authenticated). No credentials, URLs or tokens. */
  status(now = Date.now()) {
    const views = this.symbols.map(s => this.view(s, now));
    const count = st => views.filter(v => v.status === st).length;
    const provs = this.providers.map(p => { const st = this.state.get(p.name); return { ...p.getStatus(), state: st.state, failures: st.failures, lastSuccessAt: st.lastSuccessAt && new Date(st.lastSuccessAt).toISOString(),
      lastErrorAt: st.lastErrorAt && new Date(st.lastErrorAt).toISOString(), lastError: st.lastError, latencyMs: st.latencyMs, pollSeconds: st.pollMs / 1000, nextPollAt: st.nextAt && new Date(st.nextAt).toISOString() }; });
    const live = count('LIVE'), delayed = count('DELAYED');
    const state = !this.enabled ? 'DISABLED' : provs.every(p => p.state === 'BLOCKED_MISSING_CREDENTIALS') ? 'BLOCKED_MISSING_CREDENTIALS'
      : live + delayed + count('MARKET_CLOSED') === views.length && views.length ? 'READY' : live + delayed > 0 ? 'DEGRADED' : 'UNAVAILABLE';
    const last = [...this.cache.values()].reduce((m, q) => Math.max(m, q.receivedAt || 0), 0);
    return { state, providers: provs, unknownProviders: this.unknownProviders, symbols: views.map(v => ({ symbol: v.symbol, status: v.status, ageMs: v.ageMs, provider: v.source && v.source.provider, reason: v.reason || null })),
      counts: { live, delayed, stale: count('STALE'), closed: count('MARKET_CLOSED'), unavailable: count('UNAVAILABLE') },
      lastUpdate: last ? new Date(last).toISOString() : null, rejections: { ...this.gate.rejections } };
  }
}
