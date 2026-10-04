/* Permanent content pages for the FOXREX static site, generated from the canonical v3 feed.
   One canonical item → its own page (EN at /<urlPath>, AR at /ar/<urlPath>) + listings derived from it.
   Uses the existing layout and CSS classes only — this is routing and content, not a redesign.
   Every value is escaped at build time (plain text in, escaped HTML out). Output is deterministic:
   nothing depends on the build clock; "is this stale?" is decided in the browser (scripts/public/item.js). */
import { createRequire } from 'node:module';
import { esc, enText, arText } from './text.mjs';

const require = createRequire(import.meta.url);
const CMS = require('../../studio/cms-model.js');
const TIME = require('../../scripts/content/time.js');
const SELECT = require('../../scripts/content/select.js');

export const GENERATED_MARK = '<meta name="foxrex:generated" content="content-v3">';

const TYPE_LABEL = Object.fromEntries(CMS.FEED_TYPES.map(k => [k, CMS.TYPES[k].label]));
const FORMAT_LABEL = { explainer: ['REX Explains', 'REX يشرح'], lesson: ['REX Explains · Lesson', 'REX يشرح · درس'], note: ['REX Note', 'ملاحظة REX'], qa: ['Ask REX', 'اسأل REX'] };
const SECTION_LABEL = { desk: ['Today at FOXREX', 'اليوم في FOXREX'], gold: ['Gold', 'الذهب'], analysis: ['Analysis', 'التحليلات'], news: ['News', 'الأخبار'], learn: ['Learn', 'تعلّم'], signals: ['Signals', 'الإشارات'] };
const BIAS = { bullish: ['Bullish', 'صاعد'], bearish: ['Bearish', 'هابط'], neutral: ['Neutral', 'محايد'] };
const OUTCOME = { TARGET_HIT: ['Target hit', 'تحقق الهدف'], STOPPED_OUT: ['Stopped out', 'ضُرب الوقف'], BREAKEVEN: ['Break-even', 'تعادل'], CLOSED_MANUALLY: ['Closed manually', 'أُغلقت يدويًا'], EXPIRED: ['Expired', 'انتهت الصلاحية'] };
const STANCE = { BUY: ['BUY', 'شراء'], SELL: ['SELL', 'بيع'], WAIT: ['WAIT', 'انتظار'] };
const IMPORTANCE = { HIGH: ['High impact', 'تأثير مرتفع'], MEDIUM: ['Medium impact', 'تأثير متوسط'], LOW: ['Low impact', 'تأثير منخفض'] };
const ARTICLE_TYPES = ['MORNING_BRIEF', 'GOLD_FOCUS', 'EVENT', 'US_SESSION_PREVIEW', 'MARKET_RECAP', 'ANALYSIS', 'WEEKLY_OUTLOOK', 'NEWS', 'REX_EXPLAINS'];

const typeLabel = e => (e.type === 'REX_EXPLAINS' && FORMAT_LABEL[e.format]) || TYPE_LABEL[e.type] || [e.type, e.type];
const has = v => typeof v === 'string' ? v.trim() !== '' : v != null;
const monthOf = e => (e.editorialDate || TIME.editorialDate(e.publishedAt)).slice(0, 7);

/** Build every content page for the feed. h = layout helpers from build.mjs (t, I, SITE). Returns { pages, sitemap }. */
export function contentPages(feed, h) {
  const { SITE, I } = h;
  const items = CMS.normalizeFeed(feed).items.filter(e => e.access === 'PUBLIC');
  const withdrawn = CMS.normalizeFeed(feed).withdrawn;
  const pages = [], sitemap = [];
  const X = (lang, en, ar) => (lang === 'ar' ? arText(ar ?? en) : enText(en)); // localised UI label, escaped
  const L = (lang, s) => (lang === 'ar' ? arText(s) : enText(s)); // content text, escaped
  const paras = (lang, s) => String(s || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${L(lang, p)}</p>`).join('\n');
  const time = (lang, iso, withDate = true) => iso ? `<time datetime="${esc(iso)}" class="ltr num">${esc(TIME.formatIst(iso, withDate))} IST</time>` : '';
  const abs = (lang, urlPath) => SITE.origin + '/' + CMS.pathFor(urlPath, lang);
  const sym = s => `<span class="fx-sym">${esc(s)}</span>`;
  const ltr = s => `<span class="ltr num">${esc(s)}</span>`;
  const relPath = (lang, urlPath) => CMS.pathFor(urlPath, lang).replace(/\/$/, '');
  const byLang = lang => SELECT.publishedForLanguage({ items }, lang, Number.MAX_SAFE_INTEGER);

  const sourcesBlock = (lang, e) => {
    const s = (e.sources || []).filter(x => has(x.name));
    if (!s.length) return '';
    return `<p class="fx-sources"><strong>${X(lang, 'Sources', 'المصادر')}:</strong> ${s.map(x => {
      const label = L(lang, x.name) + (has(x.publisher) && x.publisher !== x.name ? ` (${L(lang, x.publisher)})` : '');
      const u = typeof x.url === 'string' && CMS.RE.https.test(x.url) ? x.url : '';
      return (u ? `<a href="${esc(u)}" rel="noopener nofollow" target="_blank">${label}</a>` : label) + (x.publishedAt ? ` · ${time(lang, x.publishedAt)}` : '');
    }).join(' · ')}</p>`;
  };
  const attribution = (lang, e) => {
    const a = e.attribution || {};
    const by = has(a.byline) && a.byline !== 'FOXREX Desk' ? L(lang, a.byline) : X(lang, 'FOXREX Desk', 'مكتب FOXREX');
    const assist = a.assistance === 'ai-assisted' ? ` · ${X(lang, 'AI-assisted, reviewed by the desk', 'بمساعدة الذكاء الاصطناعي، وبمراجعة المكتب')}` : '';
    return `${X(lang, 'By', 'بقلم')} ${by}${assist}`;
  };
  const freshnessBlock = (lang, e) => {
    const f = e.freshness; if (!f) return '';
    const what = CMS.TYPES[e.type].layer === 'TRADING_INTELLIGENCE' || ['ANALYSIS', 'WEEKLY_OUTLOOK'].includes(e.type) ? X(lang, 'Levels as of', 'المستويات حتى') : X(lang, 'Information as of', 'المعلومات حتى');
    const px = e.priceRef ? ` · ${X(lang, 'Price at time of writing', 'السعر وقت الكتابة')}: ${e.priceRef.symbol ? sym(e.priceRef.symbol) + ' ' : ''}${ltr(Number(e.priceRef.price).toLocaleString('en-US', { maximumFractionDigits: 6 }))} · ${L(lang, e.priceRef.source)} · ${time(lang, e.priceRef.sourceTimestamp)}` : '';
    const notice = f.validUntil ? `\n<div class="fx-notice fx-notice--info" data-stale-notice hidden>${I.info}<span>${X(lang, `This ${typeLabel(e)[0]} is from ${TIME.formatIst(e.publishedAt)} IST. Its levels and conditions may no longer apply.`, `هذا المحتوى (${typeLabel(e)[1]}) منشور في ${TIME.formatIst(e.publishedAt)} بتوقيت إسطنبول، وقد لا تكون مستوياته وظروفه صالحة الآن.`)}</span></div>` : '';
    return `<p class="fx-card__meta" data-freshness${f.validUntil ? ` data-valid-until="${esc(f.validUntil)}"` : ''} data-data-as-of="${esc(f.dataAsOf)}">${what} ${time(lang, f.dataAsOf)}${px}</p>${notice}`;
  };
  const levels = (lang, rows) => `<dl class="gold__levels" style="margin:24px 0">${rows.filter(r => has(r[2])).map(([en, ar, v]) => `<div><dt>${X(lang, en, ar)}</dt><dd class="has">${ltr(v)}</dd></div>`).join('')}</dl>`;
  const scen = (lang, e) => {
    const rows = [];
    if (has(e.bullishScenario)) rows.push(`<li><span class="fx-bias fx-bias--bullish">${X(lang, 'Bullish', 'صاعد')}</span> ${L(lang, e.bullishScenario)}</li>`);
    if (has(e.bearishScenario)) rows.push(`<li><span class="fx-bias fx-bias--bearish">${X(lang, 'Bearish', 'هابط')}</span> ${L(lang, e.bearishScenario)}</li>`);
    if (has(e.invalidation)) rows.push(`<li><strong>${X(lang, 'Invalidation', 'مستوى الإلغاء')}:</strong> ${L(lang, e.invalidation)}</li>`);
    return rows.length ? `<ul class="fx-scen">${rows.join('')}</ul>` : '';
  };
  const badges = (lang, e) => {
    const b = [];
    for (const s of e.instruments || []) b.push(sym(s));
    if (BIAS[e.bias]) b.push(`<span class="fx-bias fx-bias--${e.bias}">${X(lang, ...BIAS[e.bias])}</span>`);
    if (has(e.timeframe)) b.push(ltr(e.timeframe));
    if (IMPORTANCE[e.importance]) b.push(`<span class="fx-badge">${X(lang, ...IMPORTANCE[e.importance])}</span>`);
    return b.length ? `<div class="fx-card__meta">${b.join('')}</div>` : '';
  };

  function typeBlock(lang, e, sibling) {
    switch (e.type) {
      case 'GOLD_FOCUS':
        return `${has(e.marketState) ? `<p><strong>${X(lang, 'Market state', 'حالة السوق')}:</strong> ${L(lang, e.marketState)}</p>` : ''}
${levels(lang, [['Key support', 'الدعم الرئيسي', (e.keySupport || []).join(' · ')], ['Important level', 'المستوى المحوري', e.importantLevel], ['Key resistance', 'المقاومة الرئيسية', (e.keyResistance || []).join(' · ')]])}
${scen(lang, e)}`;
      case 'ANALYSIS': case 'WEEKLY_OUTLOOK':
        return `${(e.keyLevels || []).length ? `<p><strong>${X(lang, 'Key levels', 'المستويات الرئيسية')}:</strong> ${ltr(e.keyLevels.join(' · '))}</p>` : ''}${scen(lang, e)}`;
      case 'NEWS': case 'EVENT':
        return e.eventTime ? `<p><strong>${X(lang, 'Event time', 'وقت الحدث')}:</strong> ${time(lang, e.eventTime)}</p>` : '';
      case 'US_SESSION_PREVIEW': {
        const s = TIME.usSession(e.editorialDate);
        return `<p class="fx-card__meta">${X(lang, `US data releases: 08:30 New York = ${s.dataRelease.ist} IST · US cash open: 09:30 New York = ${s.cashOpen.ist} IST`, `البيانات الأمريكية: 08:30 بتوقيت نيويورك = ${s.dataRelease.ist} بتوقيت إسطنبول · افتتاح السوق النقدي الأمريكي: 09:30 بتوقيت نيويورك = ${s.cashOpen.ist} بتوقيت إسطنبول`)}</p>`;
      }
      case 'MORNING_BRIEF': {
        const d = e.deskRead; if (!d) return '';
        const rows = [['regime', 'Regime', 'حالة السوق'], ['usd', 'USD', 'الدولار'], ['yields', 'Yields', 'العوائد'], ['volatility', 'Volatility', 'التقلب'], ['nextEvent', 'Next event', 'الحدث التالي']].filter(r => has(d[r[0]]));
        return rows.length ? `<h2>${X(lang, 'Desk Read', 'قراءة المكتب')}</h2><ul>${rows.map(([k, en, ar]) => `<li><strong>${X(lang, en, ar)}:</strong> ${L(lang, d[k])}</li>`).join('')}</ul>` : '';
      }
      case 'TRADING_IDEA':
        return `<dl class="fx-levels"><div><dt>${X(lang, 'Stance', 'الموقف')}</dt><dd>${X(lang, ...STANCE[e.stance])}</dd></div>${has(e.zone) ? `<div><dt>${X(lang, 'Zone', 'المنطقة')}</dt><dd>${ltr(e.zone)}</dd></div>` : ''}${(e.targets || []).length ? `<div><dt>${X(lang, 'Targets', 'الأهداف')}</dt><dd>${ltr(e.targets.join(' · '))}</dd></div>` : ''}</dl>
<p><strong>${X(lang, 'Condition', 'الشرط')}:</strong> ${L(lang, e.condition)}</p>
<p><strong>${X(lang, 'Invalidation', 'مستوى الإلغاء')}:</strong> ${L(lang, e.invalidation)}</p>
${paras(lang, e.rationale)}
<p class="fx-risk">${X(lang, 'A trading idea is a conditional view, not an order or an instruction.', 'فكرة التداول رؤية مشروطة، وليست أمرًا أو تعليمات.')}</p>`;
      case 'SIGNAL':
        return `<dl class="fx-levels"><div><dt>${X(lang, 'Direction', 'الاتجاه')}</dt><dd>${X(lang, ...STANCE[e.direction])}</dd></div><div><dt>${X(lang, 'Entry', 'الدخول')}</dt><dd>${ltr(e.entry)}</dd></div><div><dt>${X(lang, 'Stop-loss', 'وقف الخسارة')}</dt><dd>${ltr(e.stopLoss)}</dd></div><div><dt>${X(lang, 'Targets', 'الأهداف')}</dt><dd>${ltr((e.targets || []).join(' · '))}</dd></div></dl>
${has(e.validity) ? `<p class="fx-card__meta">${X(lang, 'Validity', 'الصلاحية')}: ${L(lang, e.validity)}</p>` : ''}
<p class="fx-risk"><strong>${X(lang, 'Risk', 'المخاطرة')}:</strong> ${L(lang, e.riskMessage)}</p>
${paras(lang, e.analysisContext)}`;
      case 'SIGNAL_RESULT': {
        const sig = items.find(i => i.id === e.signalId);
        const local = sig && (sig.language === lang ? sig : items.find(i => i.translationGroupId === sig.translationGroupId && i.language === lang));
        return `<dl class="fx-levels"><div><dt>${X(lang, 'Outcome', 'النتيجة')}</dt><dd>${X(lang, ...(OUTCOME[e.outcome] || ['Closed', 'مغلقة']))}</dd></div><div><dt>${X(lang, 'Entry → exit', 'الدخول ← الخروج')}</dt><dd>${ltr(`${e.entry} → ${e.exit}`)}</dd></div><div><dt>${X(lang, 'Closed', 'الإغلاق')}</dt><dd>${time(lang, e.closedAt)}</dd></div></dl>
<p>${L(lang, e.resultNotes)}</p>
${local ? `<p><a class="fx-link" href="{{ROOT}}${CMS.pathFor(local.urlPath, lang)}">${X(lang, 'The original signal', 'الإشارة الأصلية')} ${I.arrow}</a></p>` : ''}`;
      }
      case 'REX_EXPLAINS':
        return '';
      default: return '';
    }
  }

  function jsonld(lang, e) {
    if (!ARTICLE_TYPES.includes(e.type)) return null;
    const url = abs(lang, e.urlPath);
    const author = e.author && has(e.author.name) ? { '@type': 'Person', name: e.author.name } : { '@type': 'Organization', name: 'FOXREX', url: SITE.origin + '/' };
    return { '@context': 'https://schema.org', '@type': e.type === 'NEWS' ? 'NewsArticle' : 'Article', headline: e.title.slice(0, 110), description: (e.seo && e.seo.description) || e.summary,
      datePublished: e.publishedAt, dateModified: e.updatedAt, inLanguage: lang, url, mainEntityOfPage: url, isAccessibleForFree: true, author,
      publisher: { '@type': 'Organization', name: 'FOXREX', url: SITE.origin + '/', logo: { '@type': 'ImageObject', url: `${SITE.origin}/assets/brand/icon-512.png` } } };
  }

  /* ---------- item pages ---------- */
  for (const e of items) {
    const lang = e.language, other = lang === 'en' ? 'ar' : 'en';
    const sib = SELECT.translationOf({ items }, e);
    const alternates = SELECT.alternatesFor({ items }, e, SITE.origin);
    const label = typeLabel(e);
    pages.push({
      kind: 'item', lang, id: `item:${e.id}`, path: e.urlPath.replace(/\/$/, ''), title: (e.seo && e.seo.title) || e.title, description: ((e.seo && e.seo.description) || e.summary).slice(0, 200),
      canonical: abs(lang, e.urlPath), alternates, ogType: 'article',
      article: { published: e.publishedAt, modified: e.updatedAt, section: SECTION_LABEL[e.section][lang === 'ar' ? 1 : 0] },
      altHref: sib ? CMS.pathFor(sib.urlPath, other) : CMS.hubPath(e.section, other),
      altHreflangExists: !!sib, active: e.section === 'desk' ? 'home' : e.section,
      jsonld: () => jsonld(lang, e), scripts: e.freshness && e.freshness.validUntil ? ['scripts/public/item.js'] : [],
      body: (r, b) => `<section class="page-hero"><div class="wrap"><span class="fx-kicker">${X(lang, ...label)}</span><h1>${L(lang, e.title)}</h1><p>${L(lang, e.summary)}</p></div></section>
<section class="section section--tight"><div class="wrap prose">
<article class="article" data-item="${esc(e.id)}" data-layer="${esc(e.layer)}">
<p class="fx-card__meta">${X(lang, 'Published', 'نُشر')} ${time(lang, e.publishedAt)}${e.updatedAt !== e.publishedAt ? ` · ${X(lang, 'Updated', 'حُدّث')} ${time(lang, e.updatedAt)}` : ''} · ${attribution(lang, e)}</p>
${badges(lang, e)}
${freshnessBlock(lang, e)}
${typeBlock(lang, e, sib).replace(/\{\{ROOT\}\}/g, r)}
${e.type === 'TRADING_IDEA' || e.type === 'SIGNAL' ? '' : paras(lang, e.body)}
${has(e.takeaway) ? `<p class="takeaway"><strong>REX:</strong> ${L(lang, e.takeaway)}</p>` : ''}
${sourcesBlock(lang, e)}
${has(e.riskDisclosure) ? `<p class="fx-risk">${L(lang, e.riskDisclosure)}</p>` : ''}
</article>
<p class="fx-card__meta"><a class="fx-link" href="${b}${CMS.SECTION_HUB[e.section]}">${X(lang, ...SECTION_LABEL[e.section])} ${I.arrow}</a> · <a class="fx-link" href="${b}archive/${monthOf(e)}/">${X(lang, 'Archive', 'الأرشيف')} ${esc(monthOf(e))}</a></p>
</div></section>`
    });
    sitemap.push({ loc: abs(lang, e.urlPath), lastmod: e.updatedAt, alternates, priority: '0.6', freq: 'weekly' });
  }

  /* ---------- withdrawn items: the URL keeps answering, never indexed, never listed ---------- */
  for (const w of withdrawn) {
    const lang = w.language;
    if (items.some(i => i.language === lang && i.urlPath === w.urlPath)) continue;
    pages.push({
      kind: 'withdrawn', lang, id: `withdrawn:${w.id}`, path: w.urlPath.replace(/\/$/, ''), title: lang === 'ar' ? 'محتوى مسحوب' : 'Withdrawn', description: lang === 'ar' ? 'سُحب هذا المحتوى من موقع FOXREX.' : 'This item was withdrawn from FOXREX.',
      canonical: abs(lang, w.urlPath), alternates: [{ hreflang: lang, href: abs(lang, w.urlPath) }], noindex: true, ogType: 'website',
      altHref: CMS.hubPath(w.section, lang === 'en' ? 'ar' : 'en'), active: w.section === 'desk' ? 'home' : w.section, scripts: [],
      body: (r, b) => `<section class="page-hero"><div class="wrap"><span class="fx-kicker">${X(lang, ...typeLabel(w))}</span><h1>${L(lang, w.title)}</h1><p>${X(lang, `This item was withdrawn on ${TIME.formatIst(w.withdrawnAt)} IST and is no longer published.`, `سُحب هذا المحتوى في ${TIME.formatIst(w.withdrawnAt)} بتوقيت إسطنبول ولم يعد منشورًا.`)}</p></div></section>
<section class="section section--tight"><div class="wrap prose"><p><a class="fx-link" href="${b}${CMS.SECTION_HUB[w.section]}">${X(lang, ...SECTION_LABEL[w.section])} ${I.arrow}</a></p></div></section>`
    });
  }

  /* ---------- archives & listings: only when they contain items ---------- */
  const listing = (lang, list) => `<ul class="news-list">${list.map(e => `<li class="news-item">${time(lang, e.publishedAt)}<div><h3><a href="{{ROOT}}${CMS.pathFor(e.urlPath, lang)}">${L(lang, e.title)}</a></h3><p>${L(lang, e.summary)}</p></div><div class="news-item__mk"><span class="fx-badge">${X(lang, ...typeLabel(e))}</span></div></li>`).join('\n')}</ul>`;
  const archiveSets = { en: SELECT.archives(byLang('en')), ar: SELECT.archives(byLang('ar')) };
  const addArchive = (key, path, titles, descs, pick, active) => {
    for (const lang of ['en', 'ar']) {
      const list = pick(archiveSets[lang]); if (!list || !list.length) continue;
      const other = lang === 'en' ? 'ar' : 'en', otherList = pick(archiveSets[other]);
      const alternates = [{ hreflang: lang, href: abs(lang, path + '/') }];
      if (otherList && otherList.length) { alternates.push({ hreflang: other, href: abs(other, path + '/') }); alternates.push({ hreflang: 'x-default', href: abs('en', path + '/') }); alternates.sort((a, b2) => (a.hreflang === 'en' ? 0 : a.hreflang === 'ar' ? 1 : 2) - (b2.hreflang === 'en' ? 0 : b2.hreflang === 'ar' ? 1 : 2)); }
      pages.push({ kind: 'archive', lang, id: `archive:${key}`, path, title: titles[lang === 'ar' ? 1 : 0], description: descs[lang === 'ar' ? 1 : 0], canonical: abs(lang, path + '/'), alternates, ogType: 'website',
        altHref: otherList && otherList.length ? CMS.pathFor(path + '/', other) : CMS.pathFor('', other), active, scripts: [],
        body: (r) => `<section class="page-hero"><div class="wrap"><span class="fx-kicker">${X(lang, 'Archive', 'الأرشيف')}</span><h1>${L(lang, titles[lang === 'ar' ? 1 : 0])}</h1></div></section>
<section class="section section--tight"><div class="wrap">${listing(lang, list).replace(/\{\{ROOT\}\}/g, r)}</div></section>` });
      sitemap.push({ loc: abs(lang, path + '/'), lastmod: list.map(e => e.updatedAt).sort().pop(), alternates, priority: '0.4', freq: 'daily' });
    }
  };
  addArchive('desk', 'desk', ['The FOXREX desk — every edition', 'مكتب FOXREX — كل الإصدارات'], ['Every FOXREX desk piece by date.', 'كل منشورات مكتب FOXREX حسب التاريخ.'], a => a.desk, 'home');
  addArchive('weekly-outlook', 'analysis/weekly-outlook', ['Weekly Outlook', 'النظرة الأسبوعية'], ['Every FOXREX Weekly Outlook.', 'كل إصدارات النظرة الأسبوعية من FOXREX.'], a => a.weeklyOutlook, 'analysis');
  addArchive('signal-results', 'signals/results', ['Signal results', 'نتائج الإشارات'], ['Every closed FOXREX signal, losses included.', 'كل إشارات FOXREX المغلقة، بما فيها الخاسرة.'], a => a.signalResults, 'signals');
  const months = [...new Set([...Object.keys(archiveSets.en.months || {}), ...Object.keys(archiveSets.ar.months || {})])].sort().reverse();
  for (const m of months) addArchive(`month:${m}`, `archive/${m}`, [`Archive · ${m}`, `الأرشيف · ${m}`], [`Everything FOXREX published in ${m}.`, `كل ما نشرته FOXREX في ${m}.`], a => a.months && a.months[m], 'home');
  for (const lang of ['en', 'ar']) {
    const mine = archiveSets[lang].months || {}, keys = Object.keys(mine); if (!keys.length) continue;
    const other = lang === 'en' ? 'ar' : 'en', both = Object.keys(archiveSets[other].months || {}).length > 0;
    const alternates = both ? [{ hreflang: 'en', href: abs('en', 'archive/') }, { hreflang: 'ar', href: abs('ar', 'archive/') }, { hreflang: 'x-default', href: abs('en', 'archive/') }] : [{ hreflang: lang, href: abs(lang, 'archive/') }];
    pages.push({ kind: 'archive', lang, id: 'archive:index', path: 'archive', title: lang === 'ar' ? 'الأرشيف' : 'Archive', description: lang === 'ar' ? 'أرشيف FOXREX حسب الشهر.' : 'The FOXREX archive by month.',
      canonical: abs(lang, 'archive/'), alternates, ogType: 'website', altHref: both ? CMS.pathFor('archive/', other) : CMS.pathFor('', other), active: 'home', scripts: [],
      body: (r) => `<section class="page-hero"><div class="wrap"><span class="fx-kicker">FOXREX</span><h1>${X(lang, 'Archive', 'الأرشيف')}</h1></div></section>
<section class="section section--tight"><div class="wrap"><ul class="news-list">${keys.map(m => `<li class="news-item"><span class="ltr num">${esc(m)}</span><div><h3><a href="${r}${CMS.pathFor(`archive/${m}/`, lang)}">${X(lang, `Archive · ${m}`, `الأرشيف · ${m}`)}</a></h3><p>${X(lang, `${mine[m].length} item(s)`, `عدد العناصر: ${mine[m].length}`)}</p></div></li>`).join('\n')}</ul></div></section>` });
    sitemap.push({ loc: abs(lang, 'archive/'), lastmod: Object.values(mine).flat().map(e => e.updatedAt).sort().pop(), alternates, priority: '0.3', freq: 'daily' });
  }

  return { pages, sitemap };
}
