/* Concrete adapters. Each maps canonical ↔ provider symbols ONLY through the registry.

   oanda      — OANDA v20 REST pricing. Real bid/ask + RFC3339 time + tradeable flag. Needs an OANDA account
                API token + account id. FX, metals, index/energy CFDs. No DXY. Crypto depends on the division.
   twelvedata — Twelve Data REST /quote (batch). LAST price (close of the current bar) with the provider's
                own previous-close change. Needs an API key. FX, metals, crypto, some indices.
   coinbase   — Coinbase Exchange public ticker. Real bid/ask + trade time. No key. Crypto only.
   bridge     — Operator-owned HTTP bridge (e.g. an MT5/broker terminal on the operator's machine) exposing
                GET <MARKET_BRIDGE_URL>/quotes?symbols=A,B → { quotes: [{ symbol, bid, ask, last?, time }] }.
                Optional bearer token. Never enabled implicitly. */
import { MarketDataProvider, ProviderError } from './base.js';

export class OandaProvider extends MarketDataProvider {
  constructor(o) {
    super({ name: 'oanda', label: 'OANDA', minPollMs: 2000, ...o });
    this.token = o.token || ''; this.accountId = o.accountId || '';
    this.host = o.environment === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
  }
  configured() { return !!(this.token && this.accountId); }
  missing() { return [!this.token && 'OANDA_API_TOKEN', !this.accountId && 'OANDA_ACCOUNT_ID'].filter(Boolean); }
  async getQuotes(symbols) {
    const map = symbols.filter(s => this.covers(s)).map(s => [s, this.registry.providerSymbol(s, this.name)]);
    if (!map.length) return [];
    const at = Date.now();
    const d = await this.getJson(`${this.host}/v3/accounts/${encodeURIComponent(this.accountId)}/pricing?instruments=${encodeURIComponent(map.map(x => x[1]).join(','))}`, { Authorization: `Bearer ${this.token}` });
    if (!d || !Array.isArray(d.prices)) throw new ProviderError('BAD_RESPONSE', 'OANDA: unexpected response shape');
    const out = [];
    for (const p of d.prices) {
      const sym = this.registry.fromProvider(this.name, p.instrument); if (!sym) continue;
      const bid = p.bids && p.bids[0] && p.bids[0].price, ask = p.asks && p.asks[0] && p.asks[0].price;
      const q = this.quote(sym, { bid, ask, time: p.time }, at); q.tradeable = p.tradeable !== false; out.push(q);
    }
    return out;
  }
}

export class TwelveDataProvider extends MarketDataProvider {
  constructor(o) { super({ name: 'twelvedata', label: 'Twelve Data', minPollMs: 60e3, maxBatch: 8, ...o, realtime: o.realtime === true }); this.apiKey = o.apiKey || ''; } // DELAYED unless the operator confirms a real-time plan
  configured() { return !!this.apiKey; }
  missing() { return this.apiKey ? [] : ['TWELVEDATA_API_KEY']; }
  async getQuotes(symbols) {
    const map = symbols.filter(s => this.covers(s)).map(s => [s, this.registry.providerSymbol(s, this.name)]);
    if (!map.length) return [];
    const at = Date.now();
    const d = await this.getJson(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(map.map(x => x[1]).join(','))}&apikey=${encodeURIComponent(this.apiKey)}`);
    if (d && d.status === 'error') {
      if (+d.code === 429) throw new ProviderError('RATE_LIMIT', 'Twelve Data: rate limited (code 429)', { retryAfterMs: 60e3, status: 429 });
      if (+d.code === 401 || +d.code === 403) throw new ProviderError('AUTH', `Twelve Data: authentication rejected (code ${d.code})`, { status: +d.code });
      throw new ProviderError('HTTP', `Twelve Data: error code ${+d.code || 'unknown'}`);
    }
    const entries = map.length === 1 ? [[map[0][1], d]] : Object.entries(d || {});
    const out = [];
    for (const [psym, v] of entries) {
      const sym = this.registry.fromProvider(this.name, psym); if (!sym || !v || v.status === 'error') continue;
      const hasPrev = v.previous_close != null && v.change != null && v.percent_change != null;
      const q = this.quote(sym, { last: v.close, time: v.last_quote_at || v.timestamp, change: v.change, changePct: v.percent_change, changeBasis: hasPrev ? 'provider previous close' : null }, at);
      q.tradeable = v.is_market_open !== false; out.push(q);
    }
    return out;
  }
}

export class CoinbaseProvider extends MarketDataProvider {
  constructor(o) { super({ name: 'coinbase', label: 'Coinbase Exchange', minPollMs: 5000, ...o }); }
  async getQuotes(symbols) {
    const out = [];
    for (const s of symbols.filter(x => this.covers(x))) {
      const at = Date.now();
      const d = await this.getJson(`https://api.exchange.coinbase.com/products/${encodeURIComponent(this.registry.providerSymbol(s, this.name))}/ticker`);
      if (!d || d.bid == null || d.ask == null) throw new ProviderError('BAD_RESPONSE', 'Coinbase Exchange: unexpected response shape');
      out.push(this.quote(s, { bid: d.bid, ask: d.ask, last: d.price, time: d.time }, at));
    }
    return out;
  }
}

export class BridgeProvider extends MarketDataProvider {
  constructor(o) { super({ name: 'bridge', label: o.label || 'Broker bridge', minPollMs: 1000, ...o }); this.url = (o.url || '').replace(/\/$/, ''); this.token = o.token || ''; }
  configured() { return /^https?:\/\//.test(this.url); }
  missing() { return this.configured() ? [] : ['MARKET_BRIDGE_URL']; }
  async getQuotes(symbols) {
    const map = symbols.filter(s => this.covers(s)).map(s => [s, this.registry.providerSymbol(s, this.name)]);
    if (!map.length) return [];
    const at = Date.now();
    const d = await this.getJson(`${this.url}/quotes?symbols=${encodeURIComponent(map.map(x => x[1]).join(','))}`, this.token ? { Authorization: `Bearer ${this.token}` } : {});
    if (!d || !Array.isArray(d.quotes)) throw new ProviderError('BAD_RESPONSE', `${this.label}: unexpected response shape`);
    return d.quotes.map(v => { const sym = this.registry.fromProvider(this.name, v.symbol); return sym ? this.quote(sym, { bid: v.bid, ask: v.ask, last: v.last, time: v.time }, at) : null; }).filter(Boolean);
  }
}

/** Build configured adapters from worker config (config.market). Unknown names are reported, not guessed. */
export function createProviders(cfg, registry, fetcher) {
  const out = [], unknown = [];
  for (const name of cfg.providers || []) {
    const common = { registry, fetcher, timeoutMs: cfg.timeoutMs };
    if (name === 'oanda') out.push(new OandaProvider({ ...common, token: cfg.oanda.token, accountId: cfg.oanda.accountId, environment: cfg.oanda.environment }));
    else if (name === 'twelvedata') out.push(new TwelveDataProvider({ ...common, apiKey: cfg.twelvedata.apiKey, realtime: cfg.twelvedata.realtime }));
    else if (name === 'coinbase') out.push(new CoinbaseProvider(common));
    else if (name === 'bridge') out.push(new BridgeProvider({ ...common, url: cfg.bridge.url, token: cfg.bridge.token, label: cfg.bridge.label }));
    else unknown.push(name);
  }
  return { providers: out, unknown };
}
