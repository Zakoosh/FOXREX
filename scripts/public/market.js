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

   Until an adapter is registered the ticker keeps its explicit "not connected" state. */
(function () {
  'use strict';
  var ticker = document.querySelector('[data-market-ticker]');
  if (!ticker) return;
  var stateEl = ticker.querySelector('[data-market-state]');
  var symbols = Array.prototype.map.call(ticker.querySelectorAll('[data-symbol]'), function (el) { return el.getAttribute('data-symbol'); });
  var STALE_MS = 5 * 60 * 1000;
  var last = {};

  var AR = document.documentElement.lang === 'ar';
  function label(en, ar) { var span = document.createElement('span'); span.textContent = AR ? ar : en; return span.innerHTML; }
  function setState(state, en, ar) { if (!stateEl) return; stateEl.setAttribute('data-state', state); stateEl.innerHTML = label(en, ar); }
  function fmt(sym, n) {
    var dp = /JPY$/.test(sym) ? 3 : /^(XAU|BTC|DXY)/.test(sym) ? 2 : 5;
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  function onQuote(q) {
    if (!q || symbols.indexOf(q.symbol) < 0 || typeof q.price !== 'number' || !isFinite(q.price)) return;
    var item = ticker.querySelector('[data-symbol="' + q.symbol + '"]');
    if (!item) return;
    item.querySelector('[data-px]').textContent = fmt(q.symbol, q.price);
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
      adapter.subscribe(symbols, function (q) { onQuote(q); setState('ok', 'Source: ' + adapter.name, 'المصدر: ' + adapter.name); },
        function () { setState('error', 'Market feed unavailable', 'بيانات السوق غير متاحة'); });
    } catch (e) { setState('error', 'Market feed unavailable', 'بيانات السوق غير متاحة'); }
    setInterval(function () {
      var now = Date.now();
      Object.keys(last).forEach(function (s) {
        if (now - last[s] > STALE_MS) { var el = ticker.querySelector('[data-symbol="' + s + '"] [data-px]'); if (el) el.style.opacity = '.45'; }
      });
    }, 30000);
  }

  var queue = window.FOXREX_MARKET_ADAPTERS = window.FOXREX_MARKET_ADAPTERS || [];
  queue.forEach(connect);
  queue.push = function (a) { Array.prototype.push.call(queue, a); connect(a); return queue.length; };
})();
