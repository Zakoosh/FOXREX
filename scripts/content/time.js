/* FOXREX editorial time — Europe/Istanbul editorial day, America/New_York market clock.
   Shared by the site generator, the publishing engine, the selectors and (later) the browser.
   Pure functions, no dependencies: zone offsets come from Intl, so DST is never hardcoded.
   Türkiye has no DST (UTC+3 all year). New York does, so New York events move in Istanbul time. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FOXREX_TIME = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const IST = 'Europe/Istanbul';
  const NY = 'America/New_York';
  const DAY = 86400e3;
  const pad = n => String(n).padStart(2, '0');
  const toDate = v => (v instanceof Date ? v : new Date(v == null ? Date.now() : v));
  const iso = d => toDate(d).toISOString().replace(/\.000Z$/, 'Z');

  const fmtCache = {};
  function partsIn(when, tz) {
    const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }));
    const o = {};
    for (const p of f.formatToParts(toDate(when))) o[p.type] = p.value;
    const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday];
    return { year: +o.year, month: +o.month, day: +o.day, hour: +o.hour % 24, minute: +o.minute, second: +o.second, weekday: wd, ymd: `${o.year}-${o.month}-${o.day}`, hm: `${o.hour === '24' ? '00' : o.hour}:${o.minute}` };
  }
  /** Minutes the zone is ahead of UTC at that instant. */
  function offsetMinutes(when, tz) {
    const d = toDate(when), p = partsIn(d, tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  }
  /** Wall-clock "YYYY-MM-DD" + "HH:MM" in a zone → the UTC instant (Date). Handles DST transitions. */
  function zonedToUtc(ymd, hm, tz) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''), t = /^(\d{2}):(\d{2})$/.exec(hm || '');
    if (!m || !t) throw new Error(`Invalid wall time ${ymd} ${hm}`);
    const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
    const first = wall - offsetMinutes(wall, tz) * 60000;
    const second = wall - offsetMinutes(first, tz) * 60000; // second pass settles DST edges
    const want = `${ymd} ${hm}`, wallOf = ms => { const p = partsIn(ms, tz); return `${p.ymd} ${p.hm}`; };
    if (wallOf(second) === want) return new Date(second);
    if (wallOf(first) === want) return new Date(first);
    return new Date(Math.max(first, second)); // wall time inside a spring-forward gap → the instant just after the gap
  }

  /** FOXREX editorial date: the calendar day in Istanbul, never the UTC day. */
  const editorialDate = when => partsIn(when, IST).ymd;
  const istTime = when => partsIn(when, IST).hm;
  const nyDate = when => partsIn(when, NY).ymd;
  function addDays(ymd, n) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd); if (!m) throw new Error(`Invalid date ${ymd}`);
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const weekdayOf = ymd => new Date(ymd + 'T12:00:00Z').getUTCDay();
  const isWeekday = ymd => { const w = weekdayOf(ymd); return w >= 1 && w <= 5; };
  function nextWeekday(ymd) { let d = addDays(ymd, 1); while (!isWeekday(d)) d = addDays(d, 1); return d; }

  /* ---------- the FOXREX desk ---------- */
  /** Editorial slots in Istanbul wall time. `always` slots run every trading day; the others only when relevant. */
  const SLOTS = [
    { id: 'morning-brief', type: 'MORNING_BRIEF', time: '09:00', always: true },
    { id: 'gold-focus', type: 'GOLD_FOCUS', time: '11:00', always: true },
    { id: 'event', type: 'EVENT', time: '14:00', always: false },
    { id: 'us-session-preview', type: 'US_SESSION_PREVIEW', time: '15:30', always: true },
    { id: 'rex-note', type: 'REX_EXPLAINS', time: '19:00', always: false },
    { id: 'market-recap', type: 'MARKET_RECAP', time: '22:30', always: true }
  ];
  const slotAt = (ymd, id) => { const s = SLOTS.find(x => x.id === id); if (!s) throw new Error(`Unknown slot ${id}`); return zonedToUtc(ymd, s.time, IST); };

  /** The US session for a trading date, computed from New York wall time (DST-aware) and shown in Istanbul time.
      15:30 IST is the editorial US Session Preview — it is NOT the US cash open. */
  function usSession(ymd) {
    const at = (hm) => { const d = zonedToUtc(ymd, hm, NY); return { utc: iso(d), ist: istTime(d), ny: hm }; };
    const open = zonedToUtc(ymd, '09:30', NY);
    return {
      date: ymd, nyUtcOffsetMinutes: offsetMinutes(open, NY), usDaylightTime: offsetMinutes(open, NY) === -240,
      dataRelease: at('08:30'), cashOpen: at('09:30'), cashClose: at('16:00'),
      preview: { utc: iso(zonedToUtc(ymd, '15:30', IST)), ist: '15:30' }
    };
  }

  /* ---------- market sessions (no holidays modelled: a holiday ages quotes into STALE, never LIVE) ---------- */
  const SESSIONS = {
    fx: { open: [0, '17:00'], close: [5, '17:00'], dailyBreak: null },
    metal: { open: [0, '18:00'], close: [5, '17:00'], dailyBreak: ['17:00', '18:00'] },
    index: { open: [0, '18:00'], close: [5, '17:00'], dailyBreak: ['17:00', '18:00'] },
    energy: { open: [0, '18:00'], close: [5, '17:00'], dailyBreak: ['17:00', '18:00'] },
    crypto: null
  };
  const mins = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  /** OPEN or CLOSED for an asset class at an instant, from the New York trading week. */
  function marketState(assetClass, when) {
    if (!(assetClass in SESSIONS)) return 'UNKNOWN';
    const s = SESSIONS[assetClass]; if (!s) return 'OPEN';
    const p = partsIn(when, NY), now = p.weekday * 1440 + p.hour * 60 + p.minute;
    const open = s.open[0] * 1440 + mins(s.open[1]), close = s.close[0] * 1440 + mins(s.close[1]);
    if (now < open || now >= close) return 'CLOSED'; // Friday close → Sunday reopen (week counted from Sunday 00:00 NY)
    if (s.dailyBreak) { const t = p.hour * 60 + p.minute; if (t >= mins(s.dailyBreak[0]) && t < mins(s.dailyBreak[1])) return 'CLOSED'; }
    return 'OPEN';
  }

  function formatIst(when, withDate) {
    const d = toDate(when); if (isNaN(d)) return '';
    return new Intl.DateTimeFormat('en-GB', { timeZone: IST, ...(withDate === false ? {} : { day: '2-digit', month: 'short', year: 'numeric' }), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  }

  return { IST, NY, DAY, SLOTS, SESSIONS, partsIn, offsetMinutes, zonedToUtc, editorialDate, istTime, nyDate, addDays, weekdayOf, isWeekday, nextWeekday, slotAt, usSession, marketState, formatIst, iso };
});
