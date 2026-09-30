/* FOXREX market ticker (docs/MARKET-DATA.md) — reads ONLY the FOXREX Market API (data-market-api on the ticker, set at build time
   from tools/site/content.mjs MARKET_API). The browser never talks to a data provider and holds no credentials.

   Nothing is estimated, simulated or bundled:
   - no API configured          → the shipped "Market feed not connected" state stays;
   - a price is shown only when the API supplies one, with its status:
       LIVE · DELAYED · STALE (dimmed, labelled) · MARKET_CLOSED (last price, labelled) · UNAVAILABLE (—);
   - change is shown only when the API marks it as provider-supplied (changeBasis), never derived here;
   - quotes keep ageing in the browser (from the server's age, not the visitor's clock), so a page left
     open, or an API that stops answering, degrades LIVE → DELAYED → STALE instead of freezing as "live". */
(function () {
  'use strict';
  var ticker = document.querySelector('[data-market-ticker]');
  if (!ticker) return;
  var api = ticker.getAttribute('data-market-api') || '';
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (!(/^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(api) || (local && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(api))) || !window.fetch) return; // honest "not connected"

  var AR = document.documentElement.lang === 'ar';
  var stateEl = ticker.querySelector('[data-market-state]');
  var items = {};
  Array.prototype.forEach.call(ticker.querySelectorAll('[data-symbol]'), function (el) { items[el.getAttribute('data-symbol')] = el; });
  var symbols = Object.keys(items);
  var data = {}, fetchedAt = 0, failures = 0, timer = null, loaded = false;
  var POLL = 15000, MAX = 240000;
  var LABEL = { LIVE: ['Live', 'مباشر'], DELAYED: ['Delayed', 'متأخر'], STALE: ['Stale', 'قديم'], MARKET_CLOSED: ['Market closed', 'السوق مغلق'], UNAVAILABLE: ['Unavailable', 'غير متاح'] };
  function tr(en, ar) { return AR ? ar : en; }
  function setState(state, en, ar) { if (!stateEl) return; stateEl.setAttribute('data-state', state); stateEl.textContent = tr(en, ar); }
  function fmt(n, dp) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
  function ago(ms) { var s = Math.round(ms / 1000); return s < 90 ? s + 's' : s < 5400 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h'; }

  /* Status as of now: the server's classification, downgraded locally as the quote keeps ageing. */
  function current(q) {
    if (!q || q.price == null || !(typeof q.price === 'number' && isFinite(q.price) && q.price > 0)) return 'UNAVAILABLE';
    var age = (q.ageMs || 0) + (Date.now() - fetchedAt);
    if (q.status === 'MARKET_CLOSED' || q.status === 'STALE' || q.status === 'UNAVAILABLE') return q.status;
    if (age > q.staleAfterMs) return 'STALE';
    if (q.status === 'LIVE' && age > q.liveWithinMs) return 'DELAYED';
    return q.status;
  }
  function tag(item) { var t = item.querySelector('.fx-ticker__tag'); if (!t) { t = document.createElement('span'); t.className = 'fx-ticker__tag'; item.appendChild(t); } return t; }

  function paint() {
    var counts = { LIVE: 0, DELAYED: 0, STALE: 0, MARKET_CLOSED: 0, UNAVAILABLE: 0 }, sources = {};
    symbols.forEach(function (s) {
      var item = items[s], q = data[s], st = current(q);
      counts[st]++;
      item.setAttribute('data-status', st);
      var px = item.querySelector('[data-px]'), chg = item.querySelector('[data-chg]');
      if (st === 'UNAVAILABLE') { px.textContent = '—'; chg.textContent = ''; chg.className = 'fx-ticker__chg'; }
      else {
        px.textContent = fmt(q.price, q.decimals);
        var showChg = (st === 'LIVE' || st === 'DELAYED') && q.changeBasis && typeof q.changePct === 'number' && isFinite(q.changePct);
        chg.textContent = showChg ? (q.changePct > 0 ? '+' : '') + q.changePct.toFixed(2) + '%' : '';
        chg.className = 'fx-ticker__chg' + (showChg ? (q.changePct >= 0 ? ' up' : ' down') : '');
        if (q.source) sources[q.source.provider] = 1;
      }
      var t = tag(item);
      // Age is wrapped in Unicode isolates (LRI…PDI) so "3h" stays intact inside Arabic text.
      t.textContent = st === 'LIVE' ? '' : tr(LABEL[st][0], LABEL[st][1]) + (st === 'STALE' && q && q.price != null ? ' · ' + (AR ? '\u2066' + ago((q.ageMs || 0) + (Date.now() - fetchedAt)) + '\u2069' : ago((q.ageMs || 0) + (Date.now() - fetchedAt))) : '');
      item.title = q && q.source ? (q.source.attribution + ' · ' + q.source.providerSymbol + ' · ' + (q.priceType === 'BID_ASK' ? 'bid ' + q.bid + ' / ask ' + q.ask : 'last') + ' · ' + q.providerTime) : tr(LABEL[st][0], LABEL[st][1]);
    });
    var src = Object.keys(sources).join(', ');
    if (!loaded && failures) setState('error', 'Market data unavailable', 'بيانات السوق غير متاحة');
    else if (!loaded) setState('warn', 'Connecting to market data…', 'جارٍ الاتصال ببيانات السوق…');
    else if (counts.LIVE && !counts.DELAYED && !counts.STALE) setState('ok', 'Live · ' + src, 'مباشر · ' + src);
    else if (counts.LIVE || counts.DELAYED) setState('warn', (counts.STALE ? 'Partly stale' : 'Delayed data') + ' · ' + src, (counts.STALE ? 'بيانات قديمة جزئيًا' : 'بيانات متأخرة') + ' · ' + src);
    else if (counts.MARKET_CLOSED && !counts.STALE) setState('off', 'Markets closed · ' + src, 'الأسواق مغلقة · ' + src);
    else if (counts.STALE) setState('warn', 'Market data stale', 'بيانات السوق قديمة');
    else setState('error', 'Market data unavailable', 'بيانات السوق غير متاحة');
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(load, failures ? Math.min(MAX, POLL * Math.pow(2, failures)) : POLL); }
  function load() {
    if (document.hidden) { schedule(); return; }
    fetch(api + '/api/market/quotes?symbols=' + encodeURIComponent(symbols.join(',')), { cache: 'no-store', credentials: 'omit', mode: 'cors' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        var next = {};
        (d && Array.isArray(d.quotes) ? d.quotes : []).forEach(function (q) { if (q && items[q.symbol]) next[q.symbol] = q; });
        data = next; fetchedAt = Date.now(); failures = 0; loaded = true; paint(); schedule();
      })
      .catch(function () { failures++; paint(); schedule(); });
  }
  paint(); load();
  setInterval(function () { if (loaded) paint(); }, 5000); // keep ageing between polls
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
  window.FOXREX_MARKET_UI = { current: current };
})();
