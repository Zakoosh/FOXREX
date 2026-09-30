/* FOXREX Market Data Layer — normalization, quality gate, freshness, sessions, service resilience,
   public API, secret safety, public ticker rendering (EN/AR), Studio monitoring and publishing independence.
   Providers are exercised through their REAL adapters with an injected fake fetcher: no network, no keys. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { buildRegistry, canonical, PUBLIC_DEFAULT } from '../src/market/symbols.js';
import { isOpen } from '../src/market/sessions.js';
import { normalize, QualityGate, classify, parseTime, REJECT } from '../src/market/quality.js';
import { MarketService } from '../src/market/service.js';
import { marketConfig } from '../src/config.js';
import { captured } from '../src/logger.js';
import { boot, approve, goldEN, TOKEN, ROOT } from './publish-fixture.mjs';

process.env.FOXREX_ALLOW_TEST_CONTENT = '1';
const reg = buildRegistry();
const WED = Date.parse('2026-09-30T15:00:00Z');   // Wednesday 11:00 New York — FX/metals open
const SAT = Date.parse('2026-10-03T15:00:00Z');   // Saturday
const iso = ms => new Date(ms).toISOString();
const SECRET = 'SECRET-td-key-5f1c9a';

/** Fake HTTP layer speaking each provider's real response format. `state` is mutated by tests. */
function fakeNet(state) {
  const calls = [];
  const res = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: k => headers[k.toLowerCase()] ?? null }, json: async () => body });
  const fetcher = async (url) => {
    calls.push(url);
    if (state.down) throw Object.assign(new Error('connect ECONNREFUSED'), { name: 'TypeError' });
    if (state.rateLimited) return res(429, { message: 'slow down' }, { 'retry-after': '120' });
    if (state.auth) return res(401, { errorMessage: 'bad token' });
    if (url.includes('oanda.com')) {
      const inst = decodeURIComponent(url.split('instruments=')[1]).split(',');
      return res(200, { prices: inst.filter(i => state.oanda[i]).map(i => ({ instrument: i, tradeable: state.oanda[i].tradeable !== false, time: state.oanda[i].time, bids: [{ price: String(state.oanda[i].bid) }], asks: [{ price: String(state.oanda[i].ask) }] })) });
    }
    if (url.includes('coinbase.com')) { const p = url.split('/products/')[1].split('/')[0]; const q = state.coinbase[p]; return q ? res(200, { bid: String(q.bid), ask: String(q.ask), price: String(q.last), time: q.time }) : res(404, {}); }
    if (url.includes('twelvedata.com')) {
      const syms = decodeURIComponent(url.split('symbol=')[1].split('&')[0]).split(',');
      const one = s => state.twelve[s] ? { symbol: s, close: String(state.twelve[s].close), timestamp: state.twelve[s].ts, previous_close: '1', change: String(state.twelve[s].change), percent_change: String(state.twelve[s].pct), is_market_open: true } : { status: 'error', code: 404 };
      return res(200, syms.length === 1 ? one(syms[0]) : Object.fromEntries(syms.map(s => [s, one(s)])));
    }
    return res(404, {});
  };
  return { fetcher, calls };
}
const svc = (providers, state, extra = {}) => { const net = fakeNet(state); return { net, s: new MarketService({ config: { providers, symbols: PUBLIC_DEFAULT, oanda: { token: 'tok', accountId: 'acc' }, twelvedata: { apiKey: SECRET }, ...extra }, fetcher: net.fetcher }) }; };
const oandaState = (t, over = {}) => ({ oanda: { XAU_USD: { bid: 3301.1, ask: 3301.6, time: iso(t) }, EUR_USD: { bid: 1.08501, ask: 1.08509, time: iso(t) }, ...over }, coinbase: {}, twelve: {} });

/* ---------- registry / normalization ---------- */
test('symbol registry: canonical symbols, provider mappings in one place, operator overrides, reverse lookup', () => {
  assert.deepEqual(PUBLIC_DEFAULT, ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD', 'DXY']);
  for (const s of ['XAGUSD', 'US30', 'NAS100', 'SPX500', 'WTI', 'ETHUSD']) assert.ok(reg.get(s), `${s} prepared`);
  assert.equal(canonical('xau/usd'), 'XAUUSD'); assert.equal(canonical('BTC-USD'), 'BTCUSD'); assert.equal(canonical('EUR_USD'), 'EURUSD'); assert.equal(canonical('FOO'), null);
  assert.equal(reg.providerSymbol('XAUUSD', 'twelvedata'), 'XAU/USD'); assert.equal(reg.providerSymbol('BTCUSD', 'coinbase'), 'BTC-USD');
  assert.equal(reg.providerSymbol('DXY', 'oanda'), null, 'DXY is never guessed for a provider that does not carry it');
  const r2 = buildRegistry({ overrides: 'bridge:XAUUSD=XAUUSD.m;bridge:NOPE=X' });
  assert.equal(r2.providerSymbol('XAUUSD', 'bridge'), 'XAUUSD.m'); assert.equal(r2.fromProvider('bridge', 'XAUUSD.m'), 'XAUUSD'); assert.equal(r2.get('NOPE'), null);
  // no provider symbol literals outside the registry
  for (const f of ['service.js', 'quality.js', 'routes.js', 'providers/base.js']) assert.ok(!/XAU_USD|XAU\/USD|BTC-USD/.test(fs.readFileSync(new URL(`../src/market/${f}`, import.meta.url), 'utf8')), f);
});

test('normalization: bid/ask → mid + spread; last-only stays last-only; change only when provider-supplied', () => {
  const a = normalize({ bid: '3301.10', ask: '3301.60', time: '2026-09-30T14:59:58.123456789Z' }, { symbol: 'XAUUSD', provider: 'oanda', providerSymbol: 'XAU_USD', receivedAt: WED });
  assert.equal(a.priceType, 'BID_ASK'); assert.equal(a.mid, 3301.35); assert.ok(Math.abs(a.spread - 0.5) < 1e-9); assert.equal(a.providerTime, Date.parse('2026-09-30T14:59:58.123Z'));
  assert.equal(a.change, null, 'no change without a provider reference');
  const l = normalize({ last: '1.0851', time: 1790000000, change: '0.001', changePct: '0.09', changeBasis: 'provider previous close' }, { symbol: 'EURUSD', provider: 'twelvedata', providerSymbol: 'EUR/USD', receivedAt: WED });
  assert.equal(l.priceType, 'LAST'); assert.equal(l.bid, null); assert.equal(l.ask, null); assert.equal(l.mid, null); assert.equal(l.last, 1.0851);
  assert.equal(l.providerTime, 1790000000 * 1000); assert.equal(l.changePct, 0.09); assert.equal(l.changeBasis, 'provider previous close');
  assert.ok(Number.isNaN(parseTime('not a date')));
});

/* ---------- quality gate ---------- */
test('quality gate: rejects NaN, zero, negative, crossed book, abnormal spread, bad and future timestamps', () => {
  const g = new QualityGate({ registry: reg });
  const q = (raw, symbol = 'XAUUSD') => normalize({ time: iso(WED - 1000), ...raw }, { symbol, provider: 'oanda', providerSymbol: 'x', receivedAt: WED });
  const reason = raw => g.check(q(raw), null, WED).reason;
  assert.equal(g.check(q({ bid: 3300, ask: 3300.4 }), null, WED).ok, true);
  assert.equal(reason({ bid: 'NaN', ask: 3300 }), REJECT.INVALID_PRICE);
  assert.equal(reason({ bid: 0, ask: 3300 }), REJECT.INVALID_PRICE);
  assert.equal(reason({ bid: -1, ask: 3300 }), REJECT.INVALID_PRICE);
  assert.equal(reason({ last: 0 }), REJECT.INVALID_PRICE);
  assert.equal(reason({ bid: 3301, ask: 3300 }), REJECT.CROSSED);
  assert.equal(reason({ bid: 3000, ask: 3300 }), REJECT.SPREAD);
  assert.equal(reason({ bid: 3300, ask: 3300.4, time: 'garbage' }), REJECT.BAD_TIME);
  assert.equal(reason({ bid: 3300, ask: 3300.4, time: iso(WED + 60e3) }), REJECT.FUTURE);
  assert.equal(g.check(normalize({ bid: 1, ask: 1.1, time: iso(WED) }, { symbol: 'NOPE', provider: 'oanda', receivedAt: WED }), null, WED).reason, REJECT.UNMAPPED);
  assert.ok(g.rejections.FUTURE_TIMESTAMP >= 1 && g.rejections.INVALID_PRICE >= 4);
});

test('quality gate: out-of-order rejected; a future timestamp never poisons the cache; clock regression self-heals', async () => {
  const st = oandaState(WED - 2000); const { s } = svc(['oanda'], st);
  await s.pollAll(() => WED); assert.equal(s.cache.get('XAUUSD').bid, 3301.1);
  st.oanda.XAU_USD = { bid: 3290, ask: 3290.5, time: iso(WED - 60e3) };             // older → OUT_OF_ORDER
  await s.pollAll(() => WED); assert.equal(s.cache.get('XAUUSD').bid, 3301.1);
  st.oanda.XAU_USD = { bid: 3302, ask: 3302.5, time: iso(WED + 3600e3) };           // provider clock 1h ahead → FUTURE
  await s.pollAll(() => WED); assert.equal(s.cache.get('XAUUSD').bid, 3301.1, 'future quote not stored');
  st.oanda.XAU_USD = { bid: 3303, ask: 3303.5, time: iso(WED + 1000) };             // next honest quote is accepted
  await s.pollAll(() => WED + 2000); assert.equal(s.cache.get('XAUUSD').bid, 3303, 'no frozen price after a bad timestamp');
  // host clock moved backwards: the cached quote is now "in the future" → dropped, newer honest quotes flow again
  s.cache.get('XAUUSD').providerTime = WED + 3600e3;
  st.oanda.XAU_USD = { bid: 3304, ask: 3304.5, time: iso(WED + 3000) };
  await s.pollAll(() => WED + 4000); assert.equal(s.cache.get('XAUUSD').bid, 3304);
  assert.ok(s.gate.rejections.OUT_OF_ORDER >= 1 && s.gate.rejections.FUTURE_TIMESTAMP >= 1);
});

test('quality gate: a single spike is held until a second quote confirms the move', async () => {
  const st = oandaState(WED - 5000); const { s } = svc(['oanda'], st);
  await s.pollAll(() => WED);
  st.oanda.XAU_USD = { bid: 3800, ask: 3800.5, time: iso(WED - 4000) };               // +15 % in one tick
  await s.pollAll(() => WED); assert.equal(s.cache.get('XAUUSD').bid, 3301.1, 'unconfirmed jump rejected');
  st.oanda.XAU_USD = { bid: 3801, ask: 3801.5, time: iso(WED - 3000) };               // confirmed
  await s.pollAll(() => WED); assert.equal(s.cache.get('XAUUSD').bid, 3801, 'confirmed move accepted — no permanent freeze');
});

/* ---------- freshness / sessions ---------- */
test('freshness: LIVE → DELAYED → STALE per asset class; delayed plans never show LIVE', () => {
  const q = { providerTime: WED, realtime: true };
  const fr = reg.freshness('XAUUSD');
  const at = ms => classify(q, { now: WED + ms, freshness: fr, marketOpen: true, providerConnected: true }).status;
  assert.equal(at(5e3), 'LIVE'); assert.equal(at(fr.liveMs + 1), 'DELAYED'); assert.equal(at(fr.delayedMs + 1), 'STALE');
  assert.equal(classify({ ...q, realtime: false }, { now: WED + 1000, freshness: fr, marketOpen: true, providerConnected: true }).status, 'DELAYED');
  assert.equal(classify(q, { now: WED + 1000, freshness: fr, marketOpen: true, providerConnected: false }).status, 'STALE', 'disconnected provider → STALE');
  assert.equal(classify(null, { now: WED, freshness: fr, marketOpen: true, providerConnected: true }).status, 'UNAVAILABLE');
  assert.notDeepEqual(reg.freshness('BTCUSD'), undefined); assert.ok(reg.freshness('DXY').liveMs >= reg.freshness('EURUSD').liveMs);
});

test('market sessions: FX/metals weekend closed, metals daily break, crypto always open (DST-aware)', () => {
  assert.equal(isOpen('fx', WED), true); assert.equal(isOpen('fx', SAT), false); assert.equal(isOpen('always', SAT), true);
  assert.equal(isOpen('fx', Date.parse('2026-10-02T20:59:00Z')), true, 'Fri 16:59 NY (EDT)');
  assert.equal(isOpen('fx', Date.parse('2026-10-02T21:01:00Z')), false, 'Fri 17:01 NY');
  assert.equal(isOpen('fx', Date.parse('2026-10-04T21:01:00Z')), true, 'Sun 17:01 NY FX open');
  assert.equal(isOpen('metal', Date.parse('2026-10-04T21:30:00Z')), false, 'metals open Sun 18:00 NY');
  assert.equal(isOpen('metal', Date.parse('2026-09-30T21:30:00Z')), false, 'daily 17:00–18:00 NY break');
  assert.equal(isOpen('fx', Date.parse('2026-12-02T21:30:00Z')), true, 'winter (EST) weekday');
});

test('market closed: weekend quotes are MARKET_CLOSED (never LIVE); provider tradeable=false also closes', async () => {
  const st = oandaState(SAT - 60e3); const { s } = svc(['oanda'], st);
  await s.pollAll(() => SAT);
  assert.equal(s.view('XAUUSD', SAT).status, 'MARKET_CLOSED');
  const st2 = oandaState(WED - 1000, { XAU_USD: { bid: 3301, ask: 3301.5, time: iso(WED - 1000), tradeable: false } }); const b = svc(['oanda'], st2);
  await b.s.pollAll(() => WED);
  assert.equal(b.s.view('XAUUSD', WED).status, 'MARKET_CLOSED'); assert.equal(b.s.view('EURUSD', WED).status, 'LIVE');
});

/* ---------- service resilience ---------- */
test('provider disconnect: state degrades, last quote kept internally but served STALE, backoff grows without storms', async () => {
  const now = Date.now(); const st = oandaState(now - 1000); const { s, net } = svc(['oanda'], st);
  await s.pollAll(); assert.equal(s.view('XAUUSD').status === 'LIVE' || s.view('XAUUSD').status === 'MARKET_CLOSED', true);
  st.down = true;
  const p = s.providers[0];
  const [r1, r2] = await Promise.all([s.poll(p), s.poll(p)]);
  assert.ok(r2.skipped === 'inflight' || r1.skipped === 'inflight', 'single-flight: concurrent polls collapse');
  await s.poll(p); await s.poll(p);
  const stt = s.state.get('oanda'); assert.equal(stt.state, 'DISCONNECTED'); assert.ok(stt.failures >= 3);
  const v = s.view('XAUUSD');
  assert.ok(['STALE', 'MARKET_CLOSED'].includes(v.status)); assert.notEqual(v.status, 'LIVE'); assert.equal(v.price, 3301.35, 'last verified quote retained, labelled');
  // backoff schedule actually used by the service: exponential with jitter, capped, never below the poll interval
  const delay = f => { stt.failures = f; stt.state = 'DISCONNECTED'; return s.nextDelay(p); };
  assert.ok(delay(1) >= stt.pollMs && delay(1) < delay(4) && delay(4) < delay(8)); assert.ok(delay(30) <= s.cfg.maxBackoffMs * 1.2);
  assert.ok(net.calls.length <= 6, `no request storm (${net.calls.length} calls)`);
});

test('provider reconnect: an unhealthy provider is probed and recovers to CONNECTED/LIVE', async () => {
  const now = Date.now(); const st = oandaState(now - 1000); st.down = true; const { s, net } = svc(['oanda'], st);
  for (let i = 0; i < 3; i++) await s.pollAll();
  assert.equal(s.state.get('oanda').state, 'DISCONNECTED'); assert.equal(s.view('EURUSD').status, 'UNAVAILABLE');
  await s.pollAll(); // while DISCONNECTED only a single probe symbol is requested
  const probe = net.calls.at(-1); assert.ok(/instruments=XAU_USD$/.test(probe), 'only one probe symbol while unhealthy');
  st.down = false; st.oanda.XAU_USD.time = iso(Date.now() - 500); st.oanda.EUR_USD.time = iso(Date.now() - 500);
  await s.pollAll(); await s.pollAll();
  assert.equal(s.state.get('oanda').state, 'CONNECTED'); assert.equal(s.state.get('oanda').failures, 0);
  assert.ok(s.cache.get('EURUSD'), 'all symbols resume after recovery');
});

test('rate limiting: 429 honours Retry-After and fails over to the next provider that maps the symbol', async () => {
  const now = Date.now();
  const st = { ...oandaState(now - 1000), twelve: { 'XAU/USD': { close: 3301.2, ts: Math.floor((now - 1000) / 1000), change: 5, pct: 0.15 } } };
  const { s } = svc(['oanda', 'twelvedata'], st);
  st.rateLimited = true;
  await s.poll(s.providers[0]);
  const o = s.state.get('oanda'); assert.equal(o.state, 'RATE_LIMITED'); assert.equal(o.retryAfterMs, 120000);
  assert.equal(s.providerFor('XAUUSD').name, 'twelvedata', 'failover while rate-limited');
  st.rateLimited = false;
  await s.poll(s.providers[1]);
  const v = s.view('XAUUSD');
  assert.equal(v.source.provider, 'Twelve Data'); assert.equal(v.priceType, 'LAST'); assert.equal(v.bid, null); assert.equal(v.changeBasis, 'provider previous close');
  assert.notEqual(v.status, 'LIVE', 'Twelve Data is treated as delayed unless TWELVEDATA_REALTIME=true');
});

test('missing credentials: BLOCKED_MISSING_CREDENTIALS with zero network calls; no provider → honest UNAVAILABLE', async () => {
  const net = fakeNet(oandaState(WED));
  const s = new MarketService({ config: { providers: ['oanda', 'twelvedata'], symbols: PUBLIC_DEFAULT, oanda: {}, twelvedata: {} }, fetcher: net.fetcher });
  await s.pollAll(); s.start(); s.stop();
  assert.equal(net.calls.length, 0);
  const st = s.status(); assert.equal(st.state, 'BLOCKED_MISSING_CREDENTIALS');
  assert.deepEqual(st.providers.map(p => p.missing), [['OANDA_API_TOKEN', 'OANDA_ACCOUNT_ID'], ['TWELVEDATA_API_KEY']]);
  const none = new MarketService({ config: { providers: [], symbols: PUBLIC_DEFAULT } });
  const q = none.quotes().quotes; assert.equal(q.length, 6);
  assert.ok(q.every(x => x.status === 'UNAVAILABLE' && x.price === null && x.reason === 'NO_PROVIDER_CONFIGURED'));
  assert.equal(none.status().state, 'DISABLED');
  const cfg = marketConfig({ MARKET_PROVIDER: 'twelvedata', MARKET_API_KEY: 'k' });
  assert.equal(cfg.twelvedata.apiKey, 'k', 'MARKET_API_KEY applies to the first provider');
  assert.deepEqual(marketConfig({ MARKET_PUBLIC_ORIGINS: '*,https://foxrex.co' }).publicOrigins, ['https://foxrex.co'], '"*" is never accepted');
});

test('missing symbol: a symbol no configured provider maps is UNAVAILABLE (NOT_COVERED), never approximated', async () => {
  const now = Date.now(); const st = oandaState(now - 1000); const { s } = svc(['oanda'], st);
  await s.pollAll();
  const dxy = s.view('DXY'); assert.equal(dxy.status, 'UNAVAILABLE'); assert.equal(dxy.reason, 'NOT_COVERED_BY_PROVIDER'); assert.equal(dxy.price, null);
  const btc = s.view('BTCUSD'); assert.equal(btc.price, null);
});

/* ---------- public API over HTTP ---------- */
test('public API: read-only, cache-backed (visitors never hit the provider), exact CORS, no secrets', async t => {
  const now = Date.now();
  const st = { ...oandaState(now - 1000), twelve: {} }; const net = fakeNet(st);
  const market = new MarketService({ config: { providers: ['oanda'], symbols: PUBLIC_DEFAULT, oanda: { token: SECRET, accountId: 'acct-777' } }, fetcher: net.fetcher });
  await market.pollAll();
  captured.length = 0;
  const { base, api } = await boot(t, { market: { publicOrigins: ['https://foxrex.co'] } }, {}, { market });
  const before = net.calls.length;
  for (let i = 0; i < 40; i++) await fetch(base + '/api/market/quotes');
  assert.equal(net.calls.length, before, 'no upstream call per visitor');
  const r = await fetch(base + '/api/market/quotes', { headers: { Origin: 'https://foxrex.co' } });
  assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), 'https://foxrex.co'); assert.match(r.headers.get('cache-control'), /max-age=5/);
  const body = await r.json();
  assert.ok(body.asOf && Array.isArray(body.quotes) && body.quotes.length === 6); assert.deepEqual(body.attribution, ['Data: OANDA']);
  const x = body.quotes.find(q => q.symbol === 'XAUUSD');
  for (const k of ['provider', 'providerSymbol']) assert.ok(x.source[k]);
  for (const k of ['providerTime', 'receivedAt', 'ageMs', 'status', 'bid', 'ask', 'mid', 'spread']) assert.ok(k in x, k);
  assert.equal((await fetch(base + '/api/market/quotes', { headers: { Origin: 'https://evil.example' } })).headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(base + '/api/market/quotes', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/api/market/quote/xau-usd')).status, 200);
  assert.equal((await fetch(base + '/api/market/quote/NOPE')).status, 404);
  const one = await (await fetch(base + '/api/market/quotes?symbols=XAUUSD,EURUSD,FOO')).json(); assert.deepEqual(one.quotes.map(q => q.symbol), ['XAUUSD', 'EURUSD']);
  // no secret anywhere public or in Studio status, and never in logs
  const texts = [JSON.stringify(body), JSON.stringify((await api('GET', '/api/system/status')).body), JSON.stringify((await api('GET', '/api/system/market')).body), captured.join('\n')];
  for (const txt of texts) { assert.ok(!txt.includes(SECRET), 'secret leaked'); assert.ok(!txt.includes('acct-777'), 'account id leaked'); assert.ok(!/oanda\.com|apikey=/i.test(txt), 'provider URL leaked'); }
});

test('public API rate limit: per-client 429 with Retry-After', async () => {
  const { createMarketRoutes } = await import('../src/market/routes.js');
  const { RateLimiter } = await import('../src/ratelimit.js');
  const handle = createMarketRoutes({ service: new MarketService({ config: { providers: [], symbols: PUBLIC_DEFAULT } }), limiter: new RateLimiter({ market: { max: 2, windowMs: 60e3 } }) });
  const call = () => { let code, headers; const res = { writeHead: (c, h) => { code = c; headers = h; }, end: () => {} }; handle({ method: 'GET', headers: {}, socket: { remoteAddress: '203.0.113.5' } }, res, new URL('http://x/api/market/quotes')); return { code, headers }; };
  assert.equal(call().code, 200); assert.equal(call().code, 200);
  const third = call(); assert.equal(third.code, 429); assert.ok(+third.headers['Retry-After'] > 0);
});

test('provider errors never echo credentials or URLs', async () => {
  const st = oandaState(WED); st.auth = true; const { s } = svc(['twelvedata'], st);
  await s.pollAll();
  const e = s.state.get('twelvedata');
  assert.equal(e.state, 'AUTH_FAILED'); assert.ok(!e.lastError.includes(SECRET) && !/https?:/.test(e.lastError), e.lastError);
  assert.ok(!JSON.stringify(s.status()).includes(SECRET));
});

/* ---------- public ticker (EN + AR) ---------- */
function fakeTicker(lang, api) {
  const mk = (tag, attrs = {}) => ({ tag, attrs: { ...attrs }, children: [], textContent: '', className: '', title: '',
    getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = String(v); }, hasAttribute(k) { return k in this.attrs; },
    appendChild(c) { this.children.push(c); return c; },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) { const out = []; const walk = n => { for (const c of n.children) { if (match(c, sel)) out.push(c); walk(c); } }; walk(this); return out; } });
  const match = (n, sel) => { const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel) || /^\.([\w-]+)$/.exec(sel); if (!m) return false; if (sel[0] === '.') return n.className.split(' ').includes(m[1]); return m[2] === undefined ? m[1] in n.attrs : n.attrs[m[1]] === m[2]; };
  const ticker = mk('section', { 'data-market-ticker': '', ...(api ? { 'data-market-api': api } : {}) });
  const state = ticker.appendChild(mk('span', { 'data-market-state': '' })); state.textContent = 'Market feed not connected';
  for (const s of PUBLIC_DEFAULT) { const li = ticker.appendChild(mk('li', { 'data-symbol': s })); li.appendChild(mk('span', { 'data-px': '' })).textContent = '—'; li.appendChild(mk('span', { 'data-chg': '' })); }
  const document = { documentElement: { lang }, hidden: false, querySelector: s => (s === '[data-market-ticker]' ? ticker : null), createElement: t => mk(t), addEventListener() {} };
  return { ticker, state, document, item: s => ticker.querySelector(`[data-symbol="${s}"]`) };
}
async function runTicker(lang, api, payload) {
  const dom = fakeTicker(lang, api); let fetched = 0;
  const ctx = { document: dom.document, window: {}, location: { hostname: 'foxrex.co' }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    fetch: async () => { fetched++; return { ok: true, json: async () => payload }; } };
  ctx.window.fetch = ctx.fetch;
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'scripts/public/market.js'), 'utf8'), ctx);
  await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  return { ...dom, fetched: () => fetched };
}
const Q = (symbol, status, extra = {}) => ({ symbol, status, price: 3301.35, decimals: 2, ageMs: 2000, liveWithinMs: 60e3, staleAfterMs: 1200e3, priceType: 'BID_ASK', bid: 3301.1, ask: 3301.6, providerTime: iso(Date.now() - 2000), source: { provider: 'OANDA', providerSymbol: 'XAU_USD', attribution: 'Data: OANDA' }, change: null, changePct: null, changeBasis: null, ...extra });

test('public ticker: no API configured → keeps the honest "not connected" state and makes no request', async () => {
  const t = await runTicker('en', '', null);
  assert.equal(t.fetched(), 0); assert.equal(t.state.textContent, 'Market feed not connected'); assert.equal(t.item('XAUUSD').querySelector('[data-px]').textContent, '—');
  const bad = await runTicker('en', 'http://market.example', null); assert.equal(bad.fetched(), 0, 'plain http API refused on a public page');
});

test('public ticker: LIVE/DELAYED/STALE/CLOSED/UNAVAILABLE rendered distinctly; change only when provider-supplied', async () => {
  const payload = { asOf: iso(Date.now()), quotes: [
    Q('XAUUSD', 'LIVE'), Q('EURUSD', 'DELAYED', { price: 1.08505, decimals: 5, change: 0.001, changePct: 0.12, changeBasis: 'provider previous close' }),
    Q('GBPUSD', 'STALE', { price: 1.27, decimals: 5, ageMs: 3 * 3600e3 }), Q('USDJPY', 'MARKET_CLOSED', { price: 149.123, decimals: 3 }),
    { symbol: 'BTCUSD', status: 'UNAVAILABLE', price: null }, Q('DXY', 'LIVE', { price: 101.2, changePct: 0.5, change: 0.5, changeBasis: null }) ] };
  const t = await runTicker('en', 'https://market.foxrex.co', payload);
  const px = s => t.item(s).querySelector('[data-px]').textContent, chg = s => t.item(s).querySelector('[data-chg]').textContent, st = s => t.item(s).getAttribute('data-status'), tag = s => (t.item(s).querySelector('.fx-ticker__tag') || {}).textContent;
  assert.equal(px('XAUUSD'), '3,301.35'); assert.equal(st('XAUUSD'), 'LIVE'); assert.equal(tag('XAUUSD'), '');
  assert.equal(st('EURUSD'), 'DELAYED'); assert.equal(tag('EURUSD'), 'Delayed'); assert.equal(chg('EURUSD'), '+0.12%');
  assert.equal(st('GBPUSD'), 'STALE'); assert.match(tag('GBPUSD'), /^Stale · 3h$/);
  assert.equal(st('USDJPY'), 'MARKET_CLOSED'); assert.equal(tag('USDJPY'), 'Market closed'); assert.equal(px('USDJPY'), '149.123');
  assert.equal(px('BTCUSD'), '—'); assert.equal(st('BTCUSD'), 'UNAVAILABLE');
  assert.equal(chg('DXY'), '', 'no change without a provider basis');
  assert.match(t.state.textContent, /Partly stale · OANDA/);
});

test('public ticker (Arabic): status labels in Arabic, prices stay Latin digits', async () => {
  const t = await runTicker('ar', 'https://market.foxrex.co', { asOf: iso(Date.now()), quotes: [Q('XAUUSD', 'LIVE'), Q('EURUSD', 'STALE', { ageMs: 7200e3 }), Q('GBPUSD', 'MARKET_CLOSED')] });
  assert.equal(t.item('XAUUSD').querySelector('[data-px]').textContent, '3,301.35');
  assert.match(t.item('EURUSD').querySelector('.fx-ticker__tag').textContent, /^قديم/);
  assert.equal(t.item('GBPUSD').querySelector('.fx-ticker__tag').textContent, 'السوق مغلق');
  assert.equal(t.item('USDJPY').querySelector('[data-px]').textContent, '—');
  assert.match(t.state.textContent, /بيانات قديمة جزئيًا/);
});

test('public ticker: a LIVE quote ages locally into DELAYED then STALE if the API stops answering', async () => {
  const t = await runTicker('en', 'https://market.foxrex.co', { asOf: iso(Date.now()), quotes: [Q('XAUUSD', 'LIVE')] });
  const src = fs.readFileSync(path.join(ROOT, 'scripts/public/market.js'), 'utf8');
  const ctx = { document: fakeTicker('en', 'https://market.foxrex.co').document, window: {}, location: { hostname: 'foxrex.co' }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, fetch: () => new Promise(() => {}) };
  ctx.window.fetch = ctx.fetch; vm.createContext(ctx); vm.runInContext(src, ctx);
  const current = ctx.window.FOXREX_MARKET_UI.current;
  // In this context nothing has loaded yet (fetchedAt = 0), so any quote is maximally aged → STALE, never LIVE.
  assert.equal(current(Q('XAUUSD', 'LIVE', { ageMs: 1000 })), 'STALE');
  assert.equal(current(Q('XAUUSD', 'MARKET_CLOSED')), 'MARKET_CLOSED');
  assert.equal(current({ symbol: 'X', status: 'LIVE', price: NaN }), 'UNAVAILABLE');
  assert.equal(t.item('XAUUSD').getAttribute('data-status'), 'LIVE');
});

test('generated site: ticker still ships empty and "not connected" until MARKET_API is set; no provider hosts or keys in static files', () => {
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const f of ['index.html', 'ar/index.html', 'markets/index.html', 'ar/markets/index.html']) {
    const h = read(f); assert.ok([...h.matchAll(/data-px>([^<]*)</g)].every(m => m[1] === '—'), f);
    assert.ok(!/data-market-api="(?!https:\/\/)/.test(h), f);
  }
  const all = ['scripts/public/market.js', 'scripts/public/content.js', 'index.html', 'studio/cms-studio.js'].map(read).join('\n');
  assert.ok(!/oanda\.com|twelvedata\.com|coinbase\.com|apikey=|MARKET_API_KEY|TWELVEDATA_API_KEY|OANDA_API_TOKEN/.test(all), 'no provider endpoints or credential names in browser code');
});

/* ---------- Studio monitoring ---------- */
test('Studio System Status shows market provider, connection, last update, live/stale counts — never secrets', () => {
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const VIEWS = {}, ctx = { window: {}, VIEWS, ACT: {}, S: {}, DB: { settings: { workerUrl: 'http://127.0.0.1:8787', operatorName: 'Zak' } }, document: { addEventListener() {} }, render() {}, go() {}, toast() {}, $: () => null };
  ctx.window.FOXREX_CMS = (() => { const m = { exports: {} }; vm.runInNewContext(read('studio/cms-model.js'), { module: m, self: {} }); return m.exports; })();
  vm.createContext(ctx); vm.runInContext(read('studio/cms-studio.js'), ctx); ctx.window.installCmsStudio();
  const now = Date.now(); const st = oandaState(now - 1000); const { s } = svc(['oanda', 'twelvedata'], st, { twelvedata: {} });
  return s.pollAll().then(() => {
    const market = s.status();
    ctx.S.cms = { list: [], config: null, sys: { health: { worker: 'HEALTHY', uptimeSeconds: 1, version: '0.3.0' }, readiness: { cms: { state: 'READY', records: 0 }, publishingRepo: { state: 'READY', branch: 'main', expectedBranch: 'main', clean: true }, git: { state: 'READY' }, github: { state: 'READY' }, ai: { state: 'DISABLED' }, publishing: { state: 'READY', mode: 'dry-run', modeLabel: 'DRY RUN' }, scheduler: { state: 'DISABLED' }, backups: { state: 'READY', count: 0, keep: 72 }, audit: { state: 'READY', entries: 0 }, market }, deployment: {} } };
    const html = VIEWS.system();
    assert.match(html, /data-component="Market data"/); assert.match(html, /data-market-panel/);
    assert.match(html, /OANDA/); assert.match(html, /Twelve Data/); assert.match(html, /BLOCKED_MISSING_CREDENTIALS/); assert.match(html, /Missing TWELVEDATA_API_KEY/);
    assert.match(html, /data-market-symbol="XAUUSD"/); assert.match(html, /live \d/);
    assert.ok(!html.includes('tok') || !/Bearer|acc\b/.test(html)); assert.ok(!html.includes(SECRET));
  });
});

/* ---------- Gold + publishing independence ---------- */
test('publishing works while market data is down; a live quote never rewrites a published Gold Focus price snapshot', async t => {
  const st = oandaState(Date.now() - 1000); st.down = true; const net = fakeNet(st);
  const market = new MarketService({ config: { providers: ['oanda'], symbols: PUBLIC_DEFAULT, oanda: { token: 'tok', accountId: 'acc' } }, fetcher: net.fetcher });
  for (let i = 0; i < 3; i++) await market.pollAll();
  const { api, repo } = await boot(t, {}, {}, { market });
  assert.equal((await api('GET', '/api/system/status')).body.readiness.publishing.state, 'READY', 'market outage does not affect publishing readiness');
  const snap = { price: 3301.35, priceSource: 'OANDA XAU_USD (mid)', priceTime: '2026-09-30T08:59:58.000Z' };
  const c = await api('POST', '/api/content', { ...goldEN, fields: { ...goldEN.fields, ...snap } }); assert.equal(c.status, 201, JSON.stringify(c.body));
  const r = await approve(api, c.body.id);
  const f = await api('GET', '/api/feed');
  const p = await api('POST', '/api/publish', { contentId: r.id, expectedVersion: f.body.version, confirm: true }); assert.equal(p.status, 200, JSON.stringify(p.body));
  // market recovers with a very different live price
  st.down = false; st.oanda.XAU_USD = { bid: 3350, ask: 3350.5, time: iso(Date.now() - 500) };
  for (let i = 0; i < 2; i++) await market.pollAll();
  const feed = JSON.parse(fs.readFileSync(path.join(repo.work, 'data/content.json'), 'utf8'));
  const g = feed.items.find(i => i.id === r.id);
  assert.equal(g.price, 3301.35); assert.equal(g.priceSource, snap.priceSource); assert.equal(g.priceTime, snap.priceTime);
  const rec = (await api('GET', `/api/content/${r.id}`)).body; assert.equal(rec.fields.price, 3301.35);
  const live = (await api('GET', '/api/system/market')).body.quotes.find(q => q.symbol === 'XAUUSD'); assert.ok(live.price > 3349, 'live quote is separate');
});

test('Studio Gold snapshot copies only a LIVE/DELAYED verified quote (price + source + time) and refuses stale data', async () => {
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const mk = status => ({ status: { state: 'READY' }, asOf: iso(Date.now()), quotes: [{ symbol: 'XAUUSD', status, price: 3301.3456, decimals: 2, priceType: 'BID_ASK', providerTime: '2026-09-30T08:59:58.000Z', source: { provider: 'OANDA', providerSymbol: 'XAU_USD' } }] });
  let payload = mk('STALE'); const toasts = [];
  const VIEWS = {}, ACT = {}, ctx = { window: {}, VIEWS, ACT, S: {}, DB: { settings: { workerUrl: 'http://127.0.0.1:8787', workerToken: 't', operatorName: 'Zak' } }, document: { addEventListener() {} }, render() {}, go() {}, toast: m => toasts.push(m), $: () => null,
    fetch: async () => ({ ok: true, status: 200, json: async () => payload }) };
  ctx.window.FOXREX_CMS = (() => { const m = { exports: {} }; vm.runInNewContext(read('studio/cms-model.js'), { module: m, self: {} }); return m.exports; })();
  vm.createContext(ctx); vm.runInContext(read('studio/cms-studio.js'), ctx); ctx.window.installCmsStudio();
  ctx.S.cms = { draft: { type: 'GOLD_FOCUS', fields: { price: null, priceSource: '', priceTime: null } }, rec: { id: 'x' } };
  await ACT['cms-gold-snapshot']();
  assert.equal(ctx.S.cms.draft.fields.price, null, 'stale quote never snapshotted'); assert.match(ctx.S.cms.err, /STALE/);
  payload = mk('LIVE');
  await ACT['cms-gold-snapshot']();
  assert.deepEqual({ ...ctx.S.cms.draft.fields }, { price: 3301.35, priceSource: 'OANDA XAU_USD (mid)', priceTime: '2026-09-30T08:59:58.000Z' });
  assert.equal(ctx.S.cms.dirty, true, 'operator must still review and save');
});
