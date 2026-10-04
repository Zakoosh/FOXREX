/* FOXREX experience — OWNER REVIEW TOOLS (development only).
   Loaded exclusively with ?review=1. Review moments for the 01 MARKET NOISE → 02 REX OBSERVES gate, REX asset
   status, key-pipeline comparison, objective renderer diagnostics and a journey benchmark on the actual machine. */

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
  const G = gpuInfo(api.renderer), params = new URLSearchParams(location.search);
  const css = document.createElement('style');
  css.textContent = `
  .rv{position:fixed;z-index:9999;top:12px;right:12px;width:300px;max-height:calc(100vh - 24px);overflow:auto;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#cfd6e0;background:rgba(6,10,16,.88);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:10px 12px;backdrop-filter:blur(6px)}
  .rv h4{margin:8px 0 4px;font-size:10px;letter-spacing:.14em;color:#7f8a99;font-weight:600}.rv h4:first-child{margin-top:0}
  .rv button,.rv a.b{all:unset;cursor:pointer;display:block;width:100%;box-sizing:border-box;padding:3px 6px;border-radius:4px;color:#e5e7eb}
  .rv button:hover,.rv button:focus-visible,.rv a.b:hover{background:rgba(0,212,167,.14);outline:none}.rv .on{background:rgba(0,212,167,.22);color:#00D4A7}
  .rv b{color:#00D4A7;font-weight:600;margin-right:6px}.rv kbd{color:#7f8a99;float:right}
  .rv dl{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;margin:0}.rv dt{color:#7f8a99}.rv dd{margin:0;word-break:break-word}
  .rv .ok{color:#00D4A7}.rv .bad{color:#ff5c7a}.rv .warn{color:#F5B942}.rv .act{display:flex;gap:6px;margin-top:6px}.rv .act button{text-align:center;border:1px solid rgba(255,255,255,.16)}
  .rv .row{display:flex;gap:4px}.rv .row a.b{text-align:center;border:1px solid rgba(255,255,255,.12)}
  .rv pre{white-space:pre-wrap;margin:6px 0 0;color:#e5e7eb}.rv-min{width:auto}.rv-min .rv-body{display:none}
  .rv .tag{display:inline-block;padding:0 5px;border-radius:3px;background:#F5B942;color:#111;font-weight:700;margin-left:6px}`;
  document.head.appendChild(css);
  const box = document.createElement('aside'); box.className = 'rv'; box.setAttribute('aria-label', 'Owner review tools (development only)');
  const keyLink = k => { const q = new URLSearchParams(location.search); if (k) q.set('key', k); else q.delete('key'); return '?' + q.toString(); };
  const curKey = params.get('key') || '';
  box.innerHTML = `<h4>OWNER REVIEW · 01 → 02 <span class="tag">DEV ONLY</span> <kbd>H hide</kbd></h4><div class="rv-body">
    <div>${api.MOMENTS.map(([n, label, p], i) => `<button data-p="${p}"><b>${n}</b>${label}<kbd>${i + 1}</kbd></button>`).join('')}</div>
    <p style="margin:4px 0 0;color:#7f8a99">P play to the end · ← / → fine-scrub</p>
    <h4>REX ASSETS (Higgsfield REX-MASTER)</h4><dl id="rv-rex"></dl>
    <h4>KEY PIPELINE</h4><div class="row">${[['', 'manifest'], ['luma', 'luma'], ['alpha', 'alpha'], ['packed', 'packed']].map(([k, l]) => `<a class="b ${k === curKey ? 'on' : ''}" href="${keyLink(k)}">${l}</a>`).join('')}</div>
    <h4>RENDERER</h4><dl id="rv-gpu"></dl>
    <h4>LIVE</h4><dl id="rv-live"></dl>
    <div class="act"><button id="rv-bench">Benchmark journey</button><button id="rv-copy">Copy report</button></div>
    <pre id="rv-out"></pre></div>`;
  document.body.appendChild(box);

  const go = p => { api.jump(+p); box.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === String(p))); };
  box.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => go(b.dataset.p)));
  let playing = null;
  function play() {
    if (playing) { cancelAnimationFrame(playing); playing = null; return; }
    const max = document.documentElement.scrollHeight - innerHeight, from = scrollY / max, dur = Math.max(6, (1 - from) * 60) * 1000, t0 = performance.now();
    const step = now => { const u = Math.min(1, (now - t0) / dur); scrollTo(0, (from + (1 - from) * u) * max); playing = u < 1 ? requestAnimationFrame(step) : null; };
    playing = requestAnimationFrame(step);
  }
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    const i = '12345'.indexOf(e.key);
    if (i >= 0 && api.MOMENTS[i]) go(api.MOMENTS[i][2]);
    else if (e.key === 'h' || e.key === 'H') box.classList.toggle('rv-min');
    else if (e.key === 'p' || e.key === 'P') play();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); scrollBy({ top: (e.key === 'ArrowRight' ? 1 : -1) * 0.004 * (document.documentElement.scrollHeight - innerHeight), behavior: 'auto' }); }
  });

  const env = () => ({ browser: browserName(), webgl: G.webgl, glVersion: G.version, gpuVendor: G.vendor, webglRenderer: G.renderer,
    hardwareAcceleration: api.renderer ? (G.hardware ? 'YES' : 'NO (software rasteriser)') : 'NO (WebGL unavailable)',
    devicePixelRatio: devicePixelRatio, screen: `${screen.width}×${screen.height}`, viewport: `${innerWidth}×${innerHeight}`, maxTexture: G.maxTexture, cores: navigator.hardwareConcurrency });
  const E = env();
  box.querySelector('#rv-gpu').innerHTML = [['browser', E.browser], ['webgl', E.webgl], ['renderer', E.webglRenderer], ['vendor', E.gpuVendor],
    ['hardware', `<span class="${G.hardware ? 'ok' : 'bad'}">${E.hardwareAcceleration}</span>`], ['device px', E.devicePixelRatio], ['screen', E.screen], ['viewport', E.viewport]]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  if (api.renderer && !G.hardware) console.warn('[review] WebGL is running on a SOFTWARE rasteriser:', G.renderer, '— check chrome://gpu.');

  const rexBox = box.querySelector('#rv-rex'), live = box.querySelector('#rv-live'); let frames = [], lastT = performance.now();
  (function tick(now) {
    frames.push([now, now - lastT]); lastT = now; while (frames.length && now - frames[0][0] > 5000) frames.shift();
    if (!tick.n || now - tick.n > 400) {
      tick.n = now; const I = api.info(), r = api.renderer && api.renderer.info, last1 = frames.filter(f => now - f[0] < 1000);
      rexBox.innerHTML = `<dt>manifest</dt><dd class="${I.rex.manifest ? 'ok' : 'warn'}">${I.rex.manifest ? 'loaded · ' + I.rex.pipeline + (I.rex.keyOverride ? ' (override: ' + I.rex.keyOverride + ')' : '') : 'not found — no REX drawn'}</dd>` +
        I.rex.shots.map(s => `<dt>${s.id}</dt><dd class="${s.missing ? 'warn' : s.error ? 'bad' : s.ready ? 'ok' : ''}">${s.missing ? 'missing' : s.error ? s.error : `${s.kind} · ${s.mode}${s.w ? ' · ' + s.w + '×' + s.h : ''}${s.ready ? '' : ' · loading'}`}</dd>`).join('');
      const rows = [['fps', last1.length], ['worst 5s', Math.round(Math.max(...frames.map(f => f[1]))) + ' ms'], ['scene', `${I.scene} · p ${(I.p * 100).toFixed(1)}%`],
        ['dpr', `${I.dpr} / max ${I.dprMax}`], ['refresh', (1000 / I.vsync).toFixed(0) + ' Hz est.'],
        ['draw calls', r ? r.render.calls : '—'], ['gpu mem', r ? `${r.memory.geometries} geo · ${r.memory.textures} tex` : '—'],
        ['js heap', heap() != null ? heap() + ' MB' : 'n/a'], ['errors', `<span class="${errors.length ? 'bad' : 'ok'}">${errors.length}</span>`]];
      live.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    }
    requestAnimationFrame(tick);
  })(performance.now());

  let report = null; const out = box.querySelector('#rv-out');
  box.querySelector('#rv-bench').addEventListener('click', async () => {
    const DUR = 40000, max = document.documentElement.scrollHeight - innerHeight, ft = [], dprs = new Set(), heap0 = heap(), errs0 = errors.length;
    out.textContent = 'Benchmarking — 40 s, please do not touch the page…';
    api.jump(0.02); await new Promise(r => setTimeout(r, 800));
    const start = performance.now(); let prev = start;
    await new Promise(done => { (function step(now) {
      ft.push(now - prev); prev = now; const u = Math.min(1, (now - start) / DUR);
      scrollTo(0, (0.02 + u * 0.98) * max); dprs.add(api.info().dpr);
      if (u < 1) requestAnimationFrame(step); else done(); })(performance.now()); });
    const n = ft.length, I = api.info();
    report = { ...env(), when: new Date().toISOString(), avgFps: +(n / (DUR / 1000)).toFixed(1), p50FrameMs: +pct(ft, 0.5).toFixed(1), p99FrameMs: +pct(ft, 0.99).toFixed(1),
      onePercentLowFps: +(1000 / pct(ft, 0.99)).toFixed(1), worstFrameMs: +Math.max(...ft).toFixed(1), framesOver33ms: ft.filter(x => x > 33.4).length, frames: n,
      estRefreshHz: +(1000 / I.vsync).toFixed(0), dprRange: [...dprs].sort(), dprEnd: I.dpr, dprMax: I.dprMax, rex: I.rex,
      jsHeapMB: heap0 != null ? [heap0, heap()] : 'n/a', errorsDuringRun: errors.length - errs0, errorMessages: errors.slice(0, 5) };
    out.textContent = Object.entries(report).filter(([k]) => /Fps|Ms|over|dpr|Heap|errors|Refresh|hardware|webglRenderer/.test(k)).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
    console.log('[FOXREX review] benchmark report', report);
  });
  box.querySelector('#rv-copy').addEventListener('click', async () => {
    const data = JSON.stringify(report || { ...env(), live: api.info(), errors }, null, 2);
    try { await navigator.clipboard.writeText(data); out.textContent = 'Report copied to clipboard.\n' + out.textContent; } catch { out.textContent = data; }
  });
  window.FOXREX_REVIEW = { env, report: () => report, errors: () => errors.slice() };
}
