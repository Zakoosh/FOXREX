/* FOXREX experience — WebGL world (Three.js r170, vendored).
   The engine (engine.js) owns the film timeline, formations, camera narrative, REX behaviour, DOM typography
   and interactions. This module renders the world those decisions describe, with real depth: perspective
   camera, exponential fog, lighting, depth-of-field point sprites, a sculpted faceted REX (rim-lit, dissolvable,
   amber eyes that reflect market data), volumetric light beams, a spatial 3D chart, and text living inside
   the space. Engine coordinates: x right, y up, z AWAY from the viewer → three.js z = -z. */
import * as THREE from '../vendor/three.module.min.js';
import { buildRex, sampleSurface, maskValue } from './rex3d.js';

const FOV = 2 * Math.atan(1 / 3) * 180 / Math.PI;   // matches the engine's projection (y = 1 at distance 3)
const BG = new THREE.Color('#070C15');
const V3 = (x, y, z) => new THREE.Vector3(x, y, -z);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

/* ------------------------------------------------------------------ REX: sculpted faceted fox head (js/rex3d.js) */
const REX = buildRex();
/** Area-weighted surface samples (REX space): [x, y, z, region] — the particles that build, dissolve into and re-form REX. */
export function sampleRexSurface(n, seed = 99) { return sampleSurface(REX.tris, n, seed); }

/* ------------------------------------------------------------------ shaders */
const NOISE = `
float hash3(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z); }`;

const REX_VS = `attribute float aZone; attribute float aRegion; attribute float aSeed; attribute float aMask;
varying vec3 vView; varying vec3 vLocal; varying float vZone; varying float vRegion; varying float vSeed; varying float vMask;
void main(){ vLocal = position; vMask = aMask; vZone = aZone; vRegion = aRegion; vSeed = aSeed; vec4 mv = modelViewMatrix * vec4(position,1.0); vView = mv.xyz; gl_Position = projectionMatrix * mv; }`;
// Material: smoked graphite + dark ceramic mask, obsidian nose. Soft frontal key (both halves readable, no hard
// seam), cool rim, a studio-softbox reflection so facets catch light differently, a trace of FOXREX teal in the
// reflection only, and warm bounce light from the eyes so they sit inside the sculpture.
const REX_FS = `${NOISE}
uniform float uKey, uRim, uOpacity, uDissolve, uTime, uFog, uReveal, uEyeGlow, uBuild, uTeal;
uniform vec3 uBg, uEyeL, uEyeR;
varying vec3 vView; varying vec3 vLocal; varying float vZone; varying float vRegion; varying float vSeed; varying float vMask;
void main(){
  // data formation: each region appears when its stream arrives (facet by facet)
  float rv = uReveal - vRegion - vSeed * 0.7;
  if (rv <= 0.0) discard;
  float n = 1.0;
  if (uDissolve > 0.001) { n = vnoise(vLocal*9.0 + vec3(0.0, uTime*0.04, 0.0)) * 0.6 + vnoise(vLocal*23.0) * 0.4; if (n < uDissolve) discard; }
  vec3 N = normalize(cross(dFdx(vView), dFdy(vView)));
  vec3 V = normalize(-vView);
  // zone materials: base emission, diffuse albedo, specular strength, shininess
  vec3 alb = mix(vec3(0.05, 0.058, 0.07), vec3(0.33, 0.335, 0.345), vMask); float spS = 0.5, shin = mix(70.0, 90.0, vMask);
  if (vZone > 1.5 && vZone < 2.5) { alb = vec3(0.03, 0.03, 0.035); spS = 0.95; shin = 170.0; }
  else if (vZone > 2.5) { alb = vec3(0.035, 0.04, 0.05); spS = 0.08; shin = 20.0; }
  alb *= 0.9 + 0.2 * fract(sin(dot(floor(N * 23.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);   // facets vary slightly
  vec3 L1 = normalize(vec3(-0.32, 0.5, 0.8)), L2 = normalize(vec3(0.55, 0.12, 0.82));
  float d1 = max(dot(N, L1), 0.0), d2 = max(dot(N, L2), 0.0), sky = 0.5 + 0.5 * N.y;
  vec3 col = alb * (d1 * 1.0 * uKey + d2 * 0.4 * uKey + sky * 0.22 + 0.06);
  vec3 H = normalize(L1 + V); col += vec3(0.82, 0.88, 0.96) * pow(max(dot(N, H), 0.0), shin) * spS * uKey;
  vec3 R = reflect(-V, N);
  float soft = smoothstep(0.35, 0.95, R.y) * smoothstep(-0.9, 0.2, R.z);                 // softbox above the camera
  col += vec3(0.5, 0.56, 0.64) * soft * spS * 0.22;
  col += vec3(0.0, 0.83, 0.66) * smoothstep(0.8, 1.0, -R.x) * smoothstep(0.2, 0.7, R.y) * spS * 0.035 * uTeal;   // a trace of FOXREX teal, upper edges only
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(0.58, 0.68, 0.82) * fres * uRim * 0.32 * (0.35 + 0.65 * sky);            // cool rim, never green
  // warm bounce from the eyes
  float eL = exp(-dot(vLocal - uEyeL, vLocal - uEyeL) / 0.03), eR = exp(-dot(vLocal - uEyeR, vLocal - uEyeR) / 0.03);
  col += vec3(0.9, 0.52, 0.14) * (eL + eR) * uEyeGlow * (vZone > 1.5 ? 0.35 : 0.12);
  // data edges: building (formation) and dissolving (ML)
  float build = 1.0 - smoothstep(0.0, 0.22, rv);
  col = mix(col, vec3(0.62, 0.96, 0.86), build * 0.5 * uBuild);
  float edge = (1.0 - smoothstep(uDissolve, uDissolve + 0.02, n)) * step(0.001, uDissolve);
  col = mix(col, vec3(0.55, 0.95, 0.85), edge * 0.5);
  float fog = exp(-uFog * uFog * dot(vView, vView));
  gl_FragColor = vec4(mix(uBg, col, fog), uOpacity);
}`;

const EYE_VS = `varying vec2 vUv; void main(){ vUv = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
// Eye: amber iris with fibres and a darker limbal ring, a soft vertical slit, the upper lid's shadow, a wet cornea
// (softbox highlight + a small secondary glint) and market information faintly reflected. Restrained emission.
const EYE_FS = `uniform vec2 uGaze; uniform float uAlpha, uTime, uFocus, uDir; uniform sampler2D uRefl; varying vec2 vUv;
void main(){
  float yn = clamp((vUv.y + 0.16) / 0.42, 0.0, 1.0);
  vec2 c = vec2(0.5 + uGaze.x * uDir * 0.14, 0.03 + uGaze.y * 0.04);
  vec2 q = (vUv - c) * vec2(1.0, 1.55); float d = length(q), ang = atan(q.y, q.x);
  vec3 iris = mix(vec3(1.0, 0.86, 0.52), vec3(0.86, 0.5, 0.12), smoothstep(0.02, 0.36, d));
  iris *= 0.86 + 0.14 * sin(ang * 26.0 + d * 30.0);                        // fibres
  iris *= 1.0 - smoothstep(0.26, 0.5, d) * 0.72;                            // limbal ring
  float slitW = mix(0.032, 0.016, uFocus);
  float slit = (1.0 - smoothstep(slitW, slitW + 0.018, abs(vUv.x - c.x))) * (1.0 - smoothstep(0.2, 0.34, abs(vUv.y - c.y)));
  vec3 col = mix(iris, vec3(0.015, 0.012, 0.01), slit);
  col *= mix(0.32, 1.0, smoothstep(0.92, 0.45, yn));                        // the upper lid shades the eye
  col *= smoothstep(0.0, 0.09, vUv.x) * smoothstep(1.0, 0.9, vUv.x);        // corners recede into the socket
  vec3 refl = texture2D(uRefl, vec2(vUv.x * 1.3 + uTime * 0.025, vUv.y * 2.2 + 0.4)).rgb;
  col += refl * 0.22 * (1.0 - slit) * smoothstep(0.85, 0.35, yn);         // market information, reflected
  float gl1 = 1.0 - smoothstep(0.0, 0.05, length((vUv - vec2(0.36, 0.12)) * vec2(1.0, 1.8)));
  float gl2 = 1.0 - smoothstep(0.0, 0.022, length(vUv - vec2(0.62, 0.02)));
  col += vec3(1.0, 0.97, 0.92) * (gl1 * 0.8 + gl2 * 0.45);                 // wet cornea
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
  if (vAlpha < 0.004) { gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }   // skip rasterizing invisible particles
}`;
const PTS_FS = `varying vec3 vColor; varying float vAlpha; varying float vBlur;
void main(){ vec2 pc = gl_PointCoord - 0.5; float intel = step(0.7, vColor.g) * step(vColor.r, 0.25) * (1.0 - vBlur);   // INTELLIGENCE PARTICLE: a crisp diamond
  float r = mix(length(pc), (abs(pc.x) + abs(pc.y)) * 0.78, intel); float core = mix(0.16, 0.46, vBlur);
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

/* ------------------------------------------------------------------ market primitives (MARKET NOISE) */
// Real market visual primitives drawn once to canvas, each in a sharp and an out-of-focus version, so the field can
// render depth of field: near-camera primitives are large and soft, the focus plane is crisp, the far field recedes.
function primitiveCanvas(kind, seed) {
  let s = seed * 9301 + 49297; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const TEAL = '#2FE0B8', WHITE = '#E5E7EB', GREY = '#8E99A8', ROSE = '#FF7A90', AMBER = '#F5B942';
  g.lineCap = 'round'; g.font = '500 30px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
  if (kind === 'candles') { let p = 150; const n = 12 + Math.floor(r() * 6), w = (W - 40) / n;
    for (let i = 0; i < n; i++) { const o = p, c2 = p + (r() - 0.46) * 46, hi = Math.min(o, c2) - r() * 22, lo = Math.max(o, c2) + r() * 22, up = c2 < o, x = 20 + i * w + w / 2;
      g.strokeStyle = g.fillStyle = up ? TEAL : GREY; g.lineWidth = 3; g.beginPath(); g.moveTo(x, hi); g.lineTo(x, lo); g.stroke(); g.fillRect(x - w * 0.3, Math.min(o, c2), w * 0.6, Math.max(4, Math.abs(c2 - o))); p = Math.min(215, Math.max(40, c2)); } }
  else if (kind === 'volume') { const n = 26, w = (W - 30) / n; for (let i = 0; i < n; i++) { const h = 20 + r() ** 2 * 190; g.fillStyle = r() < 0.5 ? 'rgba(47,224,184,0.8)' : 'rgba(142,153,168,0.7)'; g.fillRect(15 + i * w, H - 12 - h, w * 0.7, h); } }
  else if (kind === 'ladder') { g.font = '500 24px Inter, system-ui, sans-serif'; for (let i = 0; i < 8; i++) { const y = 20 + i * 30, px = (4328.9 - i * 0.1).toFixed(2), bid = i >= 4, bw = 40 + r() * 260;
      g.fillStyle = bid ? 'rgba(47,224,184,0.28)' : 'rgba(255,122,144,0.24)'; g.fillRect(bid ? 150 : 150, y - 11, bw, 22); g.fillStyle = bid ? TEAL : '#C9D4E3'; g.fillText(px, 14, y); g.fillStyle = GREY; g.fillText(String(Math.floor(r() * 90 + 5)), 170 + bw, y); } }
  else if (kind === 'yield') { const pts = [[40, 190], [120, 150], [210, 120], [310, 108], [400, 98], [480, 94]], lab = ['2Y', '5Y', '7Y', '10Y', '20Y', '30Y'];
    g.strokeStyle = WHITE; g.lineWidth = 3; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    g.font = '500 22px Inter, system-ui, sans-serif'; pts.forEach(([x, y], i) => { g.fillStyle = TEAL; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.fillStyle = GREY; g.fillText(lab[i], x - 14, y + 34); }); g.fillStyle = WHITE; g.fillText('US10Y 4.21  +4bp', 40, 34); }
  else if (kind === 'calendar') { g.font = '500 25px Inter, system-ui, sans-serif'; const rows = [['08:30', 'USD', 'CPI y/y', '3.1%', '3.2%'], ['10:00', 'USD', 'ISM Services', '51.4', '52.0'], ['14:00', 'USD', 'FOMC Minutes', '—', '—'], ['09:30', 'GBP', 'GDP m/m', '0.2%', '0.1%']];
    rows.forEach((rw, i) => { const y = 40 + i * 52; g.fillStyle = i === 0 ? AMBER : GREY; g.fillText(rw[0], 14, y); g.fillStyle = WHITE; g.fillText(rw[1], 104, y); g.fillText(rw[2], 180, y); g.fillStyle = GREY; g.fillText(rw[3], 380, y); g.fillText(rw[4], 450, y); }); }
  else if (kind === 'depth') { g.lineWidth = 3; g.strokeStyle = TEAL; g.fillStyle = 'rgba(47,224,184,0.16)'; g.beginPath(); g.moveTo(10, 60); let x = 10, y = 60; while (x < 250) { x += 20 + r() * 20; g.lineTo(x, y); y += 10 + r() * 16; g.lineTo(x, y); } g.lineTo(256, 236); g.lineTo(10, 236); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = ROSE; g.fillStyle = 'rgba(255,122,144,0.13)'; g.beginPath(); g.moveTo(502, 70); x = 502; y = 70; while (x > 262) { x -= 20 + r() * 20; g.lineTo(x, y); y += 10 + r() * 16; g.lineTo(x, y); } g.lineTo(256, 236); g.lineTo(502, 236); g.closePath(); g.fill(); g.stroke(); }
  else if (kind === 'structure') { const pts = [[20, 200], [110, 110], [170, 160], [270, 60], [330, 120], [470, 30]], lab = ['', 'HH', 'HL', 'HH', 'HL', 'BOS'];
    g.strokeStyle = WHITE; g.lineWidth = 3; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    g.setLineDash([10, 8]); g.strokeStyle = TEAL; g.beginPath(); g.moveTo(270, 60); g.lineTo(500, 60); g.stroke(); g.setLineDash([]);
    g.font = '700 24px Inter, system-ui, sans-serif'; pts.forEach(([x, y], i) => { if (!lab[i]) return; g.fillStyle = TEAL; g.fillText(lab[i], x - 16, y + (i % 2 ? -22 : 26)); }); }
  else if (kind === 'headline') { const hs = ['GOLD HOLDS 4,300 AHEAD OF CPI', 'FED SPEAKER: “DATA DEPENDENT”', 'DOLLAR FIRMS AS YIELDS RISE', 'RISK APPETITE FADES INTO THE CLOSE'];
    g.font = '600 30px Inter, system-ui, sans-serif'; g.fillStyle = WHITE; g.fillText(hs[seed % hs.length], 14, 110); g.fillStyle = GREY; g.font = '500 22px Inter, system-ui, sans-serif'; g.fillText('09:31 · MARKETS · DEMO', 14, 160); g.fillStyle = TEAL; g.fillRect(14, 60, 60, 4); }
  else if (kind === 'ticks') { g.font = '500 26px Inter, system-ui, sans-serif'; for (let i = 0; i < 6; i++) { const up = r() < 0.55; g.fillStyle = up ? TEAL : GREY; g.fillText(`09:31:0${i}.${String(Math.floor(r() * 999)).padStart(3, '0')}   ${(4328.3 + r() * 0.6).toFixed(2)}  ${up ? '▲' : '▼'}`, 14, 26 + i * 40); } }
  else if (kind === 'sparkline') { g.strokeStyle = WHITE; g.lineWidth = 3; g.beginPath(); let y = 150; for (let x = 10; x < W - 10; x += 8) { y = Math.min(230, Math.max(30, y + (r() - 0.49) * 22)); x === 10 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); g.fillStyle = TEAL; g.font = '600 26px Inter, system-ui, sans-serif'; g.fillText(['EURUSD 1.0842', 'BTCUSD 64,120', 'DXY 104.2', 'USDJPY 149.62'][seed % 4], 12, 24); }
  return c;
}
function blurred(src, px) { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'); g.filter = `blur(${px}px)`; g.drawImage(src, 0, 0); if (g.filter === 'none') { g.globalAlpha = 0.5; for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) g.drawImage(src, dx, dy); } return c; }
const tex2 = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

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
  const rexGeo = new THREE.BufferGeometry();
  { const pos = [], zone = [], reg = [], seed = [], mask = []; let k = 0;
    for (const [a, b, c, z, r] of REX.tris) { pos.push(...a, ...b, ...c); const sd = ((k++ * 0.6180339887) % 1);
      for (const v of [a, b, c]) { zone.push(z === 4 ? 0 : z); reg.push(r); seed.push(sd); mask.push(z === 1 ? 1 : z === 4 ? maskValue(v) : 0); } }
    rexGeo.setAttribute('aMask', new THREE.Float32BufferAttribute(mask, 1));
    rexGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rexGeo.setAttribute('aZone', new THREE.Float32BufferAttribute(zone, 1));
    rexGeo.setAttribute('aRegion', new THREE.Float32BufferAttribute(reg, 1)); rexGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1)); }
  const E3 = e => new THREE.Vector3(...e);
  const rexU = { uKey: { value: 1 }, uRim: { value: 0.6 }, uOpacity: { value: 0 }, uDissolve: { value: 0 }, uTime: { value: 0 }, uFog: { value: 0.04 }, uBg: { value: BG },
    uReveal: { value: 12 }, uBuild: { value: 0 }, uEyeGlow: { value: 0 }, uTeal: { value: 1 }, uEyeL: { value: E3(REX.eyes.L.centre) }, uEyeR: { value: E3(REX.eyes.R.centre) } };
  const rexMat = new THREE.ShaderMaterial({ vertexShader: REX_VS, fragmentShader: REX_FS, uniforms: rexU, transparent: true, side: THREE.FrontSide });
  const rexMesh = new THREE.Mesh(rexGeo, rexMat); rexMesh.renderOrder = 1; rex.add(rexMesh);
  // crease lines (the OBSERVATION LINE motif tracing REX's structure) — only strong creases, never a wireframe
  const rexEdges = new THREE.LineSegments(new THREE.EdgesGeometry(rexGeo, 32), lineMat('#DDE6F2', 0)); rex.add(rexEdges);
  // eyes: set into the sculpture on the surface basis (inner → outer corner), under the lid overhang
  const reflTex = reflectionTexture(['4328.50', 'XAUUSD', 'CPI', 'BOS', 'EMA 200', '1.0842', 'VOL', 'US10Y', 'HL', 'RSI 61', 'ATR']);
  const eyeShape = new THREE.Shape(); eyeShape.moveTo(0, 0); eyeShape.quadraticCurveTo(0.42, 0.34, 1, 0.03); eyeShape.quadraticCurveTo(0.56, -0.17, 0.08, -0.05); eyeShape.lineTo(0, 0);
  const eyeGeo = new THREE.ShapeGeometry(eyeShape, 28);
  const eyeU = { uGaze: { value: new THREE.Vector2() }, uAlpha: { value: 0 }, uTime: { value: 0 }, uFocus: { value: 0 }, uRefl: { value: reflTex } };
  const eyeMats = { L: new THREE.ShaderMaterial({ vertexShader: EYE_VS, fragmentShader: EYE_FS, uniforms: { ...eyeU, uDir: { value: -1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    R: new THREE.ShaderMaterial({ vertexShader: EYE_VS, fragmentShader: EYE_FS, uniforms: { ...eyeU, uDir: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide }) };
  const glowTex = glowTexture('rgba(255,200,120,1)', 'rgba(245,170,60,0.18)');
  const eyes = ['L', 'R'].map(side => {
    const E = REX.eyes[side], g = new THREE.Group(), m = new THREE.Mesh(eyeGeo, eyeMats[side]); m.renderOrder = 4;
    const xa = E3(E.xAxis), ya = E3(E.yAxis), za = E3(E.normal);
    g.matrixAutoUpdate = false; g.matrix.makeBasis(xa, ya, za).setPosition(E3(E.inner).addScaledVector(za, 0.008));
    const baseY = E.len; m.scale.set(E.len, baseY, 1);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.position.set(E.len * 0.5, 0.0, 0.02); glow.scale.set(E.len * 1.5, E.len * 0.7, 1); glow.renderOrder = 3;
    g.add(glow, m); rex.add(g); return { g, m, glow, len: E.len, baseY };
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

  /* MARKET NOISE field: primitives drifting toward the camera through depth, with depth of field */
  const KINDS = ['candles', 'volume', 'ladder', 'yield', 'calendar', 'depth', 'structure', 'headline', 'ticks', 'sparkline'];
  const PRIM = [];
  { const texCache = {}, n = D.mobile() ? 22 : 36; let sd = 7;
    for (let k = 0; k < n; k++) {
      const kind = KINDS[k % KINDS.length], variant = Math.floor(k / KINDS.length) % 3, key = kind + variant;
      if (!texCache[key]) { const c = primitiveCanvas(kind, variant + 1); texCache[key] = [tex2(c), tex2(blurred(c, 7))]; }
      const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      const h = 0.34 + r() * 0.38, mk = map => new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0, fog: false }));
      const sharp = mk(texCache[key][0]), soft = mk(texCache[key][1]); for (const sp of [sharp, soft]) { sp.scale.set(h * 2, h, 1); sp.renderOrder = 1; world.add(sp); }
      const ang = r() * Math.PI * 2, rad = 0.55 + r() * 1.6;
      PRIM.push({ sharp, soft, kind, d0: r(), x: Math.cos(ang) * rad * 1.9, y: Math.sin(ang) * rad * 0.8, speed: 0.7 + r() * 0.6, signal: kind === 'structure' && variant === 0 || kind === 'calendar' && variant === 0 || kind === 'candles' && variant === 1 });
    } }
  /* FOXREX motifs: OBSERVATION LINE brackets + light path, and the amber ATTENTION glint (REX's eye, reflected) */
  const brackets = [0, 1, 2].map(() => { const g = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat('#9FF5DF', 0)); g.frustumCulled = false; world.add(g); return g; });
  const lightPath = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), lineMat('#CFFAF0', 0)); lightPath.frustumCulled = false; world.add(lightPath);
  const glintTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 32, 0, 128, 32, 128); gr.addColorStop(0, 'rgba(255,226,170,1)'); gr.addColorStop(0.08, 'rgba(245,185,66,0.7)'); gr.addColorStop(0.35, 'rgba(245,160,50,0.12)'); gr.addColorStop(1, 'rgba(245,160,50,0)');
    g.fillStyle = gr; g.setTransform(1, 0, 0, 0.18, 0, 26); g.fillRect(0, 0, 256, 64); g.setTransform(1, 0, 0, 1, 0, 0);
    const c2 = g.createRadialGradient(128, 32, 0, 128, 32, 16); c2.addColorStop(0, 'rgba(255,240,210,1)'); c2.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = c2; g.fillRect(96, 0, 64, 64); return tex2(c); })();
  const glints = [0, 1].map(() => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); sp.scale.set(0.5, 0.125, 1); sp.renderOrder = 6; world.add(sp); return sp; });
  function bracket(g, x, y, z, w, h, a) {
    const c = Math.min(w, h) * 0.18, X0 = x - w / 2, X1 = x + w / 2, Y0 = y - h / 2, Y1 = y + h / 2, Z = -z, v = [];
    for (const [px, py, sx, sy] of [[X0, Y0, 1, 1], [X1, Y0, -1, 1], [X0, Y1, 1, -1], [X1, Y1, -1, -1]]) v.push(px, py, Z, px + sx * c, py, Z, px, py, Z, px, py + sy * c, Z);
    g.geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.material.opacity = a; g.visible = a > 0.005;
  }
  const signals = [];   // screen-independent positions of the primitives FOXREX selects (engine reads them for REX's gaze)
  const SPAN = 13, NEAR = 0.3, SIG_ANCHOR = [[0.04, 0.52, 3.6], [0.12, -0.52, 3.9], [-0.14, -0.04, 4.6]];
  PRIM.filter(p => p.signal).forEach((p, k) => { p.sigK = k % 3; });
  function updatePrims(s, fieldA, focusD, ap, select) {
    signals.length = 0;
    for (const p of PRIM) {
      const d = NEAR + (((p.d0 - s.t * 0.016 * p.speed) % 1 + 1) % 1) * SPAN, z = s.cam.z + d;
      const on = fieldA > 0.005; p.sharp.visible = p.soft.visible = on; if (!on) continue;
      let a = fieldA * smooth(SPAN, SPAN - 3, d - NEAR) * smooth(0.25, 1.1, d) * 0.55;
      let px = p.x, py = p.y, pz = z, dd = d;
      if (select > 0) {   // attention: the noise dims; the signal settles where FOXREX can hold it in focus
        if (p.signal) { const an = SIG_ANCHOR[p.sigK]; px = lerp(p.x, an[0] * s.A, select); py = lerp(p.y, an[1], select); dd = lerp(d, an[2], select); pz = s.cam.z + dd; a = lerp(a, fieldA * 0.95, select); }
        else a *= 1 - 0.82 * select;
      }
      const coc = Math.abs(dd - focusD) * ap, b = smooth(0.12, 0.7, coc);
      p.sharp.position.set(px, py, -pz); p.soft.position.copy(p.sharp.position);
      const k = d < 1.2 ? 1 + (1.2 - d) * 0.25 : 1; p.sharp.scale.set(p.sharp.userData.w ??= p.sharp.scale.x, p.sharp.userData.h ??= p.sharp.scale.y, 1); p.soft.scale.set(p.sharp.userData.w * k, p.sharp.userData.h * k, 1);
      p.sharp.material.opacity = a * (1 - b); p.soft.material.opacity = a * b * 0.9;
      p.sharp.visible = p.sharp.material.opacity > 0.006; p.soft.visible = p.soft.material.opacity > 0.006;   // never rasterize what is invisible
      if (p.signal && select > 0) signals.push({ x: px, y: py, z: pz, a, w: p.sharp.userData.w, h: p.sharp.userData.h });
    }
  }

  /* scene objects (built lazily; asleep unless their scene is near) */
  const groups = {};
  const G = id => (groups[id] ||= (() => { const g = new THREE.Group(); g.visible = false; world.add(g); return g; })());
  const built = {};
  const once = (k, f) => { if (!built[k]) { built[k] = true; f(); } };

  /* streams: ten evidence flows — each a fine trail (the OBSERVATION LINE) with its name riding the leading edge */
  const STREAM_N = 48;
  function buildStreams() {
    const g = G('streams'), names = D.T.streamNames || ['PRICE', 'VOLUME', 'VOLATILITY', 'STRUCTURE', 'MOMENTUM', 'TREND', 'LIQUIDITY', 'NEWS', 'SESSION', 'HISTORICAL MEMORY'];
    g.userData.trails = []; g.userData.labels = []; g.userData.heads = [];
    const headTex = glowTexture('rgba(220,255,245,1)', 'rgba(0,212,167,0.3)');
    for (let k = 0; k < 10; k++) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAM_N * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const tr = new THREE.Line(geo, lineMat(k === 0 || k === 5 ? '#7FF0D6' : '#C9D4E3', 0)); tr.frustumCulled = false; g.add(tr); g.userData.trails.push(tr);
      const lab = textSprite(names[k], { px: 64, weight: 600, h: 0.1, color: '#E5E7EB', track: 7, align: 'left', font: D.lang === 'ar' ? 'IBM Plex Sans Arabic' : 'Inter' }); lab.material.depthTest = false; lab.renderOrder = 7; g.add(lab); g.userData.labels.push(lab);
      const hd = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); hd.scale.set(0.26, 0.26, 1); g.add(hd); g.userData.heads.push(hd);
    }
  }
  const bz = (a, b, c, u, out) => { const v = 1 - u; out.set(v * v * a[0] + 2 * v * u * b[0] + u * u * c[0], v * v * a[1] + 2 * v * u * b[1] + u * u * c[1], -(v * v * a[2] + 2 * v * u * b[2] + u * u * c[2])); return out; };
  const _v = new THREE.Vector3();
  function updateStreams(s, a) {
    const U = groups.streams.userData, ST = s.streams; if (!ST) return;
    ST.forEach((st, k) => {
      const tr = U.trails[k], lab = U.labels[k], hd = U.heads[k], u = st.u, arr = tr.geometry.attributes.position.array;
      const head = Math.min(1, u * 1.1), tail = Math.max(0, head - 0.55);
      for (let i = 0; i < STREAM_N; i++) { bz(st.o, st.c, st.t, tail + (head - tail) * i / (STREAM_N - 1), _v); arr[i * 3] = _v.x; arr[i * 3 + 1] = _v.y; arr[i * 3 + 2] = _v.z; }
      tr.geometry.attributes.position.needsUpdate = true;
      const live = u > 0 && u < 1 ? 1 : 0;
      tr.material.opacity = a * live * 0.85 * Math.sin(Math.min(1, u) * Math.PI) ** 0.5;
      bz(st.o, st.c, st.t, head, _v); hd.position.copy(_v); hd.material.opacity = a * live * 0.8; hd.visible = tr.visible = live > 0 && a > 0.01; lab.visible = hd.visible;
      // the name rides the leading edge, then settles beside the region it built
      lab.position.set(_v.x + 0.07, _v.y + 0.04, _v.z); lab.material.opacity = a * (live ? smooth(0, 0.15, u) : 0) * 0.95;
    });
  }
  /* enter: the six architecture layers the camera flies through */
  function buildEnter() {
    const g = G('enter'); g.userData.labels = [];
    D.T.layers.forEach((name, layer) => {
      // a precision instrument, not a wireframe ring: three arcs with gaps, fine ticks, one major tick per arc
      const z = 1.2 + layer * 2.1, sx = 1.05 * (D.mobile() ? 0.62 : 1), sy = 1.05 * 0.68, rot = layer * 0.5, col = layer === 3 ? '#00D4A7' : '#C9D4E3';
      for (let arc = 0; arc < 3; arc++) { const a0 = rot + arc * Math.PI * 2 / 3 + 0.12, a1 = a0 + Math.PI * 2 / 3 - 0.24, pts = [];
        for (let s = 0; s <= 40; s++) { const a = lerp(a0, a1, s / 40); pts.push([Math.cos(a) * sx, Math.sin(a) * sy, z]); } g.add(polyline(pts, lineMat(col, 0.35))); }
      const tv = []; for (let k = 0; k < 72; k++) { const a = rot + k / 72 * Math.PI * 2, L = k % 12 === 0 ? 0.07 : 0.025; tv.push(Math.cos(a) * sx, Math.sin(a) * sy, -z, Math.cos(a) * (sx - L), Math.sin(a) * (sy - L * 0.68), -z); }
      const ticks = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(tv, 3)), lineMat(col, 0.3)); g.add(ticks);
      const lab = textSprite(name.toUpperCase(), { px: 64, weight: 600, h: 0.075, color: layer === 3 ? '#00D4A7' : '#C9D4E3', track: 8, font: D.lang === 'ar' ? 'IBM Plex Sans Arabic' : 'Inter' });
      lab.position.copy(V3(0, 1.05 * 0.68 + 0.08, z)); g.add(lab); g.userData.labels.push(lab);
    });
  }

  /* chart: candles as lit volumes, indicators as depth-layered ribbons, structure connected in space */
  const CH = {};
  function buildChart() {
    const g = G('chart'), NV = 120;
    const box = new THREE.BoxGeometry(1, 1, 1);
    CH.body = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0, emissive: '#0a1320', depthWrite: false }), NV);
    CH.wick = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), NV);
    CH.vol = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0, depthWrite: false }), NV);
    for (const m of [CH.body, CH.wick, CH.vol]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(m); }
    const c = new THREE.Color(); for (let i = 0; i < NV; i++) { CH.body.setColorAt(i, c.set('#fff')); CH.wick.setColorAt(i, c); CH.vol.setColorAt(i, c); }
    const rib = (color, op, add) => { const r = new Ribbon(NV, basic(color, op, add)); r.mesh.renderOrder = 3; g.add(r.mesh); return r; };
    CH.ema20 = rib('#7FF0D6', 0.95); CH.ema20g = rib('#00D4A7', 0.12, true); CH.ema50 = rib('#E5E7EB', 0.75); CH.ema200 = rib('#F5B942', 0.6);
    CH.bbU = rib('#E5E7EB', 0.28); CH.bbL = rib('#E5E7EB', 0.28);
    CH.bbFillPos = new Float32Array(NV * 2 * 3); { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(CH.bbFillPos, 3).setUsage(THREE.DynamicDrawUsage)); const idx = []; for (let i = 0; i < NV - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } gg.setIndex(idx); CH.bbFill = new THREE.Mesh(gg, basic('#9fb3cc', 0.05)); CH.bbFill.frustumCulled = false; g.add(CH.bbFill); }
    CH.osc = rib('#00D4A7', 0.9); CH.osc2 = rib('#E5E7EB', 0.6);
    CH.path = rib('#00D4A7', 0.85); CH.pathG = rib('#00D4A7', 0.14, true);                         // HH-HL-BOS-RETEST connected in space
    CH.bos = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: '#00D4A7', dashSize: 0.03, gapSize: 0.02, transparent: true, opacity: 0, depthWrite: false })); g.add(CH.bos);
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
      if (!replay) { const gl = glints[1]; gl.position.copy(V3(cxw(b.i), cyw(C_[b.i].c), box.z - 0.14)); gl.scale.set(0.34, 0.085, 1); gl.material.opacity = alpha * smooth(0.55, 0.9, grow(11)) * (0.6 + 0.4 * Math.sin(o.t * 2.2) ** 2); }
      if (rt && rt.i <= cut) { CH.retest.position.copy(V3(cxw(rt.i), cyw(C_[rt.i].l), box.z - 0.12)); CH.retest.material.opacity = alpha * smooth(0.7, 1, grow(11)); CH.rtLab.position.copy(V3(cxw(rt.i), cyw(C_[rt.i].l) - 0.07, box.z - 0.12)); CH.rtLab.material.opacity = CH.retest.material.opacity; } else CH.retest.material.opacity = CH.rtLab.material.opacity = 0;
    } else { CH.bos.material.opacity = CH.bosLab.material.opacity = CH.retest.material.opacity = CH.rtLab.material.opacity = 0; glints[1].material.opacity = 0; }
    // price at the edge of knowledge
    const lastC = C_[cut].c.toFixed(2); if (CH.tagVal !== lastC) { CH.tagVal = lastC; const n2 = textSprite(lastC, { px: 60, weight: 600, h: 0.05, color: '#00D4A7', align: 'left' }); CH.tag.material.map.dispose(); CH.tag.material.map = n2.material.map; CH.tag.scale.copy(n2.scale); }
    CH.tag.position.copy(V3(cxw(D.LAST) + 0.05, cyw(C_[cut].c), box.z - 0.05)); CH.tag.material.opacity = crisp;
    CH.grid.material.uniforms.uAlpha.value = 0;   // no default grid: raw candles in darkness
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
  /* ML: no default axes or grids — a glass validation plane, cluster halos, and the probability distribution */
  function buildML() {
    const g = G('ml'), U = g.userData, halo = glowTexture('rgba(200,255,240,0.9)', 'rgba(0,212,167,0.12)');
    U.plane = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.2), new THREE.ShaderMaterial({ vertexShader: UV_VS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      fragmentShader: `uniform float uAlpha, uTime; varying vec2 vUv; void main(){ vec2 e = min(vUv, 1.0 - vUv); float edge = 1.0 - smoothstep(0.0, 0.006, min(e.x, e.y * 1.6));
        float scan = smoothstep(0.985, 1.0, fract(vUv.y * 1.0 - uTime * 0.18)) * 0.5; float fill = 0.032 + 0.03 * (1.0 - vUv.y);
        gl_FragColor = vec4(mix(vec3(0.6, 0.72, 0.84), vec3(0.5, 0.98, 0.86), edge), (fill + edge * 0.8 + scan * 0.25) * uAlpha); }`,
      uniforms: { uAlpha: { value: 0 }, uTime: { value: 0 } } }));
    g.add(U.plane);
    U.planeLab = textSprite('WALK-FORWARD · VALIDATION', { px: 64, weight: 600, h: 0.06, color: '#7FF0D6', track: 8, align: 'left' }); g.add(U.planeLab);
    U.halos = [0, 1, 2].map(k => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: ['#BFF7EA', '#E5E7EB', '#8e99a8'][k], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); g.add(s); return s; });
    U.base = new Ribbon(2, basic('#C9D4E3', 0)); U.mark = new Ribbon(2, basic('#7FF0D6', 0)); g.add(U.base.mesh, U.mark.mesh);
    U.l0 = textSprite('0', { px: 56, weight: 500, h: 0.045, color: '#8e99a8' }); U.l1 = textSprite('1', { px: 56, weight: 500, h: 0.045, color: '#8e99a8' }); g.add(U.l0, U.l1);
  }
  /* reasoning chamber: darkness, a soft pool of light under REX, one precise ring; evidence connects only when
     reasoning establishes the relationship (the OBSERVATION LINE grows from the evidence to REX's eyes) */
  function buildChamber() {
    const g = G('chamber');
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShaderMaterial({ vertexShader: UV_VS, transparent: true, depthWrite: false,
      fragmentShader: `uniform float uAlpha; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = exp(-r * r * 9.0) * 0.5 + exp(-r * r * 2.2) * 0.12; gl_FragColor = vec4(vec3(0.62, 0.7, 0.82), a * uAlpha); }`,
      uniforms: { uAlpha: { value: 0 } } }));
    pool.rotation.x = -Math.PI / 2; pool.position.copy(V3(0, -1.3, 2.0)); g.add(pool); g.userData.pool = pool;
    const ring = []; for (let k = 0; k <= 160; k++) { const a = k / 160 * Math.PI * 2; ring.push([Math.cos(a) * 1.7, -1.3, 2.0 + Math.sin(a) * 1.7]); }
    g.userData.ring = polyline(ring, lineMat('#9FB3CC', 0)); g.add(g.userData.ring);
    g.userData.links = D.EVIDENCE.map(e => { const m = new THREE.ShaderMaterial({ vertexShader: DASH_VS, fragmentShader: DASH_FS, uniforms: { uColor: { value: new THREE.Color(e.agree ? '#7FF0D6' : '#F5B942') }, uAlpha: { value: 0 }, uTime: { value: 0 }, uSpeed: { value: e.agree ? 0.8 : 0.25 }, uFreq: { value: 9 } }, transparent: true, depthWrite: false }); const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), m); g.add(l); return l; });
    const tex = glowTexture(); g.userData.cores = D.EVIDENCE.map(e => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: e.agree ? '#BFF7EA' : '#F5B942', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); s.scale.set(0.22, 0.22, 1); g.add(s); return s; });
  }
  /* risk: a portal — the setup must pass through it */
  function buildGate() {
    const g = G('gate'); const mat = new THREE.MeshBasicMaterial({ color: '#E5E7EB', transparent: true, opacity: 0, depthWrite: false }); g.userData.mat = mat;
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
    decision: { fog: 0.05, exp: 1.05, beam: 0.22, rim: 0.4, key: 0.3, ap: 0.16 }, replay: { fog: 0.025, exp: 1.06, beam: 0, rim: 0.6, key: 0.45, ap: 0.08 },
    ask: { fog: 0.04, exp: 1.02, beam: 0.3, rim: 1.1, key: 0.55, ap: 0.12 }, live: { fog: 0.025, exp: 1.06, beam: 0, rim: 0.5, key: 0.4, ap: 0.08 },
    system: { fog: 0.03, exp: 1.04, beam: 0.25, rim: 0.7, key: 0.45, ap: 0.08 }
  };
  const look = (id, nid, mu) => { const a = LOOK[id], b = LOOK[nid]; const o = {}; for (const k in a) o[k] = lerp(a[k], b[k], mu); return o; };

  /* ------------------------------------------------------------------ frame */
  let W = 1, H = 1, dpr = 1;
  const eyeTmp = new THREE.Vector3();
  function resize(w, h, pr) { W = w; H = h; dpr = pr; renderer.setPixelRatio(pr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); ptsMat.uniforms.uPx.value = 6.2 * pr; dustMat.uniforms.uPx.value = 6.2 * pr;
    for (const k of Object.keys(built)) { if (['enter', 'memory'].includes(k)) { world.remove(groups[k]); delete groups[k]; delete built[k]; } } }

  let lastAttention = null;
  function frame(s) {
    const { t, id, nid, mu, lp, cam, rexS } = s, near = x => id === x || nid === x;
    let L = look(id, nid, mu);
    if (s.inspect) L = s.inspect === 'silhouette' ? { fog: 0.03, exp: 1, beam: 0, rim: 2.6, key: -0.75, ap: 0.12 } : { fog: 0.03, exp: 1.05, beam: 0.3, rim: 1, key: 0.6, ap: 0.12 };
    // camera: orbit about the pivot (engine yaw), then dolly
    orbit.rotation.y = cam.yaw; world.position.set(-cam.x, 0, cam.pivot);
    camera.position.set(0, cam.y, cam.pivot - cam.z); camera.lookAt(0, cam.y, -1e3); camera.position.x = 0;
    // light + lens
    scene.fog.density = L.fog; renderer.toneMappingExposure = L.exp; ptsMat.uniforms.uFog.value = L.fog; ptsMat.uniforms.uAperture.value = L.ap; dustMat.uniforms.uFog.value = L.fog * 0.35;
    ptsMat.uniforms.uFocus.value = s.focus; key.intensity = 0.4 + L.key; ambient.intensity = 0.25 + L.key * 0.4;
    // REX
    rex.position.set(rexS.x, rexS.y, -rexS.z); rex.scale.setScalar(rexS.s); rex.rotation.set(rexS.pitch, rexS.yaw, 0, 'XYZ');
    rexU.uOpacity.value = rexS.mesh; rexU.uDissolve.value = rexS.dissolve; rexU.uTime.value = t; rexU.uFog.value = L.fog; rexU.uRim.value = L.rim * (rexS.rimBoost || 1);
    rexU.uKey.value = 0.55 + L.key * 0.6; rexU.uEyeGlow.value = rexS.eye; rexU.uReveal.value = s.reveal ?? 12; rexU.uBuild.value = s.build || 0; rexMesh.visible = rexS.mesh > 0.01;
    rexEdges.material.opacity = rexS.edge * (1 - rexS.dissolve); rexEdges.visible = rexEdges.material.opacity > 0.01;
    const open = s.eyeOpen, focusN = s.eyeFocus;
    eyes.forEach(e => { e.m.scale.y = e.baseY * Math.max(0.06, open * (0.86 - focusN * 0.26)); e.glow.material.opacity = rexS.eye * 0.16; e.g.visible = rexS.eye > 0.01; });
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
    // market primitives: chaos arrives after the isolated numbers, fills the noise, then dims except the signal (observe)
    { const fa = s.inspect ? 0 : id === 'opening' ? smooth(8.4, 11.5, intro) : id === 'noise' ? 1 - mu : id === 'observe' ? (1 - smooth(0.7, 0.95, lp)) * (1 - mu) : 0;
      const fin = nid === 'noise' && id === 'opening' ? Math.max(fa, mu) : fa;
      const sel = id === 'observe' && !s.inspect ? smooth(0.08, 0.32, lp) * (1 - mu) : 0;
      updatePrims(s, fin, id === 'observe' ? 3.8 : 6.5, id === 'observe' ? L.ap * 1.4 : L.ap * 1.9, sel);
      brackets.forEach((g, k) => { const sg = signals[k]; if (!sg || sel < 0.01) { g.visible = false; return; } bracket(g, sg.x, sg.y, sg.z, sg.w * 1.06, sg.h * 1.12, sel * Math.min(1, sg.a) * 0.9); });
      const cur = signals.length ? signals[Math.floor(s.t / 3.2) % signals.length] : null;
      if (cur && sel > 0.02 && rexS.eye > 0.05) { rex.updateMatrixWorld(); const e = eyes[1].g.localToWorld(_v.set(eyes[1].len * 0.5, 0, 0)).clone(), wp = world.worldToLocal(e);
        lightPath.geometry.setFromPoints([wp, new THREE.Vector3(cur.x - cur.w / 2, cur.y, -cur.z)]); lightPath.material.opacity = sel * 0.35 * Math.min(1, cur.a); lightPath.visible = true;
        glints[0].position.set(cur.x - cur.w * 0.46, cur.y + cur.h * 0.2, -cur.z + 0.01); glints[0].material.opacity = sel * (0.55 + 0.45 * Math.sin(s.t * 2.4) ** 2) * Math.min(1, cur.a); glints[0].scale.set(cur.w * 0.5, cur.w * 0.125, 1);
        s.attention = { x: cur.x, y: cur.y, z: cur.z }; }
      else { lightPath.visible = false; glints[0].material.opacity = 0; } }
    // market fragments ride their particles (noise / observe)
    const fragOn = id === 'noise' || id === 'observe' || (id === 'opening' && intro > 9);
    frag.forEach((sp, k) => { const i = s.fragIdx[k]; if (!fragOn || i == null) { sp.visible = false; return; } sp.visible = true; sp.position.set(P.pos[i * 3] + 0.05, P.pos[i * 3 + 1], P.pos[i * 3 + 2]);
      const imp = k === 3 || k === 0 || k === 11 || k === 16; let a = P.alpha[i] * (id === 'noise' ? 0.6 : 1.6); if (id === 'observe') a = imp ? 0.95 : a * (1 - smooth(0.05, 0.5, lp) * 0.92); if (id === 'opening') a *= smooth(9, 12, intro) * 0.6;
      sp.material.opacity = clamp(a) * (1 - mu); sp.visible = sp.material.opacity > 0.006; sp.material.color.set(imp && id !== 'opening' ? '#00D4A7' : '#E5E7EB'); });
    // scene objects — asleep unless their scene (or the next) is on screen
    for (const [gid, ids] of Object.entries({ streams: ['streams'], enter: ['enter'], chart: ['technical', 'replay', 'memory'], memory: ['memory'], ml: ['ml'], chamber: ['reason', 'ask'], gate: ['risk'], decision: ['decision'], live: ['live'], system: ['system'] })) {
      const on = ids.some(near); if (groups[gid]) groups[gid].visible = on;
      if (on) once(gid, { streams: buildStreams, enter: buildEnter, chart: buildChart, memory: buildMemory, ml: buildML, chamber: buildChamber, gate: buildGate, decision: buildDecision, live: buildLive, system: buildSystem }[gid]);
      if (on && groups[gid]) groups[gid].visible = true;
    }
    const fadeFor = x => (id === x ? 1 - mu : nid === x ? mu : 0);
    if (groups.streams?.visible) updateStreams(s, fadeFor('streams'));
    if (groups.enter?.visible) { const a = fadeFor('enter'); groups.enter.children.forEach(c => { if (c.isLineSegments) c.material.opacity = 0.22 * a; else if (c.isLine) c.material.opacity = 0.34 * a; }); groups.enter.userData.labels.forEach(l => { l.material.opacity = 0.85 * a; }); }
    if (!groups.chart?.visible) glints[1].material.opacity = 0;
    if (groups.chart?.visible) {
      const rep = id === 'replay' || (nid === 'replay' && mu > 0.5), cid = rep ? 'replay' : 'technical';
      const a = id === 'memory' ? (1 - smooth(0, 0.3, lp)) * 0.6 : fadeFor(cid);
      updateChart({ t, box: D.chartBox(cid), lo: D.LAST - D.NV() + 1, cut: rep ? D.replayIndex() : D.LAST, step: id === 'technical' ? s.step : 11, stepU: s.stepU, crisp: (rep ? s.crispReplay : id === 'memory' ? a : s.crisp) * a, alpha: a, replay: rep });
    }
    if (groups.memory?.visible) { const a = fadeFor('memory'), u = id === 'memory' ? lp : 0; groups.memory.userData.lines.forEach((l, w) => { const m = D.memShapes[w], on = m.similar && u > 0.35, keep = m.similar ? 1 : 1 - smooth(0.45, 0.8, u); l.material.opacity = (on ? 0.75 : 0.18) * keep * a; l.material.color.set(on ? '#00D4A7' : '#AEB8C6'); groups.memory.userData.scores[w].material.opacity = (on ? 0.9 : 0.3) * keep * a * smooth(0.3, 0.4, u); }); }
    if (groups.ml?.visible) { const a = fadeFor('ml'), u = id === 'ml' ? lp : 0, U = groups.ml.userData, MZ = 2.4, A_ = s.A;
      const wz = lerp(MZ + 1.5, -0.5, smooth(0.62, 0.8, u)), wa = smooth(0.6, 0.64, u) * (1 - smooth(0.78, 0.82, u)) * a;
      U.plane.position.set(0, 0, -wz); U.plane.material.uniforms.uAlpha.value = wa; U.plane.material.uniforms.uTime.value = t;
      U.planeLab.position.set(-1.78, 1.2, -wz); U.planeLab.material.opacity = wa * 0.9;
      const ha = smooth(0.52, 0.6, u) * (1 - smooth(0.8, 0.86, u)) * a;
      [[0.8, 0.34, -0.5], [-0.8, -0.28, 0.2], [0.1, -0.05, 0.9]].forEach((c, k) => { const h = U.halos[k]; h.position.set(c[0] * (s.mobile ? 0.62 : 1), c[1], -(MZ + c[2])); h.scale.set(0.9, 0.9, 1); h.material.opacity = ha * [0.8, 0.4, 0.2][k]; });
      const pa = smooth(0.8, 0.86, u) * a, X = A_ * 0.72;
      U.base.set([[-X, -0.5, 0.9], [X, -0.5, 0.9]], 0.003); U.base.mesh.material.opacity = pa * 0.5;
      const mx = lerp(-X, X, 0.72); U.mark.set([[mx, -0.5, 0.9], [mx, 0.2, 0.9]], 0.004); U.mark.mesh.material.opacity = pa * 0.9;
      U.l0.position.copy(V3(-X, -0.56, 0.9)); U.l1.position.copy(V3(X, -0.56, 0.9)); U.l0.material.opacity = U.l1.material.opacity = pa * 0.8; }
    if (groups.chamber?.visible) { const a = Math.max(fadeFor('reason'), fadeFor('ask')), U = groups.chamber.userData, nodes = s.nodes, cx = s.linkTarget, LK = s.links;
      U.pool.material.uniforms.uAlpha.value = a * (LK ? 1 : 0.5); U.ring.material.opacity = a * 0.22;
      D.EVIDENCE.forEach((e, j) => { const n = nodes[j], l = U.links[j], f = s.focusOf(e.id), flick = !e.agree && s.waitHold ? 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + j * 2.1)) : 1;
        const grow = LK ? LK[j].grow : 1, w = LK ? LK[j].w : 1;
        l.geometry.setFromPoints([V3(n.x, n.y, n.z), V3(lerp(n.x, cx.x, grow), lerp(n.y, cx.y, grow), lerp(n.z, cx.z, grow))]); l.computeLineDistances();
        l.material.uniforms.uAlpha.value = (e.agree ? 0.55 : 0.6) * a * f * flick * Math.min(1.3, w) * (grow > 0.01 ? 1 : 0); l.material.uniforms.uTime.value = t * (s.waitHold ? 0.35 : 1);
        U.cores[j].position.copy(V3(n.x, n.y, n.z)); U.cores[j].material.opacity = (0.35 + e.strength * 0.4) * a * f * (0.5 + 0.5 * grow) * Math.min(1.2, w); }); }
    if (groups.gate?.visible) { const a = id === 'risk' ? 1 - mu : nid === 'risk' ? smooth(0.55, 1, mu) : 0, u = id === 'risk' ? lp : 0, U = groups.gate.userData, g = s.gate, gw = s.gateW, fail = u < 0.55, col = u > 0.3 && u < 0.55 ? '#FF5C7A' : u >= 0.72 ? '#00D4A7' : '#C9D4E3';
      const th = 0.012; [[0, g.h, gw * 2 + th, th], [0, -g.h, gw * 2 + th, th], [-gw, 0, th, g.h * 2], [gw, 0, th, g.h * 2]].forEach(([x, y, w, h], k) => { U.bars[k].position.copy(V3(x, g.y + y, 1)); U.bars[k].scale.set(w, h, 0.03); });
      U.mat.color.set(col); U.mat.opacity = 0.9 * a; U.field.position.copy(V3(0, g.y, 1)); U.field.scale.set(gw * 2, g.h * 2, 1); U.field.material.uniforms.uAlpha.value = (fail && u > 0.3 ? 0.35 : 0.08) * a; U.field.material.uniforms.uColor.value.set(fail ? '#FF5C7A' : '#00D4A7'); U.field.material.uniforms.uTime.value = t;
      const vy = s.narrow ? g.y + g.h + 0.16 : g.y - g.h - 0.16; U.verdict.position.copy(V3(0, vy, 1)); U.pass.position.copy(V3(0, vy, 1)); U.verdict.material.opacity = a * smooth(0.3, 0.38, u) * (1 - smooth(0.52, 0.56, u)); U.pass.material.opacity = a * smooth(0.72, 0.8, u); }
    if (groups.decision?.visible) { const a = fadeFor('decision'), u = id === 'decision' ? lp : 0, U = groups.decision.userData, X = s.A * 1.05, lv = smooth(0.25, 0.55, u) * a;
      U.h.set([[-X, s.decY(s.DEC.entry), 0.3], [X, s.decY(s.DEC.entry), 0.3]], 0.0035); U.h.mesh.material.opacity = 0.35 * a;
      U.t.set([[-X, s.decY(s.DEC.target), 0.3], [X, s.decY(s.DEC.target), 0.3]], 0.002); U.t.mesh.material.opacity = 0.16 * lv; U.i.set([[-X, s.decY(s.DEC.invalidation), 0.3], [X, s.decY(s.DEC.invalidation), 0.3]], 0.002); U.i.mesh.material.opacity = 0.16 * lv;
      U.tl.position.copy(V3(X * 0.95, s.decY(s.DEC.target) + 0.04, 0.3)); U.tl.material.opacity = 0; U.il.position.copy(V3(X * 0.95, s.decY(s.DEC.invalidation) + 0.04, 0.3)); U.il.material.opacity = 0;
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
    rimL.intensity = 0; lastAttention = s.attention || null;
    renderer.render(scene, camera);
  }
  return { renderer, resize, setParticles, frame, sampleRexSurface, signals, attention: () => lastAttention, get dpr() { return dpr; } };
}
