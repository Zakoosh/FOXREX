/* REX — the intelligence presence. A faceted, low-poly fox head derived from the approved FOXREX fox
   (tall pointed ears, broad cheek ruff, narrow muzzle, slanted eyes). Built as 3D line geometry so it
   can be rendered as particles, turned toward events (rotY), dissolved into data and re-formed.
   Coordinates: x right, y up, z toward the viewer (muzzle forward). Unit ≈ half head width. */

// Key vertices (front-facing). Depth gives the head real volume when it turns.
const V = {
  earL: [-0.74, 1.14, -0.25], earLin: [-0.24, 0.50, -0.05], earLout: [-0.95, 0.32, -0.2], earInL: [-0.54, 0.64, -0.12],
  earR: [0.74, 1.14, -0.25], earRin: [0.24, 0.50, -0.05], earRout: [0.95, 0.32, -0.2], earInR: [0.54, 0.64, -0.12],
  crown: [0, 0.56, 0.02],
  cheekL: [-1.08, -0.08, -0.18], ruffL: [-1.02, -0.38, -0.14], ruffL2: [-0.70, -0.40, -0.02], jawL: [-0.40, -0.58, 0.12],
  cheekR: [1.08, -0.08, -0.18], ruffR: [1.02, -0.38, -0.14], ruffR2: [0.70, -0.40, -0.02], jawR: [0.40, -0.58, 0.12],
  muzL: [-0.13, -0.98, 0.42], muzR: [0.13, -0.98, 0.42], nose: [0, -1.10, 0.50],
  browL: [-0.60, 0.24, 0.0], browR: [0.60, 0.24, 0.0], browInL: [-0.14, 0.18, 0.12], browInR: [0.14, 0.18, 0.12],
  midface: [0, -0.30, 0.30], faceL: [-0.28, -0.04, 0.2], faceR: [0.28, -0.04, 0.2],
  // eyes: inner corner → outer corner, slanted up toward the ears — narrow, focused, a little cunning
  eyeLin: [-0.17, -0.04, 0.22], eyeLout: [-0.50, 0.10, 0.1], eyeRin: [0.17, -0.04, 0.22], eyeRout: [0.50, 0.10, 0.1]
};

// Edges: silhouette first (weighted heavier), then inner facets (ear triangles, brow, facial mask, muzzle ridge).
const OUTLINE = [['earLin', 'earL'], ['earL', 'earLout'], ['earLout', 'cheekL'], ['cheekL', 'ruffL'], ['ruffL', 'ruffL2'], ['ruffL2', 'jawL'], ['jawL', 'muzL'], ['muzL', 'nose'],
  ['nose', 'muzR'], ['muzR', 'jawR'], ['jawR', 'ruffR2'], ['ruffR2', 'ruffR'], ['ruffR', 'cheekR'], ['cheekR', 'earRout'], ['earRout', 'earR'], ['earR', 'earRin'], ['earRin', 'crown'], ['crown', 'earLin']];
const FACETS = [['earL', 'earInL'], ['earInL', 'earLin'], ['earR', 'earInR'], ['earInR', 'earRin'], ['browL', 'browInL'], ['browR', 'browInR'], ['browInL', 'crown'], ['browInR', 'crown'],
  ['browInL', 'faceL'], ['browInR', 'faceR'], ['faceL', 'midface'], ['faceR', 'midface'], ['midface', 'nose'], ['faceL', 'jawL'], ['faceR', 'jawR'],
  ['browL', 'cheekL'], ['browR', 'cheekR'], ['jawL', 'midface'], ['jawR', 'midface'], ['earLout', 'browL'], ['earRout', 'browR'], ['eyeLout', 'cheekL'], ['eyeRout', 'cheekR'], ['ruffL2', 'faceL'], ['ruffR2', 'faceR']];

export const EDGES = { outline: OUTLINE.map(([a, b]) => [V[a], V[b]]), facets: FACETS.map(([a, b]) => [V[a], V[b]]) };
export const EYES = { L: [V.eyeLin, V.eyeLout], R: [V.eyeRin, V.eyeRout] };

/** n points sampled along the geometry (outline gets ~60 % of points). Deterministic. */
export function samplePoints(n) {
  const pts = [], len = e => Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1], e[1][2] - e[0][2]);
  const put = (edges, count) => {
    const total = edges.reduce((s, e) => s + len(e), 0); let acc = 0, ei = 0;
    for (let k = 0; k < count; k++) {
      let d = ((k + 0.5) / count) * total;
      while (ei < edges.length - 1 && acc + len(edges[ei]) < d) { acc += len(edges[ei]); ei++; }
      const e = edges[ei], u = Math.min(1, (d - acc) / len(e));
      pts.push([e[0][0] + (e[1][0] - e[0][0]) * u, e[0][1] + (e[1][1] - e[0][1]) * u, e[0][2] + (e[1][2] - e[0][2]) * u]);
    }
    acc = 0; ei = 0;
  };
  const o = Math.round(n * 0.6); put(EDGES.outline, o); put(EDGES.facets, n - o);
  return pts;
}

/** Rotate a REX-space point (yaw, pitch) then place it in world space. */
export function place(p, { x = 0, y = 0, z = 0, s = 1, yaw = 0, pitch = 0 }, out) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  let px = p[0] * cy + p[2] * sy, pz = -p[0] * sy + p[2] * cy, py = p[1];
  const py2 = py * cp - pz * sp, pz2 = py * sp + pz * cp;
  out[0] = x + px * s; out[1] = y + py2 * s; out[2] = z - pz2 * s; // world z grows away from the viewer
  return out;
}
