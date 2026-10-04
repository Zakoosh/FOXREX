/* FOXREX content selection — ONE canonical item → MANY derived placements.
   Listings, hubs, archives and the homepage are queries over the published v3 feed; nothing is
   duplicated by hand. Selection never fabricates: an empty or stale slot is OMITTED from the
   result, and `absent` records why (for diagnostics only — never shown to visitors as a message). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./time.js'), require('./freshness.js'));
  else root.FOXREX_SELECT = factory(root.FOXREX_TIME, root.FOXREX_FRESHNESS);
})(typeof self !== 'undefined' ? self : this, function (TIME, FRESHNESS) {
  'use strict';

  const DAY = 86400e3;
  const ms = v => (typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v));
  const newest = (a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '') || (a.id || '').localeCompare(b.id || '');
  const arr = v => (Array.isArray(v) ? v : []);
  /** Why something is absent. NO_CONTENT: nothing published · STALE_CONTENT: exists but past validity ·
      DATA_UNAVAILABLE: no usable market data · NOT_YET_DUE: a slot later today. */
  const ABSENCE = { NO_CONTENT: 'NO_CONTENT', STALE_CONTENT: 'STALE_CONTENT', DATA_UNAVAILABLE: 'DATA_UNAVAILABLE', NOT_YET_DUE: 'NOT_YET_DUE' };
  const DESK_TYPES = ['MORNING_BRIEF', 'GOLD_FOCUS', 'EVENT', 'US_SESSION_PREVIEW', 'REX_EXPLAINS', 'MARKET_RECAP'];
  const SLOT_ORDER = { MORNING_BRIEF: 1, GOLD_FOCUS: 2, EVENT: 3, US_SESSION_PREVIEW: 4, REX_EXPLAINS: 5, MARKET_RECAP: 6 };

  /* ---------- base queries (all return newest first) ---------- */
  /** Published, visible items for one language. Withdrawn tombstones and future-dated entries are excluded. */
  function publishedForLanguage(feed, lang, now = Date.now()) {
    const t = typeof now === 'number' ? now : ms(now);
    return arr(feed && feed.items).filter(e => e && e.language === lang && e.title && e.urlPath && e.access === 'PUBLIC' && ms(e.publishedAt) <= t + 5 * 60e3).sort(newest);
  }
  const latestByType = (items, types, n) => { const ts = [].concat(types); const r = items.filter(e => ts.includes(e.type)); return n == null ? r : r.slice(0, n); };
  const latestByLayer = (items, layer, n) => { const r = items.filter(e => e.layer === layer || arr(e.layers).includes(layer)); return n == null ? r : r.slice(0, n); };
  const latestByInstrument = (items, symbol, n) => { const s = String(symbol || '').toUpperCase(); const r = items.filter(e => arr(e.instruments).includes(s) || e.symbol === s); return n == null ? r : r.slice(0, n); };
  const latestByTag = (items, tag, n) => { const r = items.filter(e => arr(e.tags).includes(tag)); return n == null ? r : r.slice(0, n); };
  const latestBySection = (items, section, n) => { const r = items.filter(e => e.section === section); return n == null ? r : r.slice(0, n); };
  const publishedBetween = (items, from, to) => items.filter(e => ms(e.publishedAt) >= ms(from) && ms(e.publishedAt) < ms(to));
  /** Items whose editorial day (Istanbul) is `date` (default: today in Istanbul). */
  const todayInIstanbul = (items, now = Date.now(), date) => { const d = date || TIME.editorialDate(now); return items.filter(e => TIME.editorialDate(e.publishedAt) === d); };
  const within = (items, now, days) => items.filter(e => ms(now) - ms(e.publishedAt) <= days * DAY);
  const freshOrAging = (e, now) => { const s = FRESHNESS.itemFreshness(e, now).status; return s === 'FRESH' || s === 'AGING'; };

  function latestMorningBrief(items, now = Date.now()) {
    const b = latestByType(items, 'MORNING_BRIEF')[0];
    return b && TIME.editorialDate(b.publishedAt) === TIME.editorialDate(now) && freshOrAging(b, now) ? b : null;
  }
  function latestMarketRecap(items, now = Date.now()) {
    const r = latestByType(items, 'MARKET_RECAP')[0];
    return r && freshOrAging(r, now) ? r : null;
  }
  /** Current Gold Focus. Past its validity it is returned as DATED (never as today's) for up to 7 days, then omitted. */
  function currentGoldFocus(items, now = Date.now()) {
    const g = latestByType(items, 'GOLD_FOCUS')[0];
    if (!g) return { item: null, reason: ABSENCE.NO_CONTENT };
    const f = FRESHNESS.itemFreshness(g, now);
    if (f.status === 'FRESH' || f.status === 'AGING') return { item: g, freshness: f.status, current: true };
    if (ms(now) - ms(g.publishedAt) <= 7 * DAY) return { item: g, freshness: 'STALE', current: false, dated: true };
    return { item: null, reason: ABSENCE.STALE_CONTENT };
  }

  /** EN ↔ AR relationship for one item: the published sibling (same translation group, other language) or null. */
  function translationOf(feed, item) {
    if (!item) return null;
    return arr(feed && feed.items).find(e => e.translationGroupId === item.translationGroupId && e.language !== item.language && e.urlPath === item.urlPath) || null;
  }
  /** hreflang alternates for an item page: only languages that are actually published. x-default only when both exist (→ English). */
  function alternatesFor(feed, item, origin) {
    const o = origin || '';
    const sib = translationOf(feed, item);
    const pages = [item, sib].filter(Boolean).sort((a, b) => (a.language === 'en' ? 0 : 1) - (b.language === 'en' ? 0 : 1));
    const href = e => `${o}/${e.language === 'ar' ? 'ar/' : ''}${e.urlPath}`;
    const alts = pages.map(e => ({ hreflang: e.language, href: href(e) }));
    if (sib) alts.push({ hreflang: 'x-default', href: href(item.language === 'en' ? item : sib) });
    return alts;
  }

  /* ---------- homepage selection contract (foxrex.homepage.v1) ---------- */
  /** opts: { lang, now, quotes?: Market API quotes (PR #6 shape), limits? }. Optional keys are OMITTED when empty. */
  function homepage(feed, opts = {}) {
    const lang = opts.lang === 'ar' ? 'ar' : 'en';
    const now = opts.now == null ? Date.now() : typeof opts.now === 'number' ? opts.now : ms(opts.now);
    const lim = { analysis: 4, news: 5, trading: 3, ...(opts.limits || {}) };
    const items = publishedForLanguage(feed, lang, now);
    const today = TIME.editorialDate(now);
    const out = { contract: 'foxrex.homepage.v1', language: lang, generatedAt: TIME.iso(now), editorialDate: today };
    const absent = {};

    // 01 Market Pulse — Layer A only; omitted entirely when no usable quote exists.
    const quotes = arr(opts.quotes).map(q => FRESHNESS.fromMarketApi(q, { now })).filter(q => q.quote && ['LIVE', 'FRESH', 'AGING'].includes(q.status));
    if (quotes.length) out.marketPulse = { quotes: quotes.map(q => ({ ...q.quote, status: q.status, marketState: q.marketState, display: FRESHNESS.display(q.status) })) };
    else absent.marketPulse = ABSENCE.DATA_UNAVAILABLE;

    // 02 Lead story — the desk's lead (FRESH/AGING), else today's newest desk piece, else a HIGH-impact news item still valid.
    const lead = items.find(e => e.lead && freshOrAging(e, now))
      || todayInIstanbul(latestByType(items, ['MORNING_BRIEF', 'US_SESSION_PREVIEW', 'MARKET_RECAP', 'EVENT']), now).find(e => freshOrAging(e, now))
      || latestByType(items, 'NEWS').find(e => e.importance === 'HIGH' && freshOrAging(e, now));
    if (lead) out.leadStory = lead; else absent.leadStory = items.length ? ABSENCE.STALE_CONTENT : ABSENCE.NO_CONTENT;

    // 03 Today at FOXREX — published desk pieces of the Istanbul day + upcoming always-on slots (time only).
    const published = todayInIstanbul(latestByType(items, DESK_TYPES), now).filter(e => e.type !== 'REX_EXPLAINS' || e.format === 'note').sort((a, b) => (SLOT_ORDER[a.type] - SLOT_ORDER[b.type]) || newest(a, b));
    const upcoming = TIME.isWeekday(today) ? TIME.SLOTS.filter(s => s.always && ms(TIME.slotAt(today, s.id)) > now && !published.some(e => e.type === s.type)).map(s => ({ slot: s.id, type: s.type, at: TIME.iso(TIME.slotAt(today, s.id)), ist: s.time })) : [];
    if (published.length || upcoming.length) {
      out.today = { date: today, published, upcoming };
      if (TIME.isWeekday(today)) out.today.usSession = TIME.usSession(today);
    } else absent.today = ABSENCE.NO_CONTENT;

    const brief = latestMorningBrief(items, now);
    if (brief) { out.morningBrief = brief; if (brief.deskRead) out.deskRead = { ...brief.deskRead, from: brief.id }; }
    else absent.morningBrief = latestByType(items, 'MORNING_BRIEF').length ? ABSENCE.STALE_CONTENT : ABSENCE.NO_CONTENT;
    if (!out.deskRead) absent.deskRead = brief ? ABSENCE.NO_CONTENT : absent.morningBrief;

    const gold = currentGoldFocus(items, now);
    if (gold.item) out.goldFocus = gold; else absent.goldFocus = gold.reason;

    // Trading Intelligence — active ideas/signals (still valid), then the latest result within 7 days.
    const active = latestByType(items, ['TRADING_IDEA', 'SIGNAL']).filter(e => freshOrAging(e, now)).slice(0, lim.trading);
    const result = within(latestByType(items, 'SIGNAL_RESULT'), now, 7)[0];
    const trading = active.concat(result ? [result] : []);
    if (trading.length) out.tradingIntelligence = trading; else absent.tradingIntelligence = latestByLayer(items, 'TRADING_INTELLIGENCE').filter(e => e.type !== 'GOLD_FOCUS').length ? ABSENCE.STALE_CONTENT : ABSENCE.NO_CONTENT;

    const analysis = within(latestByType(items, ['ANALYSIS', 'WEEKLY_OUTLOOK']), now, 7).slice(0, lim.analysis);
    if (analysis.length) out.latestAnalysis = analysis; else absent.latestAnalysis = latestByType(items, ['ANALYSIS', 'WEEKLY_OUTLOOK']).length ? ABSENCE.STALE_CONTENT : ABSENCE.NO_CONTENT;

    const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const news = within(latestByType(items, 'NEWS'), now, 2).sort((a, b) => (rank[a.importance] - rank[b.importance]) || newest(a, b)).slice(0, lim.news);
    if (news.length) out.importantNews = news; else absent.importantNews = latestByType(items, 'NEWS').length ? ABSENCE.STALE_CONTENT : ABSENCE.NO_CONTENT;

    // REX only where he adds value: a note still valid today, or one tied to the current lead. No evergreen filler on the homepage.
    const rex = latestByType(items, 'REX_EXPLAINS').find(e => e.format === 'note' && freshOrAging(e, now) && TIME.editorialDate(e.publishedAt) === today);
    if (rex) out.rexExplains = rex; else absent.rexExplains = ABSENCE.NO_CONTENT;

    out.absent = absent;
    return out;
  }

  /* ---------- archives: generated only when they have qualifying items ---------- */
  /** { 'yyyy-mm': [items] } for one language, newest month first. Empty months never appear. */
  function archiveByMonth(items) {
    const m = {};
    for (const e of items) { const k = (e.editorialDate || TIME.editorialDate(e.publishedAt)).slice(0, 7); (m[k] = m[k] || []).push(e); }
    return Object.fromEntries(Object.keys(m).sort().reverse().map(k => [k, m[k].sort(newest)]));
  }
  /** Section/format archives that exist only with content: desk by date, weekly outlook, signal results. */
  function archives(items) {
    const out = {};
    const desk = items.filter(e => DESK_TYPES.includes(e.type) && (e.type !== 'REX_EXPLAINS' || e.format === 'note')); // every daily desk slot, Gold Focus included
    if (desk.length) out.desk = desk;
    const wo = latestByType(items, 'WEEKLY_OUTLOOK'); if (wo.length) out.weeklyOutlook = wo;
    const res = latestByType(items, 'SIGNAL_RESULT'); if (res.length) out.signalResults = res;
    const months = archiveByMonth(items); if (Object.keys(months).length) out.months = months;
    return out;
  }

  return { ABSENCE, DESK_TYPES, publishedForLanguage, latestByType, latestByLayer, latestByInstrument, latestByTag, latestBySection, publishedBetween, todayInIstanbul,
    latestMorningBrief, latestMarketRecap, currentGoldFocus, translationOf, alternatesFor, homepage, archiveByMonth, archives };
});
