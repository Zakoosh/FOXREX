/* Normalization + data-quality gate + freshness classification.

   Canonical quote (internal):
     { symbol, provider, providerSymbol, priceType: 'BID_ASK'|'LAST', bid, ask, mid, last, spread,
       change, changePct, changeBasis, providerTime, receivedAt, realtime }
   - BID_ASK: bid and ask come from the provider; mid and spread are computed from them.
   - LAST:    the provider supplies only a last/close price; bid/ask/mid/spread stay null (never invented).
   - change/changePct only when the PROVIDER supplies them against its own reference (e.g. previous close);
     they are never derived from the latest quote alone.

   Gate (per symbol, stateful):
     rejects NaN/non-finite/zero/negative prices, crossed books (ask < bid), abnormal spreads,
     unparseable timestamps, provider timestamps in the future beyond tolerance, quotes older than the
     last accepted one (out of order), and single-update jumps beyond the class limit until a second
     quote confirms the move.
   Anti-poisoning: a rejected quote never becomes the reference. If the host clock moves backwards so
   that the cached quote lies in the future, the cached quote is discarded instead of blocking every
   newer update (the "future clock → frozen price" failure). */

export const REJECT = {
  INVALID_PRICE: 'INVALID_PRICE', CROSSED: 'CROSSED_BOOK', SPREAD: 'ABNORMAL_SPREAD', BAD_TIME: 'BAD_TIMESTAMP',
  FUTURE: 'FUTURE_TIMESTAMP', OUT_OF_ORDER: 'OUT_OF_ORDER', TOO_OLD: 'TOO_OLD', JUMP: 'UNCONFIRMED_JUMP', UNMAPPED: 'UNMAPPED_SYMBOL'
};
export const STATUS = ['LIVE', 'DELAYED', 'STALE', 'MARKET_CLOSED', 'UNAVAILABLE'];

const pos = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
const clean = x => Number(x.toPrecision(12)); // strip binary float noise (1.1111499999999999 → 1.11115)
const num = v => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v);

/** Parse provider time: ISO strings (any fractional precision), epoch seconds or epoch ms. Returns ms or NaN. */
export function parseTime(t) {
  if (t == null || t === '') return NaN;
  if (typeof t === 'number') return t < 1e12 ? t * 1000 : t;
  if (/^\d+(\.\d+)?$/.test(String(t))) return parseTime(Number(t));
  const s = String(t).replace(/(\.\d{3})\d+/, '$1'); // RFC3339 nanoseconds → ms
  return Date.parse(s);
}

/** Raw provider fields → canonical quote (no validation beyond typing). */
export function normalize(raw, { symbol, provider, providerSymbol, receivedAt, realtime = true }) {
  const bid = num(raw.bid), ask = num(raw.ask), last = num(raw.last);
  const hasBook = raw.bid != null || raw.ask != null;
  const q = { symbol, provider, providerSymbol, priceType: hasBook ? 'BID_ASK' : 'LAST', bid: null, ask: null, mid: null, last: null, spread: null,
    change: null, changePct: null, changeBasis: null, providerTime: parseTime(raw.time), receivedAt, realtime: !!realtime };
  if (hasBook) { q.bid = bid; q.ask = ask; if (pos(bid) && pos(ask)) { q.mid = clean((bid + ask) / 2); q.spread = clean(ask - bid); } if (last != null) q.last = last; }
  else q.last = last;
  const ch = num(raw.change), chp = num(raw.changePct);
  if (raw.changeBasis && Number.isFinite(ch) && Number.isFinite(chp)) { q.change = ch; q.changePct = chp; q.changeBasis = String(raw.changeBasis); }
  return q;
}

export const displayPrice = q => (q.priceType === 'BID_ASK' ? q.mid : q.last);

export class QualityGate {
  constructor({ registry, futureToleranceMs = 10e3, maxAcceptAgeMs = 7 * 24 * 3600e3 }) {
    this.registry = registry; this.futureToleranceMs = futureToleranceMs; this.maxAcceptAgeMs = maxAcceptAgeMs;
    this.pendingJump = new Map(); // symbol → candidate quote awaiting confirmation
    this.rejections = {};         // reason → count
    this.lastReject = new Map();  // symbol → { reason, at }
  }
  #reject(q, reason, now) {
    this.rejections[reason] = (this.rejections[reason] || 0) + 1;
    this.lastReject.set(q.symbol, { reason, at: now });
    return { ok: false, reason };
  }
  /** Check `q` against the previous accepted quote. Returns { ok, reason?, quote?, dropPrevious? }. */
  check(q, prev, now = Date.now()) {
    if (!q.symbol || !this.registry.get(q.symbol)) return this.#reject(q, REJECT.UNMAPPED, now);
    if (q.priceType === 'BID_ASK') {
      if (!pos(q.bid) || !pos(q.ask)) return this.#reject(q, REJECT.INVALID_PRICE, now);
      if (q.ask < q.bid) return this.#reject(q, REJECT.CROSSED, now);
      if (q.spread / q.mid > this.registry.quality(q.symbol).maxSpreadPct) return this.#reject(q, REJECT.SPREAD, now);
    } else if (!pos(q.last)) return this.#reject(q, REJECT.INVALID_PRICE, now);
    if (!Number.isFinite(q.providerTime)) return this.#reject(q, REJECT.BAD_TIME, now);
    if (q.providerTime > now + this.futureToleranceMs) return this.#reject(q, REJECT.FUTURE, now);
    if (now - q.providerTime > this.maxAcceptAgeMs) return this.#reject(q, REJECT.TOO_OLD, now);

    // Anti-poisoning: a cached quote that is now "in the future" (host clock moved back) is dropped, not trusted.
    let dropPrevious = false;
    if (prev && prev.providerTime > now + this.futureToleranceMs) { prev = null; dropPrevious = true; }
    if (prev && prev.provider === q.provider) {
      if (q.providerTime < prev.providerTime) return this.#reject(q, REJECT.OUT_OF_ORDER, now);
    }
    if (prev) {
      const a = displayPrice(prev), b = displayPrice(q), limit = this.registry.quality(q.symbol).maxJumpPct;
      if (a && Math.abs(b - a) / a > limit) {
        const cand = this.pendingJump.get(q.symbol);
        const confirmed = cand && Math.abs(b - displayPrice(cand)) / displayPrice(cand) <= limit / 4 && q.providerTime >= cand.providerTime;
        if (!confirmed) { this.pendingJump.set(q.symbol, q); return { ...this.#reject(q, REJECT.JUMP, now), dropPrevious }; }
      }
    }
    this.pendingJump.delete(q.symbol);
    return { ok: true, quote: q, dropPrevious };
  }
}

/** Freshness classification at read time. Age is measured from the PROVIDER timestamp, so a frozen feed
    that keeps answering with the same old quote ages into STALE instead of looking live. */
export function classify(q, { now = Date.now(), freshness, marketOpen, providerConnected }) {
  if (!q) return { status: 'UNAVAILABLE', ageMs: null };
  const ageMs = Math.max(0, now - q.providerTime);
  if (!marketOpen) return { status: 'MARKET_CLOSED', ageMs };
  if (!providerConnected) return { status: 'STALE', ageMs };
  if (ageMs <= freshness.liveMs && q.realtime) return { status: 'LIVE', ageMs };
  if (ageMs <= freshness.delayedMs) return { status: 'DELAYED', ageMs };
  return { status: 'STALE', ageMs };
}
