/* Creative direction is supplied by a real reasoning provider or by the operator.
   This file contains guardrails and blank editors, never fabricated AI concepts. */
function creativeState(it) {
  if (!it.creative) it.creative = { version: 1, mode: 'manual', audience: '', tone: '', references: '', facts: [], factsReviewed: false, concepts: null, selectedId: '', plan: null, manualPrompt: '', feedback: '', observations: '', revisions: [], lifecycle: 'draft' };
  return it.creative;
}
function invalidateCreativeQuote(c) { if (!c.pendingQuote?.submissionAttempted) delete c.pendingQuote; }
function creativeDraft(it, field, value) { return S.creativeDrafts?.[it.id]?.[field] ?? (value ? JSON.stringify(value, null, 2) : ''); }
function creativeQuotePanel(q) {
  const manual = q.provider === 'MANUAL_CLAUDE';
  const exact = { prompt: q.request.prompt, type: q.request.type, aspectRatio: q.request.aspectRatio, variations: q.request.variations, references: q.request.references, modelParameters: q.modelParams };
  return `<div class="panel"><h3>${manual ? 'Save manual production request' : 'Approve one image generation'}</h3>
    <p>${esc(q.provider)} / ${manual ? 'external tool selected by operator' : esc(q.model)} · ${manual ? 'No worker generation or worker credit charge. External tool costs are separate.' : q.estimatedCredits == null ? 'Credit estimate unavailable — standard plan credits may apply' : `${q.estimatedCredits} estimated credits`}</p>
    <pre class="ltr" style="white-space:pre-wrap;max-height:320px;overflow:auto">${esc(JSON.stringify(exact, null, 2))}</pre>
    <details><summary>Approved brief, facts and revision snapshot</summary><pre class="ltr" style="white-space:pre-wrap;max-height:240px;overflow:auto">${esc(JSON.stringify(q.request.creative, null, 2))}</pre></details>
    <button class="btn pri" data-act="creative-submit" ${S.creativeSubmitting ? 'disabled' : ''}>${manual ? 'Save this manual request' : 'Approve this request and submit once'}</button><button class="btn" data-act="creative-dismiss">Back to editing</button>
    <p class="hint">Repeated approval returns the same job. After connection loss, use this same preview to recover it.</p></div>`;
}
function creativeBrief(it) {
  const c = creativeState(it);
  return { objective: OBJECTIVES[it.objective] || it.objective, audience: c.audience, platform: it.platforms.join(', '), format: it.format, message: it.brief.key, tone: c.tone, language: it.language,
    brandAssets: DB.assets.filter(a => a.approval === 'approved' && (a.id === DB.settings.masterCharId || a.src === 'logo')).map(a => ({ id: a.id, name: a.name })), references: c.references.split('\n').filter(Boolean), facts: c.facts };
}
function creativeSnapshot(it) {
  const c = creativeState(it);
  return JSON.parse(JSON.stringify({ brief: creativeBrief(it), family: it.family, dataVerified: it.verified, approvedInputData: it.data, mode: c.mode, selectedConcept: c.concepts?.concepts?.find(x => x.id === c.selectedId) || null, plan: c.plan, revisions: c.revisions, factsReviewed: c.factsReviewed, reviewState: c.lifecycle, feedback: c.feedback }));
}
function creativeSaveRevision(it, stage, output, provider = 'OPERATOR', model = null) {
  const c = creativeState(it);
  c.revisions.push({ id: uid(), createdAt: new Date().toISOString(), stage, input: { brief: creativeBrief(it), selectedId: c.selectedId, feedback: c.feedback }, output: JSON.parse(JSON.stringify(output)), provider, model, reviewState: 'draft' });
  c.lifecycle = 'draft'; c.factsReviewed = false; invalidateCreativeQuote(c);
  if (['APPROVED', 'SCHEDULED', 'PUBLISHED', 'FINALIZING'].includes(it.status)) it.status = 'DRAFT';
  save();
}
function restoreCreativeRevision(it, revision) {
  const c = creativeState(it), value = JSON.parse(JSON.stringify(revision.output));
  const field = revision.stage === 'ideate' ? 'concepts' : revision.stage;
  if (field === 'plan') {
    if (c.mode === 'ai' && !c.concepts?.concepts?.some(x => x.id === value.conceptId)) throw new Error('Restore the matching concepts before restoring this plan.');
    c.selectedId = value.conceptId; it.final.caption = value.caption;
  }
  if (field === 'concepts') { c.selectedId = value.recommendedId; c.plan = null; }
  if (field === 'selectedId') c.plan = null;
  c[field] = value;
  if (S.creativeDrafts?.[it.id]) delete S.creativeDrafts[it.id][field];
  creativeSaveRevision(it, revision.stage, value);
}
function creativeField(label, field, value, area = false) {
  return `<div class="field"><label class="f" for="creative-${field}">${label}</label>${area ? `<textarea id="creative-${field}" data-creative="${field}" style="min-height:90px">${esc(value)}</textarea>` : `<input type="text" id="creative-${field}" data-creative="${field}" value="${esc(value)}">`}</div>`;
}
function creativeReviewWarnings(c) {
  const text = JSON.stringify([c.concepts, c.plan]);
  if (c.plan && (/characters|minimum length|80\+/i.test(JSON.stringify(c.plan.scenes?.map(s => s.prompt))) || /^(None|العربية|Arabic|English)$/i.test(c.plan.caption || '') || c.plan.scenes?.some(s => /^(None|العربية|Arabic|English)$/i.test(s.copy || '')))) return 'Editorial check: this draft contains placeholder copy or model instruction residue. Write actual caption/slide copy and clean image prompts before marking factual and brand review complete.';
  return /handwritten|handwriting|Arabic labels|line of writing/i.test(text)
    ? 'Editorial check: the model mentions handwriting or labels. Replace requests for baked text with blank surfaces; add all copy and the official logo as editable overlays. Schema validation does not prove brand or factual accuracy.' : '';
}
function creativePanel(it) {
  const c = creativeState(it), status = S.creativeStatus;
  const scenes = c.plan?.scenes || [];
  return `<section class="panel" id="creative-director"><h2>Creative director · الإخراج الإبداعي</h2>
    <p class="hint">الموجز ← أفكار متميزة ← خطة قابلة للتحرير ← مراجعة الطلب والتكلفة ← أصل للمراجعة. النشر غير متصل.</p>
    <div class="row"><button class="btn ${c.mode === 'ai' ? 'pri' : ''}" data-act="creative-mode" data-v="ai">AI-directed</button><button class="btn ${c.mode === 'manual' ? 'pri' : ''}" data-act="creative-mode" data-v="manual">Manual prompt / import</button><button class="btn" data-act="creative-status">Check reasoning provider</button></div>
    <p class="hint">${status ? esc(status.available ? `${status.provider} / ${status.model} · local compute, no API charge` : status.message || 'Reasoning unavailable') : 'Reasoning provider not checked. Configure CREATIVE_PROVIDER=ollama and CREATIVE_MODEL on the worker.'}</p>
    <div class="fg">${creativeField('الجمهور · Audience', 'audience', c.audience)}${creativeField('النبرة · Tone', 'tone', c.tone)}</div>
    <p class="hint">Objective: ${esc(OBJECTIVES[it.objective])} · ${esc(it.platforms.join(', '))} · ${esc(FORMATS[it.format].ar)}</p>
    ${creativeField('المراجع · References (one per line)', 'references', c.references, true)}
    <label class="f" for="creative-facts">Approved facts with sources · JSON [{"id":"fact-1","text":"…","source":"…","approved":true}]</label>
    <textarea id="creative-facts" class="ltr" style="min-height:90px">${esc(creativeDraft(it, 'facts', c.facts))}</textarea><button class="btn" data-act="creative-facts">Save facts</button>
    <p class="hint">لا تستخدم أسعاراً أو إشارات أو أرقام أداء بدون حقائق معتمدة أعلاه. البيانات القديمة لا تُعتمد تلقائياً.</p>
    ${creativeReviewWarnings(c) ? `<p class="warnbox">${esc(creativeReviewWarnings(c))}</p>` : ''}
    ${c.mode === 'ai' ? `<button class="btn pri" data-act="creative-ideate" ${S.creativeBusy ? 'disabled' : ''}>${S.creativeBusy ? 'Thinking…' : 'Propose distinct concepts / revise'}</button>
    ${c.concepts ? `<label class="f">Concepts, hooks, narrative and recommendation · editable JSON</label><textarea id="creative-concepts" class="ltr" style="min-height:220px">${esc(creativeDraft(it, 'concepts', c.concepts))}</textarea><button class="btn" data-act="creative-concepts">Save concept edits</button><label class="f">Selected direction</label><select data-creative="selectedId">${c.concepts.concepts.map(x => `<option value="${esc(x.id)}" ${x.id === c.selectedId ? 'selected' : ''}>${esc(x.title)}${x.id === c.concepts.recommendedId ? ' ★ Recommended' : ''}</option>`).join('')}</select><p>${esc(c.concepts.rationale)}</p><button class="btn pri" data-act="creative-plan" ${S.creativeBusy ? 'disabled' : ''}>Create / revise production plan</button>` : ''}` : creativeField('Ready image prompt · قابل للتحرير', 'manualPrompt', c.manualPrompt, true)}
    <details ${c.plan ? 'open' : ''}><summary>Production plan · Copy / scenes / slides / voiceover / cover / editing instructions</summary>
    <p class="hint">AI fills this only after a successful provider response. Manual mode can enter a plan. Reels generate reference images, never a rendered video.</p>
    <label class="f" for="creative-plan">Editable production plan JSON</label><textarea id="creative-plan" class="ltr" style="min-height:240px" placeholder="Paste a production plan JSON">${esc(creativeDraft(it, 'plan', c.plan))}</textarea><button class="btn" data-act="creative-save-plan">Save plan edits</button>
    ${scenes.map((s, i) => { const state = it.scenes?.[i], asset = state?.assetId && assetById(state.assetId); return `<div class="panel"><div class="row"><span>${i + 1}. ${esc(s.title)}${state ? ' · ' + esc(state.status) : ''}</span><button class="btn" data-act="creative-scene" data-i="${i}">Review ${it.format === 'reel' ? 'reference frame' : 'image'} request</button></div>${asset ? `<div style="max-width:280px">${assetTag(asset)}</div><p class="hint">Review concept match, brand, legibility and factual accuracy before approval.</p><button class="btn" data-act="scene-ok" data-i="${i}">Approve reviewed scene asset</button><button class="btn" data-act="scene-no" data-i="${i}">Reject scene asset</button>` : ''}</div>`; }).join('')}</details>
    ${creativeField('Targeted revision feedback', 'feedback', c.feedback, true)}
    ${creativeField('Operator observations of generated asset (concept, brand, legibility, facts)', 'observations', c.observations, true)}
    <button class="btn" data-act="creative-critique" ${!c.plan || S.creativeBusy ? 'disabled' : ''}>Critique plan + observations</button>
    <p class="hint">Local text model cannot inspect pixels. Use the image preview and human review checks for visual validation.</p>
    ${c.critique ? `<pre style="white-space:pre-wrap">${esc(JSON.stringify(c.critique, null, 2))}</pre>` : ''}
    <label class="row"><input type="checkbox" data-creative-review ${c.factsReviewed ? 'checked' : ''}> I reviewed all copy/prompts against approved facts and sources; no invented financial claims. Logo and critical text will be editable overlays.</label>
    <div class="row"><button class="btn pri" data-act="creative-preview">Review exact generation request</button><button class="btn" data-act="creative-manual-preview">Preview manual request · no worker credits</button><label class="btn">Import external asset<input type="file" accept="image/*" data-act-file="gen" style="display:none"></label></div>
    ${S.creativeError ? `<div class="errbox" role="alert">${esc(S.creativeError)}</div>` : ''}
    ${c.pendingQuote ? creativeQuotePanel(c.pendingQuote) : ''}
    <details><summary>Version history (${c.revisions.length})</summary>${c.revisions.slice().reverse().map((r, i) => `<details><summary>${esc(r.stage)} · ${esc(r.provider)} ${esc(r.model || '')} · ${esc(r.createdAt)}</summary><pre class="ltr" style="white-space:pre-wrap">${esc(JSON.stringify(r, null, 2))}</pre><button class="btn" data-act="creative-restore" data-i="${c.revisions.length - 1 - i}">Restore as a new draft</button></details>`).join('')}</details>
    </section>`;
}
async function runCreative(stage) {
  const it = cur(), c = creativeState(it); if (S.creativeBusy) return;
  S.creativeBusy = true; S.creativeError = ''; render();
  try {
    if (Object.keys(S.creativeDrafts?.[it.id] || {}).length) throw new Error('Save the edited JSON before asking for a revision.');
    const input = { contentId: it.id, brief: creativeBrief(it), concept: c.concepts?.concepts?.find(x => x.id === c.selectedId), previous: stage === 'ideate' ? c.concepts : c.plan, feedback: c.feedback, observations: c.observations, assetIds: it.generations.map(g => g.assetId) };
    const r = await wapi('/creative/' + stage, { method: 'POST', body: JSON.stringify(input) });
    if (JSON.stringify(input.brief) !== JSON.stringify(creativeBrief(it)) || (stage === 'plan' && input.concept.id !== c.selectedId)) {
      c.revisions.push(r); throw new Error('Brief changed while reasoning. The result is preserved in version history; review it before restoring.');
    }
    if (stage === 'ideate') { c.concepts = r.output; c.selectedId = r.output.recommendedId; c.plan = null; }
    if (stage === 'plan') { c.plan = r.output; it.final.caption = r.output.caption; }
    if (stage === 'critique') c.critique = r.output;
    creativeSaveRevision(it, stage, r.output, r.provider, r.model);
    Object.assign(c.revisions[c.revisions.length - 1], r);
    if (stage === 'plan') it.brief.hook = input.concept.hook;
  } catch (e) { S.creativeError = e.message; }
  finally { S.creativeBusy = false; save(); render(); }
}
async function previewCreative(it, { scene = null, manual = false } = {}) {
  const c = creativeState(it); S.creativeError = '';
  try {
    if (c.pendingQuote?.submissionAttempted) throw new Error('An approval may already have submitted. Resolve the retained preview before creating another.');
    if (activeJob(it)) throw new Error('Wait for the existing generation job.');
    if (Object.keys(S.creativeDrafts?.[it.id] || {}).length) throw new Error('Save edited facts, concepts and plan before previewing.');
    if (!c.factsReviewed) throw new Error('Review the facts, sources and exact prompt first.');
    if (['analysis', 'signal', 'news', 'result'].includes(it.family) && (!it.verified || !c.facts.length || missing(it).length)) throw new Error('Financial content requires verified source facts and all required data fields.');
    const promptText = scene == null ? buildPrompt(it) : buildScenePrompt(it, scene);
    if (!promptText.trim()) throw new Error('Write a manual prompt or create and review an AI production plan first.');
    const refs = characterRefs(it);
    const payload = { prompt: promptText, aspectRatio: it.format === 'reel' ? '9:16' : FORMATS[it.format].ar_, variations: 1, contentId: it.id, promptVersionId: `${it.id}:v${it.prompts.length + 1}`, characterAssetId: refs[0]?.assetId || null, format: it.format, contentType: it.family, type: 'image', references: refs, creative: creativeSnapshot(it), ...(manual ? { provider: 'MANUAL_CLAUDE' } : {}) };
    c.pendingQuote = await wapi('/jobs/quote', { method: 'POST', body: JSON.stringify(payload) });
    c.pendingQuote.scene = scene;
    save();
  } catch (e) { S.creativeError = e.message; }
  render(); document.querySelector('#creative-director')?.scrollIntoView({ behavior: 'smooth' });
}
async function submitCreative() {
  const it = cur(), c = creativeState(it), q = c.pendingQuote;
  if (!q || S.creativeSubmitting) return;
  S.creativeSubmitting = true; S.creativeError = ''; render();
  q.submissionAttempted = true; save();
  try {
    const res = await wapi('/jobs', { method: 'POST', body: JSON.stringify({ quoteId: q.id, approved: true }) });
    let job = it.jobs.find(j => j.id === res.id);
    if (!job) {
      const pv = { v: it.prompts.length + 1, text: q.request.prompt, date: Date.now(), scene: q.scene, approvedRequest: q.request };
      it.prompts.push(pv);
      job = { ...res, localId: uid(), promptV: pv.v, scene: q.scene }; it.jobs.push(job);
      if (q.scene != null) { it.scenes ||= []; it.scenes[q.scene] = { status: 'GENERATING', jobLocalId: job.localId }; }
    }
    c.lifecycle = 'review'; delete c.pendingQuote;
    it.status = 'GENERATING'; onJobUpdate(it, job); poll(it.id, job.localId);
  } catch (e) { S.creativeError = `${e.message}. The approved preview is retained. Submit the same preview to recover the same job; do not create another.`; }
  finally { S.creativeSubmitting = false; save(); render(); }
}
function installCreativeStudio() {
  // Additive migration: old fields, generations, prompts and assets stay untouched.
  if (DB.schemaVersion !== 5) {
    try { if (!localStorage.getItem(LS + ':before-creative-v5')) localStorage.setItem(LS + ':before-creative-v5', JSON.stringify(DB)); }
    catch { throw new Error('Cannot back up existing Studio data. Export data before migrating.'); }
    DB.items.forEach(creativeState); DB.schemaVersion = 5; save();
  }
  const oldNew = newItem;
  newItem = o => { const it = oldNew(o); it.brief = { hook: '', key: '', cta: '', ...(o.brief || {}) }; creativeState(it); return it; };
  refreshDerived = it => { const rec = recommendChar(it); for (const k in rec) if (k !== 'overridden' && !it.char.overridden[k]) it.char[k] = rec[k]; };
  const guard = '\n\nFOXREX guardrails: navy #0B1320, slate #1F2937, restrained teal #00D4A7. No fabricated financial numbers or claims. No text, logos, prices, Entry/SL/TP or performance figures in generated pixels. Keep safe space for editable logo and critical text overlays.';
  buildPrompt = it => { const c = creativeState(it), text = c.mode === 'manual' ? c.manualPrompt : c.plan?.scenes?.[0]?.prompt; return text?.trim() ? text + guard : ''; };
  buildScenePrompt = (it, i) => { const text = creativeState(it).plan?.scenes?.[i]?.prompt; return text?.trim() ? text + guard : ''; };
  caption = it => it.final.caption || creativeState(it).plan?.caption || '';
  reelShots = it => (creativeState(it).plan?.scenes || []).map(s => ({ t: s.duration, k: s.title, ar: s.title, d: s.visualDirection }));
  carouselPlan = it => (creativeState(it).plan?.scenes || []).map((s, i) => ({ n: i + 1, k: s.title, ar: s.title, d: s.visualDirection }));
  generate = previewCreative;
  const oldView = VIEWS.item;
  VIEWS.item = () => { const markup = oldView(); return cur() ? creativePanel(cur()) + markup : markup; };
  const oldIngest = ingest;
  ingest = (it, job) => { const made = oldIngest(it, job); for (const asset of made) asset.lineage.creative = job.creative || creativeSnapshot(it); return made; };
  const oldGenPanel = genPanel;
  genPanel = it => {
    if (activeJob(it) || ['IN_REVIEW', 'FINALIZING', 'APPROVED', 'SCHEDULED', 'PUBLISHED'].includes(it.status)) return oldGenPanel(it);
    const unresolved = (it.jobs || []).find(j => !['COMPLETED'].includes(j.status) && !j.reconciled_no_output && (j.submission_started_at || j.provider_job_id || ['SUBMISSION_UNCONFIRMED', 'WORKER_RESTARTED'].includes(j.failure_code) || j.failure_message === 'CLI did not return a job id'));
    return `<h2>Asset production · إنشاء الأصول</h2><p class="hint">Use the creative director above to edit a prompt or AI plan, then review one image request and its credit estimate. Import an external asset at any time. Reels are reference frames only.</p>${unresolved ? `<div class="warnbox">Existing submission needs reconciliation before another generation.</div><button class="btn" data-act="recoverjob">Recover existing Higgsfield job</button>` : ''}<button class="btn" data-act="copyprompt">Copy approved draft prompt</button>${reuseMatches(it).map(a => `<button class="btn" data-act="reuse" data-a="${esc(a.id)}">Reuse ${esc(a.name)} · no credits</button>`).join('')}`;
  };
  Object.assign(ACT, {
    'creative-manual-preview': () => previewCreative(cur(), { manual: true }),
    'creative-mode': el => { const c = creativeState(cur()); c.mode = el.dataset.v; invalidateCreativeQuote(c); c.factsReviewed = false; save(); render(); },
    'creative-status': async () => { try { S.creativeStatus = await wapi('/creative/status'); } catch (e) { S.creativeStatus = { available: false, message: e.message }; } render(); },
    'creative-ideate': () => runCreative('ideate'), 'creative-plan': () => runCreative('plan'), 'creative-critique': () => runCreative('critique'),
    'creative-preview': () => previewCreative(cur()), 'creative-scene': el => previewCreative(cur(), { scene: +el.dataset.i }), 'creative-submit': submitCreative,
    'creative-dismiss': async () => { const c = creativeState(cur()); if (c.pendingQuote?.submissionAttempted) { S.creativeError = 'Resolve the existing approval by submitting this same preview again. It returns the same job.'; } else delete c.pendingQuote; save(); render(); },
    'creative-facts': () => creativeEditor('facts', 'creative-facts'), 'creative-concepts': () => creativeEditor('concepts', 'creative-concepts'), 'creative-save-plan': () => creativeEditor('plan', 'creative-plan'),
    'creative-restore': el => { try { const it = cur(); restoreCreativeRevision(it, creativeState(it).revisions[+el.dataset.i]); S.creativeError = ''; } catch (e) { S.creativeError = e.message; } render(); }
  });
  ACT.testworker = ACT['worker-health'] = async () => {
    try {
      const u = new URL(document.getElementById('w-url').value.trim());
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || /\/(health|providers|jobs)\/?$/.test(u.pathname)) throw new Error('Enter the worker base URL, for example http://127.0.0.1:8787, without /health, credentials, query or fragment.');
      DB.settings.workerUrl = u.href.replace(/\/$/, '');
      DB.settings.workerToken = document.getElementById('w-tok').value;
      save();
      const health = await wapi('/health');
      if (health.service !== 'foxrex-studio-generation-worker') throw new Error('The URL returned another service. Use the FOXREX worker base URL.');
      S.workerDiagnostic = 'Health HTTP 200. Checking authenticated API…';
      await wapi('/policy');
      await refreshProviders(true);
      if (DB.providers.error) throw new Error(DB.providers.message || DB.providers.error);
      S.workerDiagnostic = 'Connected: health HTTP 200, authenticated policy HTTP 200 and provider status loaded. No image generation was submitted.';
    } catch (e) { S.workerDiagnostic = e.message; }
    render();
  };
  ACT['fb-go'] = () => { const it = cur(), c = creativeState(it), g = it.generations.find(g => g.n === S.feedbackFor); c.feedback = (S.fbSel || []).map(k => FEEDBACK.find(f => f[0] === k)?.[1]).filter(Boolean).concat(document.getElementById('fb-note')?.value || '').join('\n'); if (!c.feedback.trim()) return toast('Add revision feedback first.'); if (g) g.feedback = c.feedback.split('\n'); c.factsReviewed = false; invalidateCreativeQuote(c); S.feedbackFor = null; S.fbSel = []; save(); render(); toast('Feedback saved. Revise the AI plan or manual prompt before previewing again.'); };
  ACT.canceljob = async () => { const it = cur(), j = activeJob(it); if (!j?.id) return; try { Object.assign(j, await wapi(`/jobs/${j.id}/cancel`, { method: 'POST' })); onJobUpdate(it,j); } catch(e) { S.creativeError = e.message; render(); } };
  const oldRecovery = ACT.recoverjob;
  ACT.recoverjob = async () => { const it = cur(); const j = (it.jobs || []).find(j => j.status !== 'COMPLETED' && (j.submission_started_at || j.provider_job_id || j.failure_code === 'WORKER_RESTARTED' || j.failure_code === 'SUBMISSION_UNCONFIRMED' || j.failure_message === 'CLI did not return a job id')); if (j) { const id = prompt('Existing Higgsfield provider job ID (read-only recovery):', j.provider_job_id || ''); if (!id) return; try { Object.assign(j,await wapi(`/jobs/${j.id}/reconcile`,{method:'POST',body:JSON.stringify({providerJobId:id.trim()})})); onJobUpdate(it,j); } catch(e) { S.creativeError=e.message; render(); } } else await oldRecovery(); };
  for (const [action, state] of [['approve-content','approved'], ['schedule','scheduled'], ['publish','published']]) {
    const old = ACT[action]; ACT[action] = (...args) => { old(...args); creativeState(cur()).lifecycle = state; save(); };
  }
  document.addEventListener('input', e => {
    const it = cur(), field = { 'creative-facts': 'facts', 'creative-concepts': 'concepts', 'creative-plan': 'plan' }[e.target.id];
    if (it && field) { S.creativeDrafts ||= {}; S.creativeDrafts[it.id] ||= {}; S.creativeDrafts[it.id][field] = e.target.value; }
    // Persist plain edits before any asynchronous response or navigation can rerender.
    if (it && e.target.dataset.creative && e.target.tagName !== 'SELECT') {
      const c = creativeState(it); c[e.target.dataset.creative] = e.target.value;
      c.factsReviewed = false; invalidateCreativeQuote(c); save();
    }
  });
  document.addEventListener('change', e => {
    const it = cur(); if (!it) return; const c = creativeState(it);
    if (e.target.hasAttribute('data-creative-review')) { c.factsReviewed = e.target.checked; invalidateCreativeQuote(c); save(); return; }
    if (e.target.dataset.creative) {
      const field = e.target.dataset.creative; c[field] = e.target.value;
      if (field === 'selectedId') c.plan = null;
      creativeSaveRevision(it, field, e.target.value); field === 'selectedId' ? render() : renderAfterBlur();
    } else if (e.target.dataset.p) { c.factsReviewed = false; invalidateCreativeQuote(c); save(); renderAfterBlur(); }
  });
  // Refresh stored terminal failures too: recovered jobs must reappear in the asset library.
  if (DB.settings.workerUrl) wapi('/jobs').then(jobs => {
    for (const it of DB.items) for (const remote of jobs.filter(j => j.content_id === it.id)) {
      let local = (it.jobs || []).find(j => j.id === remote.id);
      if (!local) { local = { localId: uid(), ...remote }; it.jobs.push(local); }
      else Object.assign(local, remote);
      if (remote.status === 'COMPLETED' && !it.generations.some(g => g.jobId === remote.id)) onJobUpdate(it, local);
    }
    save(); render();
  }).catch(() => {});
}
async function creativeEditor(field, id) {
  try {
    const it = cur(), c = creativeState(it), value = JSON.parse(document.getElementById(id).value);
    if (field === 'facts' && (!Array.isArray(value) || value.some(f => !f.id || !f.text || !f.source || f.approved !== true))) throw new Error('Facts require id, text, source and approved:true.');
    if (field === 'concepts' && (!Array.isArray(value.concepts) || !value.concepts.length || value.concepts.some(x => !x.id || !x.title || !x.angle))) throw new Error('Concepts require id, title and angle.');
    if (field === 'plan' && (!Array.isArray(value.scenes) || !value.scenes.length || value.scenes.some(s => !s.prompt || !s.title || !s.id))) throw new Error('Plan requires scenes with id, title and prompt.');
    if (DB.settings.workerUrl) await wapi('/creative/validate', { method: 'POST', body: JSON.stringify({ stage: field === 'concepts' ? 'ideate' : field, output: value, input: { brief: creativeBrief(it), concept: c.mode === 'manual' ? { id: value.conceptId } : c.concepts?.concepts?.find(x => x.id === c.selectedId) } }) });
    c[field] = value; if (S.creativeDrafts?.[it.id]) delete S.creativeDrafts[it.id][field];
    if (field === 'concepts') { c.selectedId = value.recommendedId || value.concepts[0].id; c.plan = null; }
    if (field === 'plan') it.final.caption = value.caption || '';
    creativeSaveRevision(it, field, value); S.creativeError = ''; render();
  } catch (e) { S.creativeError = e.message; const alert = document.createElement('p'); alert.className = 'errbox'; alert.textContent = e.message; document.getElementById(id).after(alert); }
}
