/* FOXREX experience — WebGL world (Three.js r170, vendored).
   The engine (engine.js) owns the film timeline, formations, camera narrative, REX behaviour, DOM typography
   and interactions. This module renders the world those decisions describe, with real depth: perspective
   camera, exponential fog, lighting, depth-of-field point sprites, a sculpted faceted REX (rim-lit, dissolvable,
   amber eyes that reflect market data), volumetric light beams, a spatial 3D chart, and text living inside
   the space. Engine coordinates: x right, y up, z AWAY from the viewer → three.js z = -z. */
import * as THREE from '../vendor/three.module.min.js';

const FOV = 2 * Math.atan(1 / 3) * 180 / Math.PI;   // matches the engine's projection (y = 1 at distance 3)
const BG = new THREE.Color('#070C15');
const V3 = (x, y, z) => new THREE.Vector3(x, y, -z);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

/* ------------------------------------------------------------------ REX: sculpted low-poly fox bust */
// Left-half vertices (x < 0); the right half is mirrored. REX space: x right, y up, z toward the viewer.
const RV = {
  C0: [0, 0.58, -0.08], C1: [0, 0.30, 0.18], C2: [0, 0.02, 0.32], C3: [0, -0.40, 0.46], C4: [0, -0.86, 0.58], C5: [0, -1.04, 0.60], C6: [0, -1.00, 0.30], C7: [0, -0.80, -0.08],
  earTip: [-0.74, 1.14, -0.30], earIn: [-0.26, 0.52, -0.02], earOut: [-0.92, 0.36, -0.28], earMid: [-0.56, 0.66, -0.04],
  brow: [-0.40, 0.26, 0.10], temple: [-0.74, 0.20, -0.12], eyeIn: [-0.17, -0.04, 0.27], eyeOut: [-0.50, 0.10, 0.13], eyeLow: [-0.32, -0.12, 0.22],
  cheek: [-1.08, -0.08, -0.20], ruff: [-1.00, -0.40, -0.18], ruff2: [-0.70, -0.44, 0.00], jaw: [-0.40, -0.60, 0.16], muz: [-0.14, -0.94, 0.44], muzSide: [-0.20, -0.62, 0.36],
  back: [-0.62, 0.40, -0.48], neck: [-0.55, -0.86, -0.36]
};
const RT = [['earTip', 'earOut', 'earMid'], ['earTip', 'earMid', 'earIn'], ['earMid', 'earOut', 'temple'], ['earMid', 'temple', 'brow'], ['earMid', 'brow', 'earIn'],
  ['earIn', 'brow', 'C1'], ['earIn', 'C1', 'C0'], ['brow', 'C1', 'C2'], ['brow', 'C2', 'eyeIn'], ['brow', 'eyeIn', 'eyeOut'], ['brow', 'eyeOut', 'temple'],
  ['temple', 'eyeOut', 'cheek'], ['temple', 'earOut', 'cheek'], ['eyeOut', 'eyeLow', 'cheek'], ['eyeIn', 'eyeLow', 'eyeOut'], ['eyeIn', 'C2', 'C3'], ['eyeIn', 'C3', 'muzSide'],
  ['eyeIn', 'muzSide', 'eyeLow'], ['eyeLow', 'muzSide', 'jaw'], ['eyeLow', 'jaw', 'ruff2'], ['eyeLow', 'ruff2', 'cheek'], ['cheek', 'ruff2', 'ruff'], ['muzSide', 'C3', 'C4'],
  ['muzSide', 'C4', 'muz'], ['muz', 'C4', 'C5'], ['muzSide', 'muz', 'jaw'], ['jaw', 'muz', 'C6'], ['muz', 'C5', 'C6'], ['jaw', 'C6', 'C7'], ['ruff2', 'jaw', 'neck'],
  ['ruff', 'ruff2', 'neck'], ['jaw', 'C7', 'neck'], ['earOut', 'back', 'temple'], ['back', 'cheek', 'temple'], ['back', 'ruff', 'cheek'], ['back', 'neck', 'ruff'], ['earIn', 'earTip', 'back'], ['C0', 'earIn', 'back']];
function rexTriangles() {
  const P = k => RV[k], M = k => (k[0] === 'C' ? RV[k] : [-RV[k][0], RV[k][1], RV[k][2]]);
  const tris = [];
  for (const [a, b, c] of RT) { tris.push([P(a), P(b), P(c)]); if (!(a[0] === 'C' && b[0] === 'C' && c[0] === 'C')) tris.push([M(a), M(c), M(b)]); }
  tris.push([RV.C7, [RV.neck[0], RV.neck[1], RV.neck[2]], [-RV.neck[0], RV.neck[1], RV.neck[2]]]);
  return tris;
}
export const REX_EYES = { L: [RV.eyeIn, RV.eyeOut], R: [[-RV.eyeIn[0], RV.eyeIn[1], RV.eyeIn[2]], [-RV.eyeOut[0], RV.eyeOut[1], RV.eyeOut[2]]] };
/** Area-weighted surface samples (REX space) — the particles that form, dissolve into and re-form REX. */
export function sampleRexSurface(n, seed = 99) {
  const tris = rexTriangles(), areas = tris.map(([a, b, c]) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2; });
  const total = areas.reduce((s, x) => s + x, 0); let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let k = 0; k < n; k++) {
    let x = r() * total, t = 0; while (t < tris.length - 1 && x > areas[t]) { x -= areas[t]; t++; }
    let u = r(), v = r(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const [a, b, c] = tris[t]; out.push([a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v, a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v, a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v]);
  }
  return out;
}

/* ------------------------------------------------------------------ shaders */
const NOISE = `
float hash3(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z); }`;

const REX_VS = `varying vec3 vView; varying vec3 vLocal;
void main(){ vLocal = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vView = mv.xyz; gl_Position = projectionMatrix * mv; }`;
const REX_FS = `${NOISE}
uniform vec3 uBase, uKeyColor, uKeyDir, uRimColor, uFillColor, uFillDir, uBg; uniform float uKey, uRim, uFill, uOpacity, uDissolve, uTime, uFog;
varying vec3 vView; varying vec3 vLocal;
void main(){
  float n = vnoise(vLocal*11.0 + vec3(0.0, uTime*0.05, 0.0)) * 0.55 + vnoise(vLocal*29.0) * 0.45;
  if (n < uDissolve) discard;
  vec3 N = normalize(cross(dFdx(vView), dFdy(vView)));
  vec3 V = normalize(-vView);
  float key = max(dot(N, normalize(uKeyDir)), 0.0);
  float fill = max(dot(N, normalize(uFillDir)), 0.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.6);
  vec3 H = normalize(normalize(uKeyDir) + V);
  float spec = pow(max(dot(N, H), 0.0), 48.0);
  vec3 col = uBase + uKeyColor * key * key * uKey * 0.7 + uFillColor * fill * fill * uFill * 0.35 + vec3(0.85, 0.92, 1.0) * spec * uKey * 0.55 + uRimColor * fres * uRim * 0.55;
  col += uRimColor * 0.035 * step(0.985, fract(vLocal.y * 22.0 - uTime * 0.12));      // faint data scan across the facets
  float edge = (1.0 - smoothstep(uDissolve, uDissolve + 0.025, n)) * step(0.001, uDissolve);
  col = mix(col, vec3(0.55, 0.95, 0.85), edge * 0.6);                                   // dissolving edge becomes data
  float fog = exp(-uFog * uFog * dot(vView, vView));
  gl_FragColor = vec4(mix(uBg, col, fog), uOpacity);
}`;

const EYE_VS = `varying vec2 vUv; void main(){ vUv = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const EYE_FS = `uniform vec2 uGaze; uniform float uAlpha, uTime, uFocus, uDir; uniform sampler2D uRefl; varying vec2 vUv;
void main(){
  vec2 c = vec2(0.5 + uGaze.x * uDir * 0.16, 0.05 + uGaze.y * 0.05);
  float d = length((vUv - c) * vec2(1.0, 1.7));
  vec3 iris = mix(vec3(1.0, 0.93, 0.76), vec3(0.94, 0.66, 0.2), smoothstep(0.0, 0.42, d));
  iris *= 1.0 - smoothstep(0.30, 0.62, d) * 0.65;
  float slitW = mix(0.035, 0.018, uFocus);
  float slit = (1.0 - smoothstep(slitW, slitW + 0.02, abs(vUv.x - c.x))) * (1.0 - smoothstep(0.18, 0.34, abs(vUv.y - c.y)));
  vec3 col = mix(iris, vec3(0.02, 0.03, 0.05), slit);
  vec3 refl = texture2D(uRefl, vec2(vUv.x * 1.3 + uTime * 0.03, vUv.y * 2.2 + 0.4)).rgb;   // market information, reflected
  col += refl * 0.55 * (1.0 - slit);
  col += vec3(1.0) * (1.0 - smoothstep(0.0, 0.07, length(vUv - vec2(0.64, 0.17)))) * 0.85;   // glint
  gl_FragColor = vec4(col, uAlpha);
}`;

const PTS_VS = `attribute vec3 aColor; attribute float aAlpha; attribute float aSize;
uniform float uPx, uFocus, uAperture, uFog; varying vec3 vColor; varying float vAlpha; varying float vBlur;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; gl_Position = projectionMatrix * mv;
  float coc = min(abs(d - uFocus) * uAperture, 2.5);
  gl_PointSize = clamp(aSize * uPx / max(d, 0.1) * (1.0 + coc * 1.6), 1.0, 72.0);
  float fog = exp(-uFog * uFog * d * d);
  vAlpha = d < 0.25 ? 0.0 : aAlpha * fog / (1.0 + coc * coc * 1.6);
  vBlur = clamp(coc, 0.0, 1.0); vColor = aColor;
}`;
const PTS_FS = `varying vec3 vColor; varying float vAlpha; varying float vBlur;
void main(){ float r = length(gl_PointCoord - 0.5); float core = mix(0.16, 0.46, vBlur);
  float a = 1.0 - smoothstep(core * 0.55, 0.5, r); if (a <= 0.004 || vAlpha <= 0.004) discard; gl_FragColor = vec4(vColor, a * vAlpha); }`;

const BEAM_VS = `varying float vH; varying vec3 vN; varying vec3 vV;
void main(){ vH = position.y + 0.5; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`;
const BEAM_FS = `uniform float uInt; uniform vec3 uColor; varying float vH; varying vec3 vN; varying vec3 vV;
void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float a = pow(vH, 1.4) * edge * uInt; gl_FragColor = vec4(uColor, a); }`;

const DASH_VS = `attribute float lineDistance; varying float vD; void main(){ vD = lineDistance; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const DASH_FS = `uniform vec3 uColor; uniform float uAlpha, uTime, uSpeed, uFreq; varying float vD;
void main(){ float f = fract(vD * uFreq - uTime * uSpeed); float a = smoothstep(0.0, 0.2, f) * (1.0 - smoothstep(0.35, 0.55, f)); gl_FragColor = vec4(uColor, uAlpha * (0.25 + 0.75 * a)); }`;

const GRID_FS = `uniform vec3 uColor; uniform float uAlpha, uCells; varying vec2 vUv;
void main(){ vec2 g = abs(fract(vUv * uCells - 0.5) - 0.5) / fwidth(vUv * uCells); float l = 1.0 - min(min(g.x, g.y), 1.0);
  float fade = 1.0 - smoothstep(0.25, 0.5, length(vUv - 0.5)); gl_FragColor = vec4(uColor, l * uAlpha * fade); }`;
const UV_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

/* ------------------------------------------------------------------ helpers */
function textSprite(txt, { px = 72, color = '#E5E7EB', weight = 600, h = 0.1, font = 'Inter', align = 'center', track = 0 } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const f = `${weight} ${px}px ${font}, system-ui, sans-serif`; g.font = f;
  if ('letterSpacing' in g) g.letterSpacing = `${track}px`;
  const w = Math.ceil(g.measureText(txt).width + px * 0.5 + track * txt.length);
  c.width = w; c.height = Math.ceil(px * 1.35); g.font = f; if ('letterSpacing' in g) g.letterSpacing = `${track}px`;
  g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(txt, px * 0.25, c.height / 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true, opacity: 0 }));
  s.scale.set(h * c.width / c.height, h, 1); if (align === 'left') s.center.set(0.02, 0.5); if (align === 'right') s.center.set(0.98, 0.5);
  s.userData.h = h; s.userData.aspect = c.width / c.height;
  return s;
}
function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.25)') {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(0.25, mid); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function reflectionTexture(words) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 128);
  g.font = '600 22px Inter, sans-serif'; let x = 6;
  for (let row = 0; row < 4; row++) { x = 6 - row * 40; for (const w of words) { g.fillStyle = row % 2 ? 'rgba(0,212,167,0.9)' : 'rgba(229,231,235,0.85)'; g.fillText(w, x, 26 + row * 30); x += g.measureText(w).width + 26; if (x > 512) break; } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
class Ribbon {  // a camera-facing line strip in the xy plane with real thickness (WebGL lines are 1px)
  constructor(max, material) {
    this.max = max; this.pos = new Float32Array(max * 2 * 3);
    const idx = []; for (let i = 0; i < max - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, material); this.mesh.frustumCulled = false; this.geo = g;
  }
  set(pts, w) {  // pts: engine coords [[x,y,z],…]
    const n = Math.min(pts.length, this.max);
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const nx = -ty * w / 2, ny = tx * w / 2, o = i * 6;
      this.pos[o] = p[0] + nx; this.pos[o + 1] = p[1] + ny; this.pos[o + 2] = -p[2]; this.pos[o + 3] = p[0] - nx; this.pos[o + 4] = p[1] - ny; this.pos[o + 5] = -p[2];
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }
}
const basic = (color, opacity = 1, additive = false) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
const lineMat = (color, opacity = 1) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
function polyline(pts, mat) { const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => V3(...p))); return new THREE.Line(g, mat); }

/* ------------------------------------------------------------------ the world */
export async function createWorld(canvas, D) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('WebGL unavailable');
  renderer.setClearColor(BG, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  try { await Promise.all(['600 72px Inter', '500 72px Inter', '700 72px Inter', '600 72px "IBM Plex Sans Arabic"'].map(f => document.fonts.load(f))); } catch { /* fallback fonts */ }

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG, 0.04);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 200);
  const orbit = new THREE.Group(), world = new THREE.Group(); orbit.add(world); scene.add(orbit);

  // lights (used by the lit chart volumes and the risk portal; REX has its own shader lighting)
  const ambient = new THREE.AmbientLight('#8fa3c0', 0.5), key = new THREE.DirectionalLight('#ffffff', 1.2); key.position.set(-2, 3, 4);
  const rimL = new THREE.PointLight('#00D4A7', 0, 8, 1.6); rimL.position.set(1.6, 0.4, -1.5);
  scene.add(ambient, key, rimL);

  /* far background: dust at great depth + a precision horizon */
  {
    const n = D.mobile() ? 500 : 1400, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), al = new Float32Array(n), sz = new Float32Array(n);
    let s = 4242; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) { pos[i * 3] = (r() - 0.5) * 70; pos[i * 3 + 1] = (r() - 0.5) * 40; pos[i * 3 + 2] = -(18 + r() * 60); col.set([0.6, 0.66, 0.74], i * 3); al[i] = 0.08 + r() * 0.25; sz[i] = 1 + r() * 2.5; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    var dustMat = pointsMaterial(); var dust = new THREE.Points(g, dustMat); dust.frustumCulled = false; scene.add(dust);
  }
  function pointsMaterial() { return new THREE.ShaderMaterial({ vertexShader: PTS_VS, fragmentShader: PTS_FS, transparent: true, depthWrite: false, uniforms: { uPx: { value: 6 }, uFocus: { value: 3 }, uAperture: { value: 0.12 }, uFog: { value: 0.03 } } }); }

  /* particles (the one population the engine morphs through every scene) */
  const P = { n: 0 };
  const ptsMat = pointsMaterial();
  function setParticles(n) {
    if (P.points) { world.remove(P.points); P.points.geometry.dispose(); }
    P.n = n; P.pos = new Float32Array(n * 3); P.col = new Float32Array(n * 3); P.alpha = new Float32Array(n); P.size = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    for (const [k, a, d] of [['position', P.pos, 3], ['aColor', P.col, 3], ['aAlpha', P.alpha, 1], ['aSize', P.size, 1]]) g.setAttribute(k, new THREE.BufferAttribute(a, d).setUsage(THREE.DynamicDrawUsage));
    P.points = new THREE.Points(g, ptsMat); P.points.frustumCulled = false; P.points.renderOrder = 2; world.add(P.points);
    return P;
  }

  /* REX */
  const rex = new THREE.Group(); world.add(rex);
  const rexGeo = new THREE.BufferGeometry(); { const arr = []; for (const t of rexTriangles()) for (const v of t) arr.push(...v); rexGeo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); }
  const rexU = { uBase: { value: new THREE.Color('#070C14') }, uKeyColor: { value: new THREE.Color('#8FA2BC') }, uKeyDir: { value: new THREE.Vector3(-0.45, 0.75, 0.55) }, uKey: { value: 0.5 },
    uRimColor: { value: new THREE.Color('#00D4A7') }, uRim: { value: 0.6 }, uFillColor: { value: new THREE.Color('#F5B942') }, uFillDir: { value: new THREE.Vector3(0.8, -0.1, 0.4) }, uFill: { value: 0 },
    uOpacity: { value: 0 }, uDissolve: { value: 0 }, uTime: { value: 0 }, uFog: { value: 0.04 }, uBg: { value: BG } };
  const rexMat = new THREE.ShaderMaterial({ vertexShader: REX_VS, fragmentShader: REX_FS, uniforms: rexU, transparent: true, side: THREE.DoubleSide });
  const rexMesh = new THREE.Mesh(rexGeo, rexMat); rexMesh.renderOrder = 1; rex.add(rexMesh);
  const rexEdges = new THREE.LineSegments(new THREE.EdgesGeometry(rexGeo, 1), lineMat('#C9D4E3', 0)); rex.add(rexEdges);
  // eyes: almond surfaces with amber iris, vertical slit, reflected market data, a glint
  const reflTex = reflectionTexture(['4328.50', 'XAUUSD', 'CPI', 'BOS', 'EMA 200', '1.0842', 'VOL', 'US10Y', 'HL', 'RSI 61', 'ATR']);
  const eyeShape = new THREE.Shape(); eyeShape.moveTo(0, 0); eyeShape.quadraticCurveTo(0.5, 0.33, 1, 0.02); eyeShape.quadraticCurveTo(0.52, -0.2, 0, 0);
  const eyeGeo = new THREE.ShapeGeometry(eyeShape, 24);
  const eyeU = { uGaze: { value: new THREE.Vector2() }, uAlpha: { value: 0 }, uTime: { value: 0 }, uFocus: { value: 0 }, uRefl: { value: reflTex } };
  const eyeMats = { L: new THREE.ShaderMaterial({ vertexShader: EYE_VS, fragmentShader: EYE_FS, uniforms: { ...eyeU, uDir: { value: -1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    R: new THREE.ShaderMaterial({ vertexShader: EYE_VS, fragmentShader: EYE_FS, uniforms: { ...eyeU, uDir: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide }) };
  const glowTex = glowTexture('rgba(255,210,140,1)', 'rgba(245,185,66,0.22)');
  const eyes = ['L', 'R'].map(side => {
    const [a, b] = REX_EYES[side], g = new THREE.Group(), m = new THREE.Mesh(eyeGeo, eyeMats[side]); m.renderOrder = 4;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); g.position.set(a[0], a[1], a[2] + 0.035); g.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
    // the left eye runs inner→outer toward -x: flip its local y so the upper lid still bulges upward
    const sign = side === 'L' ? -1 : 1, baseY = len * 0.5 * sign; m.scale.set(len, baseY, 1);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.position.set(len * 0.5, 0.03, 0.02); glow.scale.set(len * 1.7, len * 0.95, 1); glow.renderOrder = 3;
    glow.position.y *= sign; g.add(glow, m); rex.add(g); return { g, m, glow, len, baseY };
  });

  /* volumetric light beam */
  const beamU = { uInt: { value: 0 }, uColor: { value: new THREE.Color('#CFE7FF') } };
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 1.1, 1, 48, 1, true), new THREE.ShaderMaterial({ vertexShader: BEAM_VS, fragmentShader: BEAM_FS, uniforms: beamU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.renderOrder = 0; world.add(beam);

  /* text sprites in space */
  const frag = D.FRAGMENTS.map((t, k) => { const s = textSprite(t, { px: 72, weight: k % 5 === 0 ? 600 : 500, h: 0.16 }); world.add(s); return s; });
  const OPEN = [['4328.50', -0.35, 0.12, 2.6, 0.24], ['XAUUSD', 1.05, -0.3, 4.6, 0.19], ['CPI', -1.2, 0.42, 5.6, 0.26],
    ['4,328.50', -1.45, 0.95, 6.4, 0.42], ['US10Y +4bp', 2.2, 0.2, 7.6, 0.3], ['▮', -0.2, -0.75, 7.0, 0.3], ['EURUSD', -1.1, -0.55, 9.0, 0.32], ['VOL ▲ 2.4×', 1.5, -0.8, 10.2, 0.3],
    ['Fed speaker: “data dependent”', -2.6, 0.95, 11.4, 0.28], ['09:31:07', 2.9, 1.0, 12.6, 0.3], ['HH · HL · BOS', 0.3, -1.25, 13.8, 0.32]];
  const openSprites = OPEN.map(([t, x, y, z, h]) => { const s = textSprite(t, { px: 80, weight: 500, h }); s.position.copy(V3(x, y, z)); world.add(s); return s; });

  /* scene objects (built lazily; asleep unless their scene is near) */
  const groups = {};
  const G = id => (groups[id] ||= (() => { const g = new THREE.Group(); g.visible = false; world.add(g); return g; })());
  const built = {};
  const once = (k, f) => { if (!built[k]) { built[k] = true; f(); } };

  /* streams: ten evidence flows with their names in space */
  function buildStreams() {
    const g = G('streams'), names = ['PRICE', 'VOLUME', 'VOLATILITY', 'STRUCTURE', 'MOMENTUM', 'TREND', 'LIQUIDITY', 'NEWS', 'SESSION', 'HISTORICAL MEMORY'];
    g.userData.labels = [];
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2 + 0.3, pts = [];
      for (let s = 0; s <= 40; s++) { const u = s / 40, rad = (1 - u) * (D.mobile() ? 1.6 : 2.6) + 0.12, sw = (1 - u) * 1.2; pts.push([Math.cos(ang + sw) * rad * (D.mobile() ? 0.7 : 1.1), Math.sin(ang + sw) * rad * 0.62, (1 - u) * 6 - 0.3]); }
      g.add(polyline(pts, lineMat(k === 0 || k === 5 ? '#00D4A7' : '#AEB8C6', 0.14)));
      const lab = textSprite(names[k], { px: 64, weight: 600, h: 0.07, color: k === 0 || k === 5 ? '#00D4A7' : '#AEB8C6', track: 6 }); lab.position.copy(V3(...pts[6])); g.add(lab); g.userData.labels.push(lab);
    }
  }
  /* enter: the six architecture layers the camera flies through */
  function buildEnter() {
    const g = G('enter'); g.userData.labels = [];
    D.T.layers.forEach((name, layer) => {
      const z = 1.2 + layer * 2.1, pts = []; for (let s = 0; s <= 96; s++) { const a = s / 96 * Math.PI * 2; pts.push([Math.cos(a) * 1.05 * (D.mobile() ? 0.62 : 1), Math.sin(a) * 1.05 * 0.68, z]); }
      g.add(polyline(pts, lineMat(layer === 3 ? '#00D4A7' : '#C9D4E3', 0.35)));
      const lab = textSprite(name.toUpperCase(), { px: 64, weight: 600, h: 0.075, color: layer === 3 ? '#00D4A7' : '#C9D4E3', track: 8, font: D.lang === 'ar' ? 'IBM Plex Sans Arabic' : 'Inter' });
      lab.position.copy(V3(0, 1.05 * 0.68 + 0.08, z)); g.add(lab); g.userData.labels.push(lab);
    });
  }

  /* chart: candles as lit volumes, indicators as depth-layered ribbons, structure connected in space */
  const CH = {};
  function buildChart() {
    const g = G('chart'), NV = 120;
    const box = new THREE.BoxGeometry(1, 1, 1);
    CH.body = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0, emissive: '#0a1320' }), NV);
    CH.wick = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }), NV);
    CH.vol = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0 }), NV);
    for (const m of [CH.body, CH.wick, CH.vol]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(m); }
    const c = new THREE.Color(); for (let i = 0; i < NV; i++) { CH.body.setColorAt(i, c.set('#fff')); CH.wick.setColorAt(i, c); CH.vol.setColorAt(i, c); }
    const rib = (color, op, add) => { const r = new Ribbon(NV, basic(color, op, add)); r.mesh.renderOrder = 3; g.add(r.mesh); return r; };
    CH.ema20 = rib('#7FF0D6', 0.95); CH.ema20g = rib('#00D4A7', 0.12, true); CH.ema50 = rib('#E5E7EB', 0.75); CH.ema200 = rib('#F5B942', 0.6);
    CH.bbU = rib('#E5E7EB', 0.28); CH.bbL = rib('#E5E7EB', 0.28);
    CH.bbFillPos = new Float32Array(NV * 2 * 3); { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(CH.bbFillPos, 3).setUsage(THREE.DynamicDrawUsage)); const idx = []; for (let i = 0; i < NV - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } gg.setIndex(idx); CH.bbFill = new THREE.Mesh(gg, basic('#9fb3cc', 0.05)); CH.bbFill.frustumCulled = false; g.add(CH.bbFill); }
    CH.osc = rib('#00D4A7', 0.9); CH.osc2 = rib('#E5E7EB', 0.6);
    CH.path = rib('#00D4A7', 0.85); CH.pathG = rib('#00D4A7', 0.14, true);                         // HH-HL-BOS-RETEST connected in space
    CH.bos = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: '#00D4A7', dashSize: 0.03, gapSize: 0.02, transparent: true, opacity: 0 })); g.add(CH.bos);
    CH.retest = new THREE.Mesh(new THREE.RingGeometry(0.028, 0.034, 40), basic('#00D4A7', 0)); g.add(CH.retest);
    CH.labels = []; for (let k = 0; k < 12; k++) { const s = textSprite('HH', { px: 60, weight: 700, h: 0.045, color: '#00D4A7' }); g.add(s); CH.labels.push(s); }
    CH.labelCache = {};
    CH.bosLab = textSprite('BOS', { px: 60, weight: 700, h: 0.05, color: '#00D4A7', track: 4 }); CH.rtLab = textSprite('RETEST', { px: 60, weight: 700, h: 0.045, color: '#00D4A7', track: 4 }); g.add(CH.bosLab, CH.rtLab);
    CH.tag = textSprite('4328.50', { px: 60, weight: 600, h: 0.05, color: '#00D4A7', align: 'left' }); g.add(CH.tag); CH.tagVal = '4328.50';
    CH.grid = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.2), new THREE.ShaderMaterial({ vertexShader: UV_VS, fragmentShader: GRID_FS, uniforms: { uColor: { value: new THREE.Color('#5d6b80') }, uAlpha: { value: 0 }, uCells: { value: 18 } }, transparent: true, depthWrite: false }));
    CH.grid.position.copy(V3(0, 0.2, 0.45)); g.add(CH.grid);
    CH.markers = []; for (let k = 0; k < 8; k++) { const r = new Ribbon(2, basic('#AEB8C6', 0)); g.add(r.mesh); CH.markers.push(r); }
  }
  function labelSprite(s, txt, color) { if (s.userData.txt === txt && s.userData.color === color) return; const n = textSprite(txt, { px: 60, weight: 700, h: s.userData.h, color }); s.material.map.dispose(); s.material.map = n.material.map; s.scale.copy(n.scale); s.userData.txt = txt; s.userData.color = color; s.material.needsUpdate = true; }
  function updateChart(o) {
    const { box, lo, cut, step, stepU, crisp, alpha, replay } = o, g = G('chart'); g.visible = alpha > 0.01;
    if (!g.visible) return;
    const C_ = D.candles, I = D.IND, cxw = i => D.cx(box, i), cyw = v => D.cy(box, v), wv = (box.x1 - box.x0) / D.NV() * 0.62, m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color();
    const has = k => (replay ? [0, 1, 2, 3, 4, 9, 10, 11].includes(k) : step >= k), grow = k => (!replay && step === k ? smooth(0, 0.65, stepU) : 1);
    let n = 0, vmax = 0; for (let i = lo; i <= D.LAST; i++) vmax = Math.max(vmax, C_[i].v);
    for (let i = lo; i <= cut; i++, n++) {
      const c = C_[i], up = c.c >= c.o, x = cxw(i), y1 = cyw(Math.max(c.o, c.c)), y0 = cyw(Math.min(c.o, c.c)), zj = Math.sin(i * 0.7) * 0.004;
      m.compose(ps.set(x, (y0 + y1) / 2, -(box.z + zj)), q, sc.set(wv, Math.max(0.003, y1 - y0), 0.03)); CH.body.setMatrixAt(n, m); CH.body.setColorAt(n, col.set(up ? '#00D4A7' : '#8e99a8'));
      m.compose(ps.set(x, (cyw(c.h) + cyw(c.l)) / 2, -box.z), q, sc.set(0.0028, Math.max(0.002, cyw(c.h) - cyw(c.l)), 0.0028)); CH.wick.setMatrixAt(n, m); CH.wick.setColorAt(n, col.set(up ? '#00D4A7' : '#8e99a8'));
      const vh = has(9) ? (c.v / vmax) * (box.y1 - box.y0) * 0.16 * grow(9) : 0;
      m.compose(ps.set(x, box.y0 + vh / 2, -(box.z + 0.22)), q, sc.set(wv, Math.max(0.0001, vh), 0.02)); CH.vol.setMatrixAt(n, m); CH.vol.setColorAt(n, col.set(up ? '#0b6b58' : '#3a4452'));
    }
    for (const mm of [CH.body, CH.wick, CH.vol]) { mm.count = n; mm.instanceMatrix.needsUpdate = true; if (mm.instanceColor) mm.instanceColor.needsUpdate = true; }
    CH.body.material.opacity = crisp * 0.95; CH.wick.material.opacity = crisp * 0.8; CH.vol.material.opacity = has(9) ? alpha * 0.7 : 0;
    const series = (arr, k, zoff) => { if (!has(k)) return []; const out = [], end = Math.round(lo + (cut - lo) * grow(k)); for (let i = lo; i <= end; i++) if (arr[i] != null) out.push([cxw(i), cyw(arr[i]), box.z + zoff]); return out; };
    const ww = 0.0065;
    CH.ema20.set(series(I.ema20, 1, -0.05), ww); CH.ema20g.set(series(I.ema20, 1, -0.05), ww * 5); CH.ema50.set(series(I.ema50, 2, -0.03), ww * 0.9); CH.ema200.set(series(I.ema200, 3, -0.015), ww * 0.85);
    CH.ema20.mesh.material.opacity = alpha * 0.95; CH.ema20g.mesh.material.opacity = alpha * 0.1; CH.ema50.mesh.material.opacity = alpha * 0.7; CH.ema200.mesh.material.opacity = alpha * 0.6;
    const up = series(I.bb.up, 4, 0.06), dn = series(I.bb.lo, 4, 0.06); CH.bbU.set(up, 0.003); CH.bbL.set(dn, 0.003); CH.bbU.mesh.material.opacity = CH.bbL.mesh.material.opacity = alpha * 0.3;
    for (let i = 0; i < Math.min(up.length, dn.length); i++) { const o = i * 6; CH.bbFillPos.set([up[i][0], up[i][1], -up[i][2], dn[i][0], dn[i][1], -dn[i][2]], o); }
    CH.bbFill.geometry.attributes.position.needsUpdate = true; CH.bbFill.geometry.setDrawRange(0, Math.max(0, (Math.min(up.length, dn.length) - 1) * 6)); CH.bbFill.material.opacity = alpha * 0.06;
    // oscillator plane, floating in front and below the chart — one at a time
    let o1 = [], o2 = [];
    if (!replay && step >= 5 && step <= 8) {
      const yb = box.y0 - 0.34, h = 0.22, zf = -0.28, strip = (arr, mn, mx) => { const out = [], end = Math.round(lo + (D.LAST - lo) * grow(step)); for (let i = lo; i <= end; i++) if (arr[i] != null) out.push([cxw(i), yb + (clamp(arr[i], mn, mx) - mn) / (mx - mn) * h, zf]); return out; };
      if (step === 5) o1 = strip(I.rsi, 0, 100);
      if (step === 6) { const vals = I.macd.line.slice(lo).filter(v => v != null).map(Math.abs), mm = Math.max(...vals); o1 = strip(I.macd.line, -mm, mm); o2 = strip(I.macd.signal, -mm, mm); }
      if (step === 7) { const v = I.atr.slice(lo).filter(x => x != null); o1 = strip(I.atr, Math.min(...v) * 0.9, Math.max(...v) * 1.1); }
      if (step === 8) o1 = strip(I.adx.adx, 0, 60);
    }
    CH.osc.set(o1, 0.006); CH.osc2.set(o2, 0.004); CH.osc.mesh.material.opacity = alpha * 0.9; CH.osc2.mesh.material.opacity = alpha * 0.6; CH.osc.mesh.material.color.set(step === 7 ? '#F5B942' : '#00D4A7');
    // market structure: pivots labelled and connected by a path that floats in front of the chart
    const sw = I.st.swings.filter(s => s.i >= lo && s.i <= cut - 4);
    const showS = has(10), gS = grow(10), pts = [];
    CH.labels.forEach((s, k) => { const w = sw[sw.length - CH.labels.length + k]; if (!w || !showS || w.i > lo + (cut - lo) * gS) { s.material.opacity = 0; return; }
      const good = w.label === 'HH' || w.label === 'HL'; labelSprite(s, w.label, good ? '#00D4A7' : '#8e99a8');
      s.position.copy(V3(cxw(w.i), cyw(w.price) + (w.type === 'H' ? 0.05 : -0.05), box.z - 0.12)); s.material.opacity = alpha * 0.95; pts.push([cxw(w.i), cyw(w.price), box.z - 0.12]); });
    const b = I.st.bos, rt = I.st.retest, bosOn = has(11) && b && b.i <= cut;
    if (bosOn) { const gb = grow(11); pts.push([lerp(cxw(pts.length ? sw.at(-1).i : b.from), cxw(b.i), gb), lerp(cyw(sw.at(-1)?.price ?? b.level), cyw(C_[b.i].c), gb), box.z - 0.12]); if (rt && rt.i <= cut && gb > 0.7) pts.push([cxw(rt.i), cyw(C_[rt.i].l), box.z - 0.12]); }
    CH.path.set(showS ? pts : [], 0.005); CH.pathG.set(showS ? pts : [], 0.028); CH.path.mesh.material.opacity = alpha * 0.85; CH.pathG.mesh.material.opacity = alpha * 0.1;
    if (bosOn) { CH.bos.geometry.setFromPoints([V3(cxw(b.from), cyw(b.level), box.z - 0.1), V3(lerp(cxw(b.from), cxw(cut), grow(11)), cyw(b.level), box.z - 0.1)]); CH.bos.computeLineDistances(); CH.bos.material.opacity = alpha * 0.9;
      CH.bosLab.position.copy(V3(cxw(b.i), cyw(b.level) + 0.06, box.z - 0.12)); CH.bosLab.material.opacity = alpha * smooth(0.4, 0.7, grow(11));
      if (rt && rt.i <= cut) { CH.retest.position.copy(V3(cxw(rt.i), cyw(C_[rt.i].l), box.z - 0.12)); CH.retest.material.opacity = alpha * smooth(0.7, 1, grow(11)); CH.rtLab.position.copy(V3(cxw(rt.i), cyw(C_[rt.i].l) - 0.07, box.z - 0.12)); CH.rtLab.material.opacity = CH.retest.material.opacity; } else CH.retest.material.opacity = CH.rtLab.material.opacity = 0;
    } else CH.bos.material.opacity = CH.bosLab.material.opacity = CH.retest.material.opacity = CH.rtLab.material.opacity = 0;
    // price at the edge of knowledge
    const lastC = C_[cut].c.toFixed(2); if (CH.tagVal !== lastC) { CH.tagVal = lastC; const n2 = textSprite(lastC, { px: 60, weight: 600, h: 0.05, color: '#00D4A7', align: 'left' }); CH.tag.material.map.dispose(); CH.tag.material.map = n2.material.map; CH.tag.scale.copy(n2.scale); }
    CH.tag.position.copy(V3(cxw(D.LAST) + 0.05, cyw(C_[cut].c), box.z - 0.05)); CH.tag.material.opacity = crisp;
    CH.grid.material.uniforms.uAlpha.value = alpha * 0.35;
    // replay: the moments FOXREX decided on, as vertical markers
    CH.markers.forEach((r, k) => { const e = D.REPLAY[k]; if (!replay || !e || e.i > cut) { r.mesh.material.opacity = 0; return; } r.set([[cxw(e.i), box.y1 + 0.02, box.z + 0.01], [cxw(e.i), box.y0 - 0.02, box.z + 0.01]], 0.0025); r.mesh.material.color.set(e.decision === 'BUY' ? '#00D4A7' : '#6b7686'); r.mesh.material.opacity = alpha * (e.decision === 'BUY' ? 0.8 : 0.35); });
  }

  /* memory: remembered market states receding into depth */
  function buildMemory() {
    const g = G('memory'); g.userData.lines = []; g.userData.scores = [];
    D.memShapes.forEach((m, w) => {
      const side = (w % 2 ? 1 : -1), depth = 1.2 + Math.floor(w / 2) * 0.62, xw = D.mobile() ? D.A() * 0.8 : 1.1, pts = [];
      for (let k = 0; k < 40; k++) pts.push([side * (D.mobile() ? 0.05 : 0.55) + (k / 39 - 0.5) * xw, m.pts[k] * 0.5 + (w % 4 - 1.5) * 0.08, depth]);
      const l = polyline(pts, lineMat(m.similar ? '#00D4A7' : '#AEB8C6', 0)); g.add(l); g.userData.lines.push(l);
      const s = textSprite((m.similar ? '✓ ' : '× ') + m.score.toFixed(2), { px: 56, weight: 600, h: 0.05, color: m.similar ? '#00D4A7' : '#6b7686', align: 'left' }); s.position.copy(V3(pts[39][0] + 0.03, pts[39][1], depth)); g.add(s); g.userData.scores.push(s);
    });
  }
  /* ML: a clean mathematical space — axes, a decision boundary, a walk-forward window travelling through time */
  function buildML() {
    const g = G('ml'); const o = 1;
    g.userData.axes = [[[-1.3, 0, o], [1.3, 0, o]], [[0, -0.85, o], [0, 0.85, o]], [[0, 0, o - 1.1], [0, 0, o + 1.1]]].map(([a, b]) => { const l = polyline([a, b], lineMat('#C9D4E3', 0)); g.add(l); return l; });
    g.userData.axl = ['TREND SLOPE', 'MOMENTUM', 'VOLATILITY'].map((t, k) => { const s = textSprite(t, { px: 56, weight: 600, h: 0.05, color: '#AEB8C6', track: 6, align: 'left' }); s.position.copy(V3(...[[1.32, 0.03, o], [0.03, 0.88, o], [0.03, 0.03, o + 1.12]][k])); g.add(s); return s; });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.7), new THREE.ShaderMaterial({ vertexShader: UV_VS, fragmentShader: GRID_FS, uniforms: { uColor: { value: new THREE.Color('#00D4A7') }, uAlpha: { value: 0 }, uCells: { value: 12 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    plane.position.copy(V3(-0.02, 0, o)); plane.rotation.y = 0.95; plane.rotation.z = 0.1; g.add(plane); g.userData.plane = plane;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 1.9), new THREE.MeshBasicMaterial({ color: '#00D4A7', transparent: true, opacity: 0, depthWrite: false })); g.add(slab); g.userData.slab = slab;
    const slabEdge = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), lineMat('#00D4A7', 0)); slab.add(slabEdge); g.userData.slabEdge = slabEdge;
    const lab = textSprite('WALK-FORWARD', { px: 56, weight: 600, h: 0.05, color: '#00D4A7', track: 8 }); g.add(lab); g.userData.slabLab = lab;
    const pr = textSprite('P = 0.72', { px: 90, weight: 600, h: 0.14, color: '#FFFFFF' }); pr.position.copy(V3(0.75, 0.55, o - 0.3)); g.add(pr); g.userData.prob = pr;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShaderMaterial({ vertexShader: UV_VS, fragmentShader: GRID_FS, uniforms: { uColor: { value: new THREE.Color('#5d6b80') }, uAlpha: { value: 0 }, uCells: { value: 30 } }, transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2; floor.position.copy(V3(0, -0.95, o)); g.add(floor); g.userData.floor = floor;
  }
  /* reasoning chamber: a dark room, a floor of rings, evidence connected to REX by flowing links */
  function buildChamber() {
    const g = G('chamber');
    const floor = new THREE.Group(); floor.position.copy(V3(0, -0.98, 0.7));
    for (let r = 1; r <= 7; r++) { const pts = []; for (let s = 0; s <= 128; s++) { const a = s / 128 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r * 0.42, 0, Math.sin(a) * r * 0.42)); } floor.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat('#5d6b80', r === 3 ? 0.35 : 0.14))); }
    for (let s = 0; s < 36; s++) { const a = s / 36 * Math.PI * 2; floor.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42), new THREE.Vector3(Math.cos(a) * 2.94, 0, Math.sin(a) * 2.94)]), lineMat('#5d6b80', 0.08))); }
    g.add(floor);
    for (let s = 0; s < 48; s++) { const a = s / 48 * Math.PI * 2; g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(Math.cos(a) * 3.3, -0.98, 0.7 + Math.sin(a) * 3.3), V3(Math.cos(a) * 3.3, 2.2, 0.7 + Math.sin(a) * 3.3)]), lineMat('#3a4452', 0.22))); }
    g.userData.links = D.EVIDENCE.map(e => { const m = new THREE.ShaderMaterial({ vertexShader: DASH_VS, fragmentShader: DASH_FS, uniforms: { uColor: { value: new THREE.Color(e.agree ? '#00D4A7' : '#F5B942') }, uAlpha: { value: 0 }, uTime: { value: 0 }, uSpeed: { value: e.agree ? 0.8 : 0.25 }, uFreq: { value: 9 } }, transparent: true, depthWrite: false }); const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), m); g.add(l); return l; });
    const tex = glowTexture(); g.userData.cores = D.EVIDENCE.map(e => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: e.agree ? '#BFF7EA' : '#F5B942', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); s.scale.set(0.22, 0.22, 1); g.add(s); return s; });
  }
  /* risk: a portal — the setup must pass through it */
  function buildGate() {
    const g = G('gate'); const mat = new THREE.MeshBasicMaterial({ color: '#E5E7EB', transparent: true, opacity: 0 }); g.userData.mat = mat;
    g.userData.bars = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); g.add(m); return m; });
    g.userData.field = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: UV_VS, fragmentShader: `uniform vec3 uColor; uniform float uAlpha, uTime; varying vec2 vUv; void main(){ float s = step(0.92, fract(vUv.y * 60.0 - uTime * 0.8)); float edge = smoothstep(0.5, 0.0, abs(vUv.x - 0.5)) * 0.3 + s * 0.7; gl_FragColor = vec4(uColor, uAlpha * edge); }`, uniforms: { uColor: { value: new THREE.Color('#FF5C7A') }, uAlpha: { value: 0 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    g.add(g.userData.field);
    g.userData.verdict = textSprite('REJECTED', { px: 90, weight: 700, h: 0.12, color: '#FF5C7A', track: 10 }); g.userData.pass = textSprite('PASSED', { px: 90, weight: 700, h: 0.12, color: '#00D4A7', track: 10 }); g.add(g.userData.verdict, g.userData.pass);
  }
  /* decision: one horizon, two levels */
  function buildDecision() {
    const g = G('decision');
    g.userData.h = new Ribbon(2, basic('#E5E7EB', 0)); g.userData.t = new Ribbon(2, basic('#00D4A7', 0)); g.userData.i = new Ribbon(2, basic('#FF5C7A', 0));
    g.add(g.userData.h.mesh, g.userData.t.mesh, g.userData.i.mesh);
    g.userData.tl = textSprite(`${D.T.target.toUpperCase()} ${D.DECISION.target.toFixed(2)}`, { px: 54, weight: 600, h: 0.045, color: '#00D4A7', align: 'right', track: 4 });
    g.userData.il = textSprite(`${D.T.inval.toUpperCase()} ${D.DECISION.invalidation.toFixed(2)}`, { px: 54, weight: 600, h: 0.045, color: '#FF5C7A', align: 'right', track: 4 });
    const tex = glowTexture('rgba(190,255,236,1)', 'rgba(0,212,167,0.25)'); g.userData.pt = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); g.userData.pt.scale.set(0.16, 0.16, 1);
    g.add(g.userData.tl, g.userData.il, g.userData.pt);
  }
  /* live: market cores + relationship links */
  function buildLive() {
    const g = G('live'), tex = glowTexture();
    g.userData.cores = D.MARKETS.map(m => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: m.signal === 'BUY' ? '#9FF2DE' : '#C9D4E3', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); s.scale.set(0.18, 0.18, 1); g.add(s); return s; });
    g.userData.links = D.LINKS.map(([, , sgn]) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMat(sgn > 0 ? '#00D4A7' : '#F5B942', 0)); g.add(l); return l; });
    g.userData.rail = polyline([[-2, -0.52, 0.3], [2, -0.52, 0.3]], lineMat('#5d6b80', 0)); g.add(g.userData.rail);
  }
  /* system: the whole architecture, stations on one path */
  function buildSystem() {
    const g = G('system'); g.userData.rings = []; g.userData.path = new THREE.Line(new THREE.BufferGeometry(), lineMat('#00D4A7', 0)); g.add(g.userData.path);
    for (let k = 0; k < 9; k++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.062, 0.068, 48), basic('#00D4A7', 0)); g.add(m); g.userData.rings.push(m); }
  }

  /* ------------------------------------------------------------------ per-scene light + lens */
  const LOOK = {
    opening: { fog: 0.075, exp: 0.9, beam: 0, rim: 0.35, key: 0.1, ap: 0.2 }, noise: { fog: 0.06, exp: 1.0, beam: 0, rim: 0.3, key: 0.15, ap: 0.16 },
    observe: { fog: 0.05, exp: 1.05, beam: 0.55, rim: 0.9, key: 0.7, ap: 0.18 }, streams: { fog: 0.035, exp: 1.05, beam: 0.15, rim: 1.1, key: 0.55, ap: 0.12 },
    enter: { fog: 0.03, exp: 1.0, beam: 0, rim: 0.6, key: 0.3, ap: 0.08 }, technical: { fog: 0.028, exp: 1.08, beam: 0, rim: 0.7, key: 0.45, ap: 0.09 },
    memory: { fog: 0.06, exp: 1.0, beam: 0, rim: 0.6, key: 0.3, ap: 0.12 }, ml: { fog: 0.018, exp: 1.12, beam: 0, rim: 0.5, key: 0.5, ap: 0.07 },
    reason: { fog: 0.045, exp: 1.0, beam: 0.28, rim: 1.2, key: 0.35, ap: 0.14 }, risk: { fog: 0.04, exp: 1.0, beam: 0.1, rim: 0.7, key: 0.3, ap: 0.1 },
    decision: { fog: 0.03, exp: 1.1, beam: 0.75, rim: 0.5, key: 0.85, ap: 0.16 }, replay: { fog: 0.025, exp: 1.06, beam: 0, rim: 0.6, key: 0.45, ap: 0.08 },
    ask: { fog: 0.04, exp: 1.02, beam: 0.3, rim: 1.1, key: 0.55, ap: 0.12 }, live: { fog: 0.025, exp: 1.06, beam: 0, rim: 0.5, key: 0.4, ap: 0.08 },
    system: { fog: 0.03, exp: 1.04, beam: 0.25, rim: 0.7, key: 0.45, ap: 0.08 }
  };
  const look = (id, nid, mu) => { const a = LOOK[id], b = LOOK[nid]; const o = {}; for (const k in a) o[k] = lerp(a[k], b[k], mu); return o; };

  /* ------------------------------------------------------------------ frame */
  let W = 1, H = 1, dpr = 1;
  const eyeTmp = new THREE.Vector3();
  function resize(w, h, pr) { W = w; H = h; dpr = pr; renderer.setPixelRatio(pr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); ptsMat.uniforms.uPx.value = 6.2 * pr; dustMat.uniforms.uPx.value = 6.2 * pr;
    for (const k of Object.keys(built)) { if (['streams', 'enter', 'memory'].includes(k)) { world.remove(groups[k]); delete groups[k]; delete built[k]; } } }

  function frame(s) {
    const { t, id, nid, mu, lp, cam, rexS } = s, L = look(id, nid, mu), near = x => id === x || nid === x;
    // camera: orbit about the pivot (engine yaw), then dolly
    orbit.rotation.y = cam.yaw; world.position.set(-cam.x, 0, cam.pivot);
    camera.position.set(0, cam.y, cam.pivot - cam.z); camera.lookAt(0, cam.y, -1e3); camera.position.x = 0;
    // light + lens
    scene.fog.density = L.fog; renderer.toneMappingExposure = L.exp; ptsMat.uniforms.uFog.value = L.fog; ptsMat.uniforms.uAperture.value = L.ap; dustMat.uniforms.uFog.value = L.fog * 0.35;
    ptsMat.uniforms.uFocus.value = s.focus; key.intensity = 0.4 + L.key; ambient.intensity = 0.25 + L.key * 0.4;
    // REX
    rex.position.set(rexS.x, rexS.y, -rexS.z); rex.scale.setScalar(rexS.s); rex.rotation.set(rexS.pitch, rexS.yaw, 0, 'XYZ');
    rexU.uOpacity.value = rexS.mesh; rexU.uDissolve.value = rexS.dissolve; rexU.uTime.value = t; rexU.uFog.value = L.fog; rexU.uRim.value = L.rim * (rexS.rimBoost || 1); rexU.uKey.value = L.key;
    rexU.uFill.value = s.fill || 0; rexMesh.visible = rexS.mesh > 0.01;
    rexEdges.material.opacity = rexS.edge * (1 - rexS.dissolve); rexEdges.visible = rexEdges.material.opacity > 0.01;
    const open = s.eyeOpen, focusN = s.eyeFocus;
    eyes.forEach(e => { e.m.scale.y = e.baseY * Math.max(0.06, open * (1 - focusN * 0.32)); e.glow.material.opacity = rexS.eye * 0.5; e.g.visible = rexS.eye > 0.01; });
    eyeU.uAlpha.value = rexS.eye; eyeU.uTime.value = t; eyeU.uGaze.value.set(s.gaze.x, s.gaze.y); eyeU.uFocus.value = focusN;
    // beam from above onto REX
    beamU.uInt.value = L.beam * (rexS.mesh > 0.05 || id === 'observe' ? 1 : 0.3) * 0.35; beam.visible = beamU.uInt.value > 0.004;
    beam.position.set(rexS.x, rexS.y + 1.5 * Math.max(rexS.s, 0.4) + 0.4, -rexS.z); beam.scale.set(Math.max(rexS.s, 0.35) * 1.25, 3.2 * Math.max(rexS.s, 0.4) + 0.6, Math.max(rexS.s, 0.35) * 1.25);
    dust.rotation.y = t * 0.006; dust.position.y = Math.sin(t * 0.05) * 0.4;
    // particles
    P.points.geometry.attributes.position.needsUpdate = true; P.points.geometry.attributes.aColor.needsUpdate = true; P.points.geometry.attributes.aAlpha.needsUpdate = true; P.points.geometry.attributes.aSize.needsUpdate = true;
    P.points.geometry.setDrawRange(0, P.n);
    // opening sequence: isolated numbers appear one at a time in the dark, at different depths
    const intro = s.intro, openOn = id === 'opening' || (id === 'noise' && lp < 0.2);
    openSprites.forEach((sp, k) => { const t0 = k < 3 ? 0.7 + k * 0.95 : 8.0 + (k - 3) * 0.55, a = openOn ? smooth(t0, t0 + 0.6, intro) * (k < 3 ? 1 - smooth(3.4, 4.1, intro) : 1) : 0; sp.material.opacity = a * (1 - mu * (id === 'opening' ? 0 : 1)) * (id === 'noise' ? 1 - lp * 5 : 1); sp.visible = sp.material.opacity > 0.005; });
    // market fragments ride their particles (noise / observe)
    const fragOn = id === 'noise' || id === 'observe' || (id === 'opening' && intro > 9);
    frag.forEach((sp, k) => { const i = s.fragIdx[k]; if (!fragOn || i == null) { sp.visible = false; return; } sp.visible = true; sp.position.set(P.pos[i * 3] + 0.05, P.pos[i * 3 + 1], P.pos[i * 3 + 2]);
      const imp = k === 3 || k === 0 || k === 11 || k === 16; let a = P.alpha[i] * 1.6; if (id === 'observe') a = imp ? 0.95 : a * (1 - smooth(0.05, 0.5, lp) * 0.92); if (id === 'opening') a *= smooth(9, 12, intro) * 0.6;
      sp.material.opacity = clamp(a) * (1 - mu); sp.material.color.set(imp && id !== 'opening' ? '#00D4A7' : '#E5E7EB'); });
    // scene objects — asleep unless their scene (or the next) is on screen
    for (const [gid, ids] of Object.entries({ streams: ['streams'], enter: ['enter'], chart: ['technical', 'replay', 'memory'], memory: ['memory'], ml: ['ml'], chamber: ['reason', 'ask'], gate: ['risk'], decision: ['decision'], live: ['live'], system: ['system'] })) {
      const on = ids.some(near); if (groups[gid]) groups[gid].visible = on;
      if (on) once(gid, { streams: buildStreams, enter: buildEnter, chart: buildChart, memory: buildMemory, ml: buildML, chamber: buildChamber, gate: buildGate, decision: buildDecision, live: buildLive, system: buildSystem }[gid]);
      if (on && groups[gid]) groups[gid].visible = true;
    }
    const fadeFor = x => (id === x ? 1 - mu : nid === x ? mu : 0);
    if (groups.streams?.visible) { const a = fadeFor('streams'); groups.streams.children.forEach(c => { if (c.isLine) c.material.opacity = 0.14 * a; }); groups.streams.userData.labels.forEach(l => { l.material.opacity = 0.7 * a * smooth(0.05, 0.3, id === 'streams' ? lp : 0); }); }
    if (groups.enter?.visible) { const a = fadeFor('enter'); groups.enter.children.forEach(c => { if (c.isLine) c.material.opacity = 0.32 * a; }); groups.enter.userData.labels.forEach(l => { l.material.opacity = 0.85 * a; }); }
    if (groups.chart?.visible) {
      const rep = id === 'replay' || (nid === 'replay' && mu > 0.5), cid = rep ? 'replay' : 'technical';
      const a = id === 'memory' ? (1 - smooth(0, 0.3, lp)) * 0.6 : fadeFor(cid);
      updateChart({ box: D.chartBox(cid), lo: D.LAST - D.NV() + 1, cut: rep ? D.replayIndex() : D.LAST, step: id === 'technical' ? s.step : 11, stepU: s.stepU, crisp: (rep ? s.crispReplay : id === 'memory' ? a : s.crisp) * a, alpha: a, replay: rep });
    }
    if (groups.memory?.visible) { const a = fadeFor('memory'), u = id === 'memory' ? lp : 0; groups.memory.userData.lines.forEach((l, w) => { const m = D.memShapes[w], on = m.similar && u > 0.35, keep = m.similar ? 1 : 1 - smooth(0.45, 0.8, u); l.material.opacity = (on ? 0.75 : 0.18) * keep * a; l.material.color.set(on ? '#00D4A7' : '#AEB8C6'); groups.memory.userData.scores[w].material.opacity = (on ? 0.9 : 0.3) * keep * a * smooth(0.3, 0.4, u); }); }
    if (groups.ml?.visible) { const a = fadeFor('ml'), u = id === 'ml' ? lp : 0, U = groups.ml.userData;
      U.axes.forEach(l => { l.material.opacity = 0.3 * smooth(0.12, 0.25, u) * a; }); U.axl.forEach(l => { l.material.opacity = 0.7 * smooth(0.12, 0.25, u) * a; });
      U.plane.material.uniforms.uAlpha.value = 0.55 * smooth(0.3, 0.45, u) * a; U.floor.material.uniforms.uAlpha.value = 0.4 * a;
      const wf = smooth(0.5, 0.78, u), wa = smooth(0.48, 0.52, u) * (1 - smooth(0.8, 0.86, u)) * a; U.slab.position.copy(V3(lerp(-1.1, 1.1, wf), 0, 1)); U.slab.material.opacity = 0.06 * wa; U.slabEdge.material.opacity = 0.5 * wa;
      U.slabLab.position.copy(V3(lerp(-1.1, 1.1, wf), 1.0, 1)); U.slabLab.material.opacity = wa; U.prob.material.opacity = 0; }
    if (groups.chamber?.visible) { const a = Math.max(fadeFor('reason'), fadeFor('ask')), U = groups.chamber.userData, nodes = s.nodes, cx = s.linkTarget;
      groups.chamber.children.forEach(c => { if (c.isLine && !U.links.includes(c)) c.material.opacity = (c.material.userData.base ??= c.material.opacity) * a; if (c.isGroup) c.children.forEach(cc => { cc.material.opacity = (cc.material.userData.base ??= cc.material.opacity) * a; }); });
      D.EVIDENCE.forEach((e, j) => { const n = nodes[j], l = U.links[j], f = s.focusOf(e.id), flick = !e.agree && s.waitHold ? 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + j * 2.1)) : 1;
        l.geometry.setFromPoints([V3(n.x, n.y, n.z), V3(cx.x, cx.y, cx.z)]); l.computeLineDistances(); l.material.uniforms.uAlpha.value = (e.agree ? 0.55 : 0.6) * a * f * flick * (s.waitHold && !e.agree ? 1 : 1); l.material.uniforms.uTime.value = t * (s.waitHold ? 0.35 : 1);
        U.cores[j].position.copy(V3(n.x, n.y, n.z)); U.cores[j].material.opacity = (0.35 + e.strength * 0.4) * a * f; }); }
    if (groups.gate?.visible) { const a = fadeFor('risk'), u = id === 'risk' ? lp : 0, U = groups.gate.userData, g = s.gate, gw = s.gateW, fail = u < 0.55, col = u > 0.3 && u < 0.55 ? '#FF5C7A' : u >= 0.72 ? '#00D4A7' : '#C9D4E3';
      const th = 0.012; [[0, g.h, gw * 2 + th, th], [0, -g.h, gw * 2 + th, th], [-gw, 0, th, g.h * 2], [gw, 0, th, g.h * 2]].forEach(([x, y, w, h], k) => { U.bars[k].position.copy(V3(x, g.y + y, 1)); U.bars[k].scale.set(w, h, 0.03); });
      U.mat.color.set(col); U.mat.opacity = 0.9 * a; U.field.position.copy(V3(0, g.y, 1)); U.field.scale.set(gw * 2, g.h * 2, 1); U.field.material.uniforms.uAlpha.value = (fail && u > 0.3 ? 0.35 : 0.08) * a; U.field.material.uniforms.uColor.value.set(fail ? '#FF5C7A' : '#00D4A7'); U.field.material.uniforms.uTime.value = t;
      const vy = s.narrow ? g.y + g.h + 0.16 : -0.8; U.verdict.position.copy(V3(0, vy, 1)); U.pass.position.copy(V3(0, vy, 1)); U.verdict.material.opacity = a * smooth(0.3, 0.38, u) * (1 - smooth(0.52, 0.56, u)); U.pass.material.opacity = a * smooth(0.72, 0.8, u); }
    if (groups.decision?.visible) { const a = fadeFor('decision'), u = id === 'decision' ? lp : 0, U = groups.decision.userData, X = s.A * 1.05, lv = smooth(0.25, 0.55, u) * a;
      U.h.set([[-X, s.decY(s.DEC.entry), 0.3], [X, s.decY(s.DEC.entry), 0.3]], 0.0035); U.h.mesh.material.opacity = 0.35 * a;
      U.t.set([[-X, s.decY(s.DEC.target), 0.3], [X, s.decY(s.DEC.target), 0.3]], 0.002); U.t.mesh.material.opacity = 0.35 * lv; U.i.set([[-X, s.decY(s.DEC.invalidation), 0.3], [X, s.decY(s.DEC.invalidation), 0.3]], 0.002); U.i.mesh.material.opacity = 0.35 * lv;
      U.tl.position.copy(V3(X * 0.95, s.decY(s.DEC.target) + 0.04, 0.3)); U.tl.material.opacity = 0.8 * lv; U.il.position.copy(V3(X * 0.95, s.decY(s.DEC.invalidation) + 0.04, 0.3)); U.il.material.opacity = 0.8 * lv;
      U.pt.position.copy(V3(s.A * (s.mobile ? 0.5 : 0.62), s.decY(s.DEC.entry), 0.3)); U.pt.material.opacity = 0.7 * a; }
    if (groups.live?.visible) { const a = fadeFor('live'), U = groups.live.userData, mk = s.mk, foc = s.liveFocus;
      U.cores.forEach((c, j) => { c.position.copy(V3(mk[j].x, mk[j].y, mk[j].z)); c.material.opacity = a * (foc < 0 ? 0.55 : foc === j ? 0.9 : 0.25); });
      D.LINKS.forEach(([p, q], k) => { const ia = D.MARKETS.findIndex(m => m.sym === p), ib = D.MARKETS.findIndex(m => m.sym === q), me = foc >= 0 ? D.MARKETS[foc].sym : null; const l = U.links[k];
        l.geometry.setFromPoints([V3(mk[ia].x, mk[ia].y, mk[ia].z), V3(mk[ib].x, mk[ib].y, mk[ib].z)]); l.material.opacity = a * (me && (p === me || q === me) ? 0.6 : 0.06) * (1 - s.dock); });
      U.rail.material.opacity = a * s.dock * 0.4; }
    if (groups.system?.visible) { const a = fadeFor('system'), U = groups.system.userData, st = s.st;
      U.path.geometry.setFromPoints(new THREE.CatmullRomCurve3(st.map(p => V3(p.x, p.y, p.z))).getPoints(160)); U.path.material.opacity = 0.35 * a * smooth(0, 0.3, id === 'system' ? lp : 0);
      U.rings.forEach((r, k) => { const p = st[k]; r.position.copy(V3(p.x, p.y, p.z)); r.material.opacity = 0.6 * a; }); }
    // evidence light on REX in the chamber: teal agreement from the left, amber conflict from the right
    rimL.intensity = 0;
    renderer.render(scene, camera);
  }
  return { renderer, resize, setParticles, frame, sampleRexSurface, get dpr() { return dpr; } };
}
