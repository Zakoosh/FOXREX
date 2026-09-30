/* FOXREX — "Enter the mind of FOXREX". Experimental cinematic prototype (isolated from production).

   One continuous world, one particle population. Scroll is the film's timeline: every scene is a
   FORMATION the same particles morph into (noise → attention → streams → candles → memories →
   feature space → evidence → gate → horizon → constellation → system), with a camera, REX and a
   vector layer (chart, indicators, lines) on top. Canvas 2D + DOM typography; no libraries.

   Data: everything market-like here is DEMO_DATA (./demo-data.js) and labelled on screen. */
import { makeCandles, analyse, EVIDENCE, REPLAY, DECISION, RISK_CASES, ASK, MARKETS, LINKS, FRAGMENTS } from './demo-data.js';
import { samplePoints, place, EYES, EDGES } from './rex.js';
import { T, LANG } from './copy.js';
import { Sound } from './sound.js';

/* ------------------------------------------------------------------ timeline */
const SCENES = [
  { id: 'opening', a: 0.000, b: 0.045 }, { id: 'noise', a: 0.045, b: 0.115 }, { id: 'observe', a: 0.115, b: 0.185 },
  { id: 'streams', a: 0.185, b: 0.255 }, { id: 'enter', a: 0.255, b: 0.310 }, { id: 'technical', a: 0.310, b: 0.435 },
  { id: 'memory', a: 0.435, b: 0.505 }, { id: 'ml', a: 0.505, b: 0.595 }, { id: 'reason', a: 0.595, b: 0.675 },
  { id: 'risk', a: 0.675, b: 0.735 }, { id: 'decision', a: 0.735, b: 0.785 }, { id: 'replay', a: 0.785, b: 0.855 },
  { id: 'ask', a: 0.855, b: 0.905 }, { id: 'live', a: 0.905, b: 0.955 }, { id: 'system', a: 0.955, b: 1.001 }
];
const MORPH = { opening: 0.35, noise: 0.3, observe: 0.35, streams: 0.3, enter: 0.3, technical: 0.14, memory: 0.28, ml: 0.25, reason: 0.22, risk: 0.25, decision: 0.3, replay: 0.18, ask: 0.22, live: 0.25, system: 0.2 };
const IDX = Object.fromEntries(SCENES.map((s, i) => [s.id, i]));

/* ------------------------------------------------------------------ environment */
const params = new URLSearchParams(location.search);
const RM = params.get('motion') === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const canvas = document.getElementById('xp-canvas');
const ctx = canvas.getContext('2d', { alpha: false });
if (!ctx) throw new Error('Canvas 2D unavailable');
const $ = s => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const ease = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

let W = 0, H = 0, DPR = 1, A = 1, S = 1, MOBILE = false, NARROW = false, N = 0, R = 0, FN = 0;
let rx, rrnd, rexPts, fragIdx;               // per-particle data
const C = { light: '#E5E7EB', teal: '#00D4A7', teal2: '#00A884', slate: '#6B7686', amber: '#F5B942', neg: '#FF5C7A', bg: '#0B1320' };
const PAL = [C.light, C.teal, C.slate, C.amber, C.neg];

/* ------------------------------------------------------------------ data (DEMO) */
const candles = makeCandles(), IND = analyse(candles);
const LAST = candles.length - 1;
let NV = 110;                                  // visible candles (fewer on mobile)
const memShapes = buildMemories();

function buildMemories() {
  // 24 remembered market states; the first 7 resemble the current structure (base → rally → HL → break), the rest do not.
  const out = []; let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let w = 0; w < 24; w++) {
    const similar = w % 3 === 0 && w < 21, pts = [];
    let y = 0;
    for (let k = 0; k < 40; k++) {
      const u = k / 39;
      if (similar) y = (u < 0.35 ? -0.3 + Math.sin(u * 9) * 0.05 : u < 0.7 ? -0.3 + (u - 0.35) * 1.6 : u < 0.8 ? 0.26 - (u - 0.7) * 1.2 : 0.14 + (u - 0.8) * 2.2) + (r() - 0.5) * 0.08;
      else y += (r() - 0.5) * 0.18;
      pts.push(y);
    }
    const m = Math.max(...pts.map(Math.abs)) || 1;
    out.push({ pts: pts.map(v => v / m * 0.45), similar, score: similar ? 0.78 + r() * 0.16 : 0.2 + r() * 0.35 });
  }
  return out;
}

/* ------------------------------------------------------------------ sizing */
function resize() {
  W = innerWidth; H = innerHeight; MOBILE = W < 760; NARROW = W < 1100 || W / H < 1.05; // tablets / portrait get their own choreography
  DPR = Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2);
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  A = W / H; S = H / 2;
  NV = MOBILE ? 64 : 110;
  const n = RM ? (MOBILE ? 700 : 1400) : W < 760 ? 1000 : W < 1200 ? 1800 : 2600;
  if (n !== N) initParticles(n);
  document.getElementById('xp-scroll').style.height = (MOBILE ? 1500 : 1700) + 'vh';
}
function initParticles(n) {
  N = n; R = Math.round(N * 0.26); FN = MOBILE ? 22 : 40;
  rx = new Float32Array(N * 4);                 // current screen-space x,y,size,alpha (for hit tests / text)
  rrnd = Array.from({ length: 6 }, () => new Float32Array(N));
  let s = 1234567;
  for (const arr of rrnd) for (let i = 0; i < N; i++) { s = (s * 16807) % 2147483647; arr[i] = s / 2147483647; }
  rexPts = samplePoints(R);
  fragIdx = []; for (let k = 0; k < FN; k++) fragIdx.push(R + k * 7);
}

/* ------------------------------------------------------------------ camera + projection */
const cam = { x: 0, y: 0, z: -3, yaw: 0, pivot: 2 };
const F = 3;
const P = [0, 0, 0];
function project(x, y, z, out) {
  let dx = x - cam.x, dz = z - cam.pivot;
  if (cam.yaw) { const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw); const t = dx * c - dz * s; dz = dx * s + dz * c; dx = t; }
  const zz = dz + cam.pivot - cam.z;
  if (zz < 0.15) return false;
  const k = F / zz;
  out[0] = W / 2 + dx * k * S; out[1] = H / 2 - (y - cam.y) * k * S; out[2] = k;
  return true;
}
const CAMS = {
  opening: { z: -3 }, noise: { z: -3 }, observe: { z: -3 }, streams: { z: -3.2 }, enter: { z: -3 }, technical: { z: -3 }, memory: { z: -3 },
  ml: { z: -3.4, pivot: 1 }, reason: { z: -3 }, risk: { z: -3 }, decision: { z: -3 }, replay: { z: -3 }, ask: { z: -3 }, live: { z: -3.2 }, system: { z: -3.2 }
};
function camFor(id, lp, t) {
  const c = { x: 0, y: 0, z: -3, yaw: 0, pivot: 2, ...CAMS[id] };
  if (RM) return c;
  if (id === 'noise') c.z = -3 + lp * 0.8;
  if (id === 'observe') c.z = -2.2 - lp * 0.4;
  if (id === 'streams') c.z = -3.4 + lp * 0.9;
  if (id === 'enter') c.z = -3 + ease(lp) * 11.5;                        // travel INTO the architecture
  if (id === 'memory') c.z = -3 + lp * 3.2, c.x = Math.sin(lp * 2) * 0.2;
  if (id === 'ml') c.yaw = -0.5 + lp * 1.6 + Math.sin(t * 0.15) * 0.05;  // orbit the feature space
  if (id === 'system') c.z = -3 - ease(lp) * 1.8;                        // pull back: the whole system
  if (id === 'decision') c.z = -3 + lp * 0.25;
  return c;
}

/* ------------------------------------------------------------------ REX per scene */
function rexFor(id, lp, t) {
  const m = MOBILE;
  const base = {
    opening: { x: m ? 0.2 : 1.5, y: 0.35, z: 10, s: 1, formed: 0, a: 0, eye: smooth(0.55, 0.95, lp) * 0.3 },
    noise: { x: m ? -0.1 : -1.6, y: 0.45, z: 10, s: 1, formed: 0.04, a: 0.1, eye: 0.28 },
    observe: { x: m ? 0.05 : 1.0, y: 0.3, z: 5.5, s: 1, formed: 0.25, a: 0.3, eye: 0.55 },
    streams: { x: 0, y: 0.05, z: 1.4, s: m ? 0.5 : 0.72, formed: smooth(0.15, 0.85, lp), a: 0.7, eye: 0.35 + lp * 0.45 },
    enter: { x: 0, y: 0, z: 12.5, s: 1.1, formed: 0.7, a: 0.3, eye: 0.6 },
    technical: { x: m ? A * 0.62 : A * 0.84, y: m ? 0.82 : 0.86, z: 0.6, s: m ? 0.12 : 0.15, formed: 0.9, a: 0.35, eye: 0.8 },
    memory: { x: m ? 0 : -0.95, y: 0.12, z: 3.5 + lp * 2.2, s: 0.7, formed: 0.45, a: 0.22, eye: 0.5 },
    ml: { x: 0, y: 0, z: 0, s: 0.8, formed: smooth(0.85, 1, lp) * 0.4, a: 0.2, eye: smooth(0.88, 1, lp) * 0.5 },
    reason: { x: 0, y: 0.02, z: 0.6, s: m ? 0.42 : 0.6, formed: 1, a: 0.9, eye: 1 },
    risk: { x: 0, y: 0.08 + GATE().y, z: 2.3, s: NARROW ? 0.3 : 0.45, formed: 1, a: 0.55, eye: 0.9 },
    decision: { x: 0, y: m ? 0.66 : 0.66, z: 1.4, s: m ? 0.17 : 0.2, formed: 1, a: 0.5, eye: 0.85 },
    replay: { x: m ? A * 0.62 : -A * 0.84, y: m ? 0.86 : 0.86, z: 0.6, s: m ? 0.11 : 0.14, formed: 0.9, a: 0.35, eye: 0.8 },
    ask: { x: NARROW ? 0 : -A * 0.4, y: NARROW ? 0.5 : 0.04, z: 0.6, s: m ? 0.26 : NARROW ? 0.3 : 0.44, formed: 1, a: 0.95, eye: 1 },
    live: { x: 0, y: 0, z: 3.4, s: 0.32, formed: 0.85, a: 0.16, eye: 0.45 },
    system: { x: 0, y: m ? 0.02 : 0.08, z: 2.2, s: m ? 0.22 : 0.3, formed: 1, a: 0.32, eye: 0.6 }
  }[id];
  return { yaw: 0, pitch: 0, ...base };
}
function mixRex(a, b, u) { const o = {}; for (const k of Object.keys(a)) o[k] = lerp(a[k], b[k] ?? a[k], u); return o; }

/* ------------------------------------------------------------------ chart geometry */
function chartBox(id) {
  const w = Math.min(A * (MOBILE ? 0.92 : 0.84), 1.7);
  if (id === 'replay') return { x0: -w, x1: w, y0: MOBILE ? 0.06 : 0.02, y1: MOBILE ? 0.62 : 0.66, z: 0 };
  return { x0: -w, x1: w, y0: MOBILE ? -0.18 : -0.26, y1: MOBILE ? 0.58 : 0.64, z: 0 };
}
function visRange() { const lo = LAST - NV + 1; let mn = Infinity, mx = -Infinity; for (let i = lo; i <= LAST; i++) { mn = Math.min(mn, candles[i].l, IND.bb.lo[i] ?? Infinity); mx = Math.max(mx, candles[i].h, IND.bb.up[i] ?? -Infinity); } const pad = (mx - mn) * 0.06; return { lo, mn: mn - pad, mx: mx + pad }; }
const VR = { v: null };
function cx(box, i) { const lo = LAST - NV + 1; return lerp(box.x0, box.x1, (i - lo + 0.5) / NV); }
function cy(box, price) { const r = VR.v; return lerp(box.y0, box.y1, (price - r.mn) / (r.mx - r.mn)); }

/* ------------------------------------------------------------------ formations */
const O = { x: 0, y: 0, z: 0, a: 0, c: 0, s: 1 };
function set(o, x, y, z, a, c, s = 1) { o.x = x; o.y = y; o.z = z; o.a = a; o.c = c; o.s = s; }
const NODES = id => EVIDENCE.map((e, j) => {
  const ang = Math.PI * (0.5 + 2 * j / EVIDENCE.length), ask = id === 'ask';
  const cx0 = ask && !NARROW ? -A * 0.4 : 0, cy0 = ask && NARROW ? 0.5 : 0.04;
  const rx_ = NARROW ? A * (ask ? 0.66 : 0.8) : ask ? Math.min(A * 0.5, 0.86) : Math.min(A * 0.78, 1.35), ry = NARROW ? (ask ? 0.32 : 0.6) : ask ? 0.62 : 0.56;
  return { x: cx0 + Math.cos(ang) * rx_, y: cy0 + Math.sin(ang) * ry, z: 0.2 };
});
const MK = () => MARKETS.map((m, j) => { const ang = -Math.PI / 2 + (2 * Math.PI * j) / MARKETS.length + 0.3; return { x: Math.cos(ang) * (MOBILE ? A * 0.7 : Math.min(A * 0.7, 1.25)), y: Math.sin(ang) * (MOBILE ? 0.55 : 0.6) - 0.02, z: 0.3 + (j % 2) * 0.5 }; });
const STATIONS = () => T.stations.map((_, j) => { const u = j / (T.stations.length - 1); return MOBILE ? { x: Math.sin(u * Math.PI * 2) * A * 0.45, y: 0.72 - u * 1.44, z: 0.4 } : { x: lerp(-A * 0.86, A * 0.86, u), y: Math.sin(u * Math.PI * 1.5) * 0.2 - 0.36, z: 0.4 + Math.sin(u * Math.PI) * 0.8 }; });
let nodeCache = null, mkCache = null, stCache = null, nodesBy = {};

function formation(id, i, t, lp, o) {
  const r0 = rrnd[0][i], r1 = rrnd[1][i], r2 = rrnd[2][i], r3 = rrnd[3][i], r4 = rrnd[4][i], r5 = rrnd[5][i];
  const T_ = RM ? 0 : t;
  switch (id) {
    case 'opening': {
      const z = 4 + r2 * 12, a = r3 < 0.35 ? 0.1 + 0.25 * r4 : 0.03;
      return set(o, (r0 - 0.5) * 9, (r1 - 0.5) * 5, z, a * smooth(0, 0.4, lp + 0.3), 2, 0.8);
    }
    case 'noise': {
      const speed = 0.25 + lp * 1.4, span = 13, z = ((r2 * span - T_ * speed * (0.6 + r5)) % span + span) % span - 1.2;
      const hot = r4 < 0.06;
      return set(o, (r0 - 0.5) * (A * 2 + 5), (r1 - 0.5) * 4.2, z, 0.18 + r3 * 0.45, hot ? 1 : r3 < 0.1 ? 3 : 0, 1 + r5);
    }
    case 'observe': {
      const signal = r4 < 0.16, lane = Math.floor(r5 * 5), u = smooth(0.1, 0.9, lp);
      let x = (r0 - 0.5) * (A * 2 + 4), y = (r1 - 0.5) * 3.6, z = r2 * 9 - 0.5;
      x += Math.sin(T_ * 0.2 + r3 * 6) * 0.05;
      if (signal) { x = lerp(x, (r0 - 0.5) * A * 2.2, u); y = lerp(y, -0.5 + lane * 0.25, u); z = lerp(z, 1 + lane * 0.4, u); }
      return set(o, x, y, z, signal ? 0.55 + 0.4 * u : 0.3 * (1 - u * 0.8), signal ? 1 : 0, signal ? 1.3 : 1);
    }
    case 'streams': {
      const k = i % 10, ang = (k / 10) * Math.PI * 2 + 0.3, u = (r0 + T_ * (0.05 + 0.02 * (k % 3))) % 1, rad = (1 - u) * (MOBILE ? 1.6 : 2.6) + 0.12;
      const sw = (1 - u) * 1.2, x = Math.cos(ang + sw) * rad * (MOBILE ? 0.7 : 1.1), y = Math.sin(ang + sw) * rad * 0.62, z = (1 - u) * 6 - 0.3 + (r1 - 0.5) * 0.3 * (1 - u);
      return set(o, x + (r2 - 0.5) * 0.04, y + (r3 - 0.5) * 0.04, z, 0.25 + 0.6 * u * (0.4 + lp), k === 0 || k === 5 ? 1 : 0, 1 + u);
    }
    case 'enter': {
      const layer = i % 6, z = 1.2 + layer * 2.1, ang = r0 * Math.PI * 2 + T_ * 0.08 * (layer % 2 ? 1 : -1), rad = 1.05 + (r1 - 0.5) * 0.08 + (layer === 3 ? 0.1 : 0);
      return set(o, Math.cos(ang) * rad * (MOBILE ? 0.62 : 1), Math.sin(ang) * rad * 0.68, z, 0.35 + r2 * 0.4, layer === 3 ? 1 : 0, 1);
    }
    case 'technical': case 'replay': {
      const box = chartBox(id), lo = LAST - NV + 1, j = lo + ((i - R) % NV + NV) % NV, cd = candles[j];
      const x = cx(box, j) + (r0 - 0.5) * (box.x1 - box.x0) / NV * 0.5;
      const body = r1 < 0.72, y = body ? cy(box, lerp(Math.min(cd.o, cd.c), Math.max(cd.o, cd.c), r2)) : cy(box, lerp(cd.l, cd.h, r2));
      let a = 0.65, cut = LAST;
      if (id === 'replay') { cut = replayIndex(); if (j > cut) a = 0; }
      return set(o, x, y, box.z, a * (1 - crispFor(id) * 0.8), cd.c >= cd.o ? 1 : 0, 0.9);
    }
    case 'memory': {
      const w = i % 24, m = memShapes[w], k = Math.floor(r0 * 40), side = (w % 2 ? 1 : -1);
      const depth = 1.2 + Math.floor(w / 2) * 0.62, xw = MOBILE ? A * 0.8 : 1.1;
      const x = side * (MOBILE ? 0.05 : 0.55) + (k / 39 - 0.5) * xw, y = m.pts[k] * 0.5 + (w % 4 - 1.5) * 0.08, z = depth + (r1 - 0.5) * 0.03;
      const keep = m.similar ? 1 : 1 - smooth(0.45, 0.8, lp) * 0.85;
      return set(o, x, y, z, (m.similar ? 0.8 : 0.4) * keep, m.similar && lp > 0.35 ? 1 : 0, 1);
    }
    case 'ml': {
      // DATASET grid → FEATURES axes → clusters; walk-forward band sweeps through "time" (r0)
      const cls = i % 3, grid = { x: ((i % 60) / 59 - 0.5) * 2.2, y: (Math.floor(i / 60) % 40 / 39 - 0.5) * 1.4, z: 0 };
      const g1 = Math.sqrt(-2 * Math.log(r1 + 1e-6)) * Math.cos(2 * Math.PI * r2), g2 = Math.sqrt(-2 * Math.log(r3 + 1e-6)) * Math.sin(2 * Math.PI * r4), g3 = (r5 - 0.5) * 1.6;
      const cen = [[0.7, 0.35, 0.3], [-0.7, -0.3, -0.25], [0.05, -0.05, 0.75]][cls];
      const clus = { x: cen[0] + g1 * 0.22, y: cen[1] + g2 * 0.18, z: cen[2] + g3 * 0.22 };
      const feat = { x: (r0 - 0.5) * 2, y: (r2 - 0.5) * 1.2, z: (r4 - 0.5) * 1.2 };
      const u1 = smooth(0.08, 0.2, lp), u2 = smooth(0.22, 0.42, lp);
      const x = lerp(lerp(grid.x, feat.x, u1), clus.x, u2), y = lerp(lerp(grid.y, feat.y, u1), clus.y, u2), z = lerp(lerp(grid.z, feat.z, u1), clus.z, u2);
      const wf = smooth(0.5, 0.78, lp) * 0.85, inBand = r0 >= wf && r0 < wf + 0.15, past = r0 < wf;
      const c = lp > 0.5 && lp < 0.8 ? (inBand ? 1 : past ? 0 : 2) : cls === 0 && lp > 0.4 ? 1 : cls === 1 && lp > 0.4 ? 0 : 2;
      return set(o, x * (MOBILE ? 0.62 : 1), y, z + 1, 0.42 + (c === 1 ? 0.5 : 0.3), c, c === 1 ? 1.5 : 1.2);
    }
    case 'reason': case 'ask': {
      const nodes = nodesBy[id], j = i % nodes.length, n = nodes[j], e = EVIDENCE[j];
      const focus = id === 'ask' ? askFocus(e.id) : 1;
      const stream = r0 < 0.35;
      const conv = id === 'reason' ? smooth(0.72, 0.95, lp) : 0.2;
      const waitHold = id === 'reason' && lp > 0.4 && lp < 0.72;
      if (stream) {
        let u = (r1 + T_ * 0.12) % 1; if (!e.agree) u = Math.min(u, 0.45 + Math.sin(T_ * 3 + r2 * 6) * 0.05); if (waitHold) u = Math.min(u, 0.55);
        const cxn = (id === 'ask' ? rexState.x : 0), cyn = (id === 'ask' ? rexState.y : 0);
        return set(o, lerp(n.x, cxn, u * (0.7 + conv * 0.3)), lerp(n.y, cyn, u * (0.7 + conv * 0.3)), lerp(n.z, 0.6, u), (0.25 + 0.5 * (1 - u)) * focus, e.agree ? 1 : 3, 0.9);
      }
      const ang = r2 * Math.PI * 2 + T_ * 0.4 * (r3 - 0.5), rad = 0.03 + r4 * 0.07 * (0.6 + e.strength);
      return set(o, n.x * (1 - conv * 0.35) + Math.cos(ang) * rad, n.y * (1 - conv * 0.35) + Math.sin(ang) * rad * 0.8, n.z + (r5 - 0.5) * 0.1, (0.35 + 0.5 * e.strength) * focus, e.agree ? (focus > 0.9 && id === 'ask' ? 1 : 0) : 3, 1.1);
    }
    case 'risk': {
      const phaseB = lp > 0.55, frame = r0 < 0.55;
      if (frame) { // the gate: a tall portal
        const u = r1, gw = MOBILE ? 0.34 : 0.42, gh = GATE().h, per = 2 * (gw + gh);
        let d = u * per * 2, x, y;
        if (d < 2 * gw) { x = -gw + d; y = gh; } else if ((d -= 2 * gw) < 2 * gh) { x = gw; y = gh - d; } else if ((d -= 2 * gh) < 2 * gw) { x = gw - d; y = -gh; } else { d -= 2 * gw; x = -gw; y = -gh + d; }
        const verdict = lp > 0.3 && lp < 0.55 ? 4 : lp >= 0.72 ? 1 : 0;
        return set(o, x + (r2 - 0.5) * 0.015, y + GATE().y + (r3 - 0.5) * 0.015, 1, 0.5 + r4 * 0.3, verdict, 1);
      }
      // candidate setup flowing toward the gate: stopped when risk fails, passes when it holds
      let x = lerp(-A * 1.1, A * 1.1, (r2 + T_ * 0.08) % 1);
      if (!phaseB) x = Math.min(x, -0.5 + r4 * 0.06);
      const y = GATE().y + (r3 - 0.5) * 0.35 * (GATE().h / 0.62);
      return set(o, x, y, 1 + (r5 - 0.5) * 0.2, 0.45, phaseB ? 1 : 3, 1);
    }
    case 'decision': {
      const yH = decY(DECISION.entry);
      if (r0 < 0.8) return set(o, lerp(-A * 1.05, A * 1.05, (r1 + T_ * 0.012) % 1), yH + (r2 - 0.5) * 0.004, 0.3 + r3 * 0.5, 0.15 + r4 * 0.2, 0, 0.8);
      const ang = r2 * Math.PI * 2, rad = r3 * 0.035;
      return set(o, A * (MOBILE ? 0.5 : 0.62) + Math.cos(ang) * rad, yH + Math.sin(ang) * rad, 0.3, 0.7, 1, 1);
    }
    case 'live': {
      const nodes = mkCache, j = i % nodes.length, n = nodes[j], m = MARKETS[j];
      const hot = liveFocus === j ? 1 : liveFocus < 0 ? 0.75 : 0.3;
      const ang = r1 * Math.PI * 2 + T_ * (0.15 + r2 * 0.2), rad = 0.04 + r3 * (0.06 + m.conf * 0.1);
      return set(o, n.x + Math.cos(ang) * rad, n.y + Math.sin(ang) * rad * 0.8, n.z + (r4 - 0.5) * 0.05, (0.3 + 0.5 * r5) * hot, m.signal === 'BUY' ? 1 : m.signal === 'NO SIGNAL' ? 2 : 0, 1);
    }
    case 'system': {
      const st = stCache, u = (r0 + T_ * 0.035) % 1, f = u * (st.length - 1), k = Math.min(st.length - 2, Math.floor(f)), v = f - k;
      const a = st[k], b = st[k + 1];
      const ring = r5 < 0.3, sp = st[Math.floor(r1 * st.length)];
      if (ring) { const ang = r2 * Math.PI * 2 + T_ * 0.2; return set(o, sp.x + Math.cos(ang) * 0.07, sp.y + Math.sin(ang) * 0.07, sp.z, 0.5, 1, 0.9); }
      return set(o, lerp(a.x, b.x, v) + (r2 - 0.5) * 0.02, lerp(a.y, b.y, v) + (r3 - 0.5) * 0.02, lerp(a.z, b.z, v), 0.35 + 0.3 * r4, 0, 0.9);
    }
  }
  return set(o, 0, 0, 0, 0, 0);
}

const GATE = () => (NARROW ? { h: 0.4, y: 0.24 } : { h: 0.62, y: 0 });
const decY = v => (MOBILE ? -0.46 : -0.5) + (v - DECISION.entry) * (MOBILE ? 0.007 : 0.008);

/* ------------------------------------------------------------------ interactive state */
let replayUser = null, askIdx = 0, liveFocus = -1, pointer = { x: -1, y: -1, active: false };
const rexState = { x: 0, y: 0 };
function replayT() { return replayUser != null ? replayUser : smooth(0.12, 0.86, cur.lp); }
function replayIndex() { const t = replayT(), first = REPLAY[0].i - 6; return Math.round(lerp(first, LAST, t)); }
function replayState() { const ix = replayIndex(); let s = null; for (const e of REPLAY) if (e.i <= ix) s = e; return { ix, s }; }
function askFocus(id) { return ASK[askIdx].focus.includes(id) ? 1 : 0.28; }
function crispFor(id) { if (id === 'technical') return smooth(0.02, 0.12, cur.lp) * (cur.id === 'technical' ? 1 : 0); if (id === 'replay') return cur.id === 'replay' ? smooth(0.03, 0.15, cur.lp) : 0; return 0; }

/* ------------------------------------------------------------------ frame */
const cur = { p: 0, target: 0, id: 'opening', k: 0, lp: 0, m: 0 };
const oa = { ...O }, ob = { ...O };
let t0 = performance.now(), last = 0, introT = 0, sceneChanged = -1;

function frame(now) {
  const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; introT += dt;
  // scroll → film time (inertia gives a camera-like feel; reduced motion follows scroll exactly)
  cur.target = clamp(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight));
  cur.p = RM ? cur.target : cur.p + (cur.target - cur.p) * (1 - Math.pow(0.001, dt));
  let k = SCENES.findIndex(s => cur.p >= s.a && cur.p < s.b); if (k < 0) k = SCENES.length - 1;
  const sc = SCENES[k], lp = clamp((cur.p - sc.a) / (sc.b - sc.a)), next = SCENES[Math.min(k + 1, SCENES.length - 1)];
  const mw = MORPH[sc.id], mu = next === sc ? 0 : RM ? (lp > 1 - mw * 0.5 ? 1 : 0) : ease(smooth(1 - mw, 1, lp));
  Object.assign(cur, { k, id: sc.id, lp, m: mu });
  if (sceneChanged !== k) { onScene(k); sceneChanged = k; }
  nodesBy = { reason: NODES('reason'), ask: NODES('ask') }; nodeCache = nodesBy[sc.id === 'ask' ? 'ask' : 'reason']; mkCache = MK(); stCache = STATIONS(); VR.v = VR.v || visRange();

  // camera
  const ca = camFor(sc.id, lp, t), cb = camFor(next.id, 0, t);
  for (const key of ['x', 'y', 'z', 'yaw', 'pivot']) cam[key] = lerp(ca[key] ?? 0, cb[key] ?? 0, mu);
  // REX
  const ra = rexFor(sc.id, lp, t), rb = rexFor(next.id, 0, t), rex = mixRex(ra, rb, mu);
  aimRex(rex, sc.id, lp, t);
  rexState.x = rex.x; rexState.y = rex.y;

  // background
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.5, Math.max(W, H) * 0.75);
  vg.addColorStop(0, sc.id === 'reason' || sc.id === 'decision' ? 'rgba(7,12,20,0)' : 'rgba(17,27,42,0.55)'); vg.addColorStop(1, 'rgba(4,7,12,0.9)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  // vector layer behind particles
  drawVectorsBack(sc.id, lp, mu, next.id, t);

  // particles
  const buckets = [[], [], [], [], []];
  const jitterOff = sc.id === 'decision';
  for (let i = 0; i < N; i++) {
    const isRex = i < R;
    formation(sc.id, i, t, lp, oa);
    if (mu > 0) {
      const st = RM ? 0 : rrnd[5][i] * 0.35, u = clamp((mu - st) / (1 - st));
      formation(next.id, i, t, 0, ob);
      oa.x = lerp(oa.x, ob.x, u); oa.y = lerp(oa.y, ob.y, u); oa.z = lerp(oa.z, ob.z, u); oa.a = lerp(oa.a, ob.a, u); oa.s = lerp(oa.s, ob.s, u); if (u > 0.5) oa.c = ob.c;
    }
    if (isRex && rex.formed > 0.001) {
      place(rexPts[i], rex, P);
      const f = RM ? (rex.formed > 0.5 ? 1 : 0) : smooth(rrnd[4][i] * 0.5, rrnd[4][i] * 0.5 + 0.5, rex.formed);
      const bre = jitterOff || RM ? 0 : Math.sin(t * 1.3 + i) * 0.004;
      oa.x = lerp(oa.x, P[0] + bre, f); oa.y = lerp(oa.y, P[1] + bre, f); oa.z = lerp(oa.z, P[2], f);
      oa.a = lerp(oa.a, rex.a * (0.55 + 0.45 * rrnd[3][i]), f); if (f > 0.5) oa.c = rex.formed > 0.95 && sc.id !== 'risk' ? 0 : 2; oa.s = lerp(oa.s, 1.1, f);
    }
    if (oa.a < 0.01 || !project(oa.x, oa.y, oa.z, P)) { rx[i * 4 + 3] = 0; continue; }
    // pointer: particles subtly part around the cursor (restrained)
    if (pointer.active && !RM && !MOBILE) { const dx = P[0] - pointer.x, dy = P[1] - pointer.y, d2 = dx * dx + dy * dy; if (d2 < 6400) { const f = (1 - d2 / 6400) * 10; P[0] += dx / Math.sqrt(d2 + 1) * f; P[1] += dy / Math.sqrt(d2 + 1) * f; } }
    const size = clamp(oa.s * P[2] * (MOBILE ? 1.5 : 1.7), 0.5, 5), fade = clamp((P[2] - 0.12) * 3);
    rx[i * 4] = P[0]; rx[i * 4 + 1] = P[1]; rx[i * 4 + 2] = size; rx[i * 4 + 3] = oa.a * fade;
    buckets[oa.c].push(i);
  }
  for (let c = 0; c < 5; c++) {
    ctx.fillStyle = PAL[c];
    for (const i of buckets[c]) { const s = rx[i * 4 + 2]; ctx.globalAlpha = rx[i * 4 + 3]; ctx.fillRect(rx[i * 4] - s / 2, rx[i * 4 + 1] - s / 2, s, s); }
  }
  ctx.globalAlpha = 1;

  drawVectorsFront(sc.id, lp, mu, next.id, t);
  drawRexLines(rex, lerp(REXLINE[sc.id] || 0, REXLINE[next.id] || 0, mu));
  drawEyes(rex, sc.id, lp, t);
  updateDom(sc, lp, mu, next, t);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ REX attention */
let gaze = { x: 0, y: 0 }, blink = 0, nextBlink = 3;
function aimRex(rex, id, lp, t) {
  // head turns toward what matters in each scene; pupils follow a world-space target
  let tgt = null;
  if (id === 'noise') { const i = fragIdx[3]; tgt = { x: (rrnd[0][i] - 0.5) * (A * 2 + 5), y: (rrnd[1][i] - 0.5) * 4.2 }; }
  else if (id === 'observe' || id === 'streams') tgt = { x: Math.sin(t * 0.4) * 0.8, y: Math.cos(t * 0.3) * 0.3 };
  else if (id === 'technical') { const box = chartBox('technical'); tgt = { x: cx(box, LAST), y: cy(box, candles[LAST].c) }; }
  else if (id === 'replay') { const box = chartBox('replay'), ix = replayIndex(); tgt = { x: cx(box, ix), y: cy(box, candles[ix].c) }; }
  else if (id === 'memory') { tgt = { x: 0.55, y: 0.1 }; }
  else if (id === 'reason') {
    const n = nodeCache; const waitWin = lp > 0.4 && lp < 0.72;
    const j = waitWin ? null : Math.floor((t * 0.5) % n.length);
    tgt = j == null ? { x: 0, y: -0.05 } : n[j];   // during WAIT the gaze settles: stillness, control
  }
  else if (id === 'ask') { const f = ASK[askIdx].focus[0]; tgt = nodeCache[EVIDENCE.findIndex(e => e.id === f)]; }
  else if (id === 'live' && liveFocus >= 0) tgt = mkCache[liveFocus];
  else if (id === 'risk') tgt = { x: -0.5, y: 0 };
  if (tgt && !RM) {
    const dx = tgt.x - rex.x, dy = tgt.y - rex.y;
    gaze.x = lerp(gaze.x, clamp(dx, -1, 1), 0.06); gaze.y = lerp(gaze.y, clamp(dy, -1, 1), 0.06);
    if (id !== 'decision') { rex.yaw = clamp(dx * 0.3, -0.35, 0.35) * rex.formed; rex.pitch = clamp(-dy * 0.2, -0.15, 0.15) * rex.formed; }
  } else { gaze.x = lerp(gaze.x, 0, 0.05); gaze.y = lerp(gaze.y, 0, 0.05); }
}

const REXLINE = { streams: 0.16, enter: 0.1, technical: 0.28, memory: 0.1, reason: 0.32, risk: 0.26, decision: 0.34, replay: 0.26, ask: 0.36, live: 0.1, system: 0.2 };
function drawRexLines(rex, a) {
  a *= smooth(0.55, 1, rex.formed); if (a < 0.01) return;
  const A1 = [0, 0, 0], B1 = [0, 0, 0], p1 = [0, 0, 0], p2 = [0, 0, 0];
  ctx.lineWidth = 1; ctx.strokeStyle = C.light;
  for (const [edges, w] of [[EDGES.outline, 1], [EDGES.facets, 0.45]]) {
    ctx.globalAlpha = a * w; ctx.beginPath();
    for (const [e0, e1] of edges) { place(e0, rex, A1); place(e1, rex, B1); if (project(A1[0], A1[1], A1[2], p1) && project(B1[0], B1[1], B1[2], p2)) { ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); } }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function drawEyes(rex, id, lp, t) {
  if (rex.eye < 0.02) return;
  if (!RM) { nextBlink -= 1 / 60; if (nextBlink < 0) { blink = 1; nextBlink = 4 + Math.random() * 5; } blink = Math.max(0, blink - 0.12); }
  const open = 1 - Math.sin(blink * Math.PI) * 0.9;
  const focus = id === 'risk' || id === 'decision' ? 0.72 : 1;            // narrower when focused on risk / decision
  const scan = id === 'streams' || id === 'ml' ? (Math.sin(t * 2.2) + 1) / 2 : -1; // loading behaviour: a scan, never a spinner
  for (const side of ['L', 'R']) {
    const [pin, pout] = EYES[side];
    const a = [0, 0, 0], b = [0, 0, 0]; place(pin, rex, a); place(pout, rex, b);
    const A2 = [0, 0, 0], B2 = [0, 0, 0];
    if (!project(a[0], a[1], a[2], A2) || !project(b[0], b[1], b[2], B2)) continue;
    const len = Math.hypot(B2[0] - A2[0], B2[1] - A2[1]); if (len < 1.2) { ctx.fillStyle = `rgba(245,185,66,${rex.eye * 0.6})`; ctx.fillRect((A2[0] + B2[0]) / 2 - 1, (A2[1] + B2[1]) / 2 - 1, 2, 2); continue; }
    const nx = -(B2[1] - A2[1]) / len, ny = (B2[0] - A2[0]) / len, hgt = len * 0.17 * open * focus;
    const mx = (A2[0] + B2[0]) / 2, my = (A2[1] + B2[1]) / 2;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(A2[0], A2[1]);
    ctx.quadraticCurveTo(mx - nx * hgt * 1.4, my - ny * hgt * 1.4, B2[0], B2[1]);
    ctx.quadraticCurveTo(mx + nx * hgt * 0.9, my + ny * hgt * 0.9, A2[0], A2[1]); ctx.closePath();
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, len * 0.6);
    g.addColorStop(0, `rgba(255,232,186,${0.95 * rex.eye})`); g.addColorStop(0.5, `rgba(245,185,66,${0.62 * rex.eye})`); g.addColorStop(1, `rgba(245,185,66,${0.04 * rex.eye})`);
    ctx.fillStyle = g; ctx.shadowColor = `rgba(245,185,66,${0.45 * rex.eye})`; ctx.shadowBlur = len * 0.28; ctx.fill(); ctx.shadowBlur = 0;
    ctx.clip();
    // vertical slit pupil following the gaze
    const px = mx + gaze.x * len * 0.18, py = my - gaze.y * len * 0.1;
    ctx.fillStyle = `rgba(11,19,32,${0.9 * rex.eye})`; ctx.beginPath(); ctx.ellipse(px, py, len * 0.035, hgt * 1.4, 0, 0, Math.PI * 2); ctx.fill();
    if (scan >= 0) { ctx.fillStyle = `rgba(0,212,167,${0.5 * rex.eye})`; ctx.fillRect(A2[0] + (B2[0] - A2[0]) * scan - 1, my - hgt * 1.5, 2, hgt * 3); }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ vector layer */
function line(pts, color, width, alpha, dash) {
  ctx.beginPath(); let started = false;
  for (const p of pts) { if (!p) { started = false; continue; } if (!started) { ctx.moveTo(p[0], p[1]); started = true; } else ctx.lineTo(p[0], p[1]); }
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = alpha; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
}
function sp(x, y, z) { const q = [0, 0, 0]; return project(x, y, z, q) ? q : null; }
function text(str, x, y, { size = 11, color = C.light, alpha = 1, align = 'left', weight = 500, font = 'Inter' } = {}) {
  ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.font = `${weight} ${size}px ${font}, system-ui, sans-serif`; ctx.textAlign = align; ctx.fillText(str, x, y); ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

function drawVectorsBack(id, lp, mu, nextId, t) {
  const fadeOut = 1 - mu;
  if (id === 'streams') {
    const labels = ['PRICE', 'VOLUME', 'VOLATILITY', 'STRUCTURE', 'MOMENTUM', 'TREND', 'LIQUIDITY', 'NEWS', 'SESSION', 'HISTORICAL MEMORY'];
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2 + 0.3, pts = [];
      for (let s = 0; s <= 24; s++) { const u = s / 24, rad = (1 - u) * (MOBILE ? 1.6 : 2.6) + 0.12, sw = (1 - u) * 1.2; pts.push(sp(Math.cos(ang + sw) * rad * (MOBILE ? 0.7 : 1.1), Math.sin(ang + sw) * rad * 0.62, (1 - u) * 6 - 0.3)); }
      line(pts, k === 0 || k === 5 ? C.teal : C.light, 1, 0.07 * fadeOut);
      const q = pts[5]; if (q && !MOBILE) text(labels[k], q[0], q[1], { size: 10, alpha: 0.5 * smooth(0.05, 0.3, lp) * fadeOut, color: k === 0 || k === 5 ? C.teal : C.light, weight: 600 });
    }
  }
  if (id === 'enter') {
    T.layers.forEach((name, layer) => {
      const z = 1.2 + layer * 2.1, pts = []; for (let s = 0; s <= 64; s++) { const ang = s / 64 * Math.PI * 2; pts.push(sp(Math.cos(ang) * 1.05 * (MOBILE ? 0.62 : 1), Math.sin(ang) * 1.05 * 0.68, z)); }
      line(pts, layer === 3 ? C.teal : C.light, 1, 0.12 * fadeOut);
      const q = sp(0, 1.05 * 0.68 + 0.06, z); if (q) text(name.toUpperCase(), q[0], q[1], { size: clamp(10 * q[2], 9, 22), align: 'center', alpha: clamp(q[2] - 0.2) * 0.75 * fadeOut, weight: 600, color: layer === 3 ? C.teal : C.light, font: LANG === 'ar' ? 'IBM Plex Sans Arabic' : 'Inter' });
    });
  }
  if (id === 'memory') {
    memShapes.forEach((m, w) => {
      const side = (w % 2 ? 1 : -1), depth = 1.2 + Math.floor(w / 2) * 0.62, xw = MOBILE ? A * 0.8 : 1.1, pts = [];
      for (let k = 0; k < 40; k++) pts.push(sp(side * (MOBILE ? 0.05 : 0.55) + (k / 39 - 0.5) * xw, m.pts[k] * 0.5 + (w % 4 - 1.5) * 0.08, depth));
      const on = m.similar && lp > 0.35, keep = m.similar ? 1 : 1 - smooth(0.45, 0.8, lp);
      line(pts, on ? C.teal : C.light, on ? 1.4 : 1, (on ? 0.55 : 0.12) * keep * fadeOut);
      const q = pts[39]; if (q && lp > 0.3 && q[2] > 0.3) text((on ? '✓ ' : '× ') + m.score.toFixed(2), q[0] + 6, q[1], { size: 10, alpha: (on ? 0.8 : 0.3) * keep * fadeOut, color: on ? C.teal : C.slate, weight: 600 });
    });
  }
  if (id === 'ml') mlVectors(lp, fadeOut);
  if (id === 'system') {
    const st = stCache; const pts = st.map(s => sp(s.x, s.y, s.z)); line(pts, C.teal, 1, 0.25 * smooth(0, 0.3, lp));
  }
}

function mlVectors(lp, fade) {
  // axes of the feature space, a decision boundary, the walk-forward window
  const o = 1, ax = [[[-1.2, 0, o], [1.2, 0, o]], [[0, -0.8, o], [0, 0.8, o]], [[0, 0, o - 1], [0, 0, o + 1]]];
  const vis = smooth(0.12, 0.25, lp) * fade;
  for (const [a, b] of ax) line([sp(...a), sp(...b)], C.light, 1, 0.18 * vis);
  if (!MOBILE) ['TREND SLOPE', 'MOMENTUM', 'VOLATILITY'].forEach((l, k) => { const q = sp(...ax[k][1]); if (q) text(l, q[0] + 4, q[1] - 4, { size: 9, alpha: 0.45 * vis, weight: 600 }); });
  const bnd = smooth(0.3, 0.45, lp) * fade;
  if (bnd > 0.01) for (let g = -4; g <= 4; g++) {
    const u = g / 4; // plane through the origin separating "continuation" from the rest
    line([sp(0.15 + u * 0.1, -0.8, o - 1 + u * 0), sp(0.15 + u * 0.1, 0.8, o - 1)].map((_, k) => sp(-0.05 + u * 0.35 * 0, k ? 0.8 : -0.8, o + u)), C.teal, 1, 0.14 * bnd);
    line([sp(-0.05, u * 0.8, o - 1), sp(-0.05, u * 0.8, o + 1)], C.teal, 1, 0.1 * bnd);
  }
}

function drawChart(id, crisp, lp, t) {
  const box = chartBox(id), lo = LAST - NV + 1, cut = id === 'replay' ? replayIndex() : LAST;
  const step = id === 'technical' ? Math.floor(clamp((lp - 0.06) / 0.86) * 12 - 1e-6) : 11, stepU = id === 'technical' ? ((clamp((lp - 0.06) / 0.86) * 12) % 1) : 1;
  const has = k => id === 'technical' ? step > k || (step === k) : id === 'replay' ? [0, 1, 2, 3, 4, 9, 10, 11].includes(k) : false;
  const grow = k => (id === 'technical' && step === k ? smooth(0, 0.6, stepU) : 1);
  const X = i => { const q = sp(cx(box, i), 0, box.z); return q ? q[0] : 0; }, Y = v => { const q = sp(0, cy(box, v), box.z); return q ? q[1] : 0; };
  const cw = Math.max(1, (X(lo + 1) - X(lo)) * 0.62);
  // Bollinger band (behind candles)
  if (has(4)) { const g = grow(4), pts = [], pts2 = []; for (let i = lo; i <= cut; i++) { if (i > lo + (cut - lo) * g) break; if (IND.bb.up[i] == null) continue; pts.push([X(i), Y(IND.bb.up[i])]); pts2.push([X(i), Y(IND.bb.lo[i])]); }
    if (pts.length > 1) { ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(...p) : ctx.moveTo(...p))); for (let k = pts2.length - 1; k >= 0; k--) ctx.lineTo(...pts2[k]); ctx.closePath(); ctx.fillStyle = 'rgba(229,231,235,0.035)'; ctx.fill(); line(pts, C.light, 1, 0.25); line(pts2, C.light, 1, 0.25); } }
  // volume
  if (has(9)) { const g = grow(9), vmax = Math.max(...candles.slice(lo).map(c => c.v)), base = Y(VR.v.mn); for (let i = lo; i <= cut; i++) { const h = (candles[i].v / vmax) * (Math.abs(Y(VR.v.mx) - base) * 0.16) * g; ctx.fillStyle = candles[i].c >= candles[i].o ? 'rgba(0,212,167,0.28)' : 'rgba(229,231,235,0.16)'; ctx.fillRect(X(i) - cw / 2, base - h, cw, h); } }
  // candles (crisp once the particles have formed them)
  if (crisp > 0.01) for (let i = lo; i <= cut; i++) {
    const c = candles[i], up = c.c >= c.o, x = X(i);
    ctx.globalAlpha = crisp * (up ? 0.9 : 0.55); ctx.strokeStyle = ctx.fillStyle = up ? C.teal : C.light;
    ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.lineWidth = 1; ctx.stroke();
    const y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c)); ctx.fillRect(x - cw / 2, y1, cw, Math.max(1, y2 - y1));
  }
  ctx.globalAlpha = 1;
  const ma = (arr, k, color, w, a) => { if (!has(k)) return; const g = grow(k), pts = []; for (let i = lo; i <= cut; i++) { if (i > lo + (cut - lo) * g) break; if (arr[i] != null) pts.push([X(i), Y(arr[i])]); } line(pts, color, w, a); };
  ma(IND.ema20, 1, '#7FF0D6', 1.4, 0.9); ma(IND.ema50, 2, C.light, 1.3, 0.7); ma(IND.ema200, 3, C.amber, 1.2, 0.55);
  // structure: HH/HL/LH/LL at pivots
  if (has(10)) { const g = grow(10); for (const s of IND.st.swings) { if (s.i < lo || s.i > cut - 4) continue; if (s.i > lo + (cut - lo) * g) continue; const y = Y(s.price) + (s.type === 'H' ? -10 : 16); text(s.label, X(s.i), y, { size: 10, align: 'center', color: /H[HL]/.test(s.label) && s.label !== 'LH' ? C.teal : C.slate, alpha: 0.9, weight: 700 }); } }
  // BOS + retest
  if (has(11) && IND.st.bos && IND.st.bos.i <= cut) {
    const b = IND.st.bos, g = grow(11), y = Y(b.level), x0 = X(b.from), x1 = lerp(x0, X(cut), g);
    line([[x0, y], [x1, y]], C.teal, 1.2, 0.85, [5, 4]);
    if (g > 0.5) text('BOS', X(b.i), y - 8, { size: 10, align: 'center', color: C.teal, weight: 700 });
    const rt = IND.st.retest; if (rt && rt.i <= cut && g > 0.8) { ctx.strokeStyle = C.teal; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(X(rt.i), Y(candles[rt.i].l), 6, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; text('RETEST', X(rt.i), Y(candles[rt.i].l) + 20, { size: 10, align: 'center', color: C.teal, weight: 700 }); }
  }
  // oscillator strip (technical only: one at a time, then it steps aside)
  if (id === 'technical' && step >= 5 && step <= 8) {
    const top = Y(VR.v.mn) + 24, h = Math.min(90, H * 0.1), strip = (arr, mn, mx, color, guides) => {
      for (const gv of guides || []) line([[X(lo), top + h - (gv - mn) / (mx - mn) * h], [X(LAST), top + h - (gv - mn) / (mx - mn) * h]], C.slate, 1, 0.5, [2, 4]);
      const g = grow(step), pts = []; for (let i = lo; i <= LAST; i++) { if (i > lo + NV * g) break; if (arr[i] != null) pts.push([X(i), top + h - (clamp(arr[i], mn, mx) - mn) / (mx - mn) * h]); } line(pts, color, 1.3, 0.9);
    };
    if (step === 5) strip(IND.rsi, 0, 100, C.teal, [30, 70]);
    if (step === 6) { const vals = IND.macd.hist.slice(lo).filter(v => v != null), m = Math.max(...vals.map(Math.abs), ...IND.macd.line.slice(lo).map(v => Math.abs(v || 0))); for (let i = lo; i <= LAST; i++) { const v = IND.macd.hist[i]; if (v == null) continue; const y0 = top + h / 2, hh = (v / m) * h / 2; ctx.fillStyle = v >= 0 ? 'rgba(0,212,167,0.45)' : 'rgba(229,231,235,0.25)'; ctx.fillRect(X(i) - cw / 2, Math.min(y0, y0 - hh), cw, Math.abs(hh)); } strip(IND.macd.line, -m, m, C.teal); strip(IND.macd.signal, -m, m, C.light); }
    if (step === 7) { const v = IND.atr.slice(lo).filter(x => x != null); strip(IND.atr, Math.min(...v) * 0.9, Math.max(...v) * 1.1, C.amber); }
    if (step === 8) strip(IND.adx.adx, 0, 60, C.teal, [25]);
  }
  // replay: event markers
  if (id === 'replay') for (const e of REPLAY) { if (e.i > cut) break; const x = X(e.i); line([[x, Y(VR.v.mx)], [x, Y(VR.v.mn)]], e.decision === 'BUY' ? C.teal : C.slate, 1, e.decision === 'BUY' ? 0.8 : 0.35, [2, 3]); }
  // price tag at the edge of knowledge
  const c = candles[cut]; const q = [X(cut), Y(c.c)];
  line([[q[0], q[1]], [X(LAST) + 30, q[1]]], C.teal, 1, 0.35, [2, 3]);
  text(c.c.toFixed(2), X(LAST) + 34, q[1] + 4, { size: 11, color: C.teal, weight: 600 });
}

function drawVectorsFront(id, lp, mu, nextId, t) {
  const fade = 1 - mu;
  if (id === 'noise' || id === 'observe' || id === 'opening') fragments(id, lp, t, fade);
  if (id === 'technical') drawChart('technical', crispFor('technical') * fade, lp, t);
  if (id === 'replay') drawChart('replay', crispFor('replay') * fade, lp, t);
  if (id === 'memory' && lp < 0.3) drawChart('technical', (1 - lp / 0.3) * 0.6, 1, t);
  if (id === 'reason' || id === 'ask') {
    const n = nodeCache, cx_ = id === 'ask' ? rexState.x : 0, cy_ = id === 'ask' ? rexState.y : 0, c0 = sp(cx_, cy_, 0.6);
    EVIDENCE.forEach((e, j) => { const q = sp(n[j].x, n[j].y, n[j].z); if (!q || !c0) return; const f = id === 'ask' ? askFocus(e.id) : 1; line([q, c0], e.agree ? C.teal : C.amber, 1, (e.agree ? 0.16 : 0.22) * f * fade, e.agree ? null : [3, 5]); });
  }
  if (id === 'risk') {
    const rc = lp < 0.55 ? RISK_CASES[0] : RISK_CASES[1], q = NARROW ? sp(0, GATE().y + GATE().h + 0.16, 1) : sp(0, -0.75, 1);
    if (q && lp > 0.3) text(rc.verdict, q[0], q[1] + 18, { size: MOBILE ? 18 : 24, align: 'center', color: rc.verdict === 'REJECTED' ? C.neg : C.teal, weight: 700, alpha: smooth(0.3, 0.4, lp) * fade * (lp > 0.5 && lp < 0.6 ? 0.3 : 1) });
  }
  if (id === 'decision') {
    const ys = [[DECISION.invalidation, C.neg, T.inval], [DECISION.target, C.teal, T.target]];
    for (const [v, col, lab] of ys) { const a = sp(-A * 1.05, decY(v), 0.3), b = sp(A * 1.05, decY(v), 0.3); if (a && b) { line([a, b], col, 1, 0.25 * smooth(0.25, 0.55, lp) * fade, [4, 6]); text(`${lab.toUpperCase()} ${v.toFixed(2)}`, b[0] - 10, b[1] - 6, { size: 10, align: 'right', color: col, alpha: 0.7 * smooth(0.3, 0.6, lp) * fade, weight: 600 }); } }
  }
  if (id === 'live' && liveFocus >= 0) {
    const n = mkCache, me = MARKETS[liveFocus].sym;
    for (const [a, b, sgn] of LINKS) { if (a !== me && b !== me) continue; const ia = MARKETS.findIndex(m => m.sym === a), ib = MARKETS.findIndex(m => m.sym === b); const pa = sp(n[ia].x, n[ia].y, n[ia].z), pb = sp(n[ib].x, n[ib].y, n[ib].z); if (pa && pb) line([pa, pb], sgn > 0 ? C.teal : C.amber, 1, 0.45 * fade, sgn > 0 ? null : [3, 4]); }
  }
  if (id === 'system') { stCache.forEach(s => { const q = sp(s.x, s.y, s.z); if (q) { ctx.strokeStyle = C.teal; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(q[0], q[1], 14 * q[2], 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; } }); }
}

function fragments(id, lp, t, fade) {
  // market information at depth: some close, some distant; in Observation most fade, a few are highlighted
  for (let k = 0; k < fragIdx.length; k++) {
    const i = fragIdx[k]; if (rx[i * 4 + 3] <= 0.01) continue;
    const label = FRAGMENTS[k % FRAGMENTS.length], sz = clamp(rx[i * 4 + 2] * 6, 8, 44);
    const important = k === 3 || k === 0 || k === 11 || k === 16;
    let a = rx[i * 4 + 3];
    if (id === 'opening') a *= 0.6;
    if (id === 'observe') a = important ? 0.95 : a * (1 - smooth(0.05, 0.5, lp) * 0.9);
    text(label, rx[i * 4] + 6, rx[i * 4 + 1], { size: sz, color: important && id !== 'opening' ? C.teal : C.light, alpha: clamp(a * 1.4) * fade, weight: important ? 600 : 400 });
  }
}

/* ------------------------------------------------------------------ DOM overlay */
const el = {};
function buildDom() {
  const ov = $('#xp-overlay');
  document.querySelectorAll('[data-t]').forEach(n => { const v = n.dataset.t.split('.').reduce((o, k) => o?.[k], T); if (typeof v === 'string') n.textContent = v; });
  const st = (a, b, txt, cls = '', extra = '') => `<p class="st ${cls}" data-a="${a}" data-b="${b}" ${extra}>${txt}</p>`;
  const S_ = id => SCENES[IDX[id]], at = (id, u) => (S_(id).a + (S_(id).b - S_(id).a) * u).toFixed(4);
  let h = '';
  h += st(at('noise', 0.12), at('noise', 0.48), T.noise1, 'st--hero');
  h += st(at('noise', 0.55), at('noise', 0.92), T.noise2, 'st--hero st--quiet');
  T.observe.forEach((w, k) => { h += st(at('observe', 0.12 + k * 0.17), at('observe', 0.26 + k * 0.17 + 0.1), w, 'st--word', `style="--i:${k}"`); });
  h += st(at('streams', 0.1), at('streams', 0.55), T.streams, 'st--line');
  h += st(at('streams', 0.6), at('streams', 0.95), T.streamsSub, 'st--line st--quiet');
  h += st(at('enter', 0.02), at('enter', 0.35), T.enter, 'st--hero st--center');
  h += st(at('technical', 0.0), at('technical', 0.08), T.tech, 'st--line st--top');
  h += st(at('memory', 0.08), at('memory', 0.78), T.memory, 'st--line st--top st--big');
  h += st(at('memory', 0.3), at('memory', 0.78), T.memorySub, 'st--sub st--top st--under');
  h += st(at('ml', 0.78), at('ml', 0.98), T.ml, 'st--line st--bottom');
  h += st(at('reason', 0.02), at('reason', 0.38), T.reason, 'st--line st--bottom');
  h += st(at('reason', 0.42), at('reason', 0.74), T.wait, 'st--hero st--wait');
  h += st(at('reason', 0.5), at('reason', 0.74), T.waitSub, 'st--sub st--waitsub');
  h += st(at('risk', 0.0), at('risk', 0.5), T.risk1, 'st--line st--top');
  h += st(at('risk', 0.5), at('risk', 1.0), T.risk2, 'st--line st--top');
  h += st(at('replay', 0.0), at('replay', 0.3), T.replayQ, 'st--line st--top');
  T.system.forEach((w, k) => { h += st(at('system', 0.05 + k * 0.1), at('system', 0.62), w, k ? 'st--word st--sys' : 'st--line st--sys0', `style="--i:${k}"`); });
  h += st(at('system', 0.64), '1.02', `<span>${T.tagline[0]}</span><span class="accent">${T.tagline[1]}</span>`, 'st--hero st--tag');
  ov.insertAdjacentHTML('beforeend', h);
  el.st = [...ov.querySelectorAll('.st')].map(n => ({ n, a: +n.dataset.a, b: +n.dataset.b }));

  // opening fragments (time-based, isolated at depth)
  el.opening = $('#xp-opening');
  // technical step caption
  el.step = $('#xp-step'); el.stepName = $('#xp-step-name'); el.stepSub = $('#xp-step-sub'); el.stepList = $('#xp-step-list');
  el.stepList.innerHTML = T.steps.map((s, k) => `<li data-k="${k}">${s[0]}</li>`).join('');
  // ML stages
  el.ml = $('#xp-ml'); el.ml.querySelector('ol').innerHTML = T.mlStages.map((s, k) => `<li data-k="${k}">${s}</li>`).join('');
  el.prob = $('#xp-prob');
  // evidence labels
  el.ev = $('#xp-evidence'); el.ev.innerHTML = EVIDENCE.map(e => `<div class="ev" data-id="${e.id}"><b>${e.label}</b><span class="ltr">${e.state}</span><i style="--s:${e.strength}"></i></div>`).join('');
  el.evs = [...el.ev.children];
  // risk checks
  el.risk = $('#xp-risk');
  // decision
  el.decision = $('#xp-decision');
  el.decision.querySelector('.dec-words').innerHTML = ['BUY', 'SELL', 'WAIT'].map(w => `<span data-w="${w}" class="${w === DECISION.action ? 'on' : ''}">${w}</span>`).join('');
  el.decision.querySelector('dl').innerHTML = [[T.conf, DECISION.confidence.toFixed(2)], [T.riskL, DECISION.risk], [T.inval, DECISION.invalidation.toFixed(2)], [T.target, DECISION.target.toFixed(2)], [T.rr, DECISION.rr.toFixed(2)]].map(([k, v]) => `<div><dt>${k}</dt><dd class="ltr">${v}</dd></div>`).join('');
  el.decision.querySelector('.dec-why').textContent = DECISION.summary;
  // replay
  el.replay = $('#xp-replay'); el.scrub = $('#xp-scrub'); el.rEvents = el.replay.querySelector('.r-events');
  el.rEvents.innerHTML = REPLAY.map((e, k) => `<li data-k="${k}"><button type="button" data-i="${k}"><time>${e.time}</time><span>${e.event}</span></button></li>`).join('');
  el.scrub.addEventListener('input', () => { replayUser = el.scrub.value / 1000; Sound.cue('tick'); });
  el.rEvents.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; const e = REPLAY[+b.dataset.i]; replayUser = (e.i - (REPLAY[0].i - 6)) / (LAST - (REPLAY[0].i - 6)); el.scrub.value = Math.round(replayUser * 1000); });
  // ask
  el.ask = $('#xp-ask'); el.askList = el.ask.querySelector('.ask-q'); el.askA = el.ask.querySelector('.ask-a');
  el.askList.innerHTML = ASK.map((a, k) => `<button type="button" data-k="${k}" aria-pressed="${k === 0}">${a.q}</button>`).join('');
  el.askList.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; askIdx = +b.dataset.k; el.askList.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); el.askA.textContent = ASK[askIdx].a; blink = 1; Sound.cue('rex'); });
  el.askA.textContent = ASK[0].a;
  // live
  el.live = $('#xp-live'); el.liveNodes = $('#xp-live-nodes'); el.liveDetail = $('#xp-live-detail');
  el.liveNodes.innerHTML = MARKETS.map((m, j) => `<button type="button" class="mk" data-j="${j}"><b>${m.sym}</b><span class="ltr px">${fmt(m)}</span><em data-sig="${m.signal}">${m.signal}</em></button>`).join('');
  el.mks = [...el.liveNodes.children];
  const focus = j => { liveFocus = j; el.mks.forEach((b, k) => b.classList.toggle('on', k === j)); renderLiveDetail(); };
  el.liveNodes.addEventListener('mouseover', ev => { const b = ev.target.closest('.mk'); if (b && liveFocus < 0) { el.mks.forEach(x => x.classList.toggle('near', x === b)); } });
  // pointer/tap toggles; keyboard focus selects (a tap also focuses, so focus from a pointer is ignored)
  el.liveNodes.addEventListener('pointerdown', () => { el._ptr = true; });
  el.liveNodes.addEventListener('click', ev => { const b = ev.target.closest('.mk'); el._ptr = false; if (b) focus(+b.dataset.j === liveFocus ? -1 : +b.dataset.j); });
  el.liveNodes.addEventListener('focusin', ev => { const b = ev.target.closest('.mk'); if (b && !el._ptr) focus(+b.dataset.j); });
  // system labels
  el.sys = $('#xp-stations'); el.sys.innerHTML = T.stations.map(s => `<span>${s}</span>`).join(''); el.sysL = [...el.sys.children];
  // nav + rail
  el.nav = $('#xp-nav'); el.rail = $('#xp-rail'); el.railName = $('#xp-rail-name'); el.railNum = $('#xp-rail-num');
  document.querySelectorAll('[data-go]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); go(a.dataset.go); }));
  el.hint = $('#xp-hint');
}
const fmt = m => m.price.toLocaleString('en-US', { minimumFractionDigits: m.dp, maximumFractionDigits: m.dp });
function renderLiveDetail() {
  if (liveFocus < 0) { el.liveDetail.hidden = true; return; }
  const m = MARKETS[liveFocus], F_ = T.liveFields;
  el.liveDetail.hidden = false;
  el.liveDetail.innerHTML = `<h3 class="ltr">${m.sym} <span>${fmt(m)}</span></h3><dl>${[[F_.trend, m.trend], [F_.regime, m.regime], [F_.vol, m.vol], [F_.signal, m.signal], [F_.ai, m.ai], [F_.conf, m.conf.toFixed(2)], [F_.fresh, 'DEMO']].map(([k, v]) => `<div><dt>${k}</dt><dd class="ltr">${v}</dd></div>`).join('')}</dl><p class="demo-note">${T.demoValues}</p>`;
}
function go(id) {
  const s = SCENES[IDX[id]]; const max = document.documentElement.scrollHeight - innerHeight;
  scrollTo({ top: (s.a + (s.b - s.a) * (id === 'technical' ? 0.02 : 0.12)) * max, behavior: RM ? 'auto' : 'smooth' });
}

function vis(node, on) { if (node._on !== on) { node.classList.toggle('show', on); node.setAttribute('aria-hidden', on ? 'false' : 'true'); if ('inert' in node) node.inert = !on; node._on = on; } }

function updateDom(sc, lp, mu, next, t) {
  const p = cur.p;
  for (const s of el.st) {
    const w = s.b - s.a, u = (p - s.a) / w;
    const o = u <= 0 || u >= 1 ? 0 : Math.min(smooth(0, 0.18, u), 1 - smooth(0.82, 1, u));
    if (o <= 0.001) { if (s.n._o !== 0) { s.n.style.opacity = 0; s.n._o = 0; } continue; }
    s.n._o = o; s.n.style.opacity = o.toFixed(3);
    if (!RM) s.n.style.transform = `translate3d(0, ${((0.5 - u) * 24).toFixed(1)}px, 0) scale(${(0.97 + o * 0.03).toFixed(4)})`, s.n.style.filter = o < 0.98 ? `blur(${((1 - o) * 6).toFixed(1)}px)` : 'none';
  }
  // opening: isolated fragments appear, then vanish (time-based on load, while at the top)
  const openingOn = sc.id === 'opening';
  vis(el.opening, openingOn); vis(el.hint, sc.id === 'opening' && introT > 5.5);
  if (openingOn) { const seq = el.opening.children, per = 0.95, k = Math.floor(introT / per); for (let j = 0; j < seq.length; j++) seq[j].classList.toggle('on', j === k % (seq.length + 2)); }
  // nav: almost invisible at first, defined as the visitor goes deeper
  el.nav.style.setProperty('--nav', (0.18 + smooth(0.03, 0.12, p) * 0.82).toFixed(3));
  el.railNum.textContent = String(cur.k + 1).padStart(2, '0'); el.railName.textContent = T.scenes[cur.k];
  el.rail.style.setProperty('--prog', p.toFixed(4));
  // technical steps
  const techOn = sc.id === 'technical' && mu < 0.6; vis(el.step, techOn);
  if (techOn) { const k = clamp(Math.floor(clamp((lp - 0.06) / 0.86) * 12 - 1e-6), 0, 11); if (el.step._k !== k) { el.step._k = k; el.stepName.textContent = T.steps[k][0]; el.stepSub.textContent = T.steps[k][1]; el.stepList.querySelectorAll('li').forEach((li, j) => { li.classList.toggle('done', j < k); li.classList.toggle('now', j === k); }); Sound.cue('tick'); } }
  // ML
  const mlOn = sc.id === 'ml' && mu < 0.6; vis(el.ml, mlOn);
  if (mlOn) { const k = Math.min(7, Math.floor(lp * 8)); el.ml.querySelectorAll('li').forEach((li, j) => { li.classList.toggle('done', j < k); li.classList.toggle('now', j === k); }); el.prob.style.opacity = smooth(0.8, 0.9, lp); }
  // evidence (reasoning + ask)
  const evOn = (sc.id === 'reason' || sc.id === 'ask') && mu < 0.7; vis(el.ev, evOn);
  if (evOn) el.evs.forEach((d, j) => { const n = nodesBy[sc.id][j]; if (project(n.x, n.y + 0.08, n.z, P)) { d.style.transform = `translate3d(${P[0].toFixed(1)}px, ${P[1].toFixed(1)}px, 0) translate(-50%, -100%)`; } const e = EVIDENCE[j]; d.classList.toggle('conflict', !e.agree); d.classList.toggle('dim', sc.id === 'ask' && askFocus(e.id) < 1); d.classList.toggle('wait', sc.id === 'reason' && lp > 0.4 && lp < 0.72 && !e.agree); });
  // risk
  const riskOn = sc.id === 'risk' && mu < 0.6; vis(el.risk, riskOn);
  if (riskOn) { const rc = lp < 0.55 ? RISK_CASES[0] : RISK_CASES[1]; if (el.risk._c !== rc) { el.risk._c = rc; el.risk.innerHTML = `<h3>${rc.name}</h3><ul>${rc.checks.map(([k, v, ok]) => `<li class="${ok ? 'ok' : 'fail'}"><b>${k}</b><span class="ltr">${v}</span><i>${ok ? 'PASS' : 'FAIL'}</i></li>`).join('')}</ul>`; Sound.cue(rc.verdict === 'REJECTED' ? 'risk' : 'pass'); } el.risk.querySelectorAll('li').forEach((li, j) => li.classList.toggle('in', ((lp % 0.55) / 0.3) * 7 > j || lp > 0.72)); }
  // decision
  const decOn = sc.id === 'decision' && mu < 0.5; vis(el.decision, decOn); if (decOn && el.decision._played !== true && lp > 0.2) { el.decision._played = true; Sound.cue('decision'); }
  el.decision.style.setProperty('--u', smooth(0.1, 0.45, lp).toFixed(3));
  // replay
  const repOn = sc.id === 'replay' && mu < 0.6; vis(el.replay, repOn);
  if (repOn) {
    if (replayUser == null) el.scrub.value = Math.round(replayT() * 1000);
    const { s } = replayState(), k = s ? REPLAY.indexOf(s) : -1;
    el.rEvents.querySelectorAll('li').forEach((li, j) => { li.classList.toggle('done', j < k); li.classList.toggle('now', j === k); });
    const knew = el.replay.querySelector('.r-knew');
    if (knew._k !== k) { knew._k = k; const ev = s ? s.ev : {}; knew.innerHTML = ['trend', 'structure', 'momentum', 'volatility', 'ml', 'risk'].map(key => `<div><dt>${key.toUpperCase()}</dt><dd class="ltr">${ev[key] || '—'}</dd></div>`).join(''); el.replay.querySelector('.r-dec').textContent = s ? s.decision : 'WAIT'; el.replay.querySelector('.r-dec').dataset.w = s ? s.decision : 'WAIT'; el.replay.querySelector('.r-conf').textContent = s ? s.conf.toFixed(2) : '—'; el.replay.querySelector('.r-conf-bar').style.setProperty('--c', s ? s.conf : 0); el.replay.querySelector('.r-risk').textContent = s ? s.risk : '—'; }
  }
  // ask
  vis(el.ask, sc.id === 'ask' && mu < 0.6);
  // live
  const liveOn = sc.id === 'live' && mu < 0.6; vis(el.live, liveOn);
  if (liveOn) el.mks.forEach((b, j) => { const n = mkCache[j]; if (project(n.x, n.y, n.z, P)) b.style.transform = `translate3d(${P[0].toFixed(1)}px, ${P[1].toFixed(1)}px, 0) translate(-50%, -50%)`; });
  // system stations
  const sysOn = sc.id === 'system'; vis(el.sys, sysOn);
  if (sysOn) el.sysL.forEach((d, j) => { const s = stCache[j]; if (project(s.x, s.y + (j % 2 && !MOBILE ? 0.13 : -0.1), s.z, P)) { d.style.transform = `translate3d(${P[0].toFixed(1)}px, ${P[1].toFixed(1)}px, 0) translate(-50%, ${j % 2 && !MOBILE ? '-100%' : '0'})`; d.style.opacity = smooth(j * 0.03, j * 0.03 + 0.15, lp) * (1 - smooth(0.62, 0.72, lp) * 0.6); } });
}

function onScene(k) {
  const id = SCENES[k].id;
  if (id !== 'replay') replayUser = null;
  if (id !== 'live' && liveFocus >= 0) { liveFocus = -1; el.mks?.forEach(b => b.classList.remove('on')); renderLiveDetail(); }
  document.body.dataset.scene = id;
  Sound.scene(id);
  el.decision && (el.decision._played = false);
}

/* ------------------------------------------------------------------ boot */
function boot() {
  if (LANG === 'ar') { root.lang = 'ar'; root.dir = 'rtl'; }
  resize(); buildDom();
  addEventListener('resize', () => { resize(); VR.v = null; }, { passive: true });
  addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = e.pointerType === 'mouse'; }, { passive: true });
  addEventListener('pointerleave', () => { pointer.active = false; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { t0 = performance.now() - (last - t0); } });
  $('#xp-sound').addEventListener('click', ev => { const on = Sound.toggle(); ev.currentTarget.setAttribute('aria-pressed', on); ev.currentTarget.querySelector('[data-state]').textContent = on ? T.on : T.off; });
  // live data rule: only a configured FOXREX Market API may replace DEMO values (none is configured → UNAVAILABLE)
  const api = document.querySelector('meta[name="foxrex-market-api"]')?.content || '';
  $('#xp-live-status').textContent = api ? '' : `${T.unavailable} · ${T.demoValues}`;
  root.classList.add('xp-ready'); if (RM) root.classList.add('xp-rm');
  requestAnimationFrame(t => { last = t; t0 = t; frame(t); });
}
try { boot(); } catch (e) { root.classList.remove('xp-ready'); root.classList.add('xp-failed'); console.warn('FOXREX experience fallback:', e.message); }
