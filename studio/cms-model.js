/* FOXREX CMS model — the single source of editorial rules.
   Loaded by FOXREX Studio (browser global FOXREX_CMS) and by the worker publishing engine
   (CommonJS require), so validation, lifecycle and destination mapping cannot drift apart.
   Pure functions only: no network, no storage, no DOM. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FOXREX_CMS = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EDITORIAL_TZ = 'Europe/Istanbul';
  const LANGS = ['en', 'ar'];

  /* ---------- lifecycle ---------- */
  const STATES = ['IDEA', 'DRAFT', 'REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'];
  const STATE_LABEL = {
    IDEA: ['Idea', 'فكرة'], DRAFT: ['Draft', 'مسودة'], REVIEW: ['In review', 'قيد المراجعة'], APPROVED: ['Approved', 'معتمد'],
    SCHEDULED: ['Scheduled', 'مجدول'], PUBLISHED: ['Published', 'منشور'], ARCHIVED: ['Archived', 'مؤرشف']
  };
  /** Operator transitions. PUBLISH / UNPUBLISH are performed only by the publishing engine. */
  const TRANSITIONS = {
    start: { from: ['IDEA'], to: 'DRAFT' },
    submit: { from: ['IDEA', 'DRAFT'], to: 'REVIEW', validate: true },
    reject: { from: ['REVIEW'], to: 'DRAFT' },
    approve: { from: ['REVIEW'], to: 'APPROVED', validate: true },
    schedule: { from: ['APPROVED'], to: 'SCHEDULED', validate: true, needsScheduledAt: true },
    unschedule: { from: ['SCHEDULED'], to: 'APPROVED' },
    archive: { from: ['IDEA', 'DRAFT', 'REVIEW', 'APPROVED', 'SCHEDULED'], to: 'ARCHIVED' },
    restore: { from: ['ARCHIVED'], to: 'DRAFT' }
  };
  const PUBLISHABLE_FROM = ['APPROVED', 'SCHEDULED'];
  /** Editing any of these states returns the record to DRAFT: approval never survives an edit. */
  const EDIT_RESETS = ['REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED'];
  /** Market-time-sensitive types: never auto-published late (missed-schedule policy) and may carry expiresAt. */
  const TIME_SENSITIVE = ['MORNING_BRIEF', 'GOLD_FOCUS', 'EVENT', 'US_OPEN', 'MARKET_RECAP'];

  /* ---------- content types & destination mapping (centralised) ---------- */
  const DESK = ['MORNING_BRIEF', 'EVENT', 'US_OPEN', 'MARKET_RECAP'];
  const TYPES = {
    MORNING_BRIEF: { label: ['Morning Brief', 'الموجز الصباحي'], section: 'desk', slot: 'brief', pages: ['home'], time: '09:00' },
    GOLD_FOCUS: { label: ['Gold Focus', 'تركيز الذهب'], section: 'gold', slot: 'gold', pages: ['home', 'gold'], time: '11:00', fixedSymbol: 'XAUUSD', risk: true },
    EVENT: { label: ['The Event', 'الحدث'], section: 'desk', slot: 'event', pages: ['home', 'news'], time: '14:00', sources: true },
    US_OPEN: { label: ['US Open', 'افتتاح السوق الأمريكي'], section: 'desk', slot: 'open', pages: ['home'], time: '15:30' },
    MARKET_RECAP: { label: ['Market Recap', 'ملخص السوق'], section: 'desk', slot: 'recap', pages: ['home'], time: '22:30' },
    ANALYSIS: { label: ['Analysis', 'تحليل'], section: 'analysis', pages: ['home', 'analysis'], trading: true, risk: true },
    NEWS: { label: ['News', 'خبر'], section: 'news', pages: ['home', 'news'], sources: true },
    LEARN: { label: ['Learn', 'تعلّم'], section: 'learn', pages: ['learn'], body: true },
    REX_EXPLAINS: { label: ['REX Explains', 'REX يشرح'], section: 'learn', pages: ['learn'], body: true },
    REX_NOTE: { label: ['REX Note', 'ملاحظة REX'], section: 'learn', pages: ['learn'], body: true },
    ASK_REX: { label: ['Ask REX', 'اسأل REX'], section: 'learn', pages: ['learn'], body: true },
    SIGNAL: { label: ['Signal', 'إشارة'], section: 'signals', pages: ['home', 'signals'], signal: true, risk: true },
    SIGNAL_RESULT: { label: ['Signal Result', 'نتيجة إشارة'], section: 'signals', pages: ['home', 'signals'], result: true },
    /* Social-only formats: produced in Studio, never mapped to the website feed. */
    REEL: { label: ['Reel', 'ريل'], website: false }, STORY: { label: ['Story', 'ستوري'], website: false },
    CAROUSEL: { label: ['Carousel', 'كاروسيل'], website: false }, CAMPAIGN: { label: ['Campaign', 'حملة'], website: false }
  };
  const WEBSITE_TYPES = Object.keys(TYPES).filter(t => TYPES[t].website !== false);
  const PAGE_PATH = { home: '', gold: 'gold/', analysis: 'analysis/', news: 'news/', learn: 'learn/', signals: 'signals/' };
  const destinations = type => (TYPES[type] && TYPES[type].pages) || [];
  const pageUrl = (page, lang, origin) => (origin || '') + '/' + (lang === 'ar' ? 'ar/' : '') + (PAGE_PATH[page] || '');

  const ANALYSIS_CATEGORIES = ['technical', 'macro', 'gold', 'fx', 'indices', 'crypto'];
  const NEWS_CATEGORIES = ['economic', 'central-banks', 'commodities', 'fx', 'indices', 'crypto'];
  const BIAS = ['bullish', 'bearish', 'neutral'];
  const IMPORTANCE = ['LOW', 'MEDIUM', 'HIGH'];
  const DIRECTION = ['BUY', 'SELL'];
  const OUTCOME = ['TARGET_HIT', 'STOPPED_OUT', 'BREAKEVEN', 'CLOSED_MANUALLY', 'EXPIRED'];

  const DEFAULT_RISK = {
    en: 'Trading carries a high risk of loss. This content is for information and education only and is not investment advice.',
    ar: 'التداول ينطوي على مخاطر عالية للخسارة. هذا المحتوى للمعلومات والتعليم فقط، ولا يُعد نصيحة استثمارية.'
  };

  /* ---------- helpers ---------- */
  const RE = {
    id: /^[a-z0-9][a-z0-9-]{2,118}[a-z0-9]$/,
    slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    group: /^[a-z0-9][a-z0-9-]{2,110}[a-z0-9]$/,
    iso: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/,
    https: /^https:\/\/[^\s<>"']+$/,
    media: /^assets\/media\/[a-z0-9][a-z0-9/_-]*\.(png|jpe?g|webp)$/,
    symbol: /^[A-Z0-9]{2,12}$/,
    html: /<\s*[a-zA-Z!/?]|javascript:|on[a-z]+\s*=/i,
    num: /^-?\d+(\.\d+)?$/
  };
  const str = v => typeof v === 'string' ? v.trim() : '';
  const has = v => str(v).length > 0;
  const arr = v => Array.isArray(v) ? v : [];
  const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const pad = n => String(n).padStart(2, '0');
  /** YYYY-MM-DD of a UTC instant, in the editorial timezone. */
  function editorialDate(iso) {
    const d = new Date(iso || Date.now());
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: EDITORIAL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    return parts;
  }
  function formatEditorial(iso, withDate = true) {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    return new Intl.DateTimeFormat('en-GB', { timeZone: EDITORIAL_TZ, ...(withDate ? { day: '2-digit', month: 'short', year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit' }).format(d) + ' IST';
  }
  /** Convert "YYYY-MM-DDTHH:MM" wall time in Istanbul (UTC+3, no DST) to canonical UTC ISO. */
  function istanbulLocalToUtc(local) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local || ''); if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 3, +m[5])).toISOString().replace('.000Z', 'Z');
  }
  function utcToIstanbulLocal(iso) {
    const d = new Date(iso); if (isNaN(d)) return '';
    const t = new Date(d.getTime() + 3 * 3600e3);
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
  }
  function makeGroupId(type, date, slug) { return `${String(type).toLowerCase().replace(/_/g, '-')}-${date}-${slug}`.replace(/-+/g, '-').slice(0, 112).replace(/-+$/, ''); }
  function makeId(groupId, lang) { return `${groupId}-${lang}`; }

  /** Latin/number tokens that must survive translation unchanged (symbols, prices, times, %). */
  function protectedTokens(text) {
    const out = new Set();
    for (const m of String(text || '').matchAll(/\d{1,2}:\d{2}|[A-Z]{2,}[A-Z0-9]*|[+\-−]?\d+(?:,\d{3})*(?:\.\d+)?%?/g)) out.add(m[0].replace('−', '-'));
    return [...out];
  }
  function missingTokens(source, target) {
    const t = String(target || '');
    return protectedTokens(source).filter(tok => !t.includes(tok));
  }

  /* ---------- blank record ---------- */
  function blankRecord(type, lang, now, actor) {
    const t = TYPES[type]; if (!t) throw new Error('Unknown content type');
    const ts = now || new Date().toISOString();
    return {
      id: '', type, status: 'DRAFT', language: lang || 'en', translationGroupId: '',
      title: '', slug: '', summary: '', body: '',
      symbol: t.fixedSymbol || '', market: t.fixedSymbol ? 'commodities' : '', bias: '', category: type === 'GOLD_FOCUS' ? 'gold' : '', tags: [],
      image: null, visualPrompt: '',
      author: actor || '', reviewer: '',
      createdAt: ts, updatedAt: ts, reviewedAt: null, approvedAt: null, scheduledAt: null, publishedAt: null, expiresAt: null,
      sourceReferences: [],
      riskDisclosure: t.risk ? DEFAULT_RISK[lang || 'en'] : '',
      seo: { title: '', description: '' }, social: { caption: '', hashtags: [] },
      publishing: { destinations: destinations(type), websiteSection: t.section || null, publishVersion: 0, lastPublishedAt: null },
      audit: { createdBy: actor || '', updatedBy: actor || '', approvedBy: null, publishedBy: null },
      fields: blankFields(type)
    };
  }
  function blankFields(type) {
    switch (type) {
      case 'GOLD_FOCUS': return { marketState: '', keySupport: [], keyResistance: [], importantLevel: '', bullishScenario: '', bearishScenario: '', invalidation: '', price: null, priceSource: '', priceTime: null };
      case 'ANALYSIS': return { timeframe: '', keyLevels: [], bullishScenario: '', bearishScenario: '', invalidation: '', price: null, priceSource: '', priceTime: null };
      case 'NEWS': case 'EVENT': return { importance: 'MEDIUM', affectedMarkets: [], eventTime: null };
      case 'SIGNAL': return { direction: '', entry: '', stopLoss: '', targets: [], riskMessage: '', analysisContext: '', validity: '' };
      case 'SIGNAL_RESULT': return { signalId: '', direction: '', entry: '', exit: '', outcome: '', closedAt: null, resultNotes: '' };
      default: return {};
    }
  }

  /* ---------- validation ---------- */
  /** Returns [{ field, message }]. level: 'draft' (shape only) or 'publish' (everything). */
  function validateRecord(r, level) {
    const E = [], err = (field, message) => E.push({ field, message });
    const publish = level !== 'draft';
    const t = TYPES[r && r.type];
    if (!r || typeof r !== 'object') return [{ field: '', message: 'Record is not an object' }];
    if (!t) err('type', 'Unknown content type');
    if (!LANGS.includes(r.language)) err('language', 'Language must be en or ar');
    if (!STATES.includes(r.status)) err('status', 'Unknown status');
    if (has(r.id) && !RE.id.test(r.id)) err('id', 'ID must be lowercase letters, digits and hyphens');
    if (has(r.slug) && !RE.slug.test(r.slug)) err('slug', 'Slug must be lowercase Latin letters, digits and single hyphens');
    if (has(r.translationGroupId) && !RE.group.test(r.translationGroupId)) err('translationGroupId', 'Invalid translation group ID');
    // No markup anywhere: public rendering is plain text only.
    walkText(r, (path, v) => { if (RE.html.test(v) && !/^(sourceReferences\.\d+\.url|visualPrompt)$/.test(path)) err(path, 'HTML, scripts and event handlers are not allowed; use plain text'); });
    if (r.image && (has(r.image.src) || has(r.image.alt))) {
      if (!has(r.image.src)) { if (has(r.image.alt)) err('image.src', 'Add the image path (assets/media/…) or clear the alt text'); }
      else if (!RE.media.test(str(r.image.src))) err('image.src', 'Image must be a file under assets/media/ (png, jpg or webp); no data: URLs');
      if (publish && !has(r.image.alt)) err('image.alt', 'Image alt text is required');
    }
    for (const [i, s] of arr(r.sourceReferences).entries()) {
      if (!has(s && s.name)) err(`sourceReferences.${i}.name`, 'Source name is required');
      if (s && has(s.url) && !RE.https.test(s.url)) err(`sourceReferences.${i}.url`, 'Source URL must start with https://');
      for (const k of ['publishedAt', 'retrievedAt']) if (s && s[k] && !RE.iso.test(s[k])) err(`sourceReferences.${i}.${k}`, 'Use an ISO UTC timestamp');
    }
    if (!t || !publish || t.website === false) { if (t && t.website === false && publish) err('type', 'Social-only formats are not published to the website'); return E; }

    // ---- publish-level requirements ----
    if (!has(r.id)) err('id', 'ID is required');
    if (!has(r.translationGroupId)) err('translationGroupId', 'Translation group is required');
    if (!has(r.title)) err('title', 'Title is required');
    else if (str(r.title).length > 180) err('title', 'Title must be 180 characters or fewer');
    if (!has(r.slug)) err('slug', 'Slug is required');
    if (!has(r.summary)) err('summary', 'Summary is required');
    else if (str(r.summary).length > 600) err('summary', 'Summary must be 600 characters or fewer');
    if (t.body && !has(r.body)) err('body', 'Body is required for education content');
    if (r.riskDisclosure !== undefined && t.risk && !has(r.riskDisclosure)) err('riskDisclosure', 'Risk disclosure is required for this type');
    if (t.sources && !arr(r.sourceReferences).some(s => has(s && s.name) && has(s && s.url)))
      err('sourceReferences', 'At least one source with a name and https URL is required — AI-generated news is never publishable');
    if (r.bias && !BIAS.includes(r.bias)) err('bias', 'Bias must be bullish, bearish or neutral');
    if (has(r.symbol) && !RE.symbol.test(r.symbol)) err('symbol', 'Symbol must be uppercase letters/digits, e.g. XAUUSD');
    if (t.fixedSymbol && r.symbol !== t.fixedSymbol) err('symbol', `${r.type} symbol must be ${t.fixedSymbol}`);
    if (r.seo && str(r.seo.description).length > 200) err('seo.description', 'Meta description must be 200 characters or fewer');
    const f = r.fields || {};
    const priceCheck = () => {
      if (f.price != null && f.price !== '') {
        if (!(typeof f.price === 'number' && isFinite(f.price))) err('fields.price', 'Price must be a number');
        if (!has(f.priceSource)) err('fields.priceSource', 'A price requires its data source — never publish an unsourced current price');
        if (!f.priceTime || !RE.iso.test(f.priceTime)) err('fields.priceTime', 'A price requires the time it was observed (UTC)');
      }
    };
    switch (r.type) {
      case 'GOLD_FOCUS':
        if (!BIAS.includes(r.bias)) err('bias', 'Gold Focus requires a bias');
        if (!has(f.marketState)) err('fields.marketState', 'Market state is required');
        if (!arr(f.keySupport).filter(has).length) err('fields.keySupport', 'At least one key support level is required');
        if (!arr(f.keyResistance).filter(has).length) err('fields.keyResistance', 'At least one key resistance level is required');
        if (!has(f.bullishScenario)) err('fields.bullishScenario', 'Bullish scenario is required');
        if (!has(f.bearishScenario)) err('fields.bearishScenario', 'Bearish scenario is required');
        if (!has(f.invalidation)) err('fields.invalidation', 'Invalidation is required');
        if (!arr(r.sourceReferences).some(s => has(s && s.name))) err('sourceReferences', 'Gold Focus needs at least one source reference (data, chart or desk source)');
        priceCheck(); break;
      case 'ANALYSIS':
        if (!has(r.symbol)) err('symbol', 'Symbol is required');
        if (!ANALYSIS_CATEGORIES.includes(r.category)) err('category', 'Choose an analysis category');
        if (!BIAS.includes(r.bias)) err('bias', 'Bias is required');
        priceCheck(); break;
      case 'NEWS': case 'EVENT':
        if (r.type === 'NEWS' && !NEWS_CATEGORIES.includes(r.category)) err('category', 'Choose a news category');
        if (!IMPORTANCE.includes(f.importance)) err('fields.importance', 'Importance must be LOW, MEDIUM or HIGH');
        for (const m of arr(f.affectedMarkets)) if (!RE.symbol.test(m)) err('fields.affectedMarkets', `Invalid market symbol: ${m}`);
        if (f.eventTime && !RE.iso.test(f.eventTime)) err('fields.eventTime', 'Event time must be an ISO UTC timestamp'); break;
      case 'SIGNAL':
        if (!has(r.symbol)) err('symbol', 'Signal symbol is required');
        if (!DIRECTION.includes(f.direction)) err('fields.direction', 'Direction must be BUY or SELL');
        if (!RE.num.test(str(f.entry))) err('fields.entry', 'Entry is required (number)');
        if (!RE.num.test(str(f.stopLoss))) err('fields.stopLoss', 'Stop-loss is required — a signal without a stop-loss is never published');
        if (!arr(f.targets).filter(x => RE.num.test(str(x))).length) err('fields.targets', 'At least one numeric target is required');
        if (!has(f.riskMessage)) err('fields.riskMessage', 'Risk message is required for every signal');
        if (!has(f.analysisContext)) err('fields.analysisContext', 'Analysis context is required');
        if (RE.num.test(str(f.entry)) && RE.num.test(str(f.stopLoss))) {
          const e = +f.entry, sl = +f.stopLoss;
          if (f.direction === 'BUY' && !(sl < e)) err('fields.stopLoss', 'For BUY the stop-loss must be below entry');
          if (f.direction === 'SELL' && !(sl > e)) err('fields.stopLoss', 'For SELL the stop-loss must be above entry');
        } break;
      case 'SIGNAL_RESULT':
        if (!has(f.signalId) || !RE.id.test(f.signalId)) err('fields.signalId', 'Result must reference the original signal ID');
        if (!has(r.symbol)) err('symbol', 'Symbol is required');
        if (!DIRECTION.includes(f.direction)) err('fields.direction', 'Direction must be BUY or SELL');
        if (!RE.num.test(str(f.entry))) err('fields.entry', 'Entry is required');
        if (!RE.num.test(str(f.exit))) err('fields.exit', 'Exit is required');
        if (!OUTCOME.includes(f.outcome)) err('fields.outcome', 'Outcome is required');
        if (!f.closedAt || !RE.iso.test(f.closedAt)) err('fields.closedAt', 'Closed time is required (UTC)');
        else if (Date.parse(f.closedAt) > Date.now() + 60e3) err('fields.closedAt', 'A result cannot close in the future');
        if (!has(f.resultNotes)) err('fields.resultNotes', 'Result notes are required'); break;
    }
    if (r.status === 'SCHEDULED' && !(r.scheduledAt && RE.iso.test(r.scheduledAt))) err('scheduledAt', 'Scheduled content needs a UTC schedule time');
    if (r.expiresAt != null && r.expiresAt !== '') {
      if (!RE.iso.test(r.expiresAt)) err('expiresAt', 'Expiry must be an ISO UTC timestamp');
      else if (r.scheduledAt && Date.parse(r.expiresAt) <= Date.parse(r.scheduledAt)) err('expiresAt', 'Expiry must be after the scheduled time');
    }
    return E;
  }
  function walkText(o, fn, path) {
    if (typeof o === 'string') return fn(path || '', o);
    if (Array.isArray(o)) return o.forEach((v, i) => walkText(v, fn, (path ? path + '.' : '') + i));
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!['audit', 'history', 'live', 'publishing'].includes(k)) walkText(v, fn, (path ? path + '.' : '') + k);
  }

  /** Is the transition allowed from the record's current status? Returns an error string or null. */
  function transitionError(r, action, opts) {
    const tr = TRANSITIONS[action];
    if (!tr) return 'Unknown action';
    if (!tr.from.includes(r.status)) return `Cannot ${action} content that is ${r.status}`;
    if (tr.validate) { const errs = validateRecord(r, 'publish'); if (errs.length) return `${errs.length} validation error(s) must be fixed first`; }
    if (tr.needsScheduledAt) {
      const at = opts && opts.scheduledAt;
      if (!at || !RE.iso.test(at)) return 'Choose a schedule time';
      if (Date.parse(at) <= Date.now()) return 'Schedule time must be in the future';
    }
    return null;
  }
  /** Publish gate: approved (or scheduled and due) + full validation. */
  function publishGate(r, now) {
    const errors = [];
    if (!PUBLISHABLE_FROM.includes(r.status)) errors.push({ field: 'status', message: `Only APPROVED content can be published (this is ${r.status})` });
    if (r.expiresAt && Date.parse(r.expiresAt) <= (now || Date.now())) errors.push({ field: 'expiresAt', message: 'This content has expired and can no longer be published as current' });
    if (r.status === 'SCHEDULED' && r.scheduledAt && Date.parse(r.scheduledAt) > (now || Date.now())) errors.push({ field: 'scheduledAt', message: 'Scheduled content cannot be published before its scheduled time' });
    if (!r.audit || !r.audit.approvedBy || !r.approvedAt) errors.push({ field: 'audit.approvedBy', message: 'Missing approval record' });
    return errors.concat(validateRecord(r, 'publish'));
  }

  /* ---------- public feed ---------- */
  const EMPTY_FEED = () => ({ schemaVersion: 2, updated: null, publication: null, items: [] });
  function normalizeFeed(feed) {
    if (!feed || typeof feed !== 'object') return EMPTY_FEED();
    if (feed.schemaVersion === 2 && Array.isArray(feed.items)) return feed;
    // v1 (collections) had no published items; migrate its shape.
    const legacy = ['editorial', 'analysis', 'news'].some(k => Array.isArray(feed[k]) && feed[k].length) || feed.gold || (feed.signals && (feed.signals.results || []).length);
    if (legacy) throw new Error('Legacy feed contains items; migrate manually');
    return EMPTY_FEED();
  }
  const trimList = v => arr(v).map(str).filter(Boolean);
  /** Public, render-ready entry. Only whitelisted fields leave the CMS. */
  function toFeedEntry(r, publishedAt, publishVersion) {
    const t = TYPES[r.type], f = r.fields || {};
    const e = {
      id: r.id, type: r.type, language: r.language, translationGroupId: r.translationGroupId, section: t.section,
      slug: r.slug, title: str(r.title), summary: str(r.summary),
      publishedAt, updatedAt: publishedAt, publishVersion
    };
    if (t.slot) e.slot = t.slot;
    if (has(r.body)) e.body = str(r.body);
    if (has(r.symbol)) e.symbol = r.symbol;
    if (has(r.market)) e.market = r.market;
    if (has(r.category)) e.category = r.category;
    if (BIAS.includes(r.bias)) e.bias = r.bias;
    if (trimList(r.tags).length) e.tags = trimList(r.tags);
    if (r.image && has(r.image.src)) e.image = { src: r.image.src, alt: str(r.image.alt) };
    const sources = arr(r.sourceReferences).filter(s => has(s && s.name)).map(s => {
      const o = { name: str(s.name) }; if (has(s.url)) o.url = s.url; if (s.publishedAt) o.publishedAt = s.publishedAt; if (s.retrievedAt) o.retrievedAt = s.retrievedAt; return o;
    });
    if (sources.length) e.sources = sources;
    if (has(r.riskDisclosure)) e.riskDisclosure = str(r.riskDisclosure);
    if (r.expiresAt) e.expiresAt = r.expiresAt;
    if (r.seo && (has(r.seo.title) || has(r.seo.description))) e.seo = { title: str(r.seo.title), description: str(r.seo.description) };
    const pick = keys => { for (const k of keys) { const v = f[k]; if (Array.isArray(v) ? trimList(v).length : v != null && v !== '') e[k] = Array.isArray(v) ? trimList(v) : typeof v === 'string' ? v.trim() : v; } };
    switch (r.type) {
      case 'GOLD_FOCUS': pick(['marketState', 'keySupport', 'keyResistance', 'importantLevel', 'bullishScenario', 'bearishScenario', 'invalidation', 'price', 'priceSource', 'priceTime']); break;
      case 'ANALYSIS': pick(['timeframe', 'keyLevels', 'bullishScenario', 'bearishScenario', 'invalidation', 'price', 'priceSource', 'priceTime']); break;
      case 'NEWS': case 'EVENT': pick(['importance', 'affectedMarkets', 'eventTime']); break;
      case 'SIGNAL': pick(['direction', 'entry', 'stopLoss', 'targets', 'riskMessage', 'analysisContext', 'validity']); break;
      case 'SIGNAL_RESULT': pick(['signalId', 'direction', 'entry', 'exit', 'outcome', 'closedAt', 'resultNotes']); break;
    }
    return e;
  }
  /** Returns a new feed with the entry inserted/replaced (by id). Never mutates the input. */
  function applyToFeed(feed, entry, publication) {
    const f = normalizeFeed(JSON.parse(JSON.stringify(feed)));
    f.items = f.items.filter(i => i.id !== entry.id).concat([entry]).sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '') || a.id.localeCompare(b.id));
    f.updated = publication.at; f.publication = publication;
    return f;
  }
  function removeFromFeed(feed, id, publication) {
    const f = normalizeFeed(JSON.parse(JSON.stringify(feed)));
    f.items = f.items.filter(i => i.id !== id);
    f.updated = publication.at; f.publication = publication;
    return f;
  }
  /** Fixture convention: titles starting with "TEST", or "test"/"fixture" as an ID/slug segment. */
  const isFixture = it => /^TEST\b/.test(str(it.title)) || /(^|-)(test|fixture)(-|$)/.test(`${it.id || ''}-${it.slug || ''}`);
  /** Integrity rules the JSON Schema cannot express. Returns error strings. */
  function feedIntegrity(feed, opts) {
    const E = []; const seen = new Set(); const now = (opts && opts.now) || Date.now();
    for (const it of arr(feed.items)) {
      const where = `items[${it.id}]`;
      if (seen.has(it.id)) E.push(`${where}: duplicate id`); seen.add(it.id);
      if (!(opts && opts.allowTestContent) && isFixture(it)) E.push(`${where}: test fixture content can never be published to the public feed`);
      if (!TYPES[it.type] || TYPES[it.type].website === false) E.push(`${where}: type ${it.type} is not publishable to the website`);
      if (it.publishedAt && Date.parse(it.publishedAt) > now + 5 * 60e3) E.push(`${where}: publishedAt is in the future (scheduled content must not appear early)`);
      if (it.price != null && !(it.priceSource && it.priceTime)) E.push(`${where}: price without source and time`);
      if ((it.type === 'NEWS' || it.type === 'EVENT') && !arr(it.sources).some(s => s.url)) E.push(`${where}: news/event without a linked source`);
      if (it.type === 'SIGNAL' && (!it.stopLoss || !it.riskMessage)) E.push(`${where}: signal without stop-loss or risk message`);
      if (it.type === 'SIGNAL_RESULT' && !it.signalId) E.push(`${where}: result without signal reference`);
      walkText(it, (p, v) => { if (RE.html.test(v) && !/^sources\.\d+\.url$/.test(p)) E.push(`${where}.${p}: markup is not allowed`); });
    }
    return E;
  }

  return {
    EDITORIAL_TZ, LANGS, TIME_SENSITIVE, STATES, STATE_LABEL, TRANSITIONS, PUBLISHABLE_FROM, EDIT_RESETS, TYPES, WEBSITE_TYPES, DESK, PAGE_PATH,
    ANALYSIS_CATEGORIES, NEWS_CATEGORIES, BIAS, IMPORTANCE, DIRECTION, OUTCOME, DEFAULT_RISK, RE,
    destinations, pageUrl, slugify, editorialDate, formatEditorial, istanbulLocalToUtc, utcToIstanbulLocal, makeGroupId, makeId,
    protectedTokens, missingTokens, blankRecord, blankFields, validateRecord, transitionError, publishGate,
    EMPTY_FEED, normalizeFeed, toFeedEntry, applyToFeed, removeFromFeed, feedIntegrity, isFixture
  };
});
