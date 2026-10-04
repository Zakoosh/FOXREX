/* FOXREX CMS model — the single source of editorial rules (content model v3).
   Loaded by FOXREX Studio (browser global FOXREX_CMS), the worker publishing engine and the site
   generator (CommonJS require), so validation, lifecycle, layers, routes and the public feed
   contract cannot drift apart. One contract: Studio records → v3 feed entries → permanent pages.
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

  /* ---------- layers (blueprint §1): never collapsed into one generic feed ---------- */
  const MD = 'MARKET_DATA', MI = 'MARKET_INTELLIGENCE', TI = 'TRADING_INTELLIGENCE';
  const LAYERS = [MD, MI, TI];
  const LAYER_LABEL = { [MD]: ['Market Data', 'بيانات السوق'], [MI]: ['Market Intelligence', 'قراءة السوق'], [TI]: ['Trading Intelligence', 'الرؤية التداولية'] };

  /* ---------- content types, layers, routes & destination mapping (centralised) ----------
     route: how the permanent URL is derived (see routeFor). Legacy Studio types stay editable and
     publish as their v3 feed type (feedType/format), so existing records keep working. */
  const DESK = ['MORNING_BRIEF', 'EVENT', 'US_SESSION_PREVIEW', 'US_OPEN', 'MARKET_RECAP'];
  const US_PREVIEW = { section: 'desk', slot: 'open', pages: ['home'], time: '15:30', layer: MI, route: 'desk', deskPath: 'us-session-preview', marketSensitive: true };
  const TYPES = {
    MORNING_BRIEF: { label: ['Morning Brief', 'الموجز الصباحي'], section: 'desk', slot: 'brief', pages: ['home'], time: '09:00', layer: MI, route: 'desk', deskPath: 'morning-brief', marketSensitive: true },
    GOLD_FOCUS: { label: ['Gold Focus', 'تركيز الذهب'], section: 'gold', slot: 'gold', pages: ['home', 'gold'], time: '11:00', fixedSymbol: 'XAUUSD', risk: true, layer: TI, layers: [MI, TI], route: 'gold', marketSensitive: true },
    EVENT: { label: ['Event of the Day', 'حدث اليوم'], section: 'desk', slot: 'event', pages: ['home', 'news'], time: '14:00', sources: true, layer: MI, route: 'desk', deskPath: 'event', marketSensitive: true },
    US_SESSION_PREVIEW: { label: ['US Session Preview', 'استعراض الجلسة الأمريكية'], ...US_PREVIEW },
    US_OPEN: { label: ['US Open (legacy → US Session Preview)', 'الجلسة الأمريكية (قديم)'], ...US_PREVIEW, legacy: true, feedType: 'US_SESSION_PREVIEW' },
    MARKET_RECAP: { label: ['Market Recap', 'ملخص السوق'], section: 'desk', slot: 'recap', pages: ['home'], time: '22:30', layer: MI, route: 'desk', deskPath: 'market-recap', marketSensitive: true },
    ANALYSIS: { label: ['Analysis', 'تحليل'], section: 'analysis', pages: ['home', 'analysis'], trading: true, risk: true, layer: MI, route: 'slug', marketSensitive: true },
    WEEKLY_OUTLOOK: { label: ['Weekly Outlook', 'النظرة الأسبوعية'], section: 'analysis', pages: ['home', 'analysis'], trading: true, risk: true, layer: MI, route: 'slug', marketSensitive: true },
    NEWS: { label: ['News', 'خبر'], section: 'news', pages: ['home', 'news'], sources: true, layer: MI, route: 'slug', marketSensitive: true },
    TRADING_IDEA: { label: ['Trading Idea', 'فكرة تداول'], section: 'signals', pages: ['home', 'signals'], risk: true, layer: TI, route: 'slug', marketSensitive: true },
    REX_EXPLAINS: { label: ['REX Explains', 'REX يشرح'], section: 'learn', pages: ['learn'], body: true, layer: MI, route: 'rex' },
    LEARN: { label: ['Learn (legacy → REX Explains lesson)', 'تعلّم (قديم)'], section: 'learn', pages: ['learn'], body: true, layer: MI, route: 'rex', legacy: true, feedType: 'REX_EXPLAINS', format: 'lesson' },
    REX_NOTE: { label: ['REX Note (legacy → REX Explains note)', 'ملاحظة REX (قديم)'], section: 'learn', pages: ['learn'], body: true, layer: MI, route: 'rex', legacy: true, feedType: 'REX_EXPLAINS', format: 'note' },
    ASK_REX: { label: ['Ask REX (legacy → REX Explains Q&A)', 'اسأل REX (قديم)'], section: 'learn', pages: ['learn'], body: true, layer: MI, route: 'rex', legacy: true, feedType: 'REX_EXPLAINS', format: 'qa' },
    SIGNAL: { label: ['Signal', 'إشارة'], section: 'signals', pages: ['home', 'signals'], signal: true, risk: true, layer: TI, route: 'slug', marketSensitive: true },
    SIGNAL_RESULT: { label: ['Signal Result', 'نتيجة إشارة'], section: 'signals', pages: ['home', 'signals'], result: true, layer: TI, route: 'result' },
    /* Social-only formats: produced in Studio, never mapped to the website feed or given a URL. */
    REEL: { label: ['Reel', 'ريل'], website: false }, STORY: { label: ['Story', 'ستوري'], website: false },
    CAROUSEL: { label: ['Carousel', 'كاروسيل'], website: false }, CAMPAIGN: { label: ['Campaign', 'حملة'], website: false }
  };
  const WEBSITE_TYPES = Object.keys(TYPES).filter(t => TYPES[t].website !== false);
  /** Types that may appear in the public v3 feed (legacy Studio types publish as their feedType). */
  const FEED_TYPES = WEBSITE_TYPES.filter(t => !TYPES[t].legacy);
  const feedTypeOf = r => { const t = TYPES[r && r.type]; return t ? (t.feedType || r.type) : null; };
  const REX_FORMATS = ['explainer', 'lesson', 'note', 'qa'];
  function formatOf(r) {
    const t = TYPES[r && r.type]; if (!t) return null;
    if (t.format) return t.format;
    if (r.type === 'REX_EXPLAINS') { const f = (r.fields && r.fields.format) || r.format; return REX_FORMATS.includes(f) ? f : 'explainer'; }
    return null;
  }
  const ACCESS = ['PUBLIC', 'MEMBER', 'PREMIUM'];
  /** Only PUBLIC content is published until the owner approves a commercial model (no paywall, no pricing). */
  const PUBLISHABLE_ACCESS = ['PUBLIC'];
  const SOURCE_TYPES = ['official', 'market-data-provider', 'central-bank', 'government', 'exchange', 'broker', 'news', 'internal-analysis'];
  const STANCE = ['BUY', 'SELL', 'WAIT'];
  /** Slugs that would shadow a section's own pages. */
  const RESERVED_SLUGS = { analysis: ['weekly-outlook'], signals: ['results', 'methodology'], learn: ['glossary'], news: [], gold: [], desk: [] };
  const SECTION_HUB = { desk: '', gold: 'gold/', analysis: 'analysis/', news: 'news/', learn: 'learn/', signals: 'signals/' };

  /** Canonical path (no leading slash, trailing slash) for a website item. Language-independent:
      Arabic is the same path under /ar/. date = the translation group's editorial date (Istanbul). */
  function routeFor(r, date) {
    const t = TYPES[r && r.type];
    if (!t || t.website === false) return null;
    const slug = str(r.slug), d = String(date || '');
    if (!RE.slug.test(slug)) return null;
    const dated = /^\d{4}-\d{2}-\d{2}$/.test(d);
    switch (t.route) {
      case 'desk': return dated ? `desk/${d}/${t.deskPath}/` : null;
      case 'gold': return dated ? `gold/${d}/` : null;
      case 'rex': return formatOf(r) === 'note' ? (dated ? `desk/${d}/rex-note/` : null) : `learn/${slug}/`;
      case 'result': return `signals/results/${slug}/`;
      case 'slug': return `${t.section}/${slug}/`;
      default: return null;
    }
  }
  const ROUTE_RE = /^(desk\/\d{4}-\d{2}-\d{2}\/(morning-brief|event|us-session-preview|market-recap|rex-note)|gold\/\d{4}-\d{2}-\d{2}|(analysis|news|signals|learn)\/[a-z0-9]+(?:-[a-z0-9]+)*|signals\/results\/[a-z0-9]+(?:-[a-z0-9]+)*)\/$/;
  const pathFor = (urlPath, lang) => (lang === 'ar' ? 'ar/' : '') + (urlPath || '');
  const canonicalUrl = (urlPath, lang, origin) => (origin || '') + '/' + pathFor(urlPath, lang);
  const hubPath = (section, lang) => pathFor(SECTION_HUB[section] != null ? SECTION_HUB[section] : '', lang);
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
    num: /^-?\d+(\.\d+)?$/,
    date: /^\d{4}-\d{2}-\d{2}$/
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
      author: actor || '', reviewer: '', byline: '', lead: false, access: 'PUBLIC',
      createdAt: ts, updatedAt: ts, reviewedAt: null, approvedAt: null, scheduledAt: null, publishedAt: null,
      sourceReferences: [],
      riskDisclosure: t.risk ? DEFAULT_RISK[lang || 'en'] : '',
      seo: { title: '', description: '' }, social: { caption: '', hashtags: [] },
      publishing: { destinations: destinations(type), websiteSection: t.section || null, publishVersion: 0, lastPublishedAt: null },
      audit: { createdBy: actor || '', updatedBy: actor || '', approvedBy: null, publishedBy: null },
      fields: blankFields(type)
    };
  }
  function blankFields(type) {
    const fresh = { dataAsOf: null, validUntil: null };
    switch (type) {
      case 'GOLD_FOCUS': return { marketState: '', keySupport: [], keyResistance: [], importantLevel: '', bullishScenario: '', bearishScenario: '', invalidation: '', price: null, priceSource: '', priceTime: null, ...fresh };
      case 'ANALYSIS': case 'WEEKLY_OUTLOOK': return { timeframe: '', keyLevels: [], bullishScenario: '', bearishScenario: '', invalidation: '', price: null, priceSource: '', priceTime: null, ...fresh };
      case 'NEWS': case 'EVENT': return { importance: 'MEDIUM', affectedMarkets: [], eventTime: null, ...fresh };
      case 'SIGNAL': return { direction: '', entry: '', stopLoss: '', targets: [], riskMessage: '', analysisContext: '', validity: '', ...fresh };
      case 'TRADING_IDEA': return { stance: '', condition: '', zone: '', invalidation: '', targets: [], rationale: '', timeframe: '', ...fresh };
      case 'SIGNAL_RESULT': return { signalId: '', direction: '', entry: '', exit: '', outcome: '', closedAt: null, resultNotes: '' };
      case 'MORNING_BRIEF': return { deskRegime: '', deskUsd: '', deskYields: '', deskVolatility: '', deskNextEvent: '', ...fresh };
      case 'US_SESSION_PREVIEW': case 'US_OPEN': case 'MARKET_RECAP': return { ...fresh };
      case 'REX_EXPLAINS': return { format: 'explainer', takeaway: '', validUntil: null };
      case 'LEARN': case 'REX_NOTE': case 'ASK_REX': return { takeaway: '' };
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
      if (!s || typeof s !== 'object') { err(`sourceReferences.${i}`, 'Source must be an object'); continue; }
      if (!has(s.name)) err(`sourceReferences.${i}.name`, 'Source name is required');
      if (has(s.url) && !RE.https.test(s.url)) err(`sourceReferences.${i}.url`, 'Source URL must start with https://');
      for (const k of ['publishedAt', 'retrievedAt']) if (s[k] && !RE.iso.test(s[k])) err(`sourceReferences.${i}.${k}`, 'Use an ISO UTC timestamp');
      if (has(s.sourceType) && !SOURCE_TYPES.includes(s.sourceType)) err(`sourceReferences.${i}.sourceType`, `Source type must be one of: ${SOURCE_TYPES.join(', ')}`);
      if (s.publisher != null && typeof s.publisher !== 'string') err(`sourceReferences.${i}.publisher`, 'Publisher must be text');
    }
    if (r.access != null && !ACCESS.includes(r.access)) err('access', 'Access must be PUBLIC, MEMBER or PREMIUM');
    if (r.byline != null && typeof r.byline !== 'string') err('byline', 'Byline must be text');
    if (r.lead != null && ![true, false, 'true', 'false', ''].includes(r.lead)) err('lead', 'Lead must be true or false');
    const ff = r.fields || {};
    for (const k of ['dataAsOf', 'validUntil']) if (ff[k] && !RE.iso.test(ff[k])) err(`fields.${k}`, 'Use an ISO UTC timestamp');
    if (ff.dataAsOf && ff.validUntil && Date.parse(ff.validUntil) <= Date.parse(ff.dataAsOf)) err('fields.validUntil', 'Valid-until must be after the data-as-of time');
    if (!t || !publish || t.website === false) { if (t && t.website === false && publish) err('type', 'Social-only formats are not published to the website'); return E; }

    // ---- publish-level requirements ----
    if (!has(r.id)) err('id', 'ID is required');
    if (!has(r.translationGroupId)) err('translationGroupId', 'Translation group is required');
    if (!has(r.title)) err('title', 'Title is required');
    else if (str(r.title).length > 180) err('title', 'Title must be 180 characters or fewer');
    if (!has(r.slug)) err('slug', 'Slug is required');
    else if ((RESERVED_SLUGS[t.section] || []).includes(r.slug)) err('slug', `"${r.slug}" is reserved for a ${t.section} page — choose another slug`);
    if (!PUBLISHABLE_ACCESS.includes(r.access || 'PUBLIC')) err('access', 'Only PUBLIC content can be published. Member and premium access are reserved until the owner approves a commercial model.');
    if (!has(r.summary)) err('summary', 'Summary is required');
    else if (str(r.summary).length > 600) err('summary', 'Summary must be 600 characters or fewer');
    if (t.body && !has(r.body)) err('body', 'Body is required for education content');
    if (r.riskDisclosure !== undefined && t.risk && !has(r.riskDisclosure)) err('riskDisclosure', 'Risk disclosure is required for this type');
    if (t.sources && !arr(r.sourceReferences).some(s => has(s && s.name) && has(s && s.url) && (s && s.sourceType) !== 'internal-analysis'))
      err('sourceReferences', 'At least one external source with a name and https URL is required — AI-generated news is never publishable');
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
        priceCheck(); break;
      case 'ANALYSIS':
        if (!has(r.symbol)) err('symbol', 'Symbol is required');
        if (!ANALYSIS_CATEGORIES.includes(r.category)) err('category', 'Choose an analysis category');
        if (!BIAS.includes(r.bias)) err('bias', 'Bias is required');
        priceCheck(); break;
      case 'WEEKLY_OUTLOOK':
        if (has(r.category) && !ANALYSIS_CATEGORIES.includes(r.category)) err('category', 'Choose an analysis category or leave it empty');
        if (!has(r.body)) err('body', 'The weekly outlook needs its body text');
        priceCheck(); break;
      case 'TRADING_IDEA':
        if (!has(r.symbol)) err('symbol', 'Trading idea symbol is required');
        if (!STANCE.includes(f.stance)) err('fields.stance', 'Stance must be BUY, SELL or WAIT');
        if (!has(f.condition)) err('fields.condition', 'State the condition that must happen first (WAIT is a valid stance)');
        if (f.stance !== 'WAIT' && !has(f.zone)) err('fields.zone', 'A BUY or SELL idea needs its zone');
        if (!has(f.invalidation)) err('fields.invalidation', 'Invalidation is required');
        if (!has(f.rationale)) err('fields.rationale', 'Rationale is required');
        for (const x of arr(f.targets)) if (!RE.num.test(str(x))) err('fields.targets', `Target must be a number: ${x}`);
        if (!f.validUntil || !RE.iso.test(f.validUntil)) err('fields.validUntil', 'A trading idea needs its valid-until time (UTC)'); break;
      case 'REX_EXPLAINS':
        if (has(f.format) && !REX_FORMATS.includes(f.format)) err('fields.format', `Format must be one of: ${REX_FORMATS.join(', ')}`); break;
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
    if (r.status === 'SCHEDULED' && r.scheduledAt && Date.parse(r.scheduledAt) > (now || Date.now())) errors.push({ field: 'scheduledAt', message: 'Scheduled content cannot be published before its scheduled time' });
    if (!r.audit || !r.audit.approvedBy || !r.approvedAt) errors.push({ field: 'audit.approvedBy', message: 'Missing approval record' });
    return errors.concat(validateRecord(r, 'publish'));
  }

  /* ---------- public feed (schema v3) ----------
     data/content.json holds every PUBLISHED item (both languages) plus tombstones of withdrawn
     items, so a permanent URL never silently disappears. One file = one concurrency token. */
  const SCHEMA_VERSION = 3;
  const EMPTY_FEED = () => ({ schemaVersion: SCHEMA_VERSION, updated: null, publication: null, items: [], withdrawn: [] });
  function normalizeFeed(feed) {
    if (!feed || typeof feed !== 'object') return EMPTY_FEED();
    if (feed.schemaVersion === SCHEMA_VERSION && Array.isArray(feed.items)) return { ...feed, withdrawn: arr(feed.withdrawn) };
    if (feed.schemaVersion === 2 && Array.isArray(feed.items)) {
      // An empty v2 feed carries no content: its structure is upgraded in place. Content is never migrated implicitly.
      if (!feed.items.length) return { ...EMPTY_FEED(), updated: feed.updated || null, publication: feed.publication || null };
      throw new Error(`Feed is schema v2 with ${feed.items.length} item(s). Run "node tools/content/migrate-v2-v3.mjs" (dry run first) before publishing.`);
    }
    // v1 (collections) had no published items; migrate its shape.
    const legacy = ['editorial', 'analysis', 'news'].some(k => Array.isArray(feed[k]) && feed[k].length) || feed.gold || (feed.signals && (feed.signals.results || []).length);
    if (legacy) throw new Error('Legacy feed contains items; migrate manually');
    return EMPTY_FEED();
  }
  const trimList = v => arr(v).map(str).filter(Boolean);
  const uniq = a => [...new Set(a.filter(Boolean))];
  const isTrue = v => v === true || v === 'true';
  /** Public, render-ready v3 entry. Only whitelisted fields leave the CMS.
      ctx (computed by the publishing engine): { urlPath, firstPublishedAt, editorialDate, validity: { validUntil, stalePolicy } | null }.
      publishedAt in the entry is the FIRST publication (permanent); updatedAt is this publication. */
  function toFeedEntry(r, publishedAt, publishVersion, ctx) {
    const c = ctx || {};
    const t = TYPES[r.type], f = r.fields || {}, type = feedTypeOf(r), format = formatOf(r);
    const first = c.firstPublishedAt || publishedAt;
    const date = c.editorialDate || editorialDate(first);
    const e = {
      id: r.id, type, layer: t.layer, language: r.language, translationGroupId: r.translationGroupId, section: t.section,
      slug: r.slug, urlPath: c.urlPath || routeFor(r, date), title: str(r.title), summary: str(r.summary),
      publishedAt: first, updatedAt: publishedAt, publishVersion, editorialDate: date,
      access: r.access || 'PUBLIC', origin: 'studio',
      attribution: { byline: has(r.byline) ? str(r.byline) : 'FOXREX Desk', assistance: r.aiGenerated ? 'ai-assisted' : 'none' }
    };
    if (t.layers) e.layers = t.layers.slice();
    if (format) e.format = format;
    if (type !== r.type) e.legacyType = r.type;
    if (has(r.byline)) e.author = { name: str(r.byline) };
    if (t.slot) e.slot = t.slot;
    if (has(r.body)) e.body = str(r.body);
    if (has(r.symbol)) e.symbol = r.symbol;
    if (has(r.market)) e.market = r.market;
    if (has(r.category)) e.category = r.category;
    if (BIAS.includes(r.bias)) e.bias = r.bias;
    if (trimList(r.tags).length) e.tags = trimList(r.tags);
    if (isTrue(r.lead)) e.lead = true;
    if (r.image && has(r.image.src)) e.image = { src: r.image.src, alt: str(r.image.alt) };
    const sources = arr(r.sourceReferences).filter(s => has(s && s.name)).map(s => {
      const o = { name: str(s.name) }; if (has(s.url)) o.url = s.url; if (has(s.publisher)) o.publisher = str(s.publisher);
      if (s.publishedAt) o.publishedAt = s.publishedAt; if (s.retrievedAt) o.retrievedAt = s.retrievedAt; if (SOURCE_TYPES.includes(s.sourceType)) o.sourceType = s.sourceType; return o;
    });
    if (sources.length) e.sources = sources;
    if (has(r.riskDisclosure)) e.riskDisclosure = str(r.riskDisclosure);
    if (r.seo && (has(r.seo.title) || has(r.seo.description))) e.seo = { title: str(r.seo.title), description: str(r.seo.description) };
    const pick = keys => { for (const k of keys) { const v = f[k]; if (Array.isArray(v) ? trimList(v).length : v != null && v !== '') e[k] = Array.isArray(v) ? trimList(v) : typeof v === 'string' ? v.trim() : v; } };
    switch (r.type) {
      case 'GOLD_FOCUS': pick(['marketState', 'keySupport', 'keyResistance', 'importantLevel', 'bullishScenario', 'bearishScenario', 'invalidation', 'price', 'priceSource', 'priceTime']); break;
      case 'ANALYSIS': case 'WEEKLY_OUTLOOK': pick(['timeframe', 'keyLevels', 'bullishScenario', 'bearishScenario', 'invalidation', 'price', 'priceSource', 'priceTime']); break;
      case 'NEWS': case 'EVENT': pick(['importance', 'affectedMarkets', 'eventTime']); break;
      case 'SIGNAL': pick(['direction', 'entry', 'stopLoss', 'targets', 'riskMessage', 'analysisContext', 'validity']); break;
      case 'TRADING_IDEA': pick(['stance', 'condition', 'zone', 'invalidation', 'targets', 'rationale', 'timeframe']); break;
      case 'SIGNAL_RESULT': pick(['signalId', 'direction', 'entry', 'exit', 'outcome', 'closedAt', 'resultNotes']); break;
      case 'LEARN': case 'REX_EXPLAINS': case 'REX_NOTE': case 'ASK_REX': pick(['takeaway']); break;
      case 'MORNING_BRIEF': {
        const dr = {}; for (const [k, src] of [['regime', 'deskRegime'], ['usd', 'deskUsd'], ['yields', 'deskYields'], ['volatility', 'deskVolatility'], ['nextEvent', 'deskNextEvent']]) if (has(f[src])) dr[k] = str(f[src]);
        if (Object.keys(dr).length) e.deskRead = dr; break;
      }
    }
    const instruments = uniq([e.symbol, ...arr(e.affectedMarkets)]);
    if (instruments.length) e.instruments = instruments;
    if (has(e.timeframe)) e.timeframes = [e.timeframe];
    if (typeof e.price === 'number' && e.priceSource && e.priceTime) e.priceRef = { symbol: e.symbol || null, price: e.price, source: e.priceSource, sourceTimestamp: e.priceTime };
    const v = c.validity !== undefined ? c.validity : (f.validUntil ? { validUntil: f.validUntil, stalePolicy: 'hide' } : null);
    if (t.marketSensitive || v) {
      const fr = { dataAsOf: f.dataAsOf || f.priceTime || publishedAt, dataAsOfBasis: f.dataAsOf ? 'editor' : f.priceTime ? 'price-snapshot' : 'publication' };
      if (f.priceTime) fr.sourceTimestamp = f.priceTime;
      if (v && v.validUntil) { fr.validUntil = v.validUntil; fr.stalePolicy = v.stalePolicy || 'hide'; }
      e.freshness = fr;
    }
    return e;
  }
  const byNewest = (a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '') || a.id.localeCompare(b.id);
  /** Returns a new feed with the entry inserted/replaced (by id). Never mutates the input. */
  function applyToFeed(feed, entry, publication) {
    const f = normalizeFeed(JSON.parse(JSON.stringify(feed)));
    f.items = f.items.filter(i => i.id !== entry.id).concat([entry]).sort(byNewest);
    f.withdrawn = f.withdrawn.filter(w => w.id !== entry.id);
    f.updated = publication.at; f.publication = publication;
    return f;
  }
  /** Unpublish: the item leaves every listing; a tombstone keeps its permanent URL answering (withdrawn notice, noindex). */
  function removeFromFeed(feed, id, publication) {
    const f = normalizeFeed(JSON.parse(JSON.stringify(feed)));
    const it = f.items.find(i => i.id === id);
    f.items = f.items.filter(i => i.id !== id);
    if (it && it.urlPath) {
      f.withdrawn = f.withdrawn.filter(w => w.id !== id).concat([{ id: it.id, type: it.type, layer: it.layer, language: it.language, translationGroupId: it.translationGroupId,
        section: it.section, slug: it.slug, urlPath: it.urlPath, title: it.title, publishedAt: it.publishedAt, withdrawnAt: publication.at }]).sort(byNewest);
    }
    f.updated = publication.at; f.publication = publication;
    return f;
  }
  /** Fixture convention: titles starting with "TEST", or "test"/"fixture" as an ID/slug segment. */
  const isFixture = it => /^TEST\b/.test(str(it.title)) || /(^|-)(test|fixture)(-|$)/.test(`${it.id || ''}-${it.slug || ''}`);
  /** Integrity rules the JSON Schema cannot express. Returns error strings. */
  function feedIntegrity(feed, opts) {
    const E = []; const seen = new Set(); const now = (opts && opts.now) || Date.now();
    const routes = new Set(); // "lang:urlPath"
    const pathGroup = new Map(); // urlPath → translationGroupId
    const groupPath = new Map(); // translationGroupId → urlPath
    const claim = (it, where) => {
      if (!it.urlPath) return;
      const k = `${it.language}:${it.urlPath}`;
      if (routes.has(k)) E.push(`${where}: permanent URL /${pathFor(it.urlPath, it.language)} is already used by another item`);
      routes.add(k);
      const owner = pathGroup.get(it.urlPath);
      if (owner && owner !== it.translationGroupId) E.push(`${where}: permanent path ${it.urlPath} belongs to another translation group`);
      if (!owner) pathGroup.set(it.urlPath, it.translationGroupId);
      const g = groupPath.get(it.translationGroupId);
      if (g && g !== it.urlPath) E.push(`${where}: EN and AR versions of one item must share the same permanent path (${g} ≠ ${it.urlPath})`);
      if (!g) groupPath.set(it.translationGroupId, it.urlPath);
    };
    const signalIds = new Set(arr(feed.items).concat(arr(feed.withdrawn)).filter(i => i.type === 'SIGNAL').map(i => i.id));
    for (const it of arr(feed.items)) {
      const where = `items[${it.id}]`;
      if (seen.has(it.id)) E.push(`${where}: duplicate id`); seen.add(it.id);
      if (!(opts && opts.allowTestContent) && isFixture(it)) E.push(`${where}: test fixture content can never be published to the public feed`);
      if (!TYPES[it.type] || TYPES[it.type].website === false || TYPES[it.type].legacy) E.push(`${where}: type ${it.type} is not publishable to the website`);
      else {
        const t = TYPES[it.type];
        if (it.layer !== t.layer) E.push(`${where}: layer must be ${t.layer} for ${it.type}`);
        if (it.section !== t.section) E.push(`${where}: section must be ${t.section} for ${it.type}`);
        if (!ROUTE_RE.test(it.urlPath || '')) E.push(`${where}: invalid permanent path "${it.urlPath}"`);
        else if (t.route === 'slug' || t.route === 'result' || (t.route === 'rex' && it.format !== 'note')) { if (routeFor(it, it.editorialDate) !== it.urlPath) E.push(`${where}: permanent path must be ${routeFor(it, it.editorialDate)}`); }
        else if (!it.urlPath.includes(`/${it.editorialDate}/`)) E.push(`${where}: dated permanent path must use the item's editorial date ${it.editorialDate}`);
        if (t.marketSensitive && !(it.freshness && it.freshness.dataAsOf)) E.push(`${where}: price-sensitive content needs freshness.dataAsOf`);
      }
      claim(it, where);
      if (!PUBLISHABLE_ACCESS.includes(it.access)) E.push(`${where}: only PUBLIC content can be published`);
      if (it.updatedAt && it.publishedAt && it.updatedAt < it.publishedAt) E.push(`${where}: updatedAt is before publishedAt`);
      if (it.freshness && it.freshness.validUntil && it.freshness.dataAsOf && it.freshness.validUntil <= it.freshness.dataAsOf) E.push(`${where}: validUntil must be after dataAsOf`);
      if (it.type === 'SIGNAL_RESULT' && it.signalId && !signalIds.has(it.signalId)) E.push(`${where}: result references a signal that is not in the public feed`);
      if (it.publishedAt && Date.parse(it.publishedAt) > now + 5 * 60e3) E.push(`${where}: publishedAt is in the future (scheduled content must not appear early)`);
      if (it.price != null && !(it.priceSource && it.priceTime)) E.push(`${where}: price without source and time`);
      if ((it.type === 'NEWS' || it.type === 'EVENT') && !arr(it.sources).some(s => s.url)) E.push(`${where}: news/event without a linked source`);
      if (it.type === 'SIGNAL' && (!it.stopLoss || !it.riskMessage)) E.push(`${where}: signal without stop-loss or risk message`);
      if (it.type === 'SIGNAL_RESULT' && !it.signalId) E.push(`${where}: result without signal reference`);
      walkText(it, (p, v) => { if (RE.html.test(v) && !/^sources\.\d+\.url$/.test(p)) E.push(`${where}.${p}: markup is not allowed`); });
      for (const s of arr(it.sources)) if (s && s.url && !RE.https.test(s.url)) E.push(`${where}: source URL must be https`);
    }
    for (const w of arr(feed.withdrawn)) {
      const where = `withdrawn[${w.id}]`;
      if (seen.has(w.id)) E.push(`${where}: an id cannot be both published and withdrawn`); seen.add(w.id);
      if (!ROUTE_RE.test(w.urlPath || '')) E.push(`${where}: invalid permanent path "${w.urlPath}"`);
      claim(w, where);
      walkText(w, (p, v) => { if (RE.html.test(v)) E.push(`${where}.${p}: markup is not allowed`); });
    }
    return E;
  }

  /* ---------- migration v2 → v3 (pure, deterministic, lossless) ----------
     Every v2 key is kept verbatim (renamed types keep the original in legacyType). New v3 fields are
     derived. validity: optional (type, ctx) → { validUntil, stalePolicy } | null, supplied by the caller. */
  const V2_TYPE_MAP = { US_OPEN: ['US_SESSION_PREVIEW', null], LEARN: ['REX_EXPLAINS', 'lesson'], REX_NOTE: ['REX_EXPLAINS', 'note'], ASK_REX: ['REX_EXPLAINS', 'qa'], REX_EXPLAINS: ['REX_EXPLAINS', 'explainer'] };
  function migrateEntryV2(item, validity) {
    const e = JSON.parse(JSON.stringify(item));
    const map = V2_TYPE_MAP[item.type];
    if (map) { if (map[0] !== item.type) e.legacyType = item.type; e.type = map[0]; if (map[1]) e.format = map[1]; }
    const t = TYPES[e.type];
    if (!t) throw new Error(`items[${item.id}]: unknown v2 type ${item.type}`);
    e.layer = t.layer; if (t.layers) e.layers = t.layers.slice();
    e.editorialDate = editorialDate(item.publishedAt);
    e.urlPath = routeFor(e, e.editorialDate);
    e.access = 'PUBLIC'; e.origin = 'migration-v2';
    e.attribution = { byline: 'FOXREX Desk', assistance: 'unknown' };
    const instruments = uniq([item.symbol, ...arr(item.affectedMarkets)]); if (instruments.length) e.instruments = instruments;
    if (has(item.timeframe)) e.timeframes = [item.timeframe];
    if (typeof item.price === 'number' && item.priceSource && item.priceTime) e.priceRef = { symbol: item.symbol || null, price: item.price, source: item.priceSource, sourceTimestamp: item.priceTime };
    if (t.marketSensitive) {
      e.freshness = { dataAsOf: item.priceTime || item.publishedAt, dataAsOfBasis: 'migration' };
      if (item.priceTime) e.freshness.sourceTimestamp = item.priceTime;
      const v = validity && validity(e.type, { publishedAt: item.publishedAt, dataAsOf: e.freshness.dataAsOf, format: e.format, timeframe: item.timeframe, eventTime: item.eventTime });
      if (v && v.validUntil) { e.freshness.validUntil = v.validUntil; e.freshness.stalePolicy = v.stalePolicy; }
    }
    return e;
  }
  /** Returns { feed, report }. Never writes, never publishes. Throws nothing for content problems: they are reported. */
  function migrateFeedV2(v2, validity) {
    const report = { from: v2 && v2.schemaVersion, to: SCHEMA_VERSION, items: 0, byType: {}, renamedTypes: [], collisions: [], lossless: true, losses: [], alreadyV3: false };
    if (v2 && v2.schemaVersion === SCHEMA_VERSION) { report.alreadyV3 = true; report.items = arr(v2.items).length; return { feed: v2, report }; }
    if (!v2 || v2.schemaVersion !== 2 || !Array.isArray(v2.items)) throw new Error('Input is not a schema v2 feed');
    const items = v2.items.map(i => migrateEntryV2(i, validity)).sort(byNewest);
    const seenPath = new Map();
    for (const [n, e] of items.entries()) {
      const src = v2.items.find(i => i.id === e.id);
      report.items++; report.byType[e.type] = (report.byType[e.type] || 0) + 1;
      if (e.legacyType) report.renamedTypes.push({ id: e.id, from: e.legacyType, to: e.type, format: e.format || null });
      for (const [k, v] of Object.entries(src)) {
        const kept = k === 'type' ? e.legacyType === v || e.type === v : JSON.stringify(e[k]) === JSON.stringify(v);
        if (!kept) { report.lossless = false; report.losses.push(`${e.id}.${k}`); }
      }
      const key = `${e.language}:${e.urlPath}`;
      if (!e.urlPath) report.collisions.push({ id: e.id, reason: 'no permanent path could be derived (invalid slug or date)' });
      else if (seenPath.has(key) && seenPath.get(key) !== e.translationGroupId) report.collisions.push({ id: e.id, urlPath: e.urlPath, reason: 'permanent path already used by another item' });
      seenPath.set(key, e.translationGroupId);
      void n;
    }
    return { feed: { schemaVersion: SCHEMA_VERSION, updated: v2.updated || null, publication: v2.publication || null, items, withdrawn: [] }, report };
  }

  return {
    EDITORIAL_TZ, LANGS, STATES, STATE_LABEL, TRANSITIONS, PUBLISHABLE_FROM, EDIT_RESETS, TYPES, WEBSITE_TYPES, FEED_TYPES, DESK, PAGE_PATH,
    LAYERS, LAYER_LABEL, ACCESS, PUBLISHABLE_ACCESS, SOURCE_TYPES, STANCE, REX_FORMATS, RESERVED_SLUGS, SECTION_HUB, SCHEMA_VERSION, ROUTE_RE,
    ANALYSIS_CATEGORIES, NEWS_CATEGORIES, BIAS, IMPORTANCE, DIRECTION, OUTCOME, DEFAULT_RISK, RE,
    destinations, pageUrl, slugify, editorialDate, formatEditorial, istanbulLocalToUtc, utcToIstanbulLocal, makeGroupId, makeId,
    feedTypeOf, formatOf, routeFor, pathFor, canonicalUrl, hubPath,
    protectedTokens, missingTokens, blankRecord, blankFields, validateRecord, transitionError, publishGate,
    EMPTY_FEED, normalizeFeed, toFeedEntry, applyToFeed, removeFromFeed, feedIntegrity, isFixture, migrateEntryV2, migrateFeedV2
  };
});
