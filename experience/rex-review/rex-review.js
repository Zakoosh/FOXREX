/* FOXREX — REX ASSET REVIEW (local, development only).
   Shows each locally supplied REX candidate (from tools/rex_ingest.py) IN CONTEXT: composited into the real
   Market Noise world by the experience engine itself (iframes of /experience/ in review/embed mode), not on a blank
   viewer. Decisions are local metadata: written to assets/rex/review-decisions.json by the local review server
   (tools/rex_review_server.py), or kept in this browser and exported when the server is read-only. */

const XP = new URL('../', location.href);                  // /experience/
const INDEX = new URL('assets/rex/processed/index.json', XP);
const DECISIONS = new URL('assets/rex/review-decisions.json', XP);
const GENERATIONS = new URL('assets/rex/higgsfield-generations.json', XP);
const LS = 'foxrex-rex-review-decisions';
const SHOTS = ['R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06', 'R-07'];
const MOMENTS = {   // film moments where each shot is on screen (js/film.js MOMENTS)
  'R-01': [['01B', 'Eyes appear', 0.47], ['02A', 'Eyes behind the market', 0.585]],
  'R-02': [['02B', 'Partial face', 0.75]],
  'R-03': [['02C', 'Three-quarter REX', 0.93]]
};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = p => p.split('/').map(encodeURIComponent).join('/');
const getJSON = async (u, d) => { try { const r = await fetch(u, { cache: 'no-store' }); return r.ok ? await r.json() : d; } catch { return d; } };

const S = { index: null, gens: null, decisions: {}, local: {}, server: false, shot: 'R-01', vi: 0, moment: 0, key: '', lift: false, bg: 'black', pauseOff: true, msg: '' };

function loadLocal() { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } }
function saveLocal() { try { localStorage.setItem(LS, JSON.stringify(S.local)); } catch { /* private mode */ } }
const decisionOf = (shot, id) => (S.local[shot] && S.local[shot][id]) || (S.decisions[shot] && S.decisions[shot][id]) || null;
const approvedOf = shot => { const all = { ...(S.decisions[shot] || {}), ...(S.local[shot] || {}) }; return Object.entries(all).filter(([, d]) => d.decision === 'approve').sort((a, b) => (b[1].at || '').localeCompare(a[1].at || ''))[0]?.[0] || null; };
const variants = () => (S.index?.shots?.[S.shot]?.variants) || [];
const unlocked = shot => shot === 'R-01' || !!approvedOf('R-01');   // R-02+ only after R-01 has been reviewed and approved

async function boot() {
  [S.index, S.gens, S.decisions] = await Promise.all([getJSON(INDEX, null), getJSON(GENERATIONS, null), getJSON(DECISIONS, {})]);
  S.local = loadLocal();
  const ping = await getJSON(new URL('/__rex/ping', location.href), null);
  S.server = !!(ping && ping.ok);
  const chip = $('#server');
  chip.textContent = S.server ? 'decisions → assets/rex/review-decisions.json' : 'read-only server: decisions stay in this browser (export below)';
  chip.className = 'chip ' + (S.server ? 'ok' : 'warn');
  const q = new URLSearchParams(location.search);
  if (q.get('shot') && SHOTS.includes(q.get('shot'))) S.shot = q.get('shot');
  render();
}

function tabs() {
  const have = new Set(Object.keys(S.index?.shots || {}));
  $('#tabs').innerHTML = SHOTS.filter(s => s === 'R-01' || s === 'R-02' || s === 'R-03' || have.has(s)).map(s => {
    const n = (S.index?.shots?.[s]?.variants || []).length, lock = !unlocked(s), ap = approvedOf(s);
    return `<button data-shot="${s}" aria-pressed="${s === S.shot}" ${lock ? 'disabled title="Locked until R-01 is reviewed and approved"' : ''}>${s}${n ? ` · ${n}` : ''}${ap ? ' ✓' : ''}${lock ? ' 🔒' : ''}</button>`;
  }).join('');
  $('#tabs').querySelectorAll('button').forEach(b => b.onclick = () => { S.shot = b.dataset.shot; S.vi = 0; S.moment = 0; S.key = ''; S.msg = ''; render(); });
}

function emptyState() {
  const g = (S.gens?.generations || []).filter(x => x.shot === S.shot);
  return `<section class="card empty"><h2>NO ${esc(S.shot)} CANDIDATES IN THE LOCAL INBOX YET</h2>
    ${S.index ? '' : '<p class="note">No ingest has run yet (assets/rex/processed/index.json not found).</p>'}
    <p>1 · Download the ${esc(S.shot)} result(s) from Higgsfield (full-resolution PNG / MP4, not the preview) into:</p>
    <pre>experience\\assets\\rex\\inbox\\</pre>
    ${g.length ? `<p>Expected ${esc(S.shot)} files (keep the Higgsfield file names — the job id identifies them):</p><pre>${g.map(x => esc(x.file) + '   (seed ' + esc(x.seed) + ')').join('\n')}</pre>` : `<p>Name files <code>${esc(S.shot)}_&lt;anything&gt;.png</code> / <code>.mp4</code>, or map them in <code>inbox/manifest.json</code>.</p>`}
    <p>2 · Run (Windows PowerShell, in the repository folder):</p>
    <pre>powershell -ExecutionPolicy Bypass -File experience\\ingest-rex.ps1</pre>
    <p>3 · This page reloads with every candidate composited into Market Noise.</p></section>`;
}

function render() {
  tabs();
  const vs = variants(), app = $('#app');
  if (!unlocked(S.shot)) { app.innerHTML = `<section class="card"><h2>${esc(S.shot)} LOCKED</h2><p>Review and approve R-01 first. R-02 is not generated until R-01 is reviewed.</p></section>`; return; }
  if (!vs.length) { app.innerHTML = emptyState(); return; }
  S.vi = Math.min(S.vi, vs.length - 1);
  const v = vs[S.vi], d = decisionOf(S.shot, v.id), moments = MOMENTS[S.shot] || [['—', 'film moment', 0.5]], m = moments[Math.min(S.moment, moments.length - 1)];
  const src = v.source || {}, hf = v.higgsfield, applied = S.index.approved?.[S.shot];
  const keyModes = [['', `manifest default (${v.mode || 'luma'})`], ...(v.key_modes || []).map(k => [k, k])];
  const isLocal = !!(S.local[S.shot] && S.local[S.shot][v.id]);
  app.innerHTML = `
  <section class="bar">
    <div class="card">
      <h2>${esc(S.shot)} · VARIANT ${S.vi + 1} OF ${vs.length}</h2>
      <p class="vid">${esc(v.id)}<small>${esc(v.kind)} · ${esc(src.width)}×${esc(src.height)} · ${esc(src.codec || src.format || '')}${src.duration ? ' · ' + esc(src.duration) + ' s' : ''}${src.fps ? ' · ' + esc(src.fps) + ' fps' : ''}</small></p>
      <dl class="meta">
        <dt>source file</dt><dd>${esc(src.file)} <span class="small">(${(src.bytes / 1048576).toFixed(2)} MB · identified by ${esc(v.identified_by)})</span></dd>
        <dt>SHA-256</dt><dd>${esc(src.sha256)}</dd>
        <dt>alpha</dt><dd>${src.alpha ? 'yes' : 'no — luminance key over black'}${src.pix_fmt ? ' · ' + esc(src.pix_fmt) : ''}</dd>
        ${hf ? `<dt>Higgsfield</dt><dd>job ${esc(hf.job_id)} · ${esc(hf.model)} · seed ${esc(hf.seed)} · ${esc(hf.resolution)} · ${esc(hf.created_utc)}</dd><dt>stage</dt><dd>${esc(hf.stage)}</dd>` : ''}
        <dt>candidate</dt><dd>${esc(v.manifest)}</dd>
      </dl>
      ${hf?.prompt ? `<details class="prompt"><summary>prompt</summary><p>${esc(hf.prompt)}</p></details>` : ''}
      <ul class="checks">${(v.checks || []).map(c => `<li class="l-${esc(c.level)}"><b>${esc(c.level.toUpperCase())}</b>${esc(c.msg)}</li>`).join('')}</ul>
      <div class="ctl">
        <label>Film moment <select id="moment">${moments.map(([n, l, p], i) => `<option value="${i}" ${i === S.moment ? 'selected' : ''}>${esc(n)} · ${esc(l)} (p ${p})</option>`).join('')}</select></label>
        <label>Key <select id="key">${keyModes.map(([k, l]) => `<option value="${k}" ${k === S.key ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label><input type="checkbox" id="pause" ${S.pauseOff ? 'checked' : ''}> pause off-screen panels (GPU)</label>
      </div>
    </div>
    <div class="card decide">
      <h2>OWNER DECISION</h2>
      <textarea id="note" placeholder="Note (identity, eyes, fur, edges, compression, fit with Market Noise…)">${esc(d?.note || '')}</textarea>
      <div class="btns"><button class="ap" id="approve">APPROVE</button><button class="rj" id="reject">REJECT</button><button id="next" ${vs.length < 2 ? 'disabled' : ''}>NEXT VARIANT</button></div>
      <p class="status">This variant: <b class="${d ? 'state-' + d.decision : ''}">${d ? d.decision.toUpperCase() + (d.at ? ' · ' + esc(d.at) : '') + (isLocal ? ' · in this browser only' : '') : 'not reviewed'}</b>
        ${d ? ' · <button class="link small" id="clear">clear</button>' : ''}<br>
        Applied to the experience: <b>${applied ? esc(applied) : 'none yet'}</b>${approvedOf(S.shot) && approvedOf(S.shot) !== applied ? ' — run <code>ingest-rex.ps1</code> again to apply the approval' : ''}</p>
      ${S.msg ? `<p class="note">${S.msg}</p>` : ''}
      <p class="small">Approval is local metadata. Nothing is uploaded, published or committed. ${S.server ? '' : '<button class="link" id="export">Export decisions JSON</button> → save as <code>experience/assets/rex/review-decisions.json</code>, then run ingest again.'}</p>
    </div>
  </section>
  <section class="grid" id="grid">
    ${panelOriginal(v)}
    ${panelFilm('B', 'Market Noise composite', 'as the film renders it at ' + m[0], { chrome: '0' }, 1600, 900)}
    ${panelFilm('C', 'Dark exposure', 'scene + REX ×0.6', { chrome: '0', exp: '0.6' }, 1600, 900)}
    ${panelFilm('D', 'Normal exposure', '×1.0 · focus on REX · no fog', { chrome: '0', exp: '1', focusrex: '1' }, 1600, 900)}
    ${panelFilm('E', 'Close crop', 'eyes ×3, rendered at full resolution', { chrome: '0', zoom: '3', focusrex: '1' }, 1600, 900)}
    ${panelFilm('F', 'Simulated desktop', '1440×900 · full page chrome', {}, 1440, 900)}
    ${panelFilm('G', 'Simulated mobile', '390×844 · full page chrome', { dpr: '1.5' }, 390, 844, true)}
  </section>`;
  wire(v, m);
}

function panelOriginal(v) {
  const url = new URL(enc(v.source.url), XP).href;
  const media = v.kind === 'video' ? `<video src="${esc(url)}" controls muted loop autoplay playsinline></video>` : `<img src="${esc(url)}" alt="${esc(S.shot)} original asset">`;
  return `<article class="panel"><div class="hd"><b>A</b><span>Original asset</span><em>exact delivered file from the inbox ·
    <label><input type="checkbox" id="lift" ${S.lift ? 'checked' : ''}> lift shadows ×4</label>
    <select id="bg"><option value="black">black</option><option value="grey" ${S.bg === 'grey' ? 'selected' : ''}>grey</option><option value="checker" ${S.bg === 'checker' ? 'selected' : ''}>checker</option></select></em></div>
    <div class="orig ${S.bg} ${S.lift ? 'lift' : ''}" id="orig">${media}</div></article>`;
}

function filmURL(v, m, extra) {
  const q = new URLSearchParams({ review: '1', embed: '1', adapt: '0', dpr: '1', rex: v.manifest, p: String(m[2]), ...extra });
  if (S.key) q.set('key', S.key);
  return new URL('?' + q.toString(), XP).href;
}
function panelFilm(letter, title, sub, extra, vw, vh, mobile) {
  const stage = `<div class="stage" data-letter="${letter}" data-vw="${vw}" data-vh="${vh}" data-extra='${esc(JSON.stringify(extra))}' style="aspect-ratio:${vw}/${vh};${mobile ? 'width:min(100%,300px)' : ''}"><div class="ph">loads when visible</div></div>`;
  return `<article class="panel"><div class="hd"><b>${letter}</b><span>${esc(title)}</span><em>${esc(sub)} · <a target="_blank" rel="noopener" data-open="${letter}" href="#">open ↗</a></em></div>${mobile ? `<div class="mob">${stage}</div>` : stage}</article>`;
}

let io = null, ro = null;
function wire(v, m) {
  $('#moment').onchange = e => { S.moment = +e.target.value; render(); };
  $('#key').onchange = e => { S.key = e.target.value; render(); };
  $('#pause').onchange = e => { S.pauseOff = e.target.checked; render(); };
  $('#lift').onchange = e => { S.lift = e.target.checked; $('#orig').classList.toggle('lift', S.lift); };
  $('#bg').onchange = e => { S.bg = e.target.value; $('#orig').className = 'orig ' + S.bg + (S.lift ? ' lift' : ''); };
  $('#approve').onclick = () => decide(v, 'approve');
  $('#reject').onclick = () => decide(v, 'reject');
  $('#next').onclick = () => { S.vi = (S.vi + 1) % variants().length; S.msg = ''; render(); };
  const clr = $('#clear'); if (clr) clr.onclick = () => decide(v, 'clear');
  const ex = $('#export'); if (ex) ex.onclick = exportDecisions;
  io?.disconnect(); ro?.disconnect();
  const stages = [...document.querySelectorAll('.stage')];
  for (const st of stages) { const url = filmURL(v, m, JSON.parse(st.dataset.extra)); st.dataset.url = url; st.closest('.panel').querySelector('[data-open]').href = url; }
  const fit = st => { const f = st.querySelector('iframe'); if (f) f.style.transform = `scale(${st.clientWidth / +st.dataset.vw})`; };
  ro = new ResizeObserver(es => es.forEach(e => fit(e.target)));
  io = new IntersectionObserver(es => es.forEach(e => {
    const st = e.target, f = st.querySelector('iframe');
    if (e.isIntersecting && !f) {
      st.innerHTML = `<iframe title="${st.dataset.letter} — REX candidate in Market Noise" width="${st.dataset.vw}" height="${st.dataset.vh}" src="${esc(st.dataset.url)}" loading="eager"></iframe>`;
      fit(st);
    } else if (!e.isIntersecting && f && S.pauseOff) st.innerHTML = '<div class="ph">paused off-screen</div>';
  }), { rootMargin: '150px' });
  stages.forEach(st => { io.observe(st); ro.observe(st); });
}

async function decide(v, decision) {
  const note = $('#note')?.value || '';
  S.msg = '';
  if (S.server) {
    try {
      const r = await fetch(new URL('/__rex/decision', location.href), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shot: S.shot, variant: v.id, decision, note }) });
      if (!r.ok) throw new Error((await r.json()).error || r.status);
      S.decisions = (await r.json()).decisions || {};
      if (S.local[S.shot]) { delete S.local[S.shot][v.id]; saveLocal(); }
    } catch (e) { S.server = false; S.msg = 'Could not reach the review server (' + esc(e.message) + '); the decision is kept in this browser.'; }
  }
  if (!S.server) {
    S.local[S.shot] = S.local[S.shot] || {};
    if (decision === 'clear') delete S.local[S.shot][v.id]; else S.local[S.shot][v.id] = { decision, note: note.slice(0, 500), at: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
    saveLocal();
  }
  if (decision === 'approve') S.msg = (S.msg ? S.msg + '<br>' : '') + `Approved ${esc(v.id)} locally. Run <code>powershell -ExecutionPolicy Bypass -File experience\\ingest-rex.ps1</code> again to apply it (copies to approved/ and updates rex-assets.json).`;
  if (decision === 'reject' && variants().length > 1) { S.vi = (S.vi + 1) % variants().length; }
  render();
}

function exportDecisions() {
  const merged = JSON.parse(JSON.stringify(S.decisions || {}));
  for (const [shot, per] of Object.entries(S.local)) merged[shot] = { ...(merged[shot] || {}), ...per };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(merged, null, 2) + '\n'], { type: 'application/json' }));
  a.download = 'review-decisions.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

addEventListener('keydown', e => {
  if (e.target.closest('textarea, input, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const v = variants()[S.vi]; if (!v || !unlocked(S.shot)) return;
  const k = e.key.toLowerCase();
  if (k === 'a') decide(v, 'approve'); else if (k === 'r') decide(v, 'reject');
  else if (k === 'n' && variants().length > 1) { S.vi = (S.vi + 1) % variants().length; S.msg = ''; render(); }
  else if (k === 'l') { S.lift = !S.lift; render(); }
});

boot();
