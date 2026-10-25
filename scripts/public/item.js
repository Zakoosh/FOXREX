/* FOXREX permanent item page: freshness notice.
   The page is static and its build time is irrelevant, so staleness is decided here, in the reader's
   browser, from the item's validUntil. Past it, the dated notice is shown — the levels are never
   presented as current. Without JavaScript the "as of" line still states the exact time. */
(function () {
  'use strict';
  var el = document.querySelector('[data-freshness][data-valid-until]');
  if (!el) return;
  var until = Date.parse(el.getAttribute('data-valid-until'));
  if (!isFinite(until) || Date.now() < until) return;
  var notice = document.querySelector('[data-stale-notice]');
  if (notice) notice.hidden = false;
  document.documentElement.setAttribute('data-stale', '');
})();
