/* REX — sculpted faceted fox head for the WebGL world.
   Built procedurally from fox anatomy rather than a generic low-poly mask: a lofted skull that narrows through
   a clear stop into a long tapered muzzle and a nose tip, a narrow jaw, a pronounced cheek ruff, and ears with
   a wide base set back on the skull. Faceting is architectural (flat shading, alternating diagonals and small
   deterministic offsets) rather than a smoothed animal model.

   Every triangle carries:
     zone   0 graphite (skull, bridge, ear backs) · 1 smoked ceramic mask (cheeks, lower muzzle, chin, ruff)
            2 nose (black gloss) · 3 deep (ear hollows, eye sockets, mouth line)
     region the order in which the data streams build REX (0 PRICE … 9 MEMORY)
   REX space: x right, y up, z toward the viewer (the muzzle points +z). About 2.2 units tall with the ears. */

const TAU = Math.PI * 2;
const lerp = (a, b, u) => a + (b - a) * u;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mix3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const gauss = (d2, s) => Math.exp(-d2 / (2 * s * s));

// profile keyframes along the head: z, centre y, half width, upper height, lower height
const KEY = [
  [-0.74, 0.1, 0.34, 0.32, 0.3],
  [-0.54, 0.12, 0.54, 0.46, 0.46],
  [-0.26, 0.1, 0.72, 0.55, 0.6],
  [0.02, 0.06, 0.71, 0.53, 0.62],    // widest at the cheeks
  [0.22, 0.01, 0.57, 0.45, 0.53],    // eye plane
  [0.38, -0.08, 0.4, 0.31, 0.42],    // the stop: forehead → muzzle
  [0.56, -0.18, 0.28, 0.21, 0.29],
  [0.76, -0.28, 0.21, 0.16, 0.2],
  [0.94, -0.36, 0.15, 0.12, 0.14],
  [1.06, -0.41, 0.085, 0.08, 0.08]
];
function prof(z) {
  if (z <= KEY[0][0]) return KEY[0];
  for (let k = 0; k < KEY.length - 1; k++) {
    const a = KEY[k], b = KEY[k + 1];
    if (z <= b[0]) { const u = (z - a[0]) / (b[0] - a[0]), s = u * u * (3 - 2 * u), e = lerp(u, s, 0.5); return a.map((v, i) => lerp(v, b[i], e)); }
  }
  return KEY[KEY.length - 1];
}
// sculpted displacement along the surface normal: brow ridge, cheekbone, eye socket, muzzle ridge, jaw line
function sculpt(z, th) {
  const a = Math.abs(th > Math.PI ? TAU - th : th);           // symmetric angle from the top (0 … π)
  return 0.05 * gauss((z - 0.25) ** 2 + ((a - 0.5) * 0.35) ** 2, 0.07)     // brow ridge above the eyes
    + 0.055 * gauss((z - 0.02) ** 2 + ((a - 1.75) * 0.3) ** 2, 0.1)        // cheekbone
    - 0.035 * gauss((z - 0.3) ** 2 + ((a - 0.9) * 0.3) ** 2, 0.05)         // eye socket
    + 0.018 * gauss((a) ** 2 * 0.2, 0.05) * (z > 0.35 ? 1 : 0)             // muzzle bridge ridge
    - 0.02 * gauss(((a - 2.35) * 0.4) ** 2, 0.05) * (z > 0.45 ? 1 : 0);    // lip line under the muzzle
}
function ringPoint(z, th) {
  const [, yc, w, ht, hb] = prof(z), s = Math.sin(th), c = Math.cos(th);
  const pc = Math.sign(c) * Math.pow(Math.abs(c), 0.82), ps = Math.sign(s) * Math.pow(Math.abs(s), 0.9);
  return [w * ps, yc + (c >= 0 ? ht : hb) * pc, z];
}
function surf(z, th) {
  const p = ringPoint(z, th), e = 0.004;
  const dz = sub(ringPoint(z + e, th), ringPoint(z - e, th)), dt = sub(ringPoint(z, th + e), ringPoint(z, th - e));
  let n = norm(cross(dt, dz)); if (dot(n, sub(p, [0, prof(z)[1], z])) < 0) n = mul(n, -1);
  return add(p, mul(n, sculpt(z, th)));
}
function surfNormal(z, th) {
  const e = 0.004, dz = sub(surf(z + e, th), surf(z - e, th)), dt = sub(surf(z, th + e), surf(z, th - e));
  let n = norm(cross(dt, dz)); const p = surf(z, th); if (dot(n, sub(p, [0, prof(z)[1], z])) < 0) n = mul(n, -1); return n;
}

const OFFSET = [0, -0.27, -0.12];
const sstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
/** Fox markings, continuous: 0 = graphite, 1 = smoked ceramic (lower muzzle, cheeks, throat). REX space (recentred). */
export function maskValue(q) {
  const p = [q[0] - OFFSET[0], q[1] - OFFSET[1], q[2] - OFFSET[2]];
  const [, yc, , ht, hb] = prof(p[2]), rel = (p[1] - yc) / (p[1] >= yc ? ht : hb);
  const muzzle = sstep(0.22, -0.02, rel), cheek = sstep(-0.02, -0.32, rel), w = sstep(0.26, 0.46, p[2]);
  return (cheek + (muzzle - cheek) * w) * sstep(-0.46, -0.24, p[2]);
}
// deterministic jitter so the faceting reads as sculpted, not as a regular tube
function jit(i, j) { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h) - 0.5; }

// eye anchors on the surface: inner corner lower and nearer the muzzle, outer corner higher toward the ear
const EYE = { inner: [0.36, 0.6], outer: [0.2, 1.02], centre: [0.29, 0.81] };

export function buildRex() {
  const tris = [];   // [a, b, c, zone, region]
  // every triangle faces outward (away from its part's centre), so REX can render front faces only
  let REF = null; const axisRef = c => [0, prof(c[2])[1], c[2]];
  const push = (a, b, c, zone) => { const cen = mul(add(add(a, b), c), 1 / 3), ref = REF ? REF : axisRef(cen), n = cross(sub(b, a), sub(c, a));
    tris.push(dot(n, sub(cen, ref)) >= 0 ? [a, b, c, zone, -1] : [a, c, b, zone, -1]); };

  /* skull + muzzle: loft */
  const NT = 20, zs = [];
  for (let k = 0; k < KEY.length - 1; k++) { zs.push(KEY[k][0]); zs.push(lerp(KEY[k][0], KEY[k + 1][0], 0.5)); }
  zs.push(KEY[KEY.length - 1][0]);
  const V = zs.map((z, i) => Array.from({ length: NT }, (_, j) => {
    const th = (j / NT) * TAU, p = surf(z, th), mid = j === 0 || j === NT / 2;
    const jj = i === 0 || i === zs.length - 1 ? 0 : 0.012;
    return mid ? [0, p[1] + jit(i, j) * jj, p[2]] : [p[0] + jit(i, j) * jj, p[1] + jit(j, i) * jj, p[2] + jit(i + 7, j) * jj * 0.6];
  }));
  // left half mirrors the right exactly, so the head is symmetric
  for (const ring of V) for (let j = 1; j < NT / 2; j++) { const r = ring[j]; ring[NT - j] = [-r[0], r[1], r[2]]; }
  for (let i = 0; i < zs.length - 1; i++) for (let j = 0; j < NT; j++) {
    const a = V[i][j], b = V[i][(j + 1) % NT], c = V[i + 1][j], d = V[i + 1][(j + 1) % NT];
    const flip = (i + j) % 2 === 0, t1 = flip ? [a, c, d] : [a, c, b], t2 = flip ? [a, d, b] : [b, c, d];
    for (const t of [t1, t2]) { const cen = mul(add(add(t[0], t[1]), t[2]), 1 / 3);
      push(t[0], t[1], t[2], cen[2] > 0.98 ? 2 : 4); }      // 4: graphite ↔ ceramic mask blended per vertex (maskValue)
  }
  // back cap and nose tip
  const back = [0, KEY[0][1], KEY[0][0] - 0.06], nose = [0, -0.385, 1.14], noseLow = [0, -0.47, 1.1];
  REF = [0, KEY[0][1], 0]; for (let j = 0; j < NT; j++) { push(V[0][(j + 1) % NT], back, V[0][j], 0); } REF = null;
  const last = V[V.length - 1];
  REF = [0, -0.41, 0.9]; for (let j = 0; j < NT; j++) { const a = last[j], b = last[(j + 1) % NT], low = a[1] < -0.43 && b[1] < -0.43; push(a, b, low ? noseLow : nose, 2); } REF = null;

  /* ears: wide base set back on the skull, tip leaning outward; hollow front, faceted back */
  for (const sgn of [1, -1]) {
    const P = (z, th) => { const p = surf(z, th); return [p[0] * sgn, p[1], p[2]]; };
    const b1 = P(-0.05, 0.26), b2 = P(-0.24, 1.3), b3 = P(-0.56, 0.74), bm = P(-0.15, 0.76);
    const baseC = mul(add(add(b1, b2), b3), 1 / 3);
    const tip = add(baseC, [0.4 * sgn, 0.82, -0.04]);
    const midF = add(mix3(mix3(b1, b2, 0.5), tip, 0.48), [0.05 * sgn, 0, 0.07]);    // front crease
    const midO = add(mix3(b2, tip, 0.5), [0.07 * sgn, 0.02, -0.03]);                 // outer edge bend
    const midI = add(mix3(b1, tip, 0.5), [-0.02 * sgn, 0.03, 0.0]);                  // inner edge bend
    const midB = add(mix3(b3, tip, 0.5), [0, 0.02, -0.07]);                          // back ridge
    // hollow: an inset, recessed triangle on the front face
    const hc = mix3(mix3(b1, b2, 0.5), tip, 0.4), rec = mul(norm(cross(sub(b2, b1), sub(tip, b1))), -0.05 * sgn);
    const h1 = add(mix3(hc, midI, 0.55), rec), h2 = add(mix3(hc, midO, 0.55), rec), h3 = add(mix3(hc, mix3(b1, b2, 0.5), 0.45), rec), ht = add(mix3(hc, tip, 0.62), rec);
    REF = mul(add(add(add(b1, b2), b3), tip), 0.25);
    const F = (a, b, c, z) => push(a, b, c, z);
    // front rim around the hollow
    F(b1, b2, h3, 0); F(b2, midO, h2, 0); F(b2, h2, h3, 0); F(midO, tip, ht, 0); F(midO, ht, h2, 0);
    F(tip, midI, ht, 0); F(midI, h1, ht, 0); F(midI, b1, h1, 0); F(b1, h3, h1, 0);
    F(h1, h3, h2, 3); F(h1, h2, ht, 3);                     // the hollow
    // back of the ear
    F(b2, b3, midO, 0); F(midO, b3, midB, 0); F(midO, midB, tip, 0); F(b3, b1, midB, 0); F(b1, midI, midB, 0); F(midI, tip, midB, 0);
    F(b1, bm, b2, 0); F(b2, bm, b3, 0); F(b3, bm, b1, 0);   // base seats into the skull
    void midF; REF = null;
  }

  /* cheek ruff: layered tufts sweeping outward and down — the fox's defining facial frame */
  const tufts = [[0.08, 1.5, 0.2, [1, -0.15, -0.35], 0.46], [-0.02, 1.78, 0.25, [0.95, -0.55, -0.35], 0.46], [-0.26, 1.7, 0.2, [0.9, -0.35, -0.6], 0.46]];
  for (const sgn of [1, -1]) for (const [z, th, len, dir, wid] of tufts) {
    const P = (zz, t) => { const p = surf(zz, t); return [p[0] * sgn, p[1], p[2]]; };
    const a = P(z + 0.04, th - wid * 0.5), b = P(z - 0.04, th + wid * 0.5), mid = mix3(a, b, 0.5);
    const tip = add(mid, mul(norm([dir[0] * sgn, dir[1], dir[2]]), len)), ridge = add(mix3(mid, tip, 0.4), [0, 0, 0.025]);
    REF = mul(add(add(add(a, b), tip), mid), 0.25); REF = add(REF, mul(norm(sub(REF, [0, prof(REF[2])[1], REF[2]])), -0.02));
    const F = (p, q, r, zz) => push(p, q, r, zz);
    F(a, ridge, tip, 1); F(ridge, b, tip, 1); F(a, b, ridge, 1); F(b, a, tip, 1); REF = null;
  }
  /* eyes: socket ring + upper lid overhang, so the eyes sit in the sculpture rather than on it */
  const eyes = {};
  for (const [side, sgn] of [['R', 1], ['L', -1]]) {
    const pin = surf(...EYE.inner), pout = surf(...EYE.outer), pc = surf(...EYE.centre);
    const S = p => [p[0] * sgn, p[1], p[2]];
    const n0 = surfNormal(...EYE.centre), n = norm([n0[0] * sgn, n0[1], n0[2]]);
    const inner = add(S(pin), mul(n, 0.012)), outer = add(S(pout), mul(n, 0.012)), centre = add(S(pc), mul(n, 0.012));
    let xa = norm(sub(outer, inner)); let ya = norm(cross(n, xa)); if (ya[1] < 0) ya = mul(ya, -1);
    const len = Math.hypot(...sub(outer, inner));
    eyes[side] = { inner, outer, centre, normal: n, xAxis: xa, yAxis: ya, len };
    // lid + socket as a ring of quads around the almond
    const L = (u, v, out) => add(add(add(inner, mul(xa, u * len)), mul(ya, v * len)), mul(n, out));
    const lidTop = [[-0.04, 0.02], [0.2, 0.17], [0.5, 0.23], [0.8, 0.19], [1.06, 0.07]], eyeTop = [[0, 0], [0.2, 0.14], [0.5, 0.2], [0.8, 0.14], [1, 0.02]];
    const eyeBot = [[0, 0], [0.25, -0.1], [0.55, -0.12], [0.85, -0.06], [1, 0.02]], sockBot = [[-0.04, -0.06], [0.25, -0.2], [0.55, -0.22], [0.85, -0.14], [1.06, -0.02]];
    const F = (a, b, c, z) => push(a, b, c, z);
    for (let k = 0; k < 4; k++) {
      const a = L(...lidTop[k], 0.03), b = L(...lidTop[k + 1], 0.03), c = L(...eyeTop[k], 0.02), d = L(...eyeTop[k + 1], 0.02);
      F(c, b, a, 0); F(c, d, b, 0);                                                   // upper lid: the overhang that shades the eye
      const e = L(...eyeBot[k], 0.0), f = L(...eyeBot[k + 1], 0.0), g = L(...sockBot[k], -0.005), h = L(...sockBot[k + 1], -0.005);
      F(e, g, f, 3); F(f, g, h, 3);                                                   // lower socket
    }
  }

  /* regions: the order in which the data streams build REX */
  const eyeC = [eyes.R.centre, eyes.L.centre];
  const earTri = t => t[0][1] > 0.45 && Math.abs(t[0][0]) > 0.15 && (t[0][1] > 0.62 || t[1][1] > 0.62 || t[2][1] > 0.62);
  for (const t of tris) {
    const c = mul(add(add(t[0], t[1]), t[2]), 1 / 3);
    let r;
    if (Math.min(...eyeC.map(e => Math.hypot(...sub(c, e)))) < 0.26) r = 0;          // PRICE → the eyes wake first
    else if (t[3] === 2 || c[2] > 0.92) r = 9;                                         // MEMORY → the nose, last
    else if (earTri(t)) r = 2;                                                         // VOLATILITY → the ears
    else if (t[3] === 1 && Math.abs(c[0]) > 0.62) r = 6;                               // LIQUIDITY → the ruff
    else if (c[1] < prof(c[2])[1] - 0.18 && c[2] > -0.2) r = 1;                        // VOLUME → jaw and chin
    else if (c[2] > 0.45) r = 4;                                                       // MOMENTUM → the muzzle
    else if (c[2] > 0.1 && c[1] > 0) r = 5;                                            // TREND → brow and forehead
    else if (c[2] < -0.36) r = 8;                                                      // SESSION → back of the head
    else if (c[1] > 0.3) r = 3;                                                        // STRUCTURE → the skull
    else r = 7;                                                                        // NEWS → the cheeks
    t[4] = r;
  }
  // recentre: the eye line sits near y = 0 and the head is balanced front-to-back (scene placements rely on it)
  const O = OFFSET, mv = p => { p[0] += O[0]; p[1] += O[1]; p[2] += O[2]; };
  const seen = new Set(); for (const t of tris) for (const p of t.slice(0, 3)) if (!seen.has(p)) { seen.add(p); mv(p); }
  for (const e of Object.values(eyes)) for (const k of ['inner', 'outer', 'centre']) if (!seen.has(e[k])) { seen.add(e[k]); mv(e[k]); }
  return { tris, eyes };
}

/** Area-weighted surface samples (REX space) with their build region: [x, y, z, region]. Deterministic. */
export function sampleSurface(tris, n, seed = 99) {
  const areas = tris.map(([a, b, c]) => Math.hypot(...cross(sub(b, a), sub(c, a))) / 2);
  const total = areas.reduce((s, x) => s + x, 0); let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let k = 0; k < n; k++) {
    let x = r() * total, t = 0; while (t < tris.length - 1 && x > areas[t]) { x -= areas[t]; t++; }
    let u = r(), v = r(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const [a, b, c, , reg] = tris[t]; out.push([a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v, a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v, a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v, reg]);
  }
  return out;
}
