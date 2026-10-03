/* FOXREX — experience v2, first implementation gate: 01 MARKET NOISE → 02 REX OBSERVES.
   One continuous market world; scroll is the film's timeline. The same market objects exist throughout:
   noise first, then attention. REX is the Higgsfield REX-MASTER character composited into the market
   (js/rex-layer.js) — never drawn procedurally. Scenes 03–06 are not built until the owner approves this gate.
   Data: every market value is DEMO / CINEMATIC DATA and is labelled on screen. */
import { FRAGMENTS } from './demo-data.js';
import { T, LANG } from './copy.js';
import { Sound } from './sound.js';

const params = new URLSearchParams(location.search);
const NO_ADAPT = params.get('adapt') === '0';                 // QA: freeze quality for review screenshots
const KEY = ['luma', 'alpha', 'packed'].includes(params.get('key')) ? params.get('key') : null;   // review: compare REX key pipelines
// review only: a same-origin manifest override for pipeline tests (?review=1&rex=path/to/manifest.json)
const REX_MANIFEST = params.get('review') === '1' && /^[\w./-]+\.json$/.test(params.get('rex') || '') && !(params.get('rex') || '').includes('..') ? new URL(params.get('rex'), location.href).href : new URL('../assets/rex/rex-assets.json', import.meta.url).href;
const RM = params.get('motion') === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
/* review-only framing controls, used by /experience/rex-review/ to show a REX candidate in context:
   embed=1 (no review panel) · p=<0..1> lock the film at a moment · exp=<x> exposure · zoom=<x> close crop on REX's
   eyes · focusrex=1 focus pulled to REX, no fog · chrome=0 world only (the DEMO label stays) · dpr=<x> cap */
const REVIEW = params.get('review') === '1';
const num = (k, d, a, b) => (REVIEW && params.has(k) && isFinite(+params.get(k)) ? Math.min(b, Math.max(a, +params.get(k))) : d);
const RV = { embed: REVIEW && params.get('embed') === '1', lockP: num('p', null, 0, 1), exp: num('exp', 1, 0.1, 3), zoom: num('zoom', 1, 1, 6),
  focusRex: REVIEW && params.get('focusrex') === '1', bare: REVIEW && params.get('chrome') === '0', dpr: num('dpr', null, 0.5, 2) };
const root = document.documentElement, $ = s => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const ease = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const band = (p, a0, a1, b0, b1) => smooth(a0, a1, p) * (1 - smooth(b0, b1, p));
function piece(p, pts) { for (let k = 1; k < pts.length; k++) if (p <= pts[k][0]) { const [p0, v0] = pts[k - 1], [p1, v1] = pts[k]; return lerp(v0, v1, (p - p0) / (p1 - p0)); } return pts.at(-1)[1]; }

/* ------------------------------------------------------------------ timeline (global progress p ∈ [0, 1]) */
const SCENES = [{ id: 'noise', a: 0, b: 0.5 }, { id: 'observe', a: 0.5, b: 1.001 }];
const MOMENTS = [   // owner review moments (?review=1)
  ['01A', 'Market noise', 0.13], ['01B', 'Eyes appear', 0.47], ['02A', 'Eyes behind the market', 0.585], ['02B', 'Partial face', 0.75], ['02C', 'Three-quarter REX', 0.93]
];
/* camera travel through the field: steady in the noise, slowing as something becomes visible, almost still while REX observes */
const TRAVEL = [[0, 0], [0.38, 16], [0.5, 18.4], [0.66, 19.6], [0.84, 20.4], [1, 20.8]];

let W = 0, H = 0, A = 1, MOBILE = false, DPR = 1, dprLive = 1;
let GL = null, introT = 0, frameMs = 16.7, vsync = 16.7, t0 = 0, last = 0;
const cur = { p: 0, target: 0, k: 0 };
const pointer = { x: 0, y: 0 };
const el = {};

/* screen-relative placement for REX shots: x as a fraction of the frame width, height as a fraction of the frame height */
const sx = (d, frac) => (frac - 0.5) * 2 * A * d / 3, sy = (d, frac) => (0.5 - frac) * 2 * d / 3, sh = (d, frac) => frac * 2 * d / 3;

function rexShots(p, focusD, ap) {
  const out = [], P = id => (GL.rex.placeOf && GL.rex.placeOf(id)) || {};
  const blurFor = d => clamp(Math.abs(d - focusD) * ap * 0.012, 0, 0.012);
  // R-01 · eyes in darkness: deep behind the calendar at the end of the noise, then held behind the passing market
  { const a = smooth(0.4, 0.47, p) * (1 - smooth(0.655, 0.69, p)), d = lerp(10.5, 6.6, smooth(0.4, 0.69, p)), pl = P('R-01');
    out.push({ id: 'R-01', a: a * (pl.a ?? 1), d, x: sx(d, pl.x ?? 0.55), y: sy(d, pl.y ?? 0.44), h: sh(d, lerp(pl.h0 ?? 0.42, pl.h1 ?? 0.56, smooth(0.4, 0.69, p))), blur: blurFor(d), refl: 0.35, fog: clamp((d - 6) * 0.05, 0, 0.25), expo: pl.expo ?? 1.05 }); }
  // R-02 · partial face: right third, slow push-in; the calendar actor crosses in front during the cut
  { const a = smooth(0.665, 0.7, p) * (1 - smooth(0.795, 0.83, p)), u = smooth(0.66, 0.84, p), d = lerp(5.0, 3.7, u), pl = P('R-02');
    out.push({ id: 'R-02', a: a * (pl.a ?? 1), d, x: sx(d, pl.x ?? 0.68), y: sy(d, pl.y ?? 0.5), h: sh(d, pl.h ?? 1.04), blur: blurFor(d), refl: 0.45, fog: 0, expo: pl.expo ?? 1.0 }); }
  // R-03 · three-quarter, jacket visible: right third, observing the chart at screen-left
  { const a = smooth(0.79, 0.835, p), d = lerp(3.9, 3.65, smooth(0.79, 1, p)), pl = P('R-03');
    out.push({ id: 'R-03', a: a * (pl.a ?? 1), d, x: sx(d, pl.x ?? 0.7), y: sy(d, pl.y ?? 0.52), h: sh(d, pl.h ?? 1.0), blur: blurFor(d), refl: 0.4, fog: 0, expo: pl.expo ?? 1.0 }); }
  return out;
}

function state(t, p) {
  const intro = introT, top = p < 0.012;
  const introField = smooth(8.4, 11.5, intro), scrolled = smooth(0.0, 0.03, p);
  const field = Math.max(introField, scrolled);
  const breathe = 1 - smooth(0.4, 0.5, p);
  // focus: wanders through the noise → pulls deep to the eyes → holds REX → settles on the chart REX looks at
  const focus = piece(p, [[0, 5.2], [0.4, 5.2], [0.47, 9.0], [0.62, 7.4], [0.7, 4.6], [0.84, 3.8], [0.9, 3.35], [1, 3.35]]);
  const aperture = piece(p, [[0, 0.23], [0.45, 0.23], [0.55, 0.26], [0.8, 0.2], [1, 0.2]]);
  const select = RM ? (p > 0.84 ? 1 : 0) : smooth(0.82, 0.9, p);
  const cu = smooth(0.635, 0.775, p);
  const calActor = p > 0.62 && p < 0.79 ? { x: lerp(0.85, -0.55, cu), y: -0.08, d: lerp(1.9, 1.35, cu), w: 1.7, a: Math.sin(Math.PI * cu) * 0.75 } : null;
  let fFocus = focus, breatheK = RM ? 0 : breathe;
  if (RV.focusRex) {   // review: pull focus to the most visible REX shot and stop the breathing
    const main = rexShots(p, focus, aperture).filter(e => e.a > 0.01).sort((x, y) => y.a - x.a)[0];
    if (main) { fFocus = main.d; breatheK = 0; }
  }
  const s = {
    t, intro, openOn: top, openA: top ? 1 : 0, zoom: RV.zoom,
    travel: RM ? piece(p, TRAVEL) : piece(p, TRAVEL) + (top ? ease(clamp(intro / 11)) * 1.2 : 1.2),
    drift: RM ? 0 : lerp(1, 0.35, smooth(0.38, 0.55, p)),
    field: field * (1 - 0.15 * smooth(0.5, 0.62, p)), fragA: field * (1 - 0.35 * smooth(0.45, 0.6, p)), heroA: scrolled * (1 - smooth(0.4, 0.55, p)),
    breathe: breatheK, focus: fFocus, aperture, select, selectA: 0.95, chartAnchor: [-0.3, 0.3, 3.35, 0.92], calActor,
    pathA: smooth(0.87, 0.93, p), exposure: RV.exp,
    camX: RM ? 0 : Math.sin(t * 0.07) * 0.05 + pointer.x * 0.04, camY: RM ? 0 : Math.sin(t * 0.05) * 0.025 - pointer.y * 0.025
  };
  s.rex = rexShots(p, fFocus, aperture);
  if (RV.exp !== 1 || RV.focusRex) for (const e of s.rex) { e.expo *= RV.exp; if (RV.focusRex) e.fog = 0; }   // custom REX shader is not tone-mapped
  return s;
}

/* ------------------------------------------------------------------ frame */
function frame(now) {
  const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; introT += dt;
  frameMs = frameMs * 0.92 + Math.min(100, dt * 1000) * 0.08;
  if (RV.lockP !== null) { cur.p = cur.target = RV.lockP; if (RV.lockP > 0.012) introT = Math.max(introT, 12); }
  else {
    cur.target = clamp(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight));
    cur.p = RM ? cur.target : cur.p + (cur.target - cur.p) * (1 - Math.pow(0.002, dt));
  }
  const k = cur.p < SCENES[1].a ? 0 : 1; if (k !== cur.k) { cur.k = k; document.body.dataset.scene = SCENES[k].id; }
  GL.frame(state(t, cur.p));
  updateDom(cur.p);
  if (!NO_ADAPT) adapt(now);
  requestAnimationFrame(frame);
}

/* adaptive quality: resolution follows the measured frame time relative to the display refresh (hysteresis) */
let adaptAt = 0, goodSince = 0;
function adapt(now) {
  if (now < 3000 || now - adaptAt < 1200) return;
  const budget = Math.max(vsync, 16.7);
  if (frameMs > budget * 1.35 && dprLive > 1) { dprLive = Math.max(1, +(dprLive - 0.25).toFixed(2)); GL.resize(W, H, dprLive); adaptAt = now; goodSince = now; }
  else if (frameMs < budget * 1.08 && dprLive < DPR) { if (now - goodSince > 4000) { dprLive = Math.min(DPR, +(dprLive + 0.25).toFixed(2)); GL.resize(W, H, dprLive); adaptAt = now; goodSince = now; } }
  else goodSince = now;
}

/* ------------------------------------------------------------------ DOM: typography above the world */
function buildDom() {
  document.querySelectorAll('[data-t]').forEach(n => { const v = n.dataset.t.split('.').reduce((o, k) => o?.[k], T); if (typeof v === 'string') n.textContent = v; });
  const ov = $('#xp-overlay');
  const st = (a, b, html, cls) => `<p class="st ${cls}" data-a="${a}" data-b="${b}">${html}</p>`;
  ov.insertAdjacentHTML('beforeend',
    st(0.045, 0.205, T.noise1, 'st--hero') + st(0.215, 0.42, T.noise2, 'st--hero st--quiet') +
    st(0.84, 1.02, `<span>${T.observe2[0]}</span><span class="st-q">${T.observe2[1]}</span>`, 'st--hero st--observe'));
  el.st = [...ov.querySelectorAll('.st')].map(n => ({ n, a: +n.dataset.a, b: +n.dataset.b }));
  el.hint = $('#xp-hint'); el.rail = $('#xp-rail'); el.railNum = $('#xp-rail-num'); el.railName = $('#xp-rail-name'); el.nav = $('#xp-nav');
}
function updateDom(p) {
  for (const s of el.st) {
    const u = (p - s.a) / (s.b - s.a), o = u <= 0 || u >= 1 ? 0 : Math.min(smooth(0, 0.18, u), 1 - smooth(0.82, 1, u));
    if (o <= 0.001) { if (s.n._o !== 0) { s.n.style.opacity = 0; s.n._o = 0; } continue; }
    s.n._o = o; s.n.style.opacity = o.toFixed(3);
    if (!RM) { s.n.style.transform = `translate3d(0, ${((0.5 - u) * 24).toFixed(1)}px, 0) scale(${(0.97 + o * 0.03).toFixed(4)})`; s.n.style.filter = o < 0.98 ? `blur(${((1 - o) * 6).toFixed(1)}px)` : 'none'; }
  }
  el.hint.classList.toggle('show', p < 0.01 && introT > 10);
  el.nav.style.setProperty('--nav', (0.18 + smooth(0.08, 0.2, p) * 0.5).toFixed(3));
  el.railNum.textContent = String(cur.k + 1).padStart(2, '0'); el.railName.textContent = T.scenes2[cur.k];
  el.rail.style.setProperty('--prog', p.toFixed(4));
}

/* ------------------------------------------------------------------ sizing + boot */
function resize() {
  W = innerWidth; H = innerHeight; A = W / H; MOBILE = W < 760;
  DPR = Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2, RV.dpr || 2); dprLive = Math.min(dprLive || DPR, DPR);
  GL.resize(W, H, dprLive);
  document.getElementById('xp-scroll').style.height = (MOBILE ? 700 : 900) + 'vh';
}
function measureVsync() { return new Promise(res => { let n = 0, a = 0; const f = ts => { if (!a) a = ts; if (++n < 30) requestAnimationFrame(f); else res((ts - a) / 29); }; requestAnimationFrame(f); }); }

async function boot() {
  if (LANG === 'ar') { root.lang = 'ar'; root.dir = 'rtl'; }
  const { createMarket } = await import('./market.js');
  GL = await createMarket(document.getElementById('xp-gl'), { fragments: FRAGMENTS, mobile: () => MOBILE, rm: RM, keyOverride: KEY, rexManifest: REX_MANIFEST });
  root.classList.add('xp-gl');
  dprLive = Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1.5 : 2);
  resize(); buildDom();
  addEventListener('resize', resize, { passive: true });
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; } }, { passive: true });
  $('#xp-sound').addEventListener('click', ev => { const on = Sound.toggle(); ev.currentTarget.setAttribute('aria-pressed', on); ev.currentTarget.querySelector('[data-state]').textContent = on ? T.on : T.off; });
  root.classList.add('xp-ready'); if (RM) root.classList.add('xp-rm');
  if (RV.bare) root.classList.add('xp-bare'); if (RV.embed) root.classList.add('xp-embed');
  window.FOXREX_XP = { state: () => ({ p: cur.p, target: cur.target, id: SCENES[cur.k].id, gl: true, dpr: dprLive, frameMs, intro: introT, rex: GL.rex.info() }) };
  if (REVIEW && !RV.embed) import('./review.js').then(m => m.mountReview({
    MOMENTS, renderer: GL.renderer,
    jump(p) { const max = document.documentElement.scrollHeight - innerHeight; scrollTo({ top: p * max, behavior: 'auto' }); cur.p = cur.target = p; if (p < 0.01) { introT = 0; } },
    info: () => ({ dpr: dprLive, dprMax: DPR, frameMs, vsync, mobile: MOBILE, rm: RM, scene: SCENES[cur.k].id, p: cur.p, rex: GL.rex.info() })
  })).catch(e => console.warn('review tools failed to load:', e.message));
  requestAnimationFrame(ts => { last = ts; t0 = ts; frame(ts); });
  measureVsync().then(v => { vsync = v; });
}
boot().catch(e => { root.classList.remove('xp-ready'); root.classList.add('xp-failed'); console.warn('FOXREX experience fallback:', e.message); });
