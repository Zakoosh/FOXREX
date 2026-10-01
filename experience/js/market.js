/* FOXREX experience v2 — the MARKET WORLD (Three.js r170, vendored).
   The market is the protagonist: real financial-interface fragments (candles, volume, depth of market, economic
   calendar, yields, headlines, tape, session stats) live at many depths. The camera travels THROUGH them; a lens
   with real depth of field decides what is sharp. REX is not drawn here: REX is Higgsfield REX-MASTER footage,
   composited into this world by rex-layer.js at a physical depth, so panels pass in front of and behind it.
   All market values are DEMO / CINEMATIC DATA and are labelled on screen. */
import * as THREE from '../vendor/three.module.min.js';
import { createRexLayer } from './rex-layer.js';

const FOV = 2 * Math.atan(1 / 3) * 180 / Math.PI;   // y = ±1 at distance 3
const BG = new THREE.Color('#070C15');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const fract = x => x - Math.floor(x);

/* ------------------------------------------------------------------ market primitives
   Drawn once to canvas, each in a sharp and an out-of-focus version, so the field renders depth of field:
   near-camera panels are large and soft, the focus plane is crisp, the far field recedes into haze. */
const TEAL = '#2FE0B8', WHITE = '#E5E7EB', GREY = '#8E99A8', ROSE = '#FF7A90', AMBER = '#F5B942';
const PW = 768, PH = 384, K = PW / 512;   // drawn at 1.5× the original layout for crisp mid-field panels at 1440p
function primitiveCanvas(kind, seed) {
  let s = seed * 9301 + 49297; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const c = document.createElement('canvas'); c.width = PW; c.height = PH; const g = c.getContext('2d');
  g.scale(K, K); const W = 512, H = 256;
  g.lineCap = 'round'; g.font = '500 30px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
  if (kind === 'candles') { let p = 150; const n = 12 + Math.floor(r() * 6), w = (W - 40) / n;
    for (let i = 0; i < n; i++) { const o = p, c2 = p + (r() - 0.46) * 46, hi = Math.min(o, c2) - r() * 22, lo = Math.max(o, c2) + r() * 22, up = c2 < o, x = 20 + i * w + w / 2;
      g.strokeStyle = g.fillStyle = up ? TEAL : GREY; g.lineWidth = 3; g.beginPath(); g.moveTo(x, hi); g.lineTo(x, lo); g.stroke(); g.fillRect(x - w * 0.3, Math.min(o, c2), w * 0.6, Math.max(4, Math.abs(c2 - o))); p = Math.min(215, Math.max(40, c2)); }
    g.fillStyle = GREY; g.font = '600 20px Inter, system-ui, sans-serif'; g.fillText(['EURUSD · 1m', 'XAUUSD · 5m', 'XAUUSD · 1m · DEMO'][seed % 3], 20, 18); }
  else if (kind === 'volume') { const n = 26, w = (W - 30) / n; for (let i = 0; i < n; i++) { const h = 20 + r() ** 2 * 190; g.fillStyle = r() < 0.5 ? 'rgba(47,224,184,0.8)' : 'rgba(142,153,168,0.7)'; g.fillRect(15 + i * w, H - 12 - h, w * 0.7, h); } }
  else if (kind === 'ladder') { g.font = '500 24px Inter, system-ui, sans-serif'; for (let i = 0; i < 8; i++) { const y = 20 + i * 30, px = (4328.9 - i * 0.1).toFixed(2), bid = i >= 4, bw = 40 + r() * 260;
      g.fillStyle = bid ? 'rgba(47,224,184,0.28)' : 'rgba(255,122,144,0.24)'; g.fillRect(150, y - 11, bw, 22); g.fillStyle = bid ? TEAL : '#C9D4E3'; g.fillText(px, 14, y); g.fillStyle = GREY; g.fillText(String(Math.floor(r() * 90 + 5)), 170 + bw, y); } }
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
  else if (kind === 'headline') { const hs = ['GOLD HOLDS 4,300 AHEAD OF CPI', 'FED SPEAKER: “DATA DEPENDENT”', 'DOLLAR FIRMS AS YIELDS RISE', 'RISK APPETITE FADES INTO THE CLOSE', 'FED HOLDS — DOTS SHIFT HAWKISH', 'DXY TESTS 104.5 RESISTANCE'];
    g.font = '600 30px Inter, system-ui, sans-serif'; g.fillStyle = WHITE; g.fillText(hs[seed % hs.length], 14, 110); g.fillStyle = GREY; g.font = '500 22px Inter, system-ui, sans-serif'; g.fillText('09:31 · MARKETS · DEMO', 14, 160); g.fillStyle = TEAL; g.fillRect(14, 60, 60, 4); }
  else if (kind === 'ticks') { g.font = '500 26px Inter, system-ui, sans-serif'; for (let i = 0; i < 6; i++) { const up = r() < 0.55; g.fillStyle = up ? TEAL : GREY; g.fillText(`09:31:0${i}.${String(Math.floor(r() * 999)).padStart(3, '0')}   ${(4328.3 + r() * 0.6).toFixed(2)}  ${up ? '▲' : '▼'}`, 14, 26 + i * 40); } }
  else if (kind === 'sparkline') { g.strokeStyle = WHITE; g.lineWidth = 3; g.beginPath(); let y = 150; for (let x = 10; x < W - 10; x += 8) { y = Math.min(230, Math.max(30, y + (r() - 0.49) * 22)); x === 10 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); g.fillStyle = TEAL; g.font = '600 26px Inter, system-ui, sans-serif'; g.fillText(['EURUSD 1.0842', 'BTCUSD 64,120', 'DXY 104.2', 'USDJPY 149.62', 'US10Y 4.21%', 'GBPUSD 1.2710'][seed % 6], 12, 24); }
  else if (kind === 'macd') { const n = 34, w = (W - 30) / n; let v = -0.4; g.fillStyle = GREY; g.font = '600 20px Inter, system-ui, sans-serif'; g.fillText('MACD 12,26,9', 14, 22);
    for (let i = 0; i < n; i++) { v += (r() - 0.42) * 0.22; v = Math.max(-1, Math.min(1, v)); const h = v * 80; g.fillStyle = v > 0 ? 'rgba(47,224,184,0.8)' : 'rgba(142,153,168,0.7)'; g.fillRect(15 + i * w, h > 0 ? 150 - h : 150, w * 0.7, Math.abs(h)); }
    g.strokeStyle = 'rgba(229,231,235,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(10, 150); g.lineTo(W - 10, 150); g.stroke(); }
  else if (kind === 'session') { g.font = '600 24px Inter, system-ui, sans-serif'; const rows = [['SESSION', 'LONDON · NY OVERLAP'], ['SPREAD', '0.40'], ['ATR 14', '3.9'], ['ADX 14', '27'], ['VWAP', '4,324.10']];
    rows.forEach(([k, v], i) => { const y = 34 + i * 46; g.fillStyle = GREY; g.fillText(k, 14, y); g.fillStyle = i === 0 ? TEAL : WHITE; g.fillText(v, 170, y); }); }
  else if (kind === 'wire') { g.font = '500 22px Inter, system-ui, sans-serif'; const rows = [['09:30', 'FED’S WALLER: NO RUSH TO CUT'], ['09:28', 'US 10Y YIELD +4BP TO 4.21%'], ['09:26', 'DXY EXTENDS GAINS, 104.2'], ['09:21', 'GOLD BIDS RETURN NEAR 4,300'], ['09:15', 'ECB’S LANE: INFLATION ON TRACK']];
    rows.forEach(([tm, h], i) => { const y = 30 + i * 48; g.fillStyle = i === 0 ? AMBER : GREY; g.fillText(tm, 14, y); g.fillStyle = i === 0 ? WHITE : '#C9D4E3'; g.fillText(h, 96, y); }); }
  return c;
}
function blurred(src, px) { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'); g.filter = `blur(${px}px)`; g.drawImage(src, 0, 0); if (g.filter === 'none') { g.globalAlpha = 0.5; for (const [dx, dy] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) g.drawImage(src, dx, dy); } return c; }
const tex2 = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
function textCanvas(txt, px, weight, color = WHITE) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), f = `${weight} ${px}px Inter, system-ui, sans-serif`;
  g.font = f; c.width = Math.ceil(g.measureText(txt).width + px * 0.6); c.height = Math.ceil(px * 1.4); g.font = f; g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(txt, px * 0.3, c.height / 2); return c;
}

/* ------------------------------------------------------------------ the world */
export async function createMarket(canvas, opt) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('WebGL unavailable');
  renderer.setClearColor(BG, 1); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  try { await Promise.all(['500 72px Inter', '600 72px Inter', '700 72px Inter'].map(f => document.fonts.load(f))); } catch { /* fallback fonts */ }

  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(BG, 0.045);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 200);
  const mobile = opt.mobile;

  /* far haze: a sparse, very faint depth cue (no star field) */
  const haze = (() => {
    const n = mobile() ? 220 : 520, pos = new Float32Array(n * 3), al = new Float32Array(n); let s = 4242; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) { pos[i * 3] = (r() - 0.5) * 60; pos[i * 3 + 1] = (r() - 0.5) * 34; pos[i * 3 + 2] = -(16 + r() * 50); al[i] = 0.05 + r() * 0.14; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uPx: { value: 2 } },
      vertexShader: 'attribute float aAlpha; uniform float uPx; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPx; vA = aAlpha; }',
      fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(0.62, 0.68, 0.76, vA * (1.0 - smoothstep(0.15, 0.5, d))); }' });
    const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); return p;
  })();

  /* MARKET FIELD: panels at depth, wrapped along the camera's path so the visitor travels through them */
  const KINDS = ['candles', 'calendar', 'volume', 'ladder', 'headline', 'yield', 'structure', 'ticks', 'sparkline', 'depth', 'macd', 'session', 'wire', 'sparkline', 'headline'];
  const SPAN = 14, NEAR = 0.32;
  const PRIM = [];
  { const texCache = {}, n = mobile() ? 26 : 46; let sd = 7; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < n; k++) {
      const kind = KINDS[k % KINDS.length], variant = Math.floor(k / KINDS.length) % 3 + (kind === 'sparkline' && k % 2 ? 3 : 0) + (kind === 'headline' && k % 2 ? 3 : 0), key = kind + variant;
      if (!texCache[key]) { const c = primitiveCanvas(kind, variant + 1); texCache[key] = [tex2(c), tex2(blurred(c, 10))]; }
      const h = 0.3 + r() * 0.36, mk = map => new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0, fog: false }));
      const sharp = mk(texCache[key][0]), soft = mk(texCache[key][1]); for (const sp of [sharp, soft]) { sp.scale.set(h * 2, h, 1); scene.add(sp); }
      // lateral placement keeps a calmer corridor where REX and the hero type will live
      const ang = r() * Math.PI * 2, rad = 0.62 + r() * 1.55;
      PRIM.push({ sharp, soft, kind, variant, w: h * 2, h, d0: r(), x: Math.cos(ang) * rad * 1.9, y: Math.sin(ang) * rad * 0.82, speed: 0.75 + r() * 0.5, sig: kind === 'candles' && variant === 1 ? 'chart' : kind === 'calendar' && variant === 0 ? 'calendar' : null });
    } }
  const sigChart = PRIM.find(p => p.sig === 'chart'), sigCal = PRIM.find(p => p.sig === 'calendar');

  /* text fragments: prices, tickers, indicator readings — at depth, same travel */
  const FR = opt.fragments.map((t, k) => {
    const sharpC = textCanvas(t, 72, k % 5 === 0 ? 600 : 500, k % 9 === 3 ? TEAL : WHITE), s1 = tex2(sharpC), s2 = tex2(blurred(sharpC, 7));
    const mk = map => new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0, fog: false }));
    const h = 0.085 + ((k * 37) % 11) / 11 * 0.08, a = sharpC.width / sharpC.height, sharp = mk(s1), soft = mk(s2);
    for (const sp of [sharp, soft]) { sp.scale.set(h * a, h, 1); scene.add(sp); }
    const ang = (k * 2.399) % (Math.PI * 2), rad = 0.5 + ((k * 53) % 17) / 17 * 1.7;
    return { sharp, soft, w: h * a, h, d0: fract(k * 0.618), x: Math.cos(ang) * rad * 1.9, y: Math.sin(ang) * rad * 0.85, speed: 0.8 + ((k * 13) % 7) / 14 };
  });

  /* near-field hero numbers: huge, soft, passing the lens (depth cue + financial weight) */
  const HERO = [['4328.50', -0.55, 0.32, 0.0], ['DXY 104.2', 0.95, -0.42, 0.33], ['CPI', -1.05, -0.5, 0.58], ['US10Y +4bp', 1.15, 0.5, 0.8]].map(([t, x, y, d0]) => {
    const c = textCanvas(t, 160, 600, '#C9D4E3'), mk = map => new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0, fog: false }));
    const sp = mk(tex2(blurred(c, 6))), h = 0.42; sp.scale.set(h * c.width / c.height, h, 1); scene.add(sp); return { sp, x, y, d0 };
  });

  /* opening: isolated numbers appear one at a time in the dark (time-based, before the noise floods in) */
  const OPEN = [['4328.50', -0.35, 0.12, 2.6, 0.24], ['XAUUSD', 1.05, -0.3, 4.6, 0.19], ['CPI', -1.2, 0.42, 5.6, 0.26],
    ['4,328.50', -1.45, 0.95, 6.4, 0.42], ['US10Y +4bp', 2.2, 0.2, 7.6, 0.3], ['EURUSD', -1.1, -0.55, 9.0, 0.32], ['VOL ▲ 2.4×', 1.5, -0.8, 10.2, 0.3],
    ['Fed speaker: “data dependent”', -2.6, 0.95, 11.4, 0.28], ['09:31:07', 2.9, 1.0, 12.6, 0.3], ['HH · HL · BOS', 0.3, -1.25, 13.8, 0.32]].map(([t, x, y, z, h]) => {
    const c = textCanvas(t, 80, 500), sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex2(c), transparent: true, depthWrite: false, opacity: 0 }));
    sp.scale.set(h * c.width / c.height, h, 1); sp.position.set(x, y, -z); scene.add(sp); return sp;
  });

  /* OBSERVATION LINE: corner brackets that hold what FOXREX attends to, and the amber attention glint */
  const bracketMat = new THREE.LineBasicMaterial({ color: '#9FF5DF', transparent: true, opacity: 0, depthWrite: false });
  const bracket = new THREE.LineSegments(new THREE.BufferGeometry(), bracketMat); bracket.frustumCulled = false; bracket.renderOrder = 5; scene.add(bracket);
  function setBracket(x, y, z, w, h, a) { const c = Math.min(w, h) * 0.16, X0 = x - w / 2, X1 = x + w / 2, Y0 = y - h / 2, Y1 = y + h / 2, v = [];
    for (const [px, py, sx, sy] of [[X0, Y0, 1, 1], [X1, Y0, -1, 1], [X0, Y1, 1, -1], [X1, Y1, -1, -1]]) v.push(px, py, z, px + sx * c, py, z, px, py, z, px, py + sy * c, z);
    bracket.geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); bracketMat.opacity = a; bracket.visible = a > 0.005; }
  const pathMat = new THREE.LineBasicMaterial({ color: '#F5C46A', transparent: true, opacity: 0, depthWrite: false });
  const path = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), pathMat); path.frustumCulled = false; path.renderOrder = 5; scene.add(path);

  /* REX: externally produced Higgsfield REX-MASTER footage, composited at depth (never procedural) */
  const rex = await createRexLayer({ THREE, scene, renderer, bg: BG, manifestUrl: opt.rexManifest, keyOverride: opt.keyOverride, rm: opt.rm });

  /* ------------------------------------------------------------------ frame */
  let W = 1, H = 1, dpr = 1;
  function resize(w, h, pr) { W = w; H = h; dpr = pr; renderer.setPixelRatio(pr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); haze.material.uniforms.uPx.value = 2 * pr; rex.resize(w * pr, h * pr); }
  const focusState = { d: 5.5 }, attn = { k: -1, until: 0 };
  function placeDOF(sharp, soft, x, y, d, w, h, a, focusD, ap, grow = 1) {
    const coc = Math.abs(d - focusD) * ap, b = smooth(0.1, 0.65, coc), fog = Math.exp(-0.0022 * d * d * d);
    sharp.position.set(x, y, -d); soft.position.set(x, y, -d); sharp.scale.set(w, h, 1); soft.scale.set(w * grow, h * grow, 1);
    const A = a * fog; sharp.material.opacity = A * (1 - b); soft.material.opacity = A * b * 0.92;
    sharp.visible = sharp.material.opacity > 0.006; soft.visible = soft.material.opacity > 0.006;
  }

  /* s: { t, travel, field, focus, aperture, select, selectA, chartAnchor, calActor, intro, openOn, heroA, fragA, camX, camY, rex: [...] } */
  function frame(s) {
    camera.position.set(s.camX || 0, s.camY || 0, 0); camera.lookAt(s.camX * 0.35 || 0, s.camY * 0.35 || 0, -100);
    renderer.toneMappingExposure = s.exposure ?? 1;
    const A = W / H, ap = s.aperture;
    // focus: breathing in the noise; attention catches one panel at a time and lets it go
    let fTarget = s.focus;
    if (s.breathe > 0) {
      fTarget = lerp(s.focus, 4.2 + Math.sin(s.t * 0.31) * 1.3 + Math.sin(s.t * 0.17 + 1.3) * 0.6, s.breathe);
      if (s.t > attn.until) { attn.k = (attn.k + 7) % PRIM.length; attn.until = s.t + 4.2; }
    }
    focusState.d = lerp(focusState.d, fTarget, 0.06);
    const fD = focusState.d;
    // primitives
    for (let k = 0; k < PRIM.length; k++) {
      const p = PRIM[k];
      let d = NEAR + fract(p.d0 - s.travel * 0.07 * p.speed / SPAN * 14 - s.t * 0.012 * p.speed * s.drift) * SPAN;
      let a = s.field * smooth(SPAN, SPAN - 3.5, d - NEAR) * smooth(0.28, 1.2, d) * 0.6;
      let x = p.x * Math.max(1, A / 1.6), y = p.y, w = p.w, h = p.h, grow = d < 1.2 ? 1 + (1.2 - d) * 0.3 : 1, focusD = fD;
      // a focus "catch" during the noise: one panel sharpens briefly
      if (s.breathe > 0 && k === attn.k && d > 2.2 && d < 8) { focusD = lerp(fD, d, s.breathe * smooth(0, 1, (attn.until - s.t) / 4.2) * 0.85); a *= 1 + 0.35 * s.breathe; }
      // gaze selection (02C): the chart REX looks at settles left of centre, in focus; the rest dims and softens
      if (p === sigChart && s.select > 0) { const an = s.chartAnchor; x = lerp(x, an[0] * A, s.select); y = lerp(y, an[1], s.select); d = lerp(d, an[2], s.select); w = lerp(w, an[3], s.select); h = w / 2; a = lerp(a, s.selectA, s.select); focusD = lerp(focusD, d, s.select); }
      else if (s.select > 0) a *= 1 - 0.78 * s.select;
      // the calendar actor (02B): crosses between camera and REX, close and soft
      if (p === sigCal && s.calActor) { const c = s.calActor; x = c.x * A; y = c.y; d = c.d; w = c.w; h = w / 2; a = c.a; }
      placeDOF(p.sharp, p.soft, x, y, d, w, h, a, focusD, ap, grow);
      p.cur = { x, y, d, w, h, a };
    }
    // fragments
    for (const f of FR) {
      const d = NEAR + fract(f.d0 - s.travel * 0.07 * f.speed / SPAN * 14 - s.t * 0.012 * f.speed * s.drift) * SPAN;
      const a = s.fragA * smooth(SPAN, SPAN - 3, d - NEAR) * smooth(0.3, 1.0, d) * 0.75 * (1 - 0.8 * s.select);
      placeDOF(f.sharp, f.soft, f.x * Math.max(1, A / 1.6), f.y, d, f.w, f.h, a, fD, ap);
    }
    // near-field hero numbers
    for (const hn of HERO) { const d = 0.35 + fract(hn.d0 - s.travel * 0.05 - s.t * 0.004 * s.drift) * 4.2, a = s.heroA * smooth(0.35, 0.9, d) * (1 - smooth(2.6, 4.4, d)) * 0.5;
      hn.sp.position.set(hn.x * A * 0.6, hn.y, -d); hn.sp.material.opacity = a; hn.sp.visible = a > 0.004; }
    // opening isolated numbers
    OPEN.forEach((sp, k) => { const t0 = k < 3 ? 0.7 + k * 0.95 : 8.0 + (k - 3) * 0.55, a = s.openOn ? smooth(t0, t0 + 0.6, s.intro) * (k < 3 ? 1 - smooth(3.4, 4.1, s.intro) : 1) : 0; sp.material.opacity = a * s.openA; sp.visible = sp.material.opacity > 0.005; });
    // observation brackets + attention path from REX's eye to the selected chart
    if (s.select > 0.02 && sigChart.cur) { const c = sigChart.cur; setBracket(c.x, c.y, -c.d, c.w * 1.06, c.h * 1.12, s.select * 0.85); }
    else bracketMat.opacity = 0, bracket.visible = false;
    const eye = rex.eyeWorld();
    if (eye && s.pathA > 0.01 && sigChart.cur) { const c = sigChart.cur; path.geometry.setFromPoints([eye, new THREE.Vector3(c.x + c.w * 0.52, c.y + c.h * 0.08, -c.d)]); pathMat.opacity = s.pathA * 0.4; path.visible = true; } else path.visible = false;
    // REX shots
    rex.update(s.rex || [], s.t, camera, scene);
    renderer.render(scene, camera);
  }
  return { renderer, resize, frame, rex, get dpr() { return dpr; }, chartRect: () => sigChart.cur };
}
