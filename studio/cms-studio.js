/* FOXREX Studio — editorial CMS (library, editor, review/approval, preview, publication center).
   The worker is the authority: records, approvals and publications live there, behind the worker
   bearer token. This file never holds Git credentials and never talks to GitHub. It only calls the
   operator's own worker (Settings → worker URL + token) and sends the operator name for the audit log.
   Rules come from cms-model.js (FOXREX_CMS), the same module the publishing engine enforces. */
(function () {
  'use strict';
  const C = window.FOXREX_CMS;
  const TYPES_ORDER = ['MORNING_BRIEF', 'GOLD_FOCUS', 'EVENT', 'US_OPEN', 'MARKET_RECAP', 'ANALYSIS', 'NEWS', 'SIGNAL', 'SIGNAL_RESULT', 'LEARN', 'REX_EXPLAINS', 'REX_NOTE', 'ASK_REX'];
  const ST_AR = { IDEA: 'فكرة', DRAFT: 'مسودة', REVIEW: 'قيد المراجعة', APPROVED: 'معتمد', SCHEDULED: 'مجدول', PUBLISHED: 'منشور', ARCHIVED: 'مؤرشف' };
  const ST_CLS = { IDEA: 'st-IDEA', DRAFT: 'st-DRAFT', REVIEW: 'st-IN_REVIEW', APPROVED: 'st-APPROVED', SCHEDULED: 'st-SCHEDULED', PUBLISHED: 'st-PUBLISHED', ARCHIVED: 'st-ARCHIVED' };
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const typeLabel = t => (C.TYPES[t] ? C.TYPES[t].label[1] : t);
  const st = s => `<span class="pill ${ST_CLS[s] || ''}">${E(ST_AR[s] || s)}</span>`;
  const lang = l => `<span class="tag ltr">${l === 'ar' ? 'AR' : 'EN'}</span>`;
  const fmt = iso => iso ? C.formatEditorial(iso) : '—';
  const X = () => (S.cms = S.cms || { list: null, filters: {}, sort: 'updated', q: '', rec: null, draft: null, dirty: false, pubs: null, config: null, sys: null, sysErr: '', ops: null, modal: null, busy: false, err: '' });

  /* ---------- worker API ---------- */
  async function api(method, path, body, headers) {
    if (!DB.settings.workerUrl) throw Object.assign(new Error('اربط العامل المحلي من الإعدادات أولًا (Worker URL + token).'), { status: 0 });
    let r;
    try {
      r = await fetch(DB.settings.workerUrl.replace(/\/$/, '') + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (DB.settings.workerToken || ''),
        'X-Foxrex-Actor': DB.settings.operatorName || '', ...(headers || {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw Object.assign(new Error('تعذّر الوصول إلى العامل المحلي. تحقق من تشغيله ومن ALLOWED_ORIGIN.'), { status: 0 }); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || data.message || ('HTTP ' + r.status)), { status: r.status, data });
    return data;
  }
  async function loadList() { const s = X(); try { s.list = await api('GET', '/api/content'); s.err = ''; } catch (e) { s.err = e.message; s.list = s.list || []; } }
  async function loadConfig() { const s = X(); try { s.config = await api('GET', '/api/cms/config'); } catch (e) { s.config = null; } }
  async function loadSys() { const s = X(); try { s.sys = await api('GET', '/api/system/status'); s.sysErr = ''; } catch (e) { s.sys = false; s.sysErr = e.message; } }
  async function loadPubs() { const s = X(); try { s.pubs = await api('GET', '/api/publications'); } catch (e) { s.err = e.message; s.pubs = s.pubs || []; } }
  async function openRecord(id) {
    const s = X(); s.busy = true; render();
    try { s.rec = await api('GET', '/api/content/' + encodeURIComponent(id)); s.draft = JSON.parse(JSON.stringify(s.rec)); s.dirty = false; s.err = ''; s.recPubs = await api('GET', '/api/publications?contentId=' + encodeURIComponent(id)); }
    catch (e) { s.err = e.message; }
    s.busy = false; go('cmsedit');
  }

  /* ---------- allowed actions (pure; mirrors the server state machine) ---------- */
  function allowedActions(rec, { dirty = false, valid = true, now = Date.now() } = {}) {
    const a = [];
    if (!rec) return a;
    const s = rec.status;
    if (s === 'IDEA') a.push('start');
    if (['IDEA', 'DRAFT'].includes(s) && !dirty) a.push('submit');
    if (s === 'REVIEW' && !dirty) a.push('approve', 'reject');
    if (s === 'APPROVED' && !dirty) a.push('schedule');
    if (s === 'SCHEDULED') a.push('unschedule');
    // Publish is offered ONLY for approved content (or scheduled content whose time has come) that validates.
    if (!dirty && valid && (s === 'APPROVED' || (s === 'SCHEDULED' && rec.scheduledAt && Date.parse(rec.scheduledAt) <= now))) a.push('publish');
    if (rec.live) a.push('unpublish');
    if (['IDEA', 'DRAFT', 'REVIEW', 'APPROVED', 'SCHEDULED'].includes(s) && !rec.live) a.push('archive');
    if (s === 'ARCHIVED') a.push('restore');
    return a;
  }
  window.FOXREX_CMS_UI = { allowedActions, stateClass: v => STATE_CLS[v] };

  /* ---------- library ---------- */
  function translationState(rec, list) {
    const other = rec.language === 'en' ? 'ar' : 'en';
    const sib = list.find(r => r.translationGroupId === rec.translationGroupId && r.language === other);
    if (!sib) return `<span class="tag exp" title="الترجمة غير موجودة">${other.toUpperCase()} ✕</span>`;
    return `<span class="tag ${sib.status === 'PUBLISHED' ? 'ok' : ''}" title="${E(ST_AR[sib.status])}">${other.toUpperCase()} · ${E(ST_AR[sib.status])}</span>`;
  }
  function filtered() {
    const s = X(), f = s.filters, q = (s.q || '').trim().toLowerCase();
    let l = (s.list || []).filter(r => (!f.type || r.type === f.type) && (!f.status || r.status === f.status) && (!f.language || r.language === f.language) &&
      (!f.symbol || r.symbol === f.symbol) && (!f.category || r.category === f.category) && (!f.market || r.market === f.market) &&
      (!f.from || (r.updatedAt || '') >= f.from) && (!f.to || (r.updatedAt || '').slice(0, 10) <= f.to) &&
      (!q || [r.title, r.id, r.slug, r.symbol].join(' ').toLowerCase().includes(q)));
    const by = { updated: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''), newest: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
      oldest: (a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''), scheduled: (a, b) => (a.scheduledAt || '9').localeCompare(b.scheduledAt || '9'),
      published: (a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '') }[s.sort];
    return by ? l.sort(by) : l;
  }
  const sel = (key, label, opts) => `<label class="cms-f"><span>${label}</span><select data-cff="${key}"><option value="">الكل</option>${opts.map(([v, t]) => `<option value="${E(v)}" ${X().filters[key] === v ? 'selected' : ''}>${E(t)}</option>`).join('')}</select></label>`;

  /* Publishing mode comes from the worker's server configuration (PUBLISH_MODE) — Studio can only display it. */
  function publishMode() { const s = X(); return (s.sys && s.sys.readiness && s.sys.readiness.publishing.mode) || (s.config && s.config.publish && s.config.publish.mode) || null; }
  function modeBanner() {
    const mode = publishMode();
    if (!mode) return `<div class="mode-banner mode-off" role="status"><b class="ltr">WORKER NOT CONNECTED</b><span>العامل غير متصل — لا يمكن المعاينة أو النشر. اربطه من الإعدادات.</span></div>`;
    return mode === 'live'
      ? `<div class="mode-banner mode-live" role="status" data-mode="live"><b class="ltr">LIVE PUBLISHING</b><span>النشر مباشر: التأكيد يكتب commit ويدفعه إلى الموقع العام foxrex.co.</span></div>`
      : `<div class="mode-banner mode-dry" role="status" data-mode="dry-run"><b class="ltr">DRY RUN</b><span>وضع تجريبي: لا يُكتب ولا يُدفع أي شيء. التحويل إلى LIVE يتم فقط من إعدادات الخادم (PUBLISH_MODE=live).</span></div>`;
  }
  function header(title, sub) {
    const s = X();
    if (s.sys === null && !s.sysLoading) { s.sysLoading = true; loadSys().then(() => { s.sysLoading = false; render(); }); }
    return modeBanner() + `<div class="head"><div><h1>${title}</h1><p>${sub}</p></div><div class="row">
      <button class="btn" data-act="cms-refresh">تحديث</button></div></div>
      ${!DB.settings.operatorName ? `<div class="warnbox" style="margin-bottom:12px">سجل التدقيق يحتاج اسم المحرر. <label class="f" style="display:inline">اسم المحرر (Operator)</label> <input type="text" data-set="operatorName" placeholder="مثال: Zak" style="max-width:220px;display:inline-block"></div>` : ''}
      ${s.err ? `<div class="errbox" style="margin-bottom:12px">${E(s.err)}</div>` : ''}`;
  }

  function viewLibrary() {
    const s = X();
    if (s.list === null) { loadList().then(loadConfig).then(render); return header('المحتوى التحريري', 'Editorial library') + '<div class="empty">جارٍ التحميل…</div>'; }
    const rows = filtered(), syms = [...new Set((s.list || []).map(r => r.symbol).filter(Boolean))], cats = [...new Set((s.list || []).map(r => r.category).filter(Boolean))];
    return header('المحتوى التحريري', 'مكتبة المحتوى القابل للنشر على foxrex.co — كل عنصر يمر بالمراجعة والاعتماد قبل النشر.') + `
    <section class="panel" style="margin-bottom:14px"><div class="cms-new">
      <label class="cms-f"><span>نوع جديد</span><select id="cms-new-type">${TYPES_ORDER.map(t => `<option value="${t}">${E(typeLabel(t))} · ${t}</option>`).join('')}</select></label>
      <label class="cms-f"><span>اللغة</span><select id="cms-new-lang"><option value="en">English</option><option value="ar">العربية</option></select></label>
      <label class="cms-f" style="flex:1"><span>العنوان</span><input type="text" id="cms-new-title" dir="auto" placeholder="عنوان العنصر"></label>
      <button class="btn pri" data-act="cms-new">إنشاء مسودة</button><button class="btn" data-act="cms-new" data-idea="1">حفظ كفكرة</button></div>
      <div class="cms-new" style="margin-top:10px"><button class="btn" data-act="cms-gold-pair">Gold Focus جديد ثنائي اللغة <span class="ltr">(EN + AR)</span></button><span class="hint" style="margin:0">ينشئ مسودة إنجليزية فارغة ومسودة عربية فارغة مرتبطتين — لا محتوى مُولّد، وكل لغة تُعتمد بشكل مستقل.</span></div></section>
    <section class="panel" style="margin-bottom:14px"><div class="cms-filters">
      <label class="cms-f" style="flex:1 1 200px"><span>بحث</span><input type="search" id="cms-q" data-cfq value="${E(s.q)}" placeholder="عنوان، رمز، معرّف…" dir="auto"></label>
      ${sel('type', 'النوع', TYPES_ORDER.map(t => [t, typeLabel(t)]))}
      ${sel('status', 'الحالة', C.STATES.map(x => [x, ST_AR[x]]))}
      ${sel('language', 'اللغة', [['en', 'English'], ['ar', 'العربية']])}
      ${sel('symbol', 'الرمز', syms.map(x => [x, x]))}
      ${sel('category', 'الفئة', cats.map(x => [x, x]))}
      ${sel('market', 'السوق', [...new Set((s.list || []).map(r => r.market).filter(Boolean))].map(x => [x, x]))}
      <label class="cms-f"><span>من</span><input type="date" data-cff="from" value="${E(s.filters.from || '')}"></label>
      <label class="cms-f"><span>إلى</span><input type="date" data-cff="to" value="${E(s.filters.to || '')}"></label>
      <label class="cms-f"><span>الترتيب</span><select data-cfs>${[['updated', 'آخر تحديث'], ['newest', 'الأحدث'], ['oldest', 'الأقدم'], ['scheduled', 'موعد الجدولة'], ['published', 'تاريخ النشر']].map(([v, t]) => `<option value="${v}" ${s.sort === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div></section>
    <section class="panel scroll"><table class="t cms-table"><thead><tr><th>العنوان</th><th>النوع</th><th>اللغة</th><th>الحالة</th><th>الترجمة</th><th>الرمز</th><th>آخر تحديث</th><th>مجدول / منشور</th><th>إجراءات</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><button class="linkish" data-act="cms-open" data-id="${E(r.id)}" dir="auto">${E(r.title || '(بدون عنوان)')}</button>${r.aiGenerated ? ' <span class="tag" title="مسودة مولّدة بالذكاء الاصطناعي — تحتاج مراجعة">AI</span>' : ''}${r.live ? ` <span class="tag ok" title="منشور على الموقع">LIVE v${r.live.publishVersion}</span>` : ''}${flagTag(r)}${expTag(r)}</td>
      <td>${E(typeLabel(r.type))}</td><td>${lang(r.language)}</td><td>${st(r.status)}</td><td>${translationState(r, s.list)}</td><td class="ltr">${E(r.symbol || '—')}</td>
      <td class="num">${fmt(r.updatedAt)}</td><td class="num">${r.status === 'SCHEDULED' ? fmt(r.scheduledAt) : r.publishedAt ? fmt(r.publishedAt) : '—'}</td>
      <td class="cms-acts">${rowActions(r)}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">لا يوجد محتوى مطابق. أنشئ أول مسودة من الأعلى.</td></tr>'}
    </tbody></table></section>`;
  }
  const FLAG_AR = { MISSED: 'فات موعده', EXPIRED: 'منتهي', STALE: 'تغيّر بعد الجدولة', INVALID: 'غير صالح' };
  function flagTag(r) { const f = r.scheduleFlag; return f && r.status === 'SCHEDULED' ? ` <span class="tag bad" title="${E(f.reason || '')}" data-flag="${E(f.state)}">${E(FLAG_AR[f.state] || f.state)} <span class="ltr">${E(f.state)}</span></span>` : ''; }
  function expTag(r) { return r.expiresAt && Date.parse(r.expiresAt) <= Date.now() ? ' <span class="tag exp" title="انتهت صلاحية هذا المحتوى">منتهي الصلاحية</span>' : ''; }
  function rowActions(r) {
    const acts = allowedActions(r, { valid: true });
    const b = (act, label, extra = '') => `<button class="btn sm" data-act="${act}" data-id="${E(r.id)}" ${extra}>${label}</button>`;
    const out = [b('cms-open', 'فتح'), b('cms-dup', 'تكرار')];
    const other = r.language === 'en' ? 'ar' : 'en';
    if (!X().list.some(x => x.translationGroupId === r.translationGroupId && x.language === other)) out.push(b('cms-translate', other === 'ar' ? 'ترجمة ← AR' : 'ترجمة ← EN', `data-mode="blank"`));
    if (acts.includes('submit')) out.push(b('cms-tr', 'إرسال للمراجعة', 'data-a="submit"'));
    if (acts.includes('approve')) out.push(b('cms-tr', 'اعتماد', 'data-a="approve"'));
    if (acts.includes('schedule')) out.push(b('cms-open', 'جدولة'));
    if (acts.includes('publish')) out.push(b('cms-preview', 'معاينة ونشر', 'class="btn sm pri"'));
    if (acts.includes('archive')) out.push(b('cms-tr', 'أرشفة', 'data-a="archive"'));
    return out.join('');
  }

  /* ---------- editor ---------- */
  const get = (o, p) => p.split('.').reduce((x, k) => x == null ? x : x[k], o);
  function set(o, p, v) { const ks = p.split('.'); let x = o; ks.slice(0, -1).forEach((k, i) => { if (x[k] == null || typeof x[k] !== 'object') x[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; x = x[k]; }); x[ks[ks.length - 1]] = v; }
  function fld(label, path, kind = 'text', opts = {}) {
    const d = X().draft, v = get(d, path), ar = d.language === 'ar' && !opts.ltr;
    const dir = opts.ltr ? 'ltr' : ar ? 'rtl' : 'auto', errs = (X().errors || []).filter(e => e.field === path || e.field.startsWith(path + '.'));
    const lbl = `<label class="f" for="cf-${path}">${label}${opts.req ? ' <b class="req">*</b>' : ''}${opts.hint ? ` <span class="hint">${opts.hint}</span>` : ''}</label>`;
    let input;
    if (kind === 'area') input = `<textarea id="cf-${path}" data-cf="${path}" dir="${dir}" rows="${opts.rows || 4}" class="${ar ? 'ar-text' : ''}">${E(v || '')}</textarea>`;
    else if (kind === 'select') input = `<select id="cf-${path}" data-cf="${path}"><option value="">—</option>${opts.options.map(o => `<option value="${E(o[0])}" ${v === o[0] ? 'selected' : ''}>${E(o[1])}</option>`).join('')}</select>`;
    else if (kind === 'list') input = `<input type="text" id="cf-${path}" data-cf="${path}" data-kind="list" dir="ltr" value="${E((v || []).join(', '))}" placeholder="${E(opts.ph || 'مفصولة بفواصل')}">`;
    else if (kind === 'number') input = `<input type="text" inputmode="decimal" id="cf-${path}" data-cf="${path}" data-kind="number" dir="ltr" value="${v == null ? '' : E(v)}">`;
    else if (kind === 'datetime') input = `<input type="datetime-local" id="cf-${path}" data-cf="${path}" data-kind="datetime" value="${v ? C.utcToIstanbulLocal(v) : ''}"><span class="hint">بتوقيت إسطنبول — يُخزَّن UTC</span>`;
    else input = `<input type="text" id="cf-${path}" data-cf="${path}" dir="${dir}" value="${E(v || '')}" class="${ar ? 'ar-text' : ''}">`;
    return `<div class="cms-field ${errs.length ? 'has-err' : ''}">${lbl}${input}${errs.map(e => `<p class="cms-err">${E(e.message)}</p>`).join('')}</div>`;
  }
  const section = (title, en, body) => `<section class="panel cms-sec"><h2>${title} <small class="ltr">${en}</small></h2>${body}</section>`;

  function viewEditor() {
    const s = X(), r = s.rec, d = s.draft;
    if (!r || !d) return header('محرر المحتوى', '') + '<div class="empty">اختر عنصرًا من المكتبة.</div>';
    const t = C.TYPES[d.type], f = 'fields.';
    s.errors = C.validateRecord(d, 'publish');
    const valid = !s.errors.length, acts = allowedActions(r, { dirty: s.dirty, valid });
    const trading = ['GOLD_FOCUS', 'ANALYSIS'].includes(d.type);
    const typeSpecific = {
      GOLD_FOCUS: [fld('حالة السوق', f + 'marketState', 'text', { req: 1 }), fld('المستوى المهم', f + 'importantLevel', 'text', { ltr: 1, hint: 'Pivot' }), levelsEditor('مستويات الدعم', 'Support', f + 'keySupport'), levelsEditor('مستويات المقاومة', 'Resistance', f + 'keyResistance')],
      ANALYSIS: [fld('الإطار الزمني', f + 'timeframe', 'text', { ltr: 1, hint: 'H4, D1…' }), fld('المستويات الرئيسية', f + 'keyLevels', 'list')],
      NEWS: [fld('الأهمية', f + 'importance', 'select', { req: 1, options: C.IMPORTANCE.map(x => [x, x]) }), fld('الأسواق المتأثرة', f + 'affectedMarkets', 'list', { ph: 'XAUUSD, DXY' }), fld('وقت الحدث', f + 'eventTime', 'datetime')],
      EVENT: [fld('الأهمية', f + 'importance', 'select', { req: 1, options: C.IMPORTANCE.map(x => [x, x]) }), fld('الأسواق المتأثرة', f + 'affectedMarkets', 'list'), fld('وقت الحدث', f + 'eventTime', 'datetime')],
      SIGNAL: [fld('الاتجاه', f + 'direction', 'select', { req: 1, options: C.DIRECTION.map(x => [x, x]) }), fld('الدخول', f + 'entry', 'text', { req: 1, ltr: 1 }), fld('وقف الخسارة', f + 'stopLoss', 'text', { req: 1, ltr: 1 }),
        fld('الأهداف', f + 'targets', 'list', { req: 1, ph: '2400, 2412' }), fld('الصلاحية', f + 'validity', 'text'), fld('رسالة المخاطرة', f + 'riskMessage', 'area', { req: 1, rows: 2 }), fld('سياق التحليل', f + 'analysisContext', 'area', { req: 1 })],
      SIGNAL_RESULT: [fld('معرّف الإشارة الأصلية', f + 'signalId', 'text', { req: 1, ltr: 1 }), fld('الاتجاه', f + 'direction', 'select', { req: 1, options: C.DIRECTION.map(x => [x, x]) }), fld('الدخول', f + 'entry', 'text', { req: 1, ltr: 1 }),
        fld('الخروج', f + 'exit', 'text', { req: 1, ltr: 1 }), fld('النتيجة', f + 'outcome', 'select', { req: 1, options: C.OUTCOME.map(x => [x, x]) }), fld('وقت الإغلاق', f + 'closedAt', 'datetime', { req: 1 }), fld('ملاحظات النتيجة', f + 'resultNotes', 'area', { req: 1, rows: 2 })]
    }[d.type] || [];
    const other = d.language === 'en' ? 'ar' : 'en', sib = (r.translations || []).find(x => x.language === other);
    const pubs = s.recPubs || [];
    return header(`${E(typeLabel(d.type))} <small class="ltr">${E(d.type)}</small>`, `<span class="ltr">${E(d.id)}</span>`) + `
    <div class="cms-bar panel">${st(r.status)} ${lang(d.language)} <span class="hint" style="margin:0">مراجعة ${r.revision}${r.live ? ` · <b class="ok">منشور v${r.live.publishVersion}</b> (${fmt(r.live.publishedAt)})` : ''}${r.status === 'SCHEDULED' ? ` · مجدول ${fmt(r.scheduledAt)}` : ''}${r.expiresAt ? ` · ينتهي ${fmt(r.expiresAt)}` : ''}${s.dirty ? ' · <b class="warn">تغييرات غير محفوظة</b>' : ''}</span>
      <span class="cms-bar__acts">
      ${r.status !== 'ARCHIVED' ? `<button class="btn ${s.dirty ? 'pri' : ''}" data-act="cms-save" ${s.dirty ? '' : 'disabled'}>حفظ المسودة</button>` : ''}
      ${acts.includes('start') ? '<button class="btn" data-act="cms-tr" data-a="start">بدء المسودة</button>' : ''}
      ${acts.includes('submit') ? `<button class="btn" data-act="cms-tr" data-a="submit" ${valid ? '' : 'disabled title="أصلح أخطاء التحقق أولًا"'}>إرسال للمراجعة</button>` : ''}
      ${acts.includes('approve') ? `<button class="btn pri" data-act="cms-tr" data-a="approve" ${valid ? '' : 'disabled'}>اعتماد</button><button class="btn" data-act="cms-tr" data-a="reject">طلب تعديلات</button>` : ''}
      ${acts.includes('schedule') ? `<input type="datetime-local" id="cms-sched" aria-label="موعد النشر (إسطنبول)"><button class="btn" data-act="cms-schedule">جدولة</button>` : ''}
      ${acts.includes('unschedule') ? '<button class="btn" data-act="cms-tr" data-a="unschedule">إلغاء الجدولة</button>' : ''}
      ${acts.includes('publish') ? '<button class="btn pri" data-act="cms-preview">معاينة ونشر…</button>' : ''}
      ${acts.includes('unpublish') ? '<button class="btn bad" data-act="cms-unpublish">إلغاء النشر…</button>' : ''}
      ${acts.includes('archive') ? '<button class="btn" data-act="cms-tr" data-a="archive">أرشفة</button>' : ''}
      ${acts.includes('restore') ? '<button class="btn" data-act="cms-tr" data-a="restore">استعادة</button>' : ''}
      </span></div>
    ${r.status === 'PUBLISHED' || (r.live && r.status !== 'PUBLISHED') ? `<p class="hint">${r.live && r.status !== 'PUBLISHED' ? 'النسخة المنشورة v' + r.live.publishVersion + ' ما زالت ظاهرة على الموقع حتى تُعتمد هذه المسودة ويُعاد نشرها.' : 'أي تعديل ينشئ مسودة جديدة (يُلغى الاعتماد) — تبقى النسخة الحالية منشورة حتى إعادة النشر.'}</p>` : ''}
    ${r.scheduleFlag && r.status === 'SCHEDULED' ? `<div class="errbox" style="margin-bottom:12px"><b>${E(FLAG_AR[r.scheduleFlag.state] || r.scheduleFlag.state)} <span class="ltr">${E(r.scheduleFlag.state)}</span></b> — ${E(r.scheduleFlag.reason || '')}. لن يُنشر تلقائيًا؛ أعد الجدولة أو انشره يدويًا بعد المعاينة والتأكيد.</div>` : ''}
    ${r.aiGenerated ? `<div class="warnbox">مسودة مولّدة بالذكاء الاصطناعي (${E(r.aiGenerated.provider)} / ${E(r.aiGenerated.model)}). راجع كل جملة ومصدر قبل الإرسال. ${(r.aiGenerated.warnings || []).map(E).join(' ')}</div>` : ''}
    <div class="cms-grid"><div>
      ${section('المحتوى', 'Content', fld('العنوان', 'title', 'text', { req: 1 }) + fld('الملخص', 'summary', 'area', { req: 1, rows: 3 }) + fld('النص', 'body', 'area', { req: !!t.body, rows: 10, hint: 'نص عادي — سطر فارغ بين الفقرات. لا HTML.' }))}
      ${section('التصنيف', 'Classification', `<div class="fg">${fld('الفئة', 'category', d.type === 'NEWS' ? 'select' : d.type === 'ANALYSIS' ? 'select' : 'text', { req: ['NEWS', 'ANALYSIS'].includes(d.type), ltr: 1, options: (d.type === 'NEWS' ? C.NEWS_CATEGORIES : C.ANALYSIS_CATEGORIES).map(x => [x, x]) })}${fld('السوق', 'market', 'text', { ltr: 1 })}${fld('الرمز', 'symbol', 'text', { ltr: 1, req: ['ANALYSIS', 'SIGNAL', 'SIGNAL_RESULT'].includes(d.type), hint: t.fixedSymbol ? 'ثابت: ' + t.fixedSymbol : '' })}${fld('الوسوم', 'tags', 'list')}</div>`)}
      ${trading || typeSpecific.length ? section(trading ? 'السياق التداولي' : 'تفاصيل النوع', trading ? 'Trading context' : 'Type details', `<div class="fg">${trading ? fld('الاتجاه', 'bias', 'select', { req: 1, options: C.BIAS.map(x => [x, BIAS_LABEL[x]]) }) : ''}${typeSpecific.join('')}</div>${trading ? fld('السيناريو الصاعد', f + 'bullishScenario', 'area', { req: d.type === 'GOLD_FOCUS', rows: 2 }) + fld('السيناريو الهابط', f + 'bearishScenario', 'area', { req: d.type === 'GOLD_FOCUS', rows: 2 }) + fld('مستوى الإلغاء', f + 'invalidation', 'area', { req: d.type === 'GOLD_FOCUS', rows: 2 }) +
        `<div class="fg">${fld('السعر (اختياري)', f + 'price', 'number', { hint: 'يتطلب مصدرًا ووقتًا' })}${fld('مصدر السعر', f + 'priceSource', 'text', { ltr: 1 })}${fld('وقت السعر', f + 'priceTime', 'datetime')}</div>` +
        (d.type === 'GOLD_FOCUS' ? `<div class="row"><button class="btn sm" data-act="cms-gold-snapshot">أخذ لقطة من سعر XAUUSD الموثّق الحالي</button><span class="hint" style="margin:0">لقطة ثابتة تُحفظ مع التحليل (السعر + المصدر + الوقت). السعر المباشر لا يغيّر التحليل المنشور أبدًا.</span></div>` : '') : ''}`) : ''}
      ${section('المصادر', 'Sources', sourcesEditor())}
      ${section('المخاطر', 'Risk', fld('إفصاح المخاطر', 'riskDisclosure', 'area', { req: !!t.risk, rows: 2 }))}
    </div><div>
      ${section('النشر', 'Publishing', `<dl class="kv"><dt>اللغة</dt><dd>${d.language === 'ar' ? 'العربية' : 'English'}</dd><dt>قسم الموقع</dt><dd class="ltr">${E(t.section || '—')}</dd><dt>الوجهات</dt><dd>${C.destinations(d.type).map(p => `<a class="ltr" target="_blank" rel="noopener" href="${E(C.pageUrl(p, d.language, 'https://foxrex.co'))}">${E(C.pageUrl(p, d.language, ''))}</a>`).join('<br>') || '—'}</dd>
        <dt>نسخة النشر</dt><dd class="num">${r.publishing ? r.publishing.publishVersion : 0}</dd><dt>آخر نشر</dt><dd>${fmt(r.publishing && r.publishing.lastPublishedAt)}</dd><dt>معتمد من</dt><dd>${E(r.audit && r.audit.approvedBy || '—')} ${r.approvedAt ? '· ' + fmt(r.approvedAt) : ''}</dd></dl>
        ${fld('ينتهي في (اختياري)', 'expiresAt', 'datetime', { hint: 'بعده لا يُعرض كمحتوى حالي ولا يُنشر' })}${rollbackPanel(r)}`)}
      ${d.type === 'GOLD_FOCUS' ? section('قائمة النشر الأول', 'Gold Focus checklist', goldChecklist(d, r, sib)) + section('معاينة البطاقة', 'Gold Focus card', goldCard(d)) : ''}
      ${section('الترجمة', 'Translation', `<p class="hint">كل لغة سجل مستقل يحتاج مراجعته واعتماده الخاص.</p>${sib ? `<p><button class="linkish" data-act="cms-open" data-id="${E(sib.id)}">${other.toUpperCase()} · ${E(sib.title || '(بدون عنوان)')}</button> ${st(sib.status)}</p>` :
        `<p class="hint">لا توجد نسخة ${other === 'ar' ? 'عربية' : 'إنجليزية'}.</p><div class="row"><button class="btn" data-act="cms-translate" data-id="${E(d.id)}" data-mode="blank">مسودة ترجمة فارغة</button><button class="btn" data-act="cms-translate" data-id="${E(d.id)}" data-mode="ai">${other === 'ar' ? 'توليد مسودة عربية (AI)' : 'Generate English draft (AI)'}</button></div><p class="hint">مخرجات الذكاء الاصطناعي تُحفظ كمسودة فقط — لا اعتماد ولا نشر تلقائي.</p>`}`)}
      ${section('الوسائط', 'Media', `${fld('مسار الصورة', 'image.src', 'text', { ltr: 1, hint: 'assets/media/…png|jpg|webp' })}${fld('النص البديل', 'image.alt', 'text')}${fld('وصف بصري / Prompt', 'visualPrompt', 'area', { rows: 2 })}`)}
      ${section('SEO', 'SEO', fld('المعرّف في الرابط (slug)', 'slug', 'text', { ltr: 1, req: 1 }) + fld('عنوان SEO', 'seo.title', 'text') + fld('الوصف', 'seo.description', 'area', { rows: 2 }))}
      ${section('التواصل الاجتماعي', 'Social', fld('النص المرافق', 'social.caption', 'area', { rows: 3 }) + fld('الوسوم', 'social.hashtags', 'list'))}
      ${section('التحقق', 'Validation', s.errors.length ? `<ul class="cms-errs">${s.errors.map(e => `<li><span class="ltr">${E(e.field)}</span> — ${E(e.message)}</li>`).join('')}</ul>` : '<p class="ok">جاهز للمراجعة والنشر ✓</p>')}
      ${section('السجل', 'Audit', `<ul class="cms-hist">${(r.history || []).slice().reverse().slice(0, 30).map(h => `<li><span class="num">${fmt(h.at)}</span> · ${E(h.action)} · ${E(h.actor || '')}${h.note ? ` · <span class="ltr">${E(h.note)}</span>` : ''}</li>`).join('')}</ul>
        ${pubs.length ? `<h3>النشر</h3><ul class="cms-hist">${pubs.map(p => `<li>${E(p.result)} · ${E(p.action)} v${p.version} · ${fmt(p.requestedAt)}${p.commitSha ? ` · <span class="ltr">${E(p.commitSha.slice(0, 7))}</span>` : ''}${p.error ? ` · ${E(p.error)}` : ''}</li>`).join('')}</ul>` : ''}`)}
    </div></div>`;
  }
  const BIAS_LABEL = { bullish: 'BULLISH · صاعد', bearish: 'BEARISH · هابط', neutral: 'NEUTRAL · محايد' };
  function levelsEditor(label, en, path) {
    const d = X().draft, list = get(d, path) || [], errs = (X().errors || []).filter(e => e.field === path);
    return `<div class="cms-field cms-levels ${errs.length ? 'has-err' : ''}"><label class="f">${label} <span class="ltr hint">${en}</span> <b class="req">*</b></label>
      ${list.map((v, i) => `<div class="cms-level"><input type="text" inputmode="decimal" dir="ltr" data-cf="${path}.${i}" value="${E(v)}" aria-label="${en} ${i + 1}"><button class="btn sm" data-act="cms-lvl-del" data-path="${path}" data-i="${i}" aria-label="حذف">✕</button></div>`).join('')}
      <button class="btn sm" data-act="cms-lvl-add" data-path="${path}">+ مستوى</button>${errs.map(e => `<p class="cms-err">${E(e.message)}</p>`).join('')}</div>`;
  }
  /* First-publication readiness for Gold Focus — mirrors the server gate; the server preflight is authoritative. */
  function goldChecklist(d, r, sib) {
    const fl = d.fields || {}, has = v => typeof v === 'string' ? v.trim() !== '' : v != null, n = a => (a || []).filter(has).length;
    const priceOk = fl.price == null || fl.price === '' || (has(fl.priceSource) && !!fl.priceTime);
    const items = [
      ['العنوان والملخص', has(d.title) && has(d.summary)], ['الاتجاه (Bias)', C.BIAS.includes(d.bias)], ['حالة السوق', has(fl.marketState)],
      ['مستوى دعم واحد على الأقل', n(fl.keySupport) > 0], ['مستوى مقاومة واحد على الأقل', n(fl.keyResistance) > 0],
      ['السيناريو الصاعد والهابط', has(fl.bullishScenario) && has(fl.bearishScenario)], ['مستوى الإلغاء', has(fl.invalidation)],
      ['مصدر واحد على الأقل', (d.sourceReferences || []).some(x => has(x.name))], ['إفصاح المخاطر', has(d.riskDisclosure)],
      ['السعر مع مصدره ووقته (أو بدون سعر)', priceOk], ['لم تنتهِ الصلاحية', !(d.expiresAt && Date.parse(d.expiresAt) <= Date.now())],
      ['هذه اللغة معتمدة', ['APPROVED', 'SCHEDULED', 'PUBLISHED'].includes(r.status)],
      [`النسخة ${d.language === 'en' ? 'العربية' : 'الإنجليزية'} موجودة`, !!sib], [`النسخة ${d.language === 'en' ? 'العربية' : 'الإنجليزية'} معتمدة بشكل مستقل`, !!sib && ['APPROVED', 'SCHEDULED', 'PUBLISHED'].includes(sib.status)],
      ['اسم المحرر مضبوط', !!DB.settings.operatorName]
    ];
    const done = items.filter(x => x[1]).length;
    return `<p class="hint">${done}/${items.length} — الفحص النهائي (Preflight) يتم على الخادم قبل النشر.</p><ul class="cms-check">${items.map(([t, ok]) => `<li class="${ok ? 'ok' : 'bad'}"><span aria-hidden="true">${ok ? '✓' : '✕'}</span> ${t}</li>`).join('')}</ul>`;
  }
  function goldCard(d) {
    const fl = d.fields || {}, ar = d.language === 'ar', lv = a => (a || []).filter(x => String(x).trim()).map(E).join(' · ') || '—';
    const b = { bullish: ['Bullish', 'صاعد', 'up'], bearish: ['Bearish', 'هابط', 'down'], neutral: ['Neutral', 'محايد', 'flat'] }[d.bias];
    return `<div class="gold-card" dir="${ar ? 'rtl' : 'ltr'}" lang="${ar ? 'ar' : 'en'}">
      <div class="gold-card__top"><span class="ltr">XAUUSD</span>${b ? `<span class="gold-bias gold-bias--${b[2]}">${ar ? b[1] : b[0]}</span>` : '<span class="hint" style="margin:0">—</span>'}
      ${typeof fl.price === 'number' && fl.priceSource && fl.priceTime ? `<span class="ltr num">${E(fl.price.toFixed(2))}</span>` : ''}</div>
      <h4 dir="auto">${E(d.title || (ar ? 'العنوان' : 'Title'))}</h4><p dir="auto">${E(d.summary || '')}</p>
      <dl class="gold-lv"><div><dt>${ar ? 'الدعم' : 'Support'}</dt><dd class="ltr num">${lv(fl.keySupport)}</dd></div><div><dt>${ar ? 'المحوري' : 'Pivot'}</dt><dd class="ltr num">${E(fl.importantLevel || '—')}</dd></div><div><dt>${ar ? 'المقاومة' : 'Resistance'}</dt><dd class="ltr num">${lv(fl.keyResistance)}</dd></div></dl>
      ${fl.bullishScenario ? `<p dir="auto"><b class="ok">${ar ? 'صاعد' : 'Bullish'}:</b> ${E(fl.bullishScenario)}</p>` : ''}${fl.bearishScenario ? `<p dir="auto"><b class="bad">${ar ? 'هابط' : 'Bearish'}:</b> ${E(fl.bearishScenario)}</p>` : ''}
      ${fl.invalidation ? `<p dir="auto"><b>${ar ? 'مستوى الإلغاء' : 'Invalidation'}:</b> ${E(fl.invalidation)}</p>` : ''}</div><p class="hint">المعاينة الكاملة بمُعرِض الموقع الحقيقي متاحة من "معاينة ونشر".</p>`;
  }
  function rollbackPanel(r) {
    const vs = (r.publishedVersions || []).filter(v => v.entry && v.action !== 'unpublish').slice().reverse();
    if (!vs.length) return '';
    const cur = r.live && r.live.publishVersion;
    return `<h3 style="margin-top:12px">النسخ المنشورة <small class="ltr">Rollback</small></h3><p class="hint">إعادة نشر نسخة سابقة تنشئ commit تصحيحيًا جديدًا — لا يُعاد كتابة السجل.</p><ul class="cms-hist">${vs.map(v => `<li><span class="num">v${v.version}</span> · ${fmt(v.publishedAt)}${v.commitSha ? ` · <span class="ltr">${E(v.commitSha.slice(0, 7))}</span>` : ''}${v.version === cur ? ' · <b class="ok">الحالية</b>' : ` <button class="btn sm" data-act="cms-rollback" data-v="${v.version}">إعادة نشر v${v.version}…</button>`}</li>`).join('')}</ul>`;
  }
  function sourcesEditor() {
    const d = X().draft; d.sourceReferences = d.sourceReferences || [];
    return `<p class="hint">مطلوبة للأخبار والأحداث والأسعار والإحصاءات. لا تُقبل ادعاءات بلا مصدر.</p>` + d.sourceReferences.map((s, i) =>
      `<div class="cms-src">${fld('الاسم', `sourceReferences.${i}.name`, 'text', { ltr: 1 })}${fld('الرابط', `sourceReferences.${i}.url`, 'text', { ltr: 1 })}${fld('نُشر', `sourceReferences.${i}.publishedAt`, 'datetime')}<button class="btn sm" data-act="cms-src-del" data-i="${i}">حذف</button></div>`).join('') +
      '<button class="btn sm" data-act="cms-src-add">إضافة مصدر</button>' + ((X().errors || []).some(e => e.field === 'sourceReferences') ? `<p class="cms-err">${E(X().errors.find(e => e.field === 'sourceReferences').message)}</p>` : '');
  }

  /* ---------- publication center ---------- */
  function viewPublications() {
    const s = X();
    if (s.pubs === null || s.list === null) { Promise.all([loadPubs(), loadList(), loadConfig()]).then(render); return header('مركز النشر', 'Publication center') + '<div class="empty">جارٍ التحميل…</div>'; }
    const recs = s.list || [], pubs = s.pubs || [];
    const due = r => r.status === 'SCHEDULED' && Date.parse(r.scheduledAt) <= Date.now();
    const recRow = r => `<li class="li"><span><button class="linkish" data-act="cms-open" data-id="${E(r.id)}" dir="auto">${E(r.title)}</button><br><span class="m">${E(typeLabel(r.type))} · ${lang(r.language)} ${r.status === 'SCHEDULED' ? '· ' + fmt(r.scheduledAt) : ''}${flagTag(r)}</span></span>${st(r.status)}${r.status === 'APPROVED' || due(r) ? `<button class="btn sm pri" data-act="cms-preview" data-id="${E(r.id)}">معاينة ونشر…</button>` : ''}</li>`;
    const pubRow = p => `<tr><td><button class="linkish ltr" data-act="cms-open" data-id="${E(p.contentId)}">${E(p.contentId)}</button></td><td>${lang(p.language)}</td><td class="ltr">${E(p.action)} · ${E(p.contentType)}</td><td class="num">v${p.version}</td>
      <td class="num">${fmt(p.publishedAt || p.requestedAt)}</td><td class="ltr">${p.commitSha ? `<a target="_blank" rel="noopener" href="https://github.com/Zakoosh/FOXREX/commit/${E(p.commitSha)}">${E(p.commitSha.slice(0, 7))}</a>` : '—'}</td>
      <td><span class="tag ${p.result === 'SUCCESS' ? 'ok' : p.result === 'DRY_RUN_OK' ? '' : 'bad'}">${E(p.result)}</span>${p.deployment ? ` <span class="tag">${E(p.deployment)}</span>` : ''}${p.mode === 'dry-run' ? ' <span class="tag">DRY RUN</span>' : ''}${p.error ? `<br><span class="hint" style="margin:0">${E(p.error)}</span>` : ''}${p.deploymentNote ? `<br><span class="hint" style="margin:0">${E(p.deploymentNote)}</span>` : ''}</td>
      <td>${p.result === 'SUCCESS' && p.mode === 'live' ? `<button class="btn sm" data-act="pub-status" data-id="${E(p.publicationId)}">فحص النشر</button>${p.deployment === 'LIVE' ? (p.liveUrls || []).map(u => ` <a class="btn sm" target="_blank" rel="noopener" href="${E(u)}">فتح</a>`).join('') : ''}` : ''}</td></tr>`;
    const table = list => list.length ? `<div class="scroll"><table class="t"><thead><tr><th>المحتوى</th><th>اللغة</th><th>الإجراء</th><th>النسخة</th><th>الوقت</th><th>Commit</th><th>الحالة</th><th></th></tr></thead><tbody>${list.map(pubRow).join('')}</tbody></table></div>` : '<div class="empty">لا شيء هنا.</div>';
    const sch = s.config && s.config.scheduler;
    return header('مركز النشر', 'جاهز للنشر · المجدول · المنشور حديثًا · الفشل · التعارضات') + `
      <div class="grid2" style="margin-bottom:16px">
        <section class="panel"><h2>جاهز للنشر <small class="ltr">Ready</small></h2><ul class="list">${recs.filter(r => r.status === 'APPROVED' || due(r)).map(recRow).join('') || '<div class="empty">لا يوجد محتوى معتمد بانتظار النشر.</div>'}</ul></section>
        <section class="panel"><h2>مجدول <small class="ltr">Scheduled</small></h2><ul class="list">${recs.filter(r => r.status === 'SCHEDULED').map(recRow).join('') || '<div class="empty">لا يوجد محتوى مجدول.</div>'}</ul>
          <p class="hint">${sch && sch.enabled ? 'المُجدول التلقائي مفعّل على هذا العامل.' : 'التنفيذ التلقائي للجدولة غير مفعّل (SCHEDULER_ENABLED): العامل يعمل على جهاز المشغّل وليس خادمًا دائمًا. العناصر المستحقة تظهر في "جاهز للنشر" لنشرها يدويًا.'}</p></section>
      </div>
      <section class="panel" style="margin-bottom:16px"><h2>المنشور حديثًا <small class="ltr">Recently published</small></h2>${table(pubs.filter(p => p.result === 'SUCCESS').slice(0, 30))}</section>
      <div class="grid2"><section class="panel"><h2>فشل <small class="ltr">Failed</small></h2>${table(pubs.filter(p => p.result === 'FAILED').slice(0, 20))}</section>
      <section class="panel"><h2>تعارضات <small class="ltr">Conflicts</small></h2>${table(pubs.filter(p => p.result === 'CONFLICT').slice(0, 20))}</section></div>
      <section class="panel" style="margin-top:16px"><h2>تجارب النشر <small class="ltr">Dry runs</small></h2>${table(pubs.filter(p => p.result === 'DRY_RUN_OK').slice(0, 10))}</section>`;
  }

  /* ---------- preview + confirmation modal ---------- */
  function modal(html) { let m = document.getElementById('cms-modal'); if (!m) { m = document.createElement('div'); m.id = 'cms-modal'; m.className = 'cms-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); document.body.appendChild(m); } m.innerHTML = `<div class="cms-modal__box">${html}</div>`; m.hidden = false; const f = m.querySelector('button,[href]'); if (f) f.focus(); }
  function closeModal() { const m = document.getElementById('cms-modal'); if (m) { m.hidden = true; m.innerHTML = ''; } X().modal = null; }
  async function openPreview(id) {
    const s = X();
    try {
      const rec = await api('GET', '/api/content/' + encodeURIComponent(id));
      const [pv, feed] = await Promise.all([api('POST', '/api/publish/preview', { contentId: id }), api('GET', '/api/feed')]);
      if (pv.errors && pv.errors.length) { modal(`<h2>لا يمكن النشر بعد</h2><ul class="cms-errs">${pv.errors.map(e => `<li><span class="ltr">${E(e.field)}</span> — ${E(e.message)}</li>`).join('')}</ul><div class="row"><button class="btn" data-act="cms-close">إغلاق</button></div>`); return; }
      const candidate = C.applyToFeed(feed.feed, pv.entry, { id: 'pub_preview00', at: pv.entry.publishedAt, contentId: rec.id, action: 'publish', version: pv.entry.publishVersion });
      s.modal = { rec, pv, candidate, pf: null, page: C.destinations(rec.type)[C.destinations(rec.type).length - 1] };
      renderPreview(); runPreflight();
    } catch (e) { toast(e.message); }
  }
  async function runPreflight() {
    const m = X().modal; if (!m) return;
    m.pf = { running: true }; paintPreflight();
    try { m.pf = await api('POST', '/api/publish/preflight', { contentId: m.rec.id, expectedVersion: m.pv.feedVersion }); }
    catch (e) { m.pf = { ready: false, status: 'BLOCKED', checks: [{ id: 'worker', label: 'Preflight request', ok: false, detail: e.message }] }; }
    paintPreflight();
  }
  function preflightHtml(pf) {
    if (!pf || pf.running) return '<p class="hint">جارٍ الفحص المسبق (Preflight)… المستودع، الفرع، التحديث، التحقق، المخطط والاختبارات.</p>';
    return `<div class="pf pf--${pf.ready ? 'ready' : 'blocked'}"><b class="ltr">${E(pf.status)}</b>${pf.ready ? '' : ' — أصلح العوائق التالية قبل النشر'}</div>` + checkList(pf.checks);
  }
  function checkList(checks) {
    return `<ul class="cms-check">${(checks || []).map(c => `<li class="${c.ok ? 'ok' : 'bad'}" data-check="${E(c.id)}"><span aria-hidden="true">${c.ok ? '✓' : '✕'}</span> <span class="ltr">${E(c.label)}</span>${c.detail ? `<br><small class="ltr">${E(String(c.detail).slice(0, 300))}</small>` : ''}</li>`).join('')}</ul>`;
  }
  function paintPreflight() {
    const m = X().modal, box = document.getElementById('cms-pf'); if (!m || !box) return;
    box.innerHTML = preflightHtml(m.pf);
    const btn = document.querySelector('[data-act="cms-confirm"]');
    if (btn) { const ok = m.pf && m.pf.ready && m.pv.mode === 'live'; btn.disabled = !ok; btn.title = ok ? '' : m.pv.mode !== 'live' ? 'DRY RUN mode — live publishing is enabled only in the worker configuration' : 'Preflight is BLOCKED'; }
  }
  const FOCUS = { gold: '[data-gold-focus]', desk: '[data-editorial]', analysis: '[data-analysis-list]', news: '[data-news-list]', learn: '[data-learn-list]', signals: '[data-signal-list],[data-signal-results]' };
  function renderPreview() {
    const m = X().modal, r = m.rec, e = m.pv.entry, mode = m.pv.mode;
    const src = '../' + (r.language === 'ar' ? 'ar/' : '') + (C.PAGE_PATH[m.page] || '') + '?preview=1';
    modal(`<div class="cms-prev"><div class="cms-prev__side">
      <h2>معاينة قبل النشر</h2>
      <dl class="kv"><dt>المحتوى</dt><dd dir="auto">${E(typeLabel(r.type))} — ${E(e.title)}</dd><dt>اللغة</dt><dd>${r.language === 'ar' ? 'العربية' : 'English'}</dd>
        <dt>الوجهات</dt><dd>${m.pv.destinations.map(d => `<button class="chip" data-act="cms-prev-page" data-page="${E(d.page)}" aria-pressed="${d.page === m.page}">${E(d.page)}</button>`).join(' ')}</dd>
        <dt>الملخص</dt><dd dir="auto">${E(e.summary)}</dd>${e.body ? `<dt>النص</dt><dd dir="auto" class="cms-clip">${E(e.body.slice(0, 400))}${e.body.length > 400 ? '…' : ''}</dd>` : ''}
        ${e.image ? `<dt>الصورة</dt><dd class="ltr">${E(e.image.src)}<br>alt: ${E(e.image.alt)}</dd>` : ''}
        <dt>SEO</dt><dd dir="auto">${E((e.seo && e.seo.title) || e.title)}<br><span class="hint" style="margin:0">${E((e.seo && e.seo.description) || e.summary)}</span></dd>
        ${e.riskDisclosure ? `<dt>المخاطر</dt><dd dir="auto">${E(e.riskDisclosure)}</dd>` : ''}<dt>النسخة</dt><dd class="num">v${e.publishVersion}</dd>
        <dt>وضع النشر</dt><dd>${mode === 'live' ? '<b class="bad">مباشر LIVE — سيُحدَّث الموقع العام</b>' : '<b>تجريبي DRY RUN — لن يُكتب أو يُدفع شيء</b>'}</dd></dl>
      <h3>الفحص المسبق <small class="ltr">Preflight</small></h3><div id="cms-pf">${preflightHtml(m.pf)}</div>
      <div class="row"><button class="btn" data-act="cms-close">إلغاء</button><button class="btn" data-act="cms-pf-run">إعادة الفحص</button><button class="btn" data-act="cms-dry">تجربة (Dry run)</button><button class="btn pri" data-act="cms-confirm" disabled>نشر…</button></div>
      <div id="cms-dry-out"></div></div>
      <iframe class="cms-prev__frame" title="معاينة الموقع العام" src="${E(src)}"></iframe></div>`);
    paintPreflight();
    const frame = document.querySelector('.cms-prev__frame');
    const send = () => frame.contentWindow && frame.contentWindow.postMessage({ type: 'foxrex-preview', feed: m.candidate, focus: FOCUS[C.TYPES[r.type].section] }, location.origin);
    window.addEventListener('message', function onReady(ev) { if (ev.origin === location.origin && ev.data && ev.data.type === 'foxrex-preview-ready' && ev.source === frame.contentWindow) { send(); } });
  }
  function confirmPublish() {
    const m = X().modal, r = m.rec, e = m.pv.entry;
    if (!m.pf || !m.pf.ready || m.pv.mode !== 'live') return; // the server re-checks everything anyway
    modal(`<h2>نشر هذا المحتوى؟</h2><dl class="kv"><dt>المحتوى</dt><dd dir="auto">${E(typeLabel(r.type))} — ${E(e.title)}</dd><dt>اللغة</dt><dd>${r.language === 'ar' ? 'العربية' : 'English'}</dd>
      <dt>الوجهات</dt><dd>${m.pv.destinations.map(d => E(d.page)).join('، ')}</dd><dt>النسخة</dt><dd class="num">v${e.publishVersion}</dd></dl>
      <p class="warnbox">سيؤدي هذا إلى تحديث ملف المحتوى العام لـ FOXREX (data/content.json) وإنشاء commit ودفعه إلى GitHub Pages.</p>
      <div class="row"><button class="btn" data-act="cms-close">إلغاء</button><button class="btn pri" data-act="cms-publish">نشر</button></div><div id="cms-pub-out"></div>`);
  }
  async function doPublish(dryRun) {
    const m = X().modal; if (!m) return;
    const out = document.getElementById(dryRun ? 'cms-dry-out' : 'cms-pub-out'); if (out) out.innerHTML = '<p class="hint">جارٍ التنفيذ… (تحقق، مخطط، اختبارات' + (dryRun ? '' : '، commit، push') + ')</p>';
    try {
      const res = await api('POST', '/api/publish', { contentId: m.rec.id, expectedVersion: m.pv.feedVersion, confirm: true, dryRun }, { 'Idempotency-Key': `publish:${m.rec.id}@r${m.rec.revision}` });
      if (dryRun) { if (out) out.innerHTML = `<p class="ok">نجحت التجربة ✓ — لم يُكتب أو يُدفع أي شيء.</p><details><summary>Diff</summary><pre class="ltr cms-diff">${E(res.diff || '')}</pre></details>`; loadPubs(); return; }
      closeModal(); toast('تم الدفع: ' + (res.commitSha || '').slice(0, 7) + ' — بانتظار نشر GitHub Pages');
      X().pubs = null; X().list = null; await openRecord(m.rec.id);
    } catch (e) {
      const conflict = e.status === 409 && e.data && e.data.code === 'CONFLICT';
      if (out) out.innerHTML = `<div class="errbox">${E(conflict ? 'تغيّر المحتوى المنشور منذ تحميل هذا العنصر. حدّث قبل النشر. (Published content changed since this item was loaded. Refresh before publishing.)' : e.message)}${(e.data && e.data.errors || []).map(x => `<br>• ${E(x.message || x)}`).join('')}${(e.data && e.data.publication && e.data.publication.checks || []).filter(c => !c.ok).map(c => `<pre class="ltr cms-diff">${E(c.output)}</pre>`).join('')}</div>${conflict ? '<button class="btn" data-act="cms-repreview">تحديث المعاينة</button>' : ''}`;
    }
  }
  async function doUnpublish() {
    const r = X().rec; if (!r) return;
    modal(`<h2>إلغاء نشر هذا المحتوى؟</h2><p dir="auto">${E(r.title)}</p><p class="warnbox">سيُزال من الموقع العام ويُؤرشف في Studio. يبقى سجل التدقيق والنشر كاملًا.</p><div class="row"><button class="btn" data-act="cms-close">إلغاء</button><button class="btn bad" data-act="cms-unpublish-go">إلغاء النشر</button></div><div id="cms-pub-out"></div>`);
  }

  /* ---------- rollback: republish a previous version as a new corrective commit ---------- */
  function openRollback(version) {
    const r = X().rec, v = (r.publishedVersions || []).find(x => x.version === +version); if (!v) return;
    const mode = publishMode();
    X().modal = { rollback: { version: v.version } };
    modal(`<h2>إعادة نشر النسخة v${v.version}؟</h2><dl class="kv"><dt>المحتوى</dt><dd dir="auto">${E(v.entry.title)}</dd><dt>نُشرت</dt><dd>${fmt(v.publishedAt)}</dd><dt>الإجراء</dt><dd>commit تصحيحي جديد يعيد محتوى v${v.version} كنسخة جديدة — بدون إعادة كتابة السجل ولا force push.</dd>
      <dt>وضع النشر</dt><dd>${mode === 'live' ? '<b class="bad">LIVE PUBLISHING</b>' : '<b>DRY RUN — لن يُكتب أو يُدفع شيء</b>'}</dd></dl>
      <div class="row"><button class="btn" data-act="cms-close">إلغاء</button><button class="btn" data-act="cms-rollback-go" data-dry="1">تجربة (Dry run)</button>${mode === 'live' ? `<button class="btn bad" data-act="cms-rollback-go">إعادة نشر v${v.version}</button>` : ''}</div><div id="cms-pub-out"></div>`);
  }
  async function doRollback(dryRun) {
    const s = X(), r = s.rec, v = s.modal && s.modal.rollback && s.modal.rollback.version, out = document.getElementById('cms-pub-out'); if (!v) return;
    try {
      const f = await api('GET', '/api/feed');
      const res = await api('POST', '/api/republish', { contentId: r.id, version: v, expectedVersion: f.version, confirm: true, dryRun }, { 'Idempotency-Key': `republish:${r.id}@v${v}@r${r.revision}@${f.version}` });
      if (dryRun || res.result === 'DRY_RUN_OK') { if (out) out.innerHTML = `<p class="ok">نجحت التجربة ✓ — لم يُكتب أو يُدفع شيء.</p><details><summary>Diff</summary><pre class="ltr cms-diff">${E(res.diff || '')}</pre></details>`; return; }
      closeModal(); toast('commit تصحيحي: ' + (res.commitSha || '').slice(0, 7)); s.pubs = null; s.list = null; await openRecord(r.id);
    } catch (e) { if (out) out.innerHTML = `<div class="errbox">${E(e.message)}</div>`; }
  }

  /* ---------- system status (health vs readiness) ---------- */
  const STATE_CLS = { READY: 'ok', HEALTHY: 'ok', ENABLED: 'ok', CONNECTED: 'ok', DEGRADED: 'warn', CONNECTING: 'warn', RATE_LIMITED: 'warn', DISABLED: '', IDLE: '',
    UNAVAILABLE: 'bad', DISCONNECTED: 'bad', AUTH_FAILED: 'bad', BLOCKED_MISSING_CREDENTIALS: 'bad' };
  const STATE_AR = { READY: 'جاهز', HEALTHY: 'سليم', ENABLED: 'مفعّل', CONNECTED: 'متصل', DEGRADED: 'متدهور', CONNECTING: 'جارٍ الاتصال', RATE_LIMITED: 'محدود المعدل', DISABLED: 'معطّل', IDLE: 'خامل',
    UNAVAILABLE: 'غير متاح', DISCONNECTED: 'منقطع', AUTH_FAILED: 'رُفضت المصادقة', BLOCKED_MISSING_CREDENTIALS: 'بيانات اعتماد مفقودة' };
  const stTag = v => `<span class="tag ${STATE_CLS[v] || ''}" data-state="${E(v)}">${E(STATE_AR[v] || v)} <span class="ltr">${E(v)}</span></span>`;
  const MK_AR = { LIVE: 'مباشر', DELAYED: 'متأخر', STALE: 'قديم', MARKET_CLOSED: 'السوق مغلق', UNAVAILABLE: 'غير متاح' };
  function marketSummary(M) {
    if (!M || M.state === 'DISABLED') return 'No provider configured (MARKET_PROVIDERS) — site shows “not connected”; publishing unaffected';
    const c = M.counts || {};
    return `${(M.providers || []).map(p => `${E(p.label)}: ${E(p.state)}`).join(' · ')} · live ${c.live || 0} · delayed ${c.delayed || 0} · stale ${c.stale || 0} · closed ${c.closed || 0} · unavailable ${c.unavailable || 0} · last update ${fmt(M.lastUpdate)}`;
  }
  function marketPanel(M) {
    if (!M || M.state === 'DISABLED') return '';
    const age = ms => ms == null ? '—' : ms < 90e3 ? Math.round(ms / 1000) + 's' : Math.round(ms / 60e3) + 'm';
    return `<section class="panel" style="margin-bottom:14px" data-market-panel><h2>بيانات السوق <small class="ltr">Market data</small></h2>
      <div class="scroll"><table class="t"><thead><tr><th>المزوّد</th><th>الاتصال</th><th>آخر نجاح</th><th>زمن الاستجابة</th><th>الاستطلاع</th><th>آخر خطأ</th></tr></thead><tbody>
      ${(M.providers || []).map(p => `<tr><td class="ltr">${E(p.label)}${p.realtime ? '' : ' <span class="tag">delayed plan</span>'}</td><td>${stTag(p.state)}</td><td>${fmt(p.lastSuccessAt)}</td><td class="num ltr">${p.latencyMs == null ? '—' : E(p.latencyMs) + ' ms'}</td><td class="num ltr">${E(p.pollSeconds)}s</td><td class="ltr">${E(p.lastError || (p.missing && p.missing.length ? 'Missing ' + p.missing.join(', ') : '—'))}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="scroll"><table class="t"><thead><tr><th>الرمز</th><th>الحالة</th><th>العمر</th><th>المصدر</th></tr></thead><tbody>
      ${(M.symbols || []).map(s => `<tr data-market-symbol="${E(s.symbol)}"><td class="ltr">${E(s.symbol)}</td><td><span class="tag ${s.status === 'LIVE' ? 'ok' : s.status === 'DELAYED' ? 'warn' : s.status === 'STALE' || s.status === 'UNAVAILABLE' ? 'bad' : ''}" data-state="${E(s.status)}">${E(MK_AR[s.status] || s.status)} <span class="ltr">${E(s.status)}</span></span></td><td class="num ltr">${age(s.ageMs)}</td><td class="ltr">${E(s.provider || s.reason || '—')}</td></tr>`).join('')}
      </tbody></table></div>
      ${Object.keys(M.rejections || {}).length ? `<p class="hint ltr">Quality gate rejections: ${Object.entries(M.rejections).map(([k, v]) => `${E(k)} ${E(v)}`).join(' · ')}</p>` : ''}
      <p class="hint">بيانات السوق خدمة مستقلة: النشر لا يعتمد عليها. لا تُعرض أي مفاتيح أو عناوين اتصال هنا.</p></section>`;
  }
  function viewSystem() {
    const s = X();
    if (s.sys === null) { if (!s.sysLoading) { s.sysLoading = true; loadSys().then(() => { s.sysLoading = false; render(); }); } return modeBanner() + '<div class="head"><div><h1>حالة النظام</h1><p>System status</p></div></div><div class="empty">جارٍ التحميل…</div>'; }
    const head = header('حالة النظام', 'Health (هل العامل يعمل؟) منفصلة عن Readiness (هل كل مكوّن جاهز للنشر؟). لا مسارات ولا أسرار في هذه الحالة.');
    if (!s.sys) return head + `<section class="panel"><p>${stTag('UNAVAILABLE')} تعذّر الوصول إلى العامل: ${E(s.sysErr)}</p><p class="hint">شغّل العامل واربطه من الإعدادات (Worker URL + token + ALLOWED_ORIGIN).</p></section>`;
    const R = s.sys.readiness, D = s.sys.deployment || {}, H = s.sys.health;
    const row = (name, en, st, detail) => `<tr data-component="${E(en)}"><td>${name} <span class="ltr hint" style="margin:0">${en}</span></td><td>${stTag(st)}</td><td class="ltr">${detail || ''}</td></tr>`;
    const sch = R.scheduler || {};
    const pub = p => p ? `<span class="ltr">${E(p.result)} · ${E(p.action)}${p.version ? ' v' + p.version : ''} · ${E(p.contentId || '')}${p.commit ? ' · ' + E(p.commit.slice(0, 7)) : ''}${p.deployment ? ' · ' + E(p.deployment) : ''}</span> · ${fmt(p.at)}${p.error ? `<br><small class="bad">${E(p.error)}</small>` : ''}` : '—';
    const ops = s.ops || {};
    return head + `
    <section class="panel" style="margin-bottom:14px"><table class="t sys-table"><thead><tr><th>المكوّن</th><th>الحالة</th><th>التفاصيل</th></tr></thead><tbody>
      ${row('العامل', 'Worker (health)', H.worker, `v${E(H.version)} · uptime ${E(H.uptimeSeconds)}s`)}
      ${row('قاعدة المحتوى', 'CMS', R.cms.state, `${R.cms.records} record(s)`)}
      ${row('مستودع النشر', 'Publishing repo', R.publishingRepo.state, `${E(R.publishingRepo.branch || '—')} / expected ${E(R.publishingRepo.expectedBranch)} · ${R.publishingRepo.clean ? 'clean' : 'NOT clean'}${R.publishingRepo.diverged ? ' · DIVERGED' : ''} · ${E(R.publishingRepo.head || '')}`)}
      ${row('Git', 'Git', R.git.state, E(R.git.version || ''))}
      ${row('GitHub', 'GitHub auth', R.github.state, `checked ${fmt(R.github.checkedAt)}`)}
      ${row('الذكاء الاصطناعي', 'AI', R.ai.state, `${E(R.ai.provider || '')} ${E(R.ai.model || '')} ${R.ai.note ? '· ' + E(R.ai.note) : ''}`)}
      ${row('النشر', 'Publishing', R.publishing.state, `<b class="${R.publishing.mode === 'live' ? 'bad' : ''}">${E(R.publishing.modeLabel)}</b>`)}
      ${row('المُجدول', 'Scheduler', sch.state, `scheduled ${sch.scheduled} · due ${sch.due} · missed ${sch.missed} · expired ${sch.expired} · grace ${sch.graceMinutes}m / ${sch.graceMinutesOther}m · last tick ${fmt(sch.lastTick)}`)}
      ${row('النسخ الاحتياطي', 'Backups', R.backups.state, R.backups.last ? `last ${fmt(R.backups.last.at)} · ${R.backups.count} kept (max ${R.backups.keep})` : 'no backup yet')}
      ${row('سجل التدقيق', 'Audit log', R.audit.state, `${R.audit.entries} entries · hash-chained`)}
      ${row('بيانات السوق', 'Market data', (R.market || {}).state || 'DISABLED', marketSummary(R.market))}
    </tbody></table></section>
    ${marketPanel(R.market)}
    <div class="grid2" style="margin-bottom:14px">
      <section class="panel"><h2>النشر <small class="ltr">Deployment</small></h2><dl class="kv"><dt>آخر نشر ناجح</dt><dd>${pub(D.lastSuccess)}</dd><dt>آخر فشل</dt><dd>${pub(D.lastFailure)}</dd><dt>آخر تشغيل تجريبي للبنية</dt><dd>${pub(D.lastCommission)}</dd></dl>
        <p class="hint">LIVE يُعرض فقط بعد أن يُظهر الملف العام النسخة المنشورة؛ وإلا DEPLOYING أو DEPLOYED_UNVERIFIED.</p></section>
      <section class="panel"><h2>العمليات <small class="ltr">Operations</small></h2>
        <div class="row"><button class="btn" data-act="sys-commission">تشغيل فحص البنية <span class="ltr">(Commissioning)</span></button><button class="btn" data-act="sys-backup">نسخة احتياطية الآن</button><button class="btn" data-act="sys-audit">التحقق من سجل التدقيق</button></div>
        <p class="hint">فحص البنية لا ينشئ أي محتوى ولا commit ولا push: يتحقق من المستودع، الجلب، صلاحية الدفع (dry-run)، توليد الملف، المخطط والاختبارات.</p>
        <div id="sys-ops">${ops.html || ''}</div></section>
    </div>`;
  }

  /* ---------- actions ---------- */
  function editable(d) { const o = {}; for (const k of ['title', 'slug', 'summary', 'body', 'symbol', 'market', 'bias', 'category', 'tags', 'image', 'visualPrompt', 'sourceReferences', 'riskDisclosure', 'seo', 'social', 'fields', 'expiresAt']) o[k] = d[k]; if (o.image && !o.image.src && !o.image.alt) o.image = null; return o; }
  async function act(fn, okMsg) { const s = X(); try { await fn(); if (okMsg) toast(okMsg); s.err = ''; } catch (e) { s.err = e.status === 409 ? 'تغيّر هذا العنصر منذ تحميله. حدّث الصفحة قبل الحفظ.' : e.message + ((e.data && e.data.errors || []).length ? ' — ' + e.data.errors.map(x => x.message).join(' · ') : ''); } render(); }
  const ACTIONS = () => ({
    'cms-refresh': () => { const s = X(); s.list = null; s.pubs = null; s.config = null; s.sys = null; if (s.rec) openRecord(s.rec.id); else render(); },
    'cms-open': el => openRecord(el.dataset.id),
    'cms-new': el => act(async () => {
      const title = ($('#cms-new-title') || {}).value || '';
      const rec = await api('POST', '/api/content', { type: $('#cms-new-type').value, language: $('#cms-new-lang').value, title, status: el.dataset.idea ? 'IDEA' : 'DRAFT' });
      X().list = null; await openRecord(rec.id);
    }),
    'cms-save': () => act(async () => { const s = X(); const r = await api('PUT', '/api/content/' + s.rec.id, { expectedRevision: s.rec.revision, record: editable(s.draft) }); s.rec = { ...r, translations: s.rec.translations }; s.draft = JSON.parse(JSON.stringify(r)); s.dirty = false; s.list = null; }, 'حُفظت المسودة'),
    'cms-tr': el => act(async () => {
      const s = X(), id = el.dataset.id || s.rec.id; const cur = el.dataset.id ? (s.list || []).find(x => x.id === id) : s.rec;
      const r = await api('POST', `/api/content/${id}/transition`, { action: el.dataset.a, expectedRevision: cur.revision });
      s.list = null; if (s.rec && s.rec.id === id) { s.rec = { ...r, translations: s.rec.translations }; s.draft = JSON.parse(JSON.stringify(r)); s.dirty = false; }
    }, 'تم'),
    'cms-schedule': () => act(async () => {
      const s = X(), local = ($('#cms-sched') || {}).value, at = C.istanbulLocalToUtc(local);
      if (!at) throw new Error('اختر موعد النشر بتوقيت إسطنبول');
      const r = await api('POST', `/api/content/${s.rec.id}/transition`, { action: 'schedule', expectedRevision: s.rec.revision, scheduledAt: at });
      s.rec = { ...r, translations: s.rec.translations }; s.draft = JSON.parse(JSON.stringify(r)); s.list = null;
    }, 'تمت الجدولة'),
    'cms-dup': el => act(async () => { const r = await api('POST', `/api/content/${el.dataset.id || X().rec.id}/duplicate`, {}); X().list = null; await openRecord(r.id); }, 'تم التكرار'),
    'cms-translate': el => act(async () => {
      const res = await api('POST', `/api/content/${el.dataset.id}/translate`, { mode: el.dataset.mode });
      X().list = null; await openRecord(res.record.id); if ((res.warnings || []).length) toast(res.warnings[0]);
    }),
    'cms-src-add': () => { const d = X().draft; (d.sourceReferences = d.sourceReferences || []).push({ name: '', url: '' }); X().dirty = true; render(); },
    'cms-src-del': el => { const d = X().draft; d.sourceReferences.splice(+el.dataset.i, 1); X().dirty = true; render(); },
    'cms-preview': el => openPreview(el.dataset.id || X().rec.id),
    'cms-repreview': () => openPreview(X().modal.rec.id),
    'cms-prev-page': el => { X().modal.page = el.dataset.page; renderPreview(); },
    'cms-dry': () => doPublish(true),
    'cms-confirm': () => confirmPublish(),
    'cms-publish': () => doPublish(false),
    'cms-close': () => closeModal(),
    'cms-unpublish': () => doUnpublish(),
    'cms-unpublish-go': async () => {
      const r = X().rec, out = document.getElementById('cms-pub-out');
      try { const f = await api('GET', '/api/feed'); await api('POST', '/api/unpublish', { contentId: r.id, expectedVersion: f.version, confirm: true }); closeModal(); X().list = null; X().pubs = null; await openRecord(r.id); toast('أُزيل من الموقع العام'); }
      catch (e) { if (out) out.innerHTML = `<div class="errbox">${E(e.message)}</div>`; }
    },
    'cms-gold-pair': () => act(async () => {
      const en = await api('POST', '/api/content', { type: 'GOLD_FOCUS', language: 'en', title: '', status: 'DRAFT' });
      await api('POST', `/api/content/${en.id}/translate`, { mode: 'blank' });
      X().list = null; await openRecord(en.id);
    }, 'أُنشئت مسودتان فارغتان (EN + AR)'),
    'cms-lvl-add': el => { const d = X().draft, a = get(d, el.dataset.path) || []; a.push(''); set(d, el.dataset.path, a); X().dirty = true; render(); },
    'cms-lvl-del': el => { const d = X().draft, a = get(d, el.dataset.path) || []; a.splice(+el.dataset.i, 1); set(d, el.dataset.path, a); X().dirty = true; render(); },
    'cms-pf-run': () => runPreflight(),
    /* Explicit operator action: copy the CURRENT verified XAUUSD quote into this draft as a fixed snapshot.
       Refused unless the market service reports it LIVE or DELAYED — stale/closed/unavailable prices are never snapshotted. */
    'cms-gold-snapshot': () => act(async () => {
      const m = await api('GET', '/api/system/market'), q = (m.quotes || []).find(x => x.symbol === 'XAUUSD');
      if (!q || !['LIVE', 'DELAYED'].includes(q.status) || !(q.price > 0)) throw new Error(`لا يوجد سعر XAUUSD موثّق حاليًا (${q ? q.status : 'UNAVAILABLE'}) — لم يُضف أي سعر.`);
      const d = X().draft; d.fields = d.fields || {};
      d.fields.price = +q.price.toFixed(q.decimals || 2);
      d.fields.priceSource = `${q.source.provider} ${q.source.providerSymbol} (${q.priceType === 'BID_ASK' ? 'mid' : 'last'}${q.status === 'DELAYED' ? ', delayed' : ''})`;
      d.fields.priceTime = q.providerTime; X().dirty = true;
    }, 'أُضيفت لقطة السعر — راجعها ثم احفظ المسودة'),
    'cms-rollback': el => openRollback(el.dataset.v),
    'cms-rollback-go': el => doRollback(!!el.dataset.dry),
    'sys-refresh': () => { X().sys = null; render(); },
    'sys-commission': async () => {
      const s = X(); s.ops = { html: '<p class="hint">جارٍ الفحص… (fetch، push --dry-run، توليد الملف، الاختبارات)</p>' }; render();
      try { const c = await api('POST', '/api/publish/commission', {}); s.ops = { html: `<div class="pf pf--${c.result === 'COMMISSION_OK' ? 'ready' : 'blocked'}"><b class="ltr">${E(c.result)}</b> · <span class="ltr">mode ${E(c.publishMode)} · head ${E(c.head || '')}</span></div>${checkList(c.checks)}` }; }
      catch (e) { s.ops = { html: `<div class="errbox">${E(e.message)}</div>` }; }
      s.sys = null; render();
    },
    'sys-backup': async () => { const s = X(); try { const b = await api('POST', '/api/system/backups', {}); s.ops = { html: `<p class="ok">نسخة احتياطية ✓ <span class="ltr">${E(b.file)} · ${E(b.bytes)} bytes · sha256 ${E(String(b.sha256 || '').slice(0, 12))}</span></p>` }; } catch (e) { s.ops = { html: `<div class="errbox">${E(e.message)}</div>` }; } s.sys = null; render(); },
    'sys-audit': async () => { const s = X(); try { const a = await api('GET', '/api/system/audit?limit=15'); s.ops = { html: `<p class="${a.verify.ok ? 'ok' : 'bad'}">${a.verify.ok ? 'سلسلة التدقيق سليمة ✓' : 'تم اكتشاف تلاعب ✕'} <span class="ltr">(${E(a.verify.entries != null ? a.verify.entries : '')} entries${a.verify.brokenAt ? ', broken at #' + E(a.verify.brokenAt) : ''})</span></p><ul class="cms-hist">${a.entries.slice().reverse().map(x => `<li class="ltr">#${x.seq} ${E(x.at)} · ${E(x.action)} · ${E(x.actor || '')} ${x.contentId ? '· ' + E(x.contentId) : ''} ${x.result ? '· ' + E(x.result) : ''}</li>`).join('')}</ul>` }; } catch (e) { s.ops = { html: `<div class="errbox">${E(e.message)}</div>` }; } render(); },
    'pub-status': el => act(async () => { const p = await api('GET', `/api/publications/${el.dataset.id}/status`); const i = X().pubs.findIndex(x => x.publicationId === p.publicationId); if (i >= 0) X().pubs[i] = p; })
  });

  function onInput(e) {
    const el = e.target, s = X();
    if (el.dataset.cf && s.draft) {
      let v = el.value; const k = el.dataset.kind;
      if (k === 'list') v = v.split(',').map(x => x.trim()).filter(Boolean);
      else if (k === 'number') v = v.trim() === '' ? null : (isFinite(+v) ? +v : v);
      else if (k === 'datetime') v = v ? C.istanbulLocalToUtc(v) : null;
      if (el.dataset.cf.startsWith('image.') && !s.draft.image) s.draft.image = { src: '', alt: '' };
      set(s.draft, el.dataset.cf, v); s.dirty = true;
      if (e.type === 'change') renderAfterBlur();
      return;
    }
    if (el.matches && el.matches('[data-cfq]')) { s.q = el.value; if (e.type === 'input') renderAfterBlur(); return; }
    if (e.type === 'change' && el.dataset.cff !== undefined) { s.filters[el.dataset.cff] = el.value; render(); return; }
    if (e.type === 'change' && el.matches && el.matches('[data-cfs]')) { s.sort = el.value; render(); }
  }

  window.installCmsStudio = function () {
    VIEWS.cms = viewLibrary; VIEWS.cmsedit = viewEditor; VIEWS.publications = viewPublications; VIEWS.system = viewSystem;
    Object.assign(ACT, ACTIONS());
    document.addEventListener('input', onInput); document.addEventListener('change', onInput);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('cms-modal') && !document.getElementById('cms-modal').hidden) closeModal(); });
  };
})();
