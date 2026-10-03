/* FOXREX analytical framework — genuine indicator math (prototype copy, no production imports).
   EMA 20/50/200 · Bollinger 20,2 · RSI 14 · MACD 12,26,9 · ATR 14 · ADX 14 · Volume · Market structure (HH/HL/LH/LL, BOS, retest). */

export function ema(v, n) {
  const k = 2 / (n + 1), out = new Array(v.length).fill(null);
  let prev = null;
  for (let i = 0; i < v.length; i++) {
    if (i < n - 1) continue;
    if (prev === null) { let s = 0; for (let j = i - n + 1; j <= i; j++) s += v[j]; prev = s / n; }
    else prev = v[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function bollinger(v, n = 20, m = 2) {
  const mid = [], up = [], lo = [];
  for (let i = 0; i < v.length; i++) {
    if (i < n - 1) { mid.push(null); up.push(null); lo.push(null); continue; }
    let s = 0; for (let j = i - n + 1; j <= i; j++) s += v[j];
    const mean = s / n; let q = 0; for (let j = i - n + 1; j <= i; j++) q += (v[j] - mean) ** 2;
    const sd = Math.sqrt(q / n); mid.push(mean); up.push(mean + m * sd); lo.push(mean - m * sd);
  }
  return { mid, up, lo };
}

/** Wilder smoothing helper */
function wilder(v, n) {
  const out = new Array(v.length).fill(null); let prev = null, s = 0;
  for (let i = 0; i < v.length; i++) {
    if (v[i] == null) continue;
    if (prev === null) { s += v[i]; if (i >= n) { prev = s / n; out[i] = prev; } continue; }
    prev = (prev * (n - 1) + v[i]) / n; out[i] = prev;
  }
  return out;
}

export function rsi(c, n = 14) {
  const g = [null], l = [null];
  for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g.push(Math.max(d, 0)); l.push(Math.max(-d, 0)); }
  const ag = wilder(g, n), al = wilder(l, n);
  return c.map((_, i) => (ag[i] == null ? null : al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i])));
}

export function macd(c, f = 12, s = 26, sig = 9) {
  const ef = ema(c, f), es = ema(c, s);
  const line = c.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
  const start = line.findIndex(x => x != null);
  const sl = ema(line.slice(start), sig); const signal = line.map((_, i) => (i < start ? null : sl[i - start]));
  return { line, signal, hist: line.map((x, i) => (x != null && signal[i] != null ? x - signal[i] : null)) };
}

export function atr(h, l, c, n = 14) {
  const tr = h.map((_, i) => (i === 0 ? h[0] - l[0] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))));
  return wilder(tr, n);
}

export function adx(h, l, c, n = 14) {
  const pdm = [null], mdm = [null], tr = [null];
  for (let i = 1; i < c.length; i++) {
    const up = h[i] - h[i - 1], dn = l[i - 1] - l[i];
    pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  const str = wilder(tr, n), sp = wilder(pdm, n), sm = wilder(mdm, n);
  const pdi = c.map((_, i) => (str[i] ? 100 * sp[i] / str[i] : null)), mdi = c.map((_, i) => (str[i] ? 100 * sm[i] / str[i] : null));
  const dx = c.map((_, i) => (pdi[i] == null ? null : (pdi[i] + mdi[i] === 0 ? 0 : 100 * Math.abs(pdi[i] - mdi[i]) / (pdi[i] + mdi[i]))));
  return { adx: wilder(dx, n), pdi, mdi };
}

/** Swing pivots (k bars each side) → HH/HL/LH/LL labels, the latest BOS (close through the last swing high/low) and its retest. */
export function structure(h, l, c, a, k = 4) {
  const swings = [];
  for (let i = k; i < c.length - k; i++) {
    let isH = true, isL = true;
    for (let j = i - k; j <= i + k; j++) { if (h[j] > h[i]) isH = false; if (l[j] < l[i]) isL = false; }
    if (isH) swings.push({ i, type: 'H', price: h[i] });
    if (isL) swings.push({ i, type: 'L', price: l[i] });
  }
  let lastH = null, lastL = null;
  for (const s of swings) {
    if (s.type === 'H') { s.label = lastH == null ? 'H' : s.price > lastH.price ? 'HH' : 'LH'; lastH = s; }
    else { s.label = lastL == null ? 'L' : s.price > lastL.price ? 'HL' : 'LL'; lastL = s; }
  }
  // BOS: first close above the most recent confirmed swing high (confirmation = k bars after the pivot)
  let bos = null;
  for (let i = 1; i < c.length; i++) {
    const ref = swings.filter(s => s.type === 'H' && s.i + k < i).at(-1);
    if (ref && c[i] > ref.price && c[i - 1] <= ref.price) bos = { i, level: ref.price, from: ref.i };
  }
  let retest = null;
  if (bos) for (let i = bos.i + 1; i < c.length; i++) if (l[i] <= bos.level + 0.25 * (a[i] || 1) && c[i] > bos.level) { retest = { i, level: bos.level }; break; }
  return { swings, bos, retest };
}
