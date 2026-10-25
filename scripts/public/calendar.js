/* Filter existing static rows; never invent or shift event dates. */
(function () {
  'use strict';
  var table = document.querySelector('[data-calendar-updated]');
  if (!table) return;
  var period = document.querySelector('[data-calendar-period]');
  var currency = document.querySelector('[data-calendar-currency]');
  var date = function (d) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); };
  function update() {
    var today = date(new Date()), end = date(new Date(Date.now() + 6 * 86400000)), visible = 0;
    table.querySelectorAll('[data-event-date]').forEach(function (row) {
      var d = row.getAttribute('data-event-date');
      var show = (period.value === 'all' || (period.value === 'today' ? d === today : d >= today && d <= end)) && (currency.value === 'all' || currency.value === row.getAttribute('data-event-currency'));
      row.hidden = !show; if (show) visible++;
    });
    document.querySelector('[data-calendar-empty]').hidden = visible !== 0;
    document.querySelector('[data-calendar-stale]').hidden = Date.now() - Date.parse(table.getAttribute('data-calendar-updated')) <= 36 * 3600000;
  }
  period.addEventListener('change', update); currency.addEventListener('change', update);
  update(); setInterval(update, 60000);
})();
