/* FOXREX public content renderer (feed v2).
   Reads data/content.json — generated only by the FOXREX publishing engine from APPROVED Studio
   records — and fills the Daily Desk, Gold Focus, Analysis, News, Signals, Results and Learn
   components for THIS page's language. Everything is plain text: escaped, never parsed as HTML.
   Missing content keeps the explicit empty state that ships in the HTML — nothing is invented.
   Preview mode (?preview=1, same-origin iframe from FOXREX Studio) renders a candidate feed
   posted by Studio instead of the live one, using exactly this renderer and the public CSS. */
(function () {
  'use strict';
  var root = document.body.getAttribute('data-root') || '';
  var TZ = 'Europe/Istanbul';
  var LANG = document.documentElement.lang === 'ar' ? 'ar' : 'en';
  var AR = LANG === 'ar';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* Arabic: isolate Latin/number runs (symbols, prices, %, times) so they stay Inter + LTR. Mirrors tools/site/text.mjs. */
  var RUN = /[A-Za-z0-9$€£+−][A-Za-z0-9.,:%\/+&'’_−-]*(?:[  ][A-Za-z0-9$€£+−][A-Za-z0-9.,:%\/+&'’_−-]*)*/g;
  function arText(s) {
    return String(s).replace(RUN, '\u0000$&\u0001').split(/(\u0000[^\u0001]*\u0001)/).map(function (part) {
      if (part.charAt(0) !== '\u0000') return esc(part);
      var run = part.slice(1, -1), trail = (run.match(/[.,:\/&'’_-]+$/) || [''])[0];
      run = run.slice(0, run.length - trail.length);
      return (run ? '<bdi class="lt" dir="ltr">' + esc(run) + '</bdi>' : '') + esc(trail);
    }).join('');
  }
  /* Text in this page's language: string, or { en, ar } for UI labels. Always escaped. */
  function L(v) {
    if (v == null) return '';
    var s = typeof v === 'string' ? v : (AR ? (v.ar || v.en) : (v.en || v.ar)) || '';
    return AR ? arText(s) : esc(s);
  }
  function T(en, ar) { return L({ en: en, ar: ar }); }
  function has(v) { return typeof v === 'string' ? v.trim() !== '' : v != null; }
  function paras(s) { return String(s || '').split(/\n\s*\n/).map(function (p) { return p.trim() ? '<p>' + L(p.trim()).replace(/\n/g, '<br>') + '</p>' : ''; }).join(''); }
  function media(src) { return typeof src === 'string' && /^assets\/media\/[a-z0-9][a-z0-9\/_-]*\.(png|jpe?g|webp)$/.test(src) ? root + src : ''; }
  function https(u) { return typeof u === 'string' && /^https:\/\/[^\s<>"']+$/.test(u) ? u : ''; }
  function time(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    return '<time datetime="' + esc(d.toISOString()) + '" class="ltr num">' + esc(d.toLocaleString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })) + ' IST</time>';
  }
  function istDate(d) { return new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }); }
  var BIAS = { bullish: ['Bullish', 'صاعد'], bearish: ['Bearish', 'هابط'], neutral: ['Neutral', 'محايد'] };
  function bias(b) { var x = BIAS[b]; return x ? '<span class="fx-bias fx-bias--' + b + '">' + T(x[0], x[1]) + '</span>' : ''; }
  var CAT = { technical: ['Technical Analysis', 'التحليل الفني'], macro: ['Macro', 'الاقتصاد الكلي'], gold: ['Gold', 'الذهب'], fx: ['FX', 'العملات'], indices: ['Indices', 'المؤشرات'], crypto: ['Crypto', 'العملات الرقمية'],
    economic: ['Economic', 'اقتصادي'], 'central-banks': ['Central Banks', 'البنوك المركزية'], commodities: ['Commodities', 'السلع'] };
  function cat(c) { var x = CAT[c]; return x ? T(x[0], x[1]) : ''; }
  var TYPE = { MORNING_BRIEF: ['Morning Brief', 'الموجز الصباحي'], EVENT: ['The Event', 'الحدث'], US_OPEN: ['US Open', 'افتتاح السوق الأمريكي'], MARKET_RECAP: ['Market Recap', 'ملخص السوق'],
    LEARN: ['Learn', 'تعلّم'], REX_EXPLAINS: ['REX EXPLAINS', 'REX EXPLAINS'], REX_NOTE: ['REX NOTE', 'REX NOTE'], ASK_REX: ['ASK REX', 'ASK REX'] };
  var arrow = '<svg class="fx-flip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  function sources(e) {
    var s = (e.sources || []).filter(function (x) { return has(x.name); });
    if (!s.length) return '';
    return '<p class="fx-sources"><strong>' + T('Sources', 'المصادر') + ':</strong> ' + s.map(function (x) {
      var u = https(x.url);
      return u ? '<a href="' + esc(u) + '" rel="noopener nofollow" target="_blank">' + L(x.name) + '</a>' : L(x.name);
    }).join(' · ') + '</p>';
  }
  function risk(e) { return has(e.riskDisclosure) ? '<p class="fx-risk">' + L(e.riskDisclosure) + '</p>' : ''; }
  function more(e, extra) {
    var inner = (has(e.body) ? paras(e.body) : '') + (extra || '') + sources(e) + risk(e);
    return inner ? '<details class="fx-more"><summary>' + T('Read more', 'اقرأ المزيد') + '</summary>' + inner + '</details>' : '';
  }
  function img(e) { var s = e.image && media(e.image.src); return s ? '<div class="fx-card__media"><img src="' + esc(s) + '" alt="' + esc(e.image.alt || '') + '" loading="lazy" decoding="async"></div>' : ''; }
  function scen(e) {
    var rows = [];
    if (has(e.bullishScenario)) rows.push('<li><span class="fx-bias fx-bias--bullish">' + T('Bullish', 'صاعد') + '</span> ' + L(e.bullishScenario) + '</li>');
    if (has(e.bearishScenario)) rows.push('<li><span class="fx-bias fx-bias--bearish">' + T('Bearish', 'هابط') + '</span> ' + L(e.bearishScenario) + '</li>');
    if (has(e.invalidation)) rows.push('<li><strong>' + T('Invalidation', 'مستوى الإلغاء') + ':</strong> ' + L(e.invalidation) + '</li>');
    if (e.keyLevels && e.keyLevels.length) rows.push('<li><strong>' + T('Key levels', 'المستويات الرئيسية') + ':</strong> <span class="ltr num">' + esc(e.keyLevels.join(' · ')) + '</span></li>');
    return rows.length ? '<ul class="fx-scen">' + rows.join('') + '</ul>' : '';
  }

  /* ---------- sections ---------- */
  function renderDesk(items) {
    var today = istDate(Date.now());
    document.querySelectorAll('[data-slot]').forEach(function (card) {
      var slot = card.getAttribute('data-slot');
      var it = items.filter(function (x) { return x.slot === slot && istDate(x.publishedAt) === today; })[0];
      if (!it) return;
      card.querySelector('[data-slot-title]').innerHTML = L(it.title);
      var st = card.querySelector('[data-slot-status]');
      st.setAttribute('data-state', 'ok');
      st.innerHTML = T('Published', 'منشور') + ' · ' + time(it.publishedAt);
    });
  }

  function renderGold(g) {
    var box = document.querySelector('[data-gold-focus]');
    if (!box || !g) return;
    function set(k, html) { var el = box.querySelector('[data-gold="' + k + '"]'); if (el && html) { el.innerHTML = html; el.hidden = false; } }
    function lvl(k, v) { var el = box.querySelector('[data-gold="' + k + '"]'); if (el && has(v)) { el.innerHTML = '<span class="ltr num">' + esc(v) + '</span>'; el.classList.add('has'); } }
    /* A price is shown only with its source and observation time — never from the analysis text */
    if (typeof g.price === 'number' && has(g.priceSource) && g.priceTime) {
      set('price', '<span class="num">' + esc(g.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + '</span>');
      var px = box.querySelector('[data-gold="price"]'); if (px) { px.style.color = 'var(--foxrex-text)'; px.title = g.priceSource + ' · ' + new Date(g.priceTime).toISOString(); }
    }
    if (BIAS[g.bias]) set('bias', T('Bias: ', 'الاتجاه: ') + bias(g.bias));
    if (has(g.marketState)) set('state', L(g.marketState));
    set('summary', '<strong>' + L(g.title) + '</strong><br>' + L(g.summary));
    set('updated', time(g.publishedAt));
    lvl('support', (g.keySupport || []).join(' · ')); lvl('pivot', g.importantLevel); lvl('resistance', (g.keyResistance || []).join(' · '));
    if (has(g.bullishScenario)) set('bull', L(g.bullishScenario));
    if (has(g.bearishScenario)) set('bear', L(g.bearishScenario));
    if (has(g.invalidation)) set('invalidation', '<strong>' + T('Invalidation', 'مستوى الإلغاء') + ':</strong> ' + L(g.invalidation));
    set('more', sources(g) + risk(g));
  }

  function analysisCard(a) {
    return '<article class="fx-card">' + img(a) +
      '<div class="fx-card__meta"><span class="fx-sym">' + esc(a.symbol) + '</span>' + (a.timeframe ? '<span class="ltr num">' + esc(a.timeframe) + '</span>' : '') + bias(a.bias) + (cat(a.category) ? '<span class="fx-badge">' + cat(a.category) + '</span>' : '') + '</div>' +
      '<h3>' + L(a.title) + '</h3><p>' + L(a.summary) + '</p>' + more(a, scen(a)) +
      '<div class="fx-card__foot">' + time(a.publishedAt) + '</div></article>';
  }

  function newsItem(n) {
    var imp = { HIGH: ['fx-badge--negative', 'High impact', 'تأثير مرتفع'], MEDIUM: ['fx-badge--warning', 'Medium', 'متوسط'], LOW: ['', 'Low', 'منخفض'] }[n.importance];
    return '<li class="news-item">' + time(n.publishedAt) +
      '<div><h3>' + L(n.title) + '</h3><p>' + L(n.summary) + '</p>' + more(n) + '</div>' +
      '<div class="news-item__mk">' + (imp ? '<span class="fx-badge ' + imp[0] + '">' + T(imp[1], imp[2]) + '</span>' : '') +
      (n.affectedMarkets || []).slice(0, 4).map(function (m) { return '<span class="fx-badge fx-sym">' + esc(m) + '</span>'; }).join('') + '</div></li>';
  }

  function signalCard(s) {
    var dir = s.direction === 'BUY' ? ['fx-bias--bullish', 'BUY', 'شراء'] : ['fx-bias--bearish', 'SELL', 'بيع'];
    var row = function (en, ar, v) { return '<div><dt>' + T(en, ar) + '</dt><dd class="ltr num">' + esc(v) + '</dd></div>'; };
    return '<article class="fx-card fx-signal">' +
      '<div class="fx-card__meta"><span class="fx-sym">' + esc(s.symbol) + '</span><span class="fx-bias ' + dir[0] + '">' + T(dir[1], dir[2]) + '</span>' + time(s.publishedAt) + '</div>' +
      '<h3>' + L(s.title) + '</h3>' +
      '<dl class="fx-levels">' + row('Entry', 'الدخول', s.entry) + row('Stop-loss', 'وقف الخسارة', s.stopLoss) + row('Targets', 'الأهداف', (s.targets || []).join(' · ')) + '</dl>' +
      (has(s.validity) ? '<p class="fx-card__meta">' + T('Validity', 'الصلاحية') + ': ' + L(s.validity) + '</p>' : '') +
      '<p class="fx-risk"><strong>' + T('Risk', 'المخاطرة') + ':</strong> ' + L(s.riskMessage) + '</p>' +
      more({ body: s.analysisContext, sources: s.sources, riskDisclosure: s.riskDisclosure }) + '</article>';
  }

  function resultItem(r) {
    var oc = { TARGET_HIT: ['fx-badge--positive', 'Target hit', 'تحقق الهدف'], STOPPED_OUT: ['fx-badge--negative', 'Stopped out', 'ضُرب الوقف'], BREAKEVEN: ['', 'Break-even', 'تعادل'],
      CLOSED_MANUALLY: ['', 'Closed manually', 'أُغلقت يدويًا'], EXPIRED: ['', 'Expired', 'انتهت الصلاحية'] }[r.outcome] || ['', 'Closed', 'مغلقة'];
    return '<li class="news-item">' + time(r.closedAt) + '<div><h3><span class="fx-sym">' + esc(r.symbol) + '</span> · ' + T(r.direction === 'BUY' ? 'BUY' : 'SELL', r.direction === 'BUY' ? 'شراء' : 'بيع') + '</h3>' +
      '<p><span class="ltr num">' + esc(r.entry) + ' → ' + esc(r.exit) + '</span></p><p>' + L(r.resultNotes) + '</p></div>' +
      '<div class="news-item__mk"><span class="fx-badge ' + oc[0] + '">' + T(oc[1], oc[2]) + '</span></div></li>';
  }

  function learnCard(l) {
    var t = TYPE[l.type] || ['Learn', 'تعلّم'];
    return '<article class="fx-card rex-card" id="' + esc(l.slug) + '"><span class="fx-kicker">' + T(t[0], t[1]) + '</span><h3>' + L(l.title) + '</h3><p>' + L(l.summary) + '</p>' + more(l) +
      '<div class="fx-card__foot">' + time(l.publishedAt) + '</div></article>';
  }

  function bindList(sel, items, render, wrap, filterFn, tabsSel) {
    document.querySelectorAll(sel).forEach(function (host) {
      var fixed = host.getAttribute('data-category');
      var limit = parseInt(host.getAttribute('data-limit'), 10) || 0;
      if (!host.hasAttribute('data-empty')) host.setAttribute('data-empty', host.innerHTML);
      var emptyHtml = host.getAttribute('data-empty');
      var tabs = tabsSel && host.parentElement.querySelector(tabsSel);
      function draw(filter) {
        var list = items.filter(function (x) { return filterFn(x, fixed || filter); });
        if (limit) list = list.slice(0, limit);
        host.innerHTML = list.length ? wrap(list.map(render).join('')) : emptyHtml;
      }
      if (tabs && !tabs.hasAttribute('data-bound')) {
        tabs.setAttribute('data-bound', '');
        tabs.addEventListener('click', function (e) {
          var b = e.target.closest('[data-filter]'); if (!b) return;
          tabs.querySelectorAll('[data-filter]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          draw(b.getAttribute('data-filter'));
        });
      }
      var pressed = tabs && tabs.querySelector('[aria-pressed="true"]');
      draw(pressed ? pressed.getAttribute('data-filter') : null);
    });
  }

  function render(feed) {
    var now = Date.now();
    var items = (feed && Array.isArray(feed.items) ? feed.items : []).filter(function (e) {
      return e && e.language === LANG && has(e.title) && e.publishedAt && Date.parse(e.publishedAt) <= now + 5 * 60e3;
    }).sort(function (a, b) { return Date.parse(b.publishedAt) - Date.parse(a.publishedAt); });
    var of = function () { var types = [].slice.call(arguments); return items.filter(function (e) { return types.indexOf(e.type) >= 0; }); };

    renderDesk(of('MORNING_BRIEF', 'GOLD_FOCUS', 'EVENT', 'US_OPEN', 'MARKET_RECAP'));
    renderGold(of('GOLD_FOCUS')[0]);
    bindList('[data-analysis-list]', of('ANALYSIS'), analysisCard, function (h) { return '<div class="grid grid--3">' + h + '</div>'; },
      function (a, f) { return !f || f === 'all' || a.category === f || (f === 'gold' && a.symbol === 'XAUUSD'); }, '[data-analysis-tabs]');
    bindList('[data-news-list]', of('NEWS', 'EVENT'), newsItem, function (h) { return '<ul class="news-list">' + h + '</ul>'; },
      function (n, f) { return !f || f === 'latest' || (f === 'high' ? n.importance === 'HIGH' : n.category === f); }, '[data-news-tabs]');
    bindList('[data-signal-list]', of('SIGNAL'), signalCard, function (h) { return '<div class="grid grid--2">' + h + '</div>'; }, function () { return true; });
    bindList('[data-signal-results]', of('SIGNAL_RESULT').sort(function (a, b) { return Date.parse(b.closedAt) - Date.parse(a.closedAt); }), resultItem, function (h) { return '<ul class="news-list">' + h + '</ul>'; }, function () { return true; });
    bindList('[data-learn-list]', of('LEARN', 'REX_EXPLAINS', 'REX_NOTE', 'ASK_REX'), learnCard, function (h) { return '<div class="grid grid--2">' + h + '</div>'; }, function () { return true; });
  }

  /* Show each editorial slot's time in the visitor's own time zone too */
  (function localSlotTimes() {
    if (-new Date().getTimezoneOffset() === 180) return;
    document.querySelectorAll('[data-slot-time]').forEach(function (el) {
      var p = el.getAttribute('data-slot-time').split(':');
      var utc = new Date(); utc.setUTCHours(+p[0] - 3, +p[1], 0, 0);
      el.title = 'Istanbul ' + el.getAttribute('data-slot-time') + ' = ' + utc.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' your time';
    });
  })();

  if (/[?&]preview=1\b/.test(location.search) && window.parent !== window) {
    document.documentElement.setAttribute('data-preview', '');
    window.addEventListener('message', function (ev) {
      if (ev.origin !== location.origin || !ev.data || ev.data.type !== 'foxrex-preview') return;
      render(ev.data.feed);
      var target = ev.data.focus && document.querySelector(ev.data.focus);
      if (target) target.scrollIntoView({ block: 'start' });
    });
    window.parent.postMessage({ type: 'foxrex-preview-ready' }, location.origin);
    return;
  }
  if (!window.fetch) return;
  fetch(root + 'data/content.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(render)
    .catch(function () { /* keep the shipped empty states */ });
})();
