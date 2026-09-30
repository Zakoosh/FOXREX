/* FOXREX experience — OWNER REVIEW TOOLS (development only).
   Loaded exclusively with ?review=1. Scene navigator for the owner's visual review, plus objective renderer
   diagnostics and a full-journey benchmark measured on the actual machine. Not part of the experience. */

const MOMENTS = [
  ['01', 'Market noise', 'noise', 0.3],
  ['02', 'REX first contact', 'opening', 3.8],        // seconds into the intro: eyes arrive ~4.3 s, leave ~7–8 s
  ['03', 'Data formation (builds REX)', 'streams', 0.02],
  ['04', 'Technical vision', 'technical', 0.04],
  ['05', 'ML transformation', 'ml', 0.02],
  ['06', 'Reasoning chamber', 'reason', 0.02],
  ['07', 'Risk gate', 'risk', 0.2],
  ['08', 'Decision', 'decision', 0.2],
  ['09', 'Decision replay', 'replay', 0.3],
  ['10', 'Live intelligence', 'live', 0.3],
  ['11', 'Complete system', 'system', 0.5]
];
const EXTRA = [['REX', 'Observation (REX close)', 'observe', 0.45]];
const INSPECT = [['F', 'REX face (three-quarter)', 'face'], ['V', 'REX front', 'front'], ['S', 'REX silhouette (profile)', 'silhouette'], ['E', 'REX eyes (close)', 'eyes'], ['T', 'REX turntable', 'turn']];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];

const errors = [];
addEventListener('error', e => errors.push(String(e.message || e.error)));
addEventListener('unhandledrejection', e => errors.push('unhandled rejection: ' + String(e.reason && e.reason.message || e.reason)));
const _cerr = console.error; console.error = (...a) => { errors.push(a.map(String).join(' ')); _cerr.apply(console, a); };

function gpuInfo(renderer) {
  const out = { webgl: 'none', vendor: '—', renderer: '—', hardware: false, maxTexture: 0 };
  if (!renderer) return out;
  const gl = renderer.getContext();
  out.webgl = renderer.capabilities.isWebGL2 ? 'WebGL 2.0' : 'WebGL 1.0';
  out.version = gl.getParameter(gl.VERSION);
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  out.vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  out.renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  out.hardware = !/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen/i.test(out.renderer);
  out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  return out;
}
function browserName() {
  const b = navigator.userAgentData && navigator.userAgentData.brands;
  const brand = b && b.map(x => x.brand).find(x => !/not.?a.?brand|chromium/i.test(x));
  const m = navigator.userAgent.match(/(Edg|OPR|Chrome|Firefox|Version)\/([\d.]+)/);
  return (brand || (m && m[1].replace('Edg', 'Edge').replace('OPR', 'Opera').replace('Version', 'Safari')) || 'unknown') + (m ? ' ' + m[2] : '');
}
const heap = () => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
const pct = (arr, q) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))] || 0; };

export function mountReview(api) {
  const G = gpuInfo(api.renderer);
  const css = document.createElement('style');
  css.textContent = `
  .rv{position:fixed;z-index:9999;top:12px;right:12px;width:300px;max-height:calc(100vh - 24px);overflow:auto;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#cfd6e0;background:rgba(6,10,16,.88);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:10px 12px;backdrop-filter:blur(6px)}
  .rv h4{margin:8px 0 4px;font-size:10px;letter-spacing:.14em;color:#7f8a99;font-weight:600}.rv h4:first-child{margin-top:0}
  .rv button{all:unset;cursor:pointer;display:block;width:100%;box-sizing:border-box;padding:3px 6px;border-radius:4px;color:#e5e7eb}
  .rv button:hover,.rv button:focus-visible{background:rgba(0,212,167,.14);outline:none}.rv button.on{background:rgba(0,212,167,.22);color:#00D4A7}
  .rv button b{color:#00D4A7;font-weight:600;margin-right:6px}.rv kbd{color:#7f8a99;float:right}
  .rv dl{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;margin:0}.rv dt{color:#7f8a99}.rv dd{margin:0;word-break:break-word}
  .rv .ok{color:#00D4A7}.rv .bad{color:#ff5c7a}.rv .act{display:flex;gap:6px;margin-top:6px}.rv .act button{text-align:center;border:1px solid rgba(255,255,255,.16)}
  .rv pre{white-space:pre-wrap;margin:6px 0 0;color:#e5e7eb}.rv-min{width:auto}.rv-min .rv-body{display:none}
  .rv-inspect #xp-overlay,.rv-inspect .xp-demo{opacity:0!important;transition:none}
  .rv .tag{display:inline-block;padding:0 5px;border-radius:3px;background:#F5B942;color:#111;font-weight:700;margin-left:6px}`;
  document.head.appendChild(css);
  const box = document.createElement('aside'); box.className = 'rv'; box.setAttribute('aria-label', 'Owner review tools (development only)');
  const btn = (k, [n, label, id, u]) => `<button data-id="${id}" data-u="${u}"><b>${n}</b>${label}${k ? `<kbd>${k}</kbd>` : ''}</button>`;
  box.innerHTML = `<h4>OWNER REVIEW <span class="tag">DEV ONLY</span> <kbd>H hide</kbd></h4><div class="rv-body">
    <div>${MOMENTS.map((m, i) => btn(KEYS[i], m)).join('')}${EXTRA.map(m => btn('R', m)).join('')}</div><h4>REX INSPECTION</h4><div>${INSPECT.map(([k, label, mode]) => `<button data-inspect="${mode}"><b>REX</b>${label}<kbd>${k}</kbd></button>`).join('')}</div>
    <p style="margin:4px 0 0;color:#7f8a99">P play scene · ← / → fine-scrub</p>
    <h4>RENDERER</h4><dl id="rv-gpu"></dl>
    <h4>LIVE</h4><dl id="rv-live"></dl>
    <div class="act"><button id="rv-bench">Benchmark journey</button><button id="rv-copy">Copy report</button></div>
    <pre id="rv-out"></pre></div>`;
  document.body.appendChild(box);

  // P: play the current scene at cinematic pace (scroll-driven scenes, hands-free), again to stop
  let playing = null;
  function playScene() {
    if (playing) { cancelAnimationFrame(playing); playing = null; return; }
    const I = api.info(), S = api.SCENES.find(x => x.id === I.scene); if (!S) return;
    const max = document.documentElement.scrollHeight - innerHeight, from = scrollY / max, to = S.b - 0.001, dur = Math.max(4, (to - from) / (S.b - S.a) * 22) * 1000, t0 = performance.now();
    const step = now => { const u = Math.min(1, (now - t0) / dur); scrollTo(0, (from + (to - from) * u) * max); if (u < 1) playing = requestAnimationFrame(step); else playing = null; };
    playing = requestAnimationFrame(step);
  }
  const go = (id, u) => { api.jump(id, +u); document.documentElement.classList.remove('rv-inspect'); box.querySelectorAll('[data-id]').forEach(b => b.classList.toggle('on', b.dataset.id === id && b.dataset.u === String(u))); };
  box.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => go(b.dataset.id, b.dataset.u)));
  const insp = mode => { api.jump('observe', 0.45); api.inspect(mode); document.documentElement.classList.toggle('rv-inspect', !!mode); box.querySelectorAll('[data-id],[data-inspect]').forEach(b => b.classList.toggle('on', b.dataset.inspect === mode)); };
  box.querySelectorAll('[data-inspect]').forEach(b => b.addEventListener('click', () => insp(b.dataset.inspect)));
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    const i = KEYS.indexOf(e.key);
    if (i >= 0) { const m = MOMENTS[i]; go(m[2], m[3]); }
    else if (e.key === 'r' || e.key === 'R') go(EXTRA[0][2], EXTRA[0][3]);
    else if (e.key === 'h' || e.key === 'H') box.classList.toggle('rv-min');
    else if (e.key === 'p' || e.key === 'P') playScene();
    else if (INSPECT.some(x => x[0] === e.key.toUpperCase())) insp(INSPECT.find(x => x[0] === e.key.toUpperCase())[2]);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); scrollBy({ top: (e.key === 'ArrowRight' ? 1 : -1) * 0.004 * (document.documentElement.scrollHeight - innerHeight), behavior: 'auto' }); }
  });

  const env = () => ({ browser: browserName(), webgl: G.webgl, glVersion: G.version, gpuVendor: G.vendor, webglRenderer: G.renderer,
    hardwareAcceleration: api.renderer ? (G.hardware ? 'YES' : 'NO (software rasteriser)') : (new URLSearchParams(location.search).get('renderer') === '2d' ? 'NO (2D renderer forced by ?renderer=2d)' : 'NO (WebGL unavailable — 2D fallback)'),
    devicePixelRatio: devicePixelRatio, screen: `${screen.width}×${screen.height}`, viewport: `${innerWidth}×${innerHeight}`, maxTexture: G.maxTexture, cores: navigator.hardwareConcurrency });
  const E = env();
  box.querySelector('#rv-gpu').innerHTML = [['browser', E.browser], ['webgl', E.webgl], ['renderer', E.webglRenderer], ['vendor', E.gpuVendor],
    ['hardware', `<span class="${G.hardware ? 'ok' : 'bad'}">${E.hardwareAcceleration}</span>`], ['device px', E.devicePixelRatio], ['screen', E.screen], ['viewport', E.viewport]]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  if (api.renderer && !G.hardware) console.warn('[review] WebGL is running on a SOFTWARE rasteriser:', G.renderer, '— check chrome://gpu (hardware acceleration disabled, GPU blocklisted, or remote/VM session).');

  // live panel: fps over the last second, worst frame over the last 5 s
  const live = box.querySelector('#rv-live'); let frames = [], lastT = performance.now();
  (function tick(now) {
    frames.push([now, now - lastT]); lastT = now; while (frames.length && now - frames[0][0] > 5000) frames.shift();
    if (!tick.n || now - tick.n > 400) {
      tick.n = now; const I = api.info(), r = api.renderer && api.renderer.info, last1 = frames.filter(f => now - f[0] < 1000);
      const rows = [['fps', last1.length], ['worst 5s', Math.round(Math.max(...frames.map(f => f[1]))) + ' ms'], ['scene', `${I.scene} ${(I.lp * 100 | 0)}%`],
        ['dpr', `${I.dpr} / max ${I.dprMax}`], ['particles', I.N + (I.pTier < 1 ? ' (tier ↓)' : '')], ['refresh', (1000 / I.vsync).toFixed(0) + ' Hz est.'],
        ['draw calls', r ? r.render.calls : '—'], ['triangles', r ? r.render.triangles : '—'], ['gpu mem', r ? `${r.memory.geometries} geo · ${r.memory.textures} tex · ${r.programs ? r.programs.length : '?'} prog` : '—'],
        ['js heap', heap() != null ? heap() + ' MB' : 'n/a'], ['errors', `<span class="${errors.length ? 'bad' : 'ok'}">${errors.length}</span>`]];
      live.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    }
    requestAnimationFrame(tick);
  })(performance.now());

  // benchmark: scroll the complete journey at a steady pace and measure every frame
  let report = null; const out = box.querySelector('#rv-out');
  box.querySelector('#rv-bench').addEventListener('click', async () => {
    const DUR = 45000, max = document.documentElement.scrollHeight - innerHeight, ft = [], dprs = new Set(), heap0 = heap();
    const errs0 = errors.length; out.textContent = 'Benchmarking — 45 s, please do not touch the page…';
    api.jump('noise', 0); await new Promise(r => setTimeout(r, 800));
    const start = performance.now(); let prev = start;
    await new Promise(done => { (function step(now) {
      ft.push(now - prev); prev = now; const u = Math.min(1, (now - start) / DUR);
      scrollTo(0, (0.045 + u * 0.955) * max); dprs.add(api.info().dpr);
      if (u < 1) requestAnimationFrame(step); else done(); })(performance.now()); });
    const n = ft.length, avg = n / (DUR / 1000), I = api.info();
    report = { ...env(), when: new Date().toISOString(),
      avgFps: +avg.toFixed(1), p50FrameMs: +pct(ft, 0.5).toFixed(1), p99FrameMs: +pct(ft, 0.99).toFixed(1), onePercentLowFps: +(1000 / pct(ft, 0.99)).toFixed(1),
      worstFrameMs: +Math.max(...ft).toFixed(1), framesOver33ms: ft.filter(x => x > 33.4).length, framesOver50ms: ft.filter(x => x > 50).length, frames: n,
      estRefreshHz: +(1000 / I.vsync).toFixed(0), dprRange: [...dprs].sort(), dprEnd: I.dpr, dprMax: I.dprMax, particles: I.N, particleTierReduced: I.pTier < 1,
      adaptLog: I.adaptLog, jsHeapMB: heap0 != null ? [heap0, heap()] : 'n/a (Chrome only)', errorsDuringRun: errors.length - errs0, errorsTotal: errors.length, errorMessages: errors.slice(0, 5) };
    out.textContent = Object.entries(report).filter(([k]) => /Fps|Ms|over|dpr|particles|Heap|errors|Refresh|hardware|webglRenderer/.test(k)).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
    console.log('[FOXREX review] benchmark report', report);
  });
  box.querySelector('#rv-copy').addEventListener('click', async () => {
    const data = JSON.stringify(report || { ...env(), live: api.info(), errors }, null, 2);
    try { await navigator.clipboard.writeText(data); out.textContent = 'Report copied to clipboard.\n' + out.textContent; } catch { out.textContent = data; }
  });
  window.FOXREX_REVIEW = { env, report: () => report, errors: () => errors.slice() };
}
