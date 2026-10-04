/* FOXREX freshness contract — how old is a value, and how may it be shown?
   Layer A (Market Data) values and price-sensitive editorial items both resolve to one status:
     LIVE · FRESH · AGING · STALE · UNAVAILABLE
   Market open/closed is a SEPARATE field (marketState). A closed market is not stale: its last
   value ages normally (AGING, "Closed · last <time>"); a value is STALE only when it is too old
   for what it claims to be. Age is always measured from the SOURCE timestamp, never from when
   FOXREX received it, so a frozen feed repeating an old value ages into STALE instead of looking live.
   Editorial content is never LIVE. Nothing here produces or estimates a price. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./time.js'));
  else root.FOXREX_FRESHNESS = factory(root.FOXREX_TIME);
})(typeof self !== 'undefined' ? self : this, function (TIME) {
  'use strict';

  const STATUSES = ['LIVE', 'FRESH', 'AGING', 'STALE', 'UNAVAILABLE'];
  const MARKET_STATES = ['OPEN', 'CLOSED', 'UNKNOWN'];
  const MIN = 60e3, HOUR = 3600e3;
  const FUTURE_TOLERANCE_MS = 10e3;

  /** Thresholds per asset class for live quotes (dataType "quote"). LIVE ≤ liveMs on a real-time entitlement;
      FRESH ≤ freshMs; AGING ≤ staleMs; beyond that STALE. While the market is closed, the last value stays
      AGING for closedAgingMs (a weekend), then becomes STALE. Defaults follow the Market Data Layer (PR #6). */
  const QUOTE_POLICY = {
    fx: { liveMs: 1 * MIN, freshMs: 5 * MIN, staleMs: 20 * MIN, closedAgingMs: 72 * HOUR },
    metal: { liveMs: 1 * MIN, freshMs: 5 * MIN, staleMs: 20 * MIN, closedAgingMs: 72 * HOUR },
    index: { liveMs: 2 * MIN, freshMs: 5 * MIN, staleMs: 20 * MIN, closedAgingMs: 72 * HOUR },
    energy: { liveMs: 2 * MIN, freshMs: 5 * MIN, staleMs: 20 * MIN, closedAgingMs: 72 * HOUR },
    crypto: { liveMs: 1 * MIN, freshMs: 2 * MIN, staleMs: 10 * MIN, closedAgingMs: 0 },
    rates: { liveMs: 5 * MIN, freshMs: 15 * MIN, staleMs: 60 * MIN, closedAgingMs: 72 * HOUR }
  };
  /** Other structured data types have their own clocks. */
  const DATA_TYPE_POLICY = {
    quote: null, // per asset class, above
    calendar: { liveMs: 0, freshMs: 24 * HOUR, staleMs: 7 * 24 * HOUR, closedAgingMs: 0 },
    candle: { liveMs: 0, freshMs: 15 * MIN, staleMs: 4 * HOUR, closedAgingMs: 72 * HOUR }
  };
  /** Symbol registry → asset class. Coverage is extensible: add a symbol here, nothing else changes. */
  const SYMBOL_CLASS = {
    XAUUSD: 'metal', XAGUSD: 'metal', EURUSD: 'fx', GBPUSD: 'fx', USDJPY: 'fx', AUDUSD: 'fx', USDCAD: 'fx', USDCHF: 'fx', NZDUSD: 'fx',
    BTCUSD: 'crypto', ETHUSD: 'crypto', DXY: 'index', US30: 'index', NAS100: 'index', SPX500: 'index', GER40: 'index', WTI: 'energy', BRENT: 'energy', US10Y: 'rates'
  };
  const assetClassOf = sym => SYMBOL_CLASS[String(sym || '').toUpperCase()] || null;

  function policyFor({ symbol, assetClass, dataType = 'quote' } = {}, overrides) {
    const cls = assetClass || assetClassOf(symbol);
    const base = dataType === 'quote' ? QUOTE_POLICY[cls] : DATA_TYPE_POLICY[dataType];
    if (!base) return null;
    const o = (overrides && (overrides[`${dataType}:${cls}`] || overrides[cls] || overrides[dataType])) || {};
    return { ...base, ...o, assetClass: cls || null, dataType };
  }

  const ms = v => { if (v == null || v === '') return NaN; const t = typeof v === 'number' ? v : Date.parse(v); return isFinite(t) ? t : NaN; };

  /** Freshness of one structured value (a quote, a calendar entry…). Never invents a value.
      value: { symbol?, assetClass?, dataType?, value|price, sourceTimestamp, receivedAt?, realtime?, marketState? } */
  function quoteFreshness(value, { now = Date.now(), overrides, marketState } = {}) {
    const out = (status, extra) => ({ status, marketState: extra.marketState || 'UNKNOWN', ageMs: extra.ageMs == null ? null : extra.ageMs, reason: extra.reason || null });
    if (!value || typeof value !== 'object') return out('UNAVAILABLE', { reason: 'NO_VALUE' });
    const v = value.price != null ? value.price : value.value;
    if (v == null || (typeof v === 'number' && !(isFinite(v) && v > 0))) return out('UNAVAILABLE', { reason: 'NO_VALID_VALUE' });
    const src = ms(value.sourceTimestamp);
    if (isNaN(src)) return out('UNAVAILABLE', { reason: 'NO_SOURCE_TIMESTAMP' });
    const t = ms(now);
    if (src > t + FUTURE_TOLERANCE_MS) return out('UNAVAILABLE', { reason: 'FUTURE_SOURCE_TIMESTAMP' });
    const policy = policyFor(value, overrides);
    if (!policy) return out('UNAVAILABLE', { reason: 'UNKNOWN_ASSET_CLASS' });
    const age = Math.max(0, t - src);
    const state = marketState || value.marketState || (policy.dataType === 'quote' && policy.assetClass ? TIME.marketState(policy.assetClass, t) : 'UNKNOWN');
    if (state === 'CLOSED') return out(age <= policy.closedAgingMs ? 'AGING' : 'STALE', { marketState: 'CLOSED', ageMs: age, reason: 'MARKET_CLOSED' });
    if (value.realtime === true && policy.liveMs > 0 && age <= policy.liveMs) return out('LIVE', { marketState: state, ageMs: age });
    if (age <= policy.freshMs) return out('FRESH', { marketState: state, ageMs: age, reason: value.realtime === true ? null : 'DELAYED_OR_SNAPSHOT' });
    if (age <= policy.staleMs) return out('AGING', { marketState: state, ageMs: age });
    return out('STALE', { marketState: state, ageMs: age, reason: 'TOO_OLD' });
  }

  /** Adapter for the Market Data Layer quote (PR #6). Its states map onto the public contract:
      LIVE→LIVE · DELAYED→FRESH/AGING by age · STALE→STALE · MARKET_CLOSED→AGING/STALE + CLOSED · UNAVAILABLE→UNAVAILABLE. */
  function fromMarketApi(q, opts = {}) {
    if (!q || q.status === 'UNAVAILABLE') return { quote: null, ...quoteFreshness(null, opts), reason: (q && q.reason) || 'NO_VALUE' };
    const value = { symbol: q.symbol, price: q.price != null ? q.price : q.last, sourceTimestamp: q.providerTime, receivedAt: q.receivedAt,
      realtime: !!(q.source && q.source.realtime), marketState: q.status === 'MARKET_CLOSED' ? 'CLOSED' : q.marketOpen === false ? 'CLOSED' : q.marketOpen === true ? 'OPEN' : undefined };
    const f = quoteFreshness(value, opts);
    if (q.status === 'STALE' && f.status !== 'UNAVAILABLE') { f.status = 'STALE'; f.reason = f.reason || 'PROVIDER_STALE'; }
    if (q.status === 'DELAYED' && f.status === 'LIVE') f.status = 'FRESH';
    return { quote: { symbol: q.symbol, price: value.price, sourceTimestamp: value.sourceTimestamp, receivedAt: value.receivedAt, source: q.source && q.source.attribution || null }, ...f };
  }

  /** Freshness of a published editorial item. Editorial is never LIVE.
      Evergreen (no validUntil) → FRESH. Otherwise FRESH until half its validity, AGING until validUntil, then STALE. */
  function itemFreshness(item, now = Date.now()) {
    if (!item) return { status: 'UNAVAILABLE', reason: 'NO_CONTENT' };
    const t = ms(now), pub = ms(item.publishedAt);
    if (isNaN(pub) || pub > t + 5 * MIN) return { status: 'UNAVAILABLE', reason: 'NOT_PUBLISHED' };
    const f = item.freshness || {};
    const until = ms(f.validUntil);
    if (isNaN(until)) return { status: 'FRESH', reason: 'EVERGREEN' };
    const start = isNaN(ms(f.dataAsOf)) ? pub : ms(f.dataAsOf);
    if (t >= until) return { status: 'STALE', reason: 'PAST_VALID_UNTIL', validUntil: f.validUntil };
    if (t >= start + (until - start) / 2) return { status: 'AGING', validUntil: f.validUntil };
    return { status: 'FRESH', validUntil: f.validUntil };
  }

  /** How a status may be displayed. Quote styling (large number, tick colour, live dot) is LIVE/FRESH only. */
  function display(status) {
    switch (status) {
      case 'LIVE': return { showValue: true, quoteStyle: true, showTime: true, label: 'Live' };
      case 'FRESH': return { showValue: true, quoteStyle: true, showTime: true, label: 'As of' };
      case 'AGING': return { showValue: true, quoteStyle: false, showTime: true, label: 'As of' };
      case 'STALE': return { showValue: false, quoteStyle: false, showTime: true, label: 'Last value at' };
      default: return { showValue: false, quoteStyle: false, showTime: false, label: null };
    }
  }

  /* ---------- validity defaults for price-sensitive editorial types ---------- */
  /** How long a published item may be presented as current, and what current-state surfaces do afterwards. */
  const STALE_POLICY = {
    MORNING_BRIEF: 'hide', US_SESSION_PREVIEW: 'hide', MARKET_RECAP: 'hide', EVENT: 'hide', GOLD_FOCUS: 'label-dated',
    ANALYSIS: 'label-dated', WEEKLY_OUTLOOK: 'label-dated', NEWS: 'archive-only', TRADING_IDEA: 'hide', SIGNAL: 'hide', REX_EXPLAINS: 'hide'
  };
  const TIMEFRAME_DAYS = { intraday: 1, m15: 1, m30: 1, h1: 1, h4: 3, d1: 7, '1-3d': 3, swing: 7, w1: 14, weekly: 14, position: 30 };
  /** Returns { validUntil, stalePolicy } or null when the item is evergreen (lessons, results). Pure and deterministic. */
  function defaultValidity(type, { publishedAt, dataAsOf, format, timeframe, eventTime, validUntil } = {}) {
    const policy = STALE_POLICY[type];
    if (!policy || (type === 'REX_EXPLAINS' && format !== 'note')) return null;
    const base = dataAsOf || publishedAt;
    if (validUntil) return { validUntil, stalePolicy: policy };
    const day = TIME.editorialDate(base), plus = h => TIME.iso(ms(base) + h * HOUR);
    let until;
    switch (type) {
      case 'MORNING_BRIEF': case 'MARKET_RECAP': until = TIME.slotAt(TIME.nextWeekday(day), 'morning-brief'); break;
      case 'GOLD_FOCUS': until = TIME.slotAt(TIME.nextWeekday(day), 'gold-focus'); break;
      case 'US_SESSION_PREVIEW': until = TIME.usSession(day).cashClose.utc; break;
      case 'EVENT': until = TIME.zonedToUtc(TIME.addDays(TIME.editorialDate(eventTime || base), 1), '00:00', TIME.IST); break;
      case 'NEWS': until = plus(48); break;
      case 'WEEKLY_OUTLOOK': until = plus(7 * 24); break;
      case 'ANALYSIS': until = plus(24 * (TIMEFRAME_DAYS[String(timeframe || '').toLowerCase()] || 7)); break;
      case 'SIGNAL': until = plus(7 * 24); break;
      case 'REX_EXPLAINS': until = plus(24); break;
      default: return null; // TRADING_IDEA requires an explicit validUntil (validated in the CMS model)
    }
    return { validUntil: TIME.iso(until), stalePolicy: policy };
  }

  /* ---------- Layer A data contracts (structured data, never editorial articles) ---------- */
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
  const HTTPS = /^https:\/\/[^\s<>"']+$/;
  /** Market Snapshot: a normalized quote with provenance. Returns error strings. */
  function validateMarketSnapshot(q) {
    const E = [];
    if (!q || typeof q !== 'object') return ['snapshot is not an object'];
    if (!/^[A-Z0-9]{2,12}$/.test(q.symbol || '')) E.push('symbol is required (uppercase registry symbol)');
    if (!(typeof q.price === 'number' && isFinite(q.price) && q.price > 0)) E.push('price must be a positive number from the provider');
    if (!ISO.test(q.sourceTimestamp || '')) E.push('sourceTimestamp (provider time, ISO UTC) is required');
    if (q.receivedAt != null && !ISO.test(q.receivedAt)) E.push('receivedAt must be ISO UTC');
    if (!q.source || typeof q.source !== 'string' || !q.source.trim()) E.push('source attribution is required');
    if (q.marketState != null && !MARKET_STATES.includes(q.marketState)) E.push('marketState must be OPEN, CLOSED or UNKNOWN');
    return E;
  }
  const IMPORTANCE = ['LOW', 'MEDIUM', 'HIGH'];
  /** Economic Event (calendar data). Times are stored in UTC; the zone of the releasing market is kept for display. */
  function validateEconomicEvent(e) {
    const E = [];
    if (!e || typeof e !== 'object') return ['event is not an object'];
    if (!/^[a-z0-9][a-z0-9-]{2,118}[a-z0-9]$/.test(e.id || '')) E.push('id is required');
    if (!(typeof e.name === 'string' && e.name.trim())) E.push('name is required');
    if (!ISO.test(e.scheduledAt || '')) E.push('scheduledAt must be ISO UTC');
    if (e.timezone != null && typeof e.timezone !== 'string') E.push('timezone must be an IANA zone name');
    if (!IMPORTANCE.includes(e.importance)) E.push('importance must be LOW, MEDIUM or HIGH');
    if (!e.source || !(typeof e.source.name === 'string' && e.source.name.trim()) || !HTTPS.test(e.source.url || '')) E.push('source with a name and https URL is required — calendar data is never invented');
    for (const k of ['actual', 'consensus', 'previous']) if (e[k] != null && typeof e[k] !== 'string' && typeof e[k] !== 'number') E.push(`${k} must be a number or string from the source`);
    if (e.actual != null && !ISO.test(e.releasedAt || '')) E.push('an actual figure requires releasedAt');
    return E;
  }

  return { STATUSES, MARKET_STATES, QUOTE_POLICY, DATA_TYPE_POLICY, SYMBOL_CLASS, STALE_POLICY, assetClassOf, policyFor, quoteFreshness, fromMarketApi, itemFreshness, display, defaultValidity, validateMarketSnapshot, validateEconomicEvent };
});
