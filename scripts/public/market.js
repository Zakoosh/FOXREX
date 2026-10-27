/* FOXREX market ticker.
   No market data is bundled with the site and nothing is estimated or simulated.
   A verified feed is connected later by registering an adapter before or after this script loads:

     window.FOXREX_MARKET_ADAPTERS = window.FOXREX_MARKET_ADAPTERS || [];
     window.FOXREX_MARKET_ADAPTERS.push({
       name: 'Provider name',            // shown to users as the data source
       subscribe: function (symbols, onQuote, onError) {
         // call onQuote({ symbol, price, change, changePct, time }) for each real update
         // return an optional unsubscribe function
       }
     });

   Built in: the "FOXREX snapshot" adapter reads data/quotes.json (refreshed every 15 minutes by the
   "Refresh market data" GitHub Action, each quote keeps its source and observation time) and polls
   Gold API directly for XAU and BTC. If every source fails the ticker says so; nothing is estimated. */
(function () {
  'use strict';
  var ticker = document.querySelector('[data-market-ticker]');
  if (!ticker) return;
  var stateEl = ticker.querySelector('[data-market-state]');
  var symbols = Array.prototype.map.call(ticker.querySelectorAll('[data-symbol]'), function (el) { return el.getAttribute('data-symbol'); });
  var STALE_MS = 30 * 60 * 1000;
  var last = {};

  var AR = document.documentElement.lang === 'ar';
  function label(en, ar, tr) { var span = document.createElement('span'); span.textContent = AR ? ar : document.documentElement.lang === 'tr' ? tr || (window.FOXREX_TR || {})[en] || en : en; return span.innerHTML; }
  function setState(state, en, ar, tr) { if (!stateEl) return; stateEl.setAttribute('data-state', state); stateEl.innerHTML = label(en, ar, tr); }
  function fmt(sym, n) {
    var dp = /JPY$/.test(sym) ? 3 : /^(XAU|BTC|DXY)/.test(sym) ? 2 : 5;
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  function onQuote(q) {
    if (!q || symbols.indexOf(q.symbol) < 0 || typeof q.price !== 'number' || !isFinite(q.price)) return;
    var item = ticker.querySelector('[data-symbol="' + q.symbol + '"]');
    if (!item) return;
    var px = item.querySelector('[data-px]');
    px.textContent = fmt(q.symbol, q.price);
    px.style.opacity = '';
    var chg = item.querySelector('[data-chg]');
    if (typeof q.changePct === 'number' && isFinite(q.changePct)) {
      chg.textContent = (q.changePct > 0 ? '+' : '') + q.changePct.toFixed(2) + '%';
      chg.className = 'fx-ticker__chg ' + (q.changePct >= 0 ? 'up' : 'down');
    } else { chg.textContent = ''; }
    last[q.symbol] = q.time ? new Date(q.time).getTime() : Date.now();
  }

  function connect(adapter) {
    if (!adapter || typeof adapter.subscribe !== 'function') return;
    setState('warn', 'Connecting to ' + adapter.name + '…', 'جارٍ الاتصال بـ ' + adapter.name + '…');
    try {
      adapter.subscribe(symbols, function (q) {
        onQuote(q);
        var t = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
        setState('ok', 'Live · updated ' + t + ' Istanbul', 'مباشر · آخر تحديث ' + t + ' بتوقيت إسطنبول', 'Canlı · güncelleme ' + t + ' İstanbul');
      },
        function () { setState('error', 'Market feed unavailable', 'بيانات السوق غير متاحة'); });
    } catch (e) { setState('error', 'Market feed unavailable', 'بيانات السوق غير متاحة'); }
    setInterval(function () {
      var now = Date.now();
      Object.keys(last).forEach(function (s) {
        if (now - last[s] > STALE_MS) { var el = ticker.querySelector('[data-symbol="' + s + '"] [data-px]'); if (el) el.style.opacity = '.45'; }
      });
    }, 30000);
  }

  var root = document.body.getAttribute('data-root') || '../';
  function nyDay(t) { return new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); }
  function prevWeekday(day) { var d = new Date(day + 'T12:00:00Z'); do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6); return d.toISOString().slice(0, 10); }
  function getJSON(url) { return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); }); }
  var snapshotAdapter = {
    name: 'FOXREX snapshot',
    subscribe: function (wanted, onQuote, onError) {
      var base = {}, failures = 0;
      function snapshot() {
        return getJSON(root + 'data/quotes.json?v=' + Math.floor(Date.now() / 60000)).then(function (d) {
          var today = nyDay(Date.now());
          (d.quotes || []).forEach(function (q) {
            // A live price is compared only with the previous trading day's close; an older baseline is dropped.
            if (typeof q.previousClose === 'number' && q.previousCloseDate === prevWeekday(today)) base[q.symbol] = q.previousClose;
            else if (typeof q.dailyChangePct === 'number' && q.price > 0 && nyDay(q.asOf) === today) base[q.symbol] = q.price / (1 + q.dailyChangePct / 100);
            else delete base[q.symbol];
            if (wanted.indexOf(q.symbol) >= 0) onQuote({ symbol: q.symbol, price: q.price, changePct: q.dailyChangePct, time: q.asOf });
          });
          failures = 0;
        });
      }
      function live() {
        return Promise.all([['XAU', 'XAUUSD'], ['BTC', 'BTCUSD']].filter(function (p) { return wanted.indexOf(p[1]) >= 0; }).map(function (p) {
          return getJSON('https://api.gold-api.com/price/' + p[0]).then(function (j) {
            if (j.symbol !== p[0] || j.currency !== 'USD') return;
            var b = base[p[1]];
            onQuote({ symbol: p[1], price: j.price, changePct: b ? (j.price / b - 1) * 100 : undefined, time: j.updatedAt });
          }).catch(function () {});
        }));
      }
      function cycle() { snapshot().catch(function () { if (++failures >= 2) onError(); }).then(live); }
      cycle();
      var a = setInterval(cycle, 60000), b = setInterval(live, 20000);
      return function () { clearInterval(a); clearInterval(b); };
    }
  };

  var queue = window.FOXREX_MARKET_ADAPTERS = window.FOXREX_MARKET_ADAPTERS || [];
  if (!queue.length) queue.push(snapshotAdapter);
  queue.forEach(connect);
  queue.push = function (a) { Array.prototype.push.call(queue, a); connect(a); return queue.length; };
})();
