/* Small in-process fixed-window rate limiter for privileged endpoints (guards against loops and
   repeated clicks; publishing idempotency remains the primary duplicate defence). */
export const LIMITS = { publish: { max: 10, windowMs: 60e3 }, ai: { max: 10, windowMs: 60e3 }, write: { max: 120, windowMs: 60e3 } };
export class RateLimiter {
  constructor(limits = LIMITS) { this.limits = limits; this.hits = new Map(); }
  /** Returns null when allowed, or the number of seconds to wait. */
  check(cls, key, now = Date.now()) {
    const l = this.limits[cls]; if (!l) return null;
    const k = `${cls}:${key}`; let h = this.hits.get(k);
    if (!h || now >= h.reset) { h = { n: 0, reset: now + l.windowMs }; this.hits.set(k, h); }
    if (++h.n > l.max) return Math.ceil((h.reset - now) / 1000);
    if (this.hits.size > 5000) for (const [kk, v] of this.hits) if (now >= v.reset) this.hits.delete(kk);
    return null;
  }
}
