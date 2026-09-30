/* FOXREX public content renderer.
   Reads data/content.json (published by the FOXREX desk / Studio) and fills the editorial,
   Gold Focus, analysis, news and signal-result components. Anything missing keeps the
   explicit empty/unavailable state that ships in the HTML — nothing is ever invented. */
(function () {
  'use strict';
  var root = document.body.getAttribute('data-root') || '';
  var TZ = 'Europe/Istanbul';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var AR = document.documentElement.lang === 'ar';
  /* Arabic: isolate Latin/number runs (symbols, prices, %, times) so they stay Inter + LTR. Mirrors tools/site/text.mjs. */
  var RUN = /[A-Za-z0-9$€£+\u2212][A-Za-z0-9.,:%\/+&'’_\u2212-]*(?:[ \u00A0][A-Za-z0-9$€£+\u2212][A-Za-z0-9.,:%\/+&'’_\u2212-]*)*/g;
  function arText(s) {
    return String(s).replace(RUN, '\u0000$&\u0001').split(/(\u0000[^\u0001]*\u0001)/).map(function (part) {
      if (part.charAt(0) !== '\u0000') return esc(part);
      var run = part.slice(1, -1), trail = (run.match(/[.,:\/&'’_-]+$/) || [''])[0];
      run = run.slice(0, run.length - trail.length);
      return (run ? '<bdi class="lt" dir="ltr">' + esc(run) + '</bdi>' : '') + esc(trail);
    }).join('');
  }
  /* Localised value: "text" or { en, ar } — rendered in this page's language only */
  function L(v) {
    if (v == null) return '';
    var s = typeof v === 'string' ? v : (AR ? (v.ar || v.en) : (v.en || v.ar)) || '';
    return AR ? arText(s) : esc(s);
  }
  function has(v) { return v != null && (typeof v === 'string' ? v.trim() !== '' : !!(v.en || v.ar)); }
  function safeUrl(u) {
    if (!u || typeof u !== 'string') return '';
    if (/^https:\/\//i.test(u)) return u;
    if (/^[a-z0-9][\w\-./#?=&]*$/i.test(u) && u.indexOf('..') < 0) return root + u;
    return '';
  }
  function time(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    return '<time datetime="' + esc(d.toISOString()) + '" class="ltr num">' + esc(d.toLocaleString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })) + ' IST</time>';
  }
  function istDate(d) { return new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }); }
  var BIAS = { bullish: ['Bullish', 'صاعد'], bearish: ['Bearish', 'هابط'], neutral: ['Neutral', 'محايد'] };
  function bias(b) { var x = BIAS[b]; return x ? '<span class="fx-bias fx-bias--' + b + '">' + L({ en: x[0], ar: x[1] }) + '</span>' : ''; }
  var CAT = { technical: ['Technical Analysis', 'التحليل الفني'], macro: ['Macro', 'الاقتصاد الكلي'], gold: ['Gold', 'الذهب'], fx: ['FX', 'العملات'], indices: ['Indices', 'المؤشرات'], crypto: ['Crypto', 'العملات الرقمية'],
    economic: ['Economic', 'اقتصادي'], 'central-banks': ['Central Banks', 'البنوك المركزية'], commodities: ['Commodities', 'السلع'] };
  function cat(c) { var x = CAT[c]; return x ? L({ en: x[0], ar: x[1] }) : esc(c || ''); }
  var arrow = '<svg class="fx-flip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  /* Show each editorial slot's time in the visitor's own time zone too */
  function localSlotTimes() {
    var offset = -new Date().getTimezoneOffset();
    if (offset === 180) return; // visitor is already on Istanbul time
    document.querySelectorAll('[data-slot-time]').forEach(function (el) {
      var p = el.getAttribute('data-slot-time').split(':');
      var utc = new Date(); utc.setUTCHours(+p[0] - 3, +p[1], 0, 0);
      var local = utc.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      el.title = 'Istanbul ' + el.getAttribute('data-slot-time') + ' = ' + local + ' your time';
    });
  }

  function renderEditorial(items) {
    var today = istDate(Date.now());
    document.querySelectorAll('[data-slot]').forEach(function (card) {
      var slot = card.getAttribute('data-slot');
      var it = (items || []).filter(function (x) { return x.slot === slot && x.publishedAt && istDate(x.publishedAt) === today && has(x.title); })
        .sort(function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); })[0];
      if (!it) return;
      var url = safeUrl(it.url);
      card.querySelector('[data-slot-title]').innerHTML = url ? '<a href="' + esc(url) + '">' + L(it.title) + '</a>' : L(it.title);
      var st = card.querySelector('[data-slot-status]');
      st.setAttribute('data-state', 'ok');
      st.innerHTML = L({ en: 'Published', ar: 'منشور' }) + ' · ' + time(it.publishedAt);
    });
  }

  function renderGold(g) {
    var box = document.querySelector('[data-gold-focus]');
    if (!box || !g || !g.updated) return;
    function set(k, html) { var el = box.querySelector('[data-gold="' + k + '"]'); if (el && html) el.innerHTML = html; }
    function lvl(k) { if (g[k] != null && g[k] !== '') { var el = box.querySelector('[data-gold="' + k + '"]'); if (el) { el.textContent = String(g[k]); el.classList.add('has'); } } }
    /* A price is shown only with its source and time — never from the analysis itself */
    if (typeof g.price === 'number' && g.priceSource && g.priceTime) {
      set('price', esc(g.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
      var px = box.querySelector('[data-gold="price"]'); if (px) { px.style.color = 'var(--foxrex-text)'; px.title = g.priceSource + ' · ' + new Date(g.priceTime).toISOString(); }
    }
    if (BIAS[g.bias]) set('bias', L({ en: 'Bias: ', ar: 'الاتجاه: ' }) + bias(g.bias));
    if (has(g.state)) set('state', L(g.state));
    if (has(g.summary)) set('summary', L(g.summary));
    set('updated', time(g.updated));
    lvl('support'); lvl('pivot'); lvl('resistance');
    if (has(g.bull)) set('bull', L(g.bull));
    if (has(g.bear)) set('bear', L(g.bear));
  }

  function analysisCard(a) {
    var url = safeUrl(a.url), img = safeUrl(a.image);
    return '<article class="fx-card' + (url ? ' fx-card--link' : '') + '">' +
      (img ? '<div class="fx-card__media"><img src="' + esc(img) + '" alt="" loading="lazy" decoding="async"></div>' : '') +
      '<div class="fx-card__meta"><span class="fx-sym">' + esc(a.symbol) + '</span>' + bias(a.bias) + '<span class="fx-badge">' + cat(a.category) + '</span></div>' +
      '<h3>' + (url ? '<a href="' + esc(url) + '">' + L(a.title) + '</a>' : L(a.title)) + '</h3>' +
      (has(a.summary) ? '<p>' + L(a.summary) + '</p>' : '') +
      '<div class="fx-card__foot">' + time(a.publishedAt) + (url ? '<a class="fx-link" href="' + esc(url) + '">' + L({ en: 'Read analysis', ar: 'اقرأ التحليل' }) + ' ' + arrow + '</a>' : '') + '</div></article>';
  }

  function newsItem(n) {
    var imp = { high: ['fx-badge--negative', 'High impact', 'تأثير مرتفع'], medium: ['fx-badge--warning', 'Medium', 'متوسط'], low: ['', 'Low', 'منخفض'] }[n.importance];
    var url = safeUrl(n.url);
    return '<li class="news-item">' + time(n.publishedAt) +
      '<div><h3>' + (url ? '<a href="' + esc(url) + '">' + L(n.headline) + '</a>' : L(n.headline)) + '</h3>' + (has(n.summary) ? '<p>' + L(n.summary) + '</p>' : '') + '</div>' +
      '<div class="news-item__mk">' + (imp ? '<span class="fx-badge ' + imp[0] + '">' + L({ en: imp[1], ar: imp[2] }) + '</span>' : '') +
      (Array.isArray(n.markets) ? n.markets.slice(0, 4).map(function (m) { return '<span class="fx-badge fx-sym">' + esc(m) + '</span>'; }).join('') : '') + '</div></li>';
  }

  function bindList(sel, items, render, wrap, filterFn, tabsSel) {
    document.querySelectorAll(sel).forEach(function (host) {
      var fixed = host.getAttribute('data-category');
      var limit = parseInt(host.getAttribute('data-limit'), 10) || 0;
      var emptyHtml = host.innerHTML;
      var tabs = host.parentElement.querySelector(tabsSel);
      function draw(filter) {
        var list = items.filter(function (x) { return filterFn(x, fixed || filter); });
        if (limit) list = list.slice(0, limit);
        host.innerHTML = list.length ? wrap(list.map(render).join('')) : emptyHtml;
      }
      if (tabs) tabs.addEventListener('click', function (e) {
        var b = e.target.closest('[data-filter]'); if (!b) return;
        tabs.querySelectorAll('[data-filter]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        draw(b.getAttribute('data-filter'));
      });
      var pressed = tabs && tabs.querySelector('[aria-pressed="true"]');
      draw(pressed ? pressed.getAttribute('data-filter') : null);
    });
  }
  function byDate(a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); }

  function renderResults(results) {
    var host = document.querySelector('[data-signal-results]');
    if (!host || !results.length) return;
    host.innerHTML = '<ul class="news-list">' + results.slice(0, 5).map(function (r) {
      var oc = { win: ['fx-badge--positive', 'Target hit', 'تحقق الهدف'], loss: ['fx-badge--negative', 'Stopped out', 'ضُرب الوقف'], be: ['', 'Break-even', 'تعادل'], closed: ['', 'Closed', 'مغلقة'] }[r.outcome] || ['', 'Closed', 'مغلقة'];
      return '<li class="news-item">' + time(r.closedAt) + '<div><h3><span class="fx-sym">' + esc(r.symbol) + '</span> · ' + esc(String(r.side || '').toUpperCase()) + '</h3><p class="ltr num">' +
        esc('Entry ' + r.entry + ' → Exit ' + r.exit) + '</p></div><div class="news-item__mk"><span class="fx-badge ' + oc[0] + '">' + L({ en: oc[1], ar: oc[2] }) + '</span></div></li>';
    }).join('') + '</ul>';
  }

  localSlotTimes();
  if (!window.fetch) return;
  fetch(root + 'data/content.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (c) {
      renderEditorial(Array.isArray(c.editorial) ? c.editorial : []);
      renderGold(c.gold);
      var analysis = (Array.isArray(c.analysis) ? c.analysis : []).filter(function (a) { return a.symbol && has(a.title) && a.publishedAt; }).sort(byDate);
      bindList('[data-analysis-list]', analysis, analysisCard, function (h) { return '<div class="grid grid--3">' + h + '</div>'; },
        function (a, f) { return !f || f === 'all' || a.category === f; }, '[data-analysis-tabs]');
      var news = (Array.isArray(c.news) ? c.news : []).filter(function (n) { return has(n.headline) && n.publishedAt; }).sort(byDate);
      bindList('[data-news-list]', news, newsItem, function (h) { return '<ul class="news-list">' + h + '</ul>'; },
        function (n, f) { return !f || f === 'latest' || (f === 'high' ? n.importance === 'high' : n.category === f); }, '[data-news-tabs]');
      renderResults(((c.signals || {}).results || []).filter(function (r) { return r.symbol && r.closedAt && r.entry != null && r.exit != null; }).sort(function (a, b) { return new Date(b.closedAt) - new Date(a.closedAt); }));
    })
    .catch(function () { /* keep the shipped empty states */ });
})();
