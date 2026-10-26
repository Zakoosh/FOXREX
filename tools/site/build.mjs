#!/usr/bin/env node
import {newsTime,newsPhase,orderedNews,signalPanel,isCompleteSignal,analysisCopy} from './desk-summary.mjs';
/* Builds the static FOXREX public website into the repository root, in two editions:
     English  → /            <html lang="en" dir="ltr">
     Arabic   → /ar/         <html lang="ar" dir="rtl">
   Each edition is real, URL-addressable HTML with its own canonical, hreflang, titles and
   Open Graph. Arabic is composed for Arabic (styles/ar.css, --ar-* tokens), not toggled.
   Published content (data/content.json, schema v3) becomes permanent pages: every item at its
   urlPath (EN) and /ar/<urlPath> (AR), withdrawn-item notices, and archives that exist only when
   they have items. The list of generated content files is kept in data/generated-content.json so a
   page that no longer belongs to the feed is removed — never left behind as an orphan.
   Usage: node tools/site/build.mjs                (writes files)
          node tools/site/build.mjs --check        (exits 1 if committed output is stale)
          node tools/site/build.mjs --plan         (prints the files that would change as JSON; writes nothing)
          --feed <file>  build from another feed (default data/content.json)
          --out <dir>    write into another directory (default the repository root)
   No dependencies. Output uses relative URLs so it works on foxrex.co and a local server. */
import fs from 'node:fs';
import { rexInteractive } from './rex-interactive.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SITE, MARKETS, SCHEDULE, SCHEDULE_EXTRA, ANALYSIS_CATEGORIES, NEWS_CATEGORIES, REX } from './content.mjs';
import { esc, enText, arText } from './text.mjs';
import { contentPages, GENERATED_MARK } from './content-pages.mjs';
import { calendarBody, validateCalendar } from '../editorial/calendar.mjs';
import { TR, tr, turkishHtml } from './tr.mjs';

const require = createRequire(import.meta.url);
const CMS = require('../../studio/cms-model.js');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EDITORIAL_VERSION = createHash('sha256').update(fs.readFileSync(path.join(ROOT,'styles/editorial.css'))).digest('hex').slice(0,12);
const ARGS = process.argv.slice(2);
const argVal = k => { const i = ARGS.indexOf(k); return i >= 0 ? ARGS[i + 1] : null; };
const CHECK = ARGS.includes('--check');
const PLAN = ARGS.includes('--plan');
const OUT = path.resolve(argVal('--out') || ROOT);
const FEED_FILE = path.resolve(argVal('--feed') || path.join(ROOT, 'data/content.json'));
const MANIFEST = 'data/generated-content.json';
const UPDATED = { en: '30 September 2026', ar: '30 سبتمبر 2026' };

/* ---------- language context ---------- */
let LANG = 'en';
const AR = () => LANG === 'ar';
/** Localised text: t(english, arabic). Arabic isolates Latin/number runs in <bdi class="lt">. "\n" → line break. */
const t = (en, ar) => AR() ? arText(ar ?? en) : enText(LANG === 'tr' ? tr(en) : en);
const tp = pair => t(pair[0], pair[1]);

const I = {
  arrow: '<svg class="fx-flip" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.3 13l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20.5 2.8c.9-.3 1.7.2 1.4 1.5z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v7h4v-7h3l.5-4h-3.5V8.8c0-.5.3-.8.5-.8z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.2 3.1z"/><path d="M9 9.5c.3 1.9 2.6 4.3 4.6 4.8l1.2-1.1 1.9.9c-.2 1.1-1 1.7-2.1 1.7-3.1-.2-6.4-3.4-6.6-6.5 0-1.1.6-1.9 1.7-2.1l.9 1.9z"/></svg>',
  data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v6.5c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.5M4.5 12v6.5c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V12"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg>',
  ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  research: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>'
};

const NAV = [
  ['analysis', 'General analysis', 'التحليل العام'], ['technical', 'Technical analysis', 'التحليل التقني'],
  ['signals', 'Signals', 'الإشارات'], ['calendar', 'Calendar', 'التقويم'], ['news', 'News', 'الأخبار'], ['learn', 'Learn with REX', 'تعلّم مع ريكس']
];

/* ---------- URL helpers ---------- */
const outPath = (p, lang) => [lang === 'ar' ? 'ar' : lang === 'tr' ? 'tr' : '', p.path].filter(Boolean).join('/');
const absUrl = (p, lang) => { const o = outPath(p, lang); return SITE.origin + (o ? `/${o}/` : '/'); };

/* ---------- layout ---------- */
function head(p, r) {
  const ar = AR();
  const url = p.canonical || absUrl(p, LANG);
  const alternates = p.alternates
    ? p.alternates.map(a => `<link rel="alternate" hreflang="${a.hreflang}" href="${esc(a.href)}">`).join('\n')
    : `<link rel="alternate" hreflang="en" href="${absUrl(p, 'en')}">\n<link rel="alternate" hreflang="ar" href="${absUrl(p, 'ar')}">\n<link rel="alternate" hreflang="tr" href="${absUrl(p, 'tr')}">\n<link rel="alternate" hreflang="x-default" href="${absUrl(p, 'en')}">`;
  const hasOtherLang = !p.alternates || p.alternates.some(a => a.hreflang === (ar ? 'en' : 'ar'));
  const article = p.article ? `\n<meta property="article:published_time" content="${esc(p.article.published)}">\n<meta property="article:modified_time" content="${esc(p.article.modified)}">\n<meta property="article:section" content="${esc(p.article.section)}">` : '';
  const pt = ar ? (p.titleAr ?? p.title) : p.title;
  const title = pt ? `${pt} — FOXREX` : (ar ? 'FOXREX — تداول أذكى... فرص أكبر' : 'FOXREX — Trade Smarter. Go Further.');
  const desc = ar ? (p.descriptionAr || p.description || SITE.descriptionAr) : (p.description || SITE.description);
  const og = ar ? 'og-image-ar.png' : 'og-image.png';
  const preload = (ar ? ['ibm-plex-sans-arabic-arabic-400-normal', 'ibm-plex-sans-arabic-arabic-700-normal'] : ['inter-latin-400-normal', 'inter-latin-800-normal'])
    .map(f => `<link rel="preload" href="${r}assets/fonts/${f}.woff2" as="font" type="font/woff2" crossorigin>`).join('\n');
  return `<!doctype html>
<html lang="${LANG}" dir="${ar ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
${alternates}${p.noindex ? '\n<meta name="robots" content="noindex">' : ''}${p.kind ? '\n' + GENERATED_MARK : ''}
<meta name="theme-color" content="#0B1320">
<meta name="color-scheme" content="dark light">
${p.noindex?'':'<meta name="robots" content="index,follow,max-image-preview:large">'}
<link rel="icon" type="image/png" sizes="32x32" href="${r}assets/brand/favicon-32.png">
<link rel="apple-touch-icon" href="${r}assets/brand/apple-touch-icon.png">
<link rel="manifest" href="${r}site.webmanifest">
<meta property="og:type" content="${p.ogType || 'website'}">
<meta property="og:site_name" content="FOXREX">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE.origin}/${p.cover || `assets/brand/${og}`}">
<meta property="og:image:width" content="${p.cover ? '1672' : '1200'}">
<meta property="og:image:height" content="${p.cover ? '941' : '630'}">
<meta property="og:image:alt" content="${esc(p.kind?p.title:ar ? 'FOXREX — تداول أذكى... فرص أكبر' : 'FOXREX — Trade smarter. Go further.')}">
<meta property="og:locale" content="${ar ? 'ar_AR' : LANG === 'tr' ? 'tr_TR' : 'en_US'}">${hasOtherLang ? `\n<meta property="og:locale:alternate" content="${ar ? 'en_US' : 'ar_AR'}">` : ''}${article}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE.origin}/${p.cover || `assets/brand/${og}`}">
<script>document.documentElement.className+=" js";try{var theme=localStorage.getItem("foxrex-theme");document.documentElement.dataset.theme=theme==="light"||theme==="dark"?theme:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");}catch(e){document.documentElement.dataset.theme="dark";}</script>
${preload}
<link rel="stylesheet" href="${r}styles/fonts.css">
<link rel="stylesheet" href="${r}styles/tokens.css">
<link rel="stylesheet" href="${r}styles/base.css">
<link rel="stylesheet" href="${r}styles/components.css">
<link rel="stylesheet" href="${r}styles/public.css">
<link rel="stylesheet" href="${r}styles/editorial.css?v=${EDITORIAL_VERSION}">
<link rel="stylesheet" href="${r}styles/themes.css">
${ar ? `<link rel="stylesheet" href="${r}styles/ar.css">\n` : ''}${p.jsonld && p.jsonld(ar) ? `<script type="application/ld+json">${JSON.stringify(p.jsonld(ar)).replace(/</g, '\\u003c')}</script>\n` : ''}</head>`;
}

const logo = b => `<a class="fx-logo" href="${b || './'}" aria-label="${AR() ? 'FOXREX — الرئيسية' : 'FOXREX home'}"><img src="${LOGO_SRC}" width="175" height="146" alt=""><b>FOX<span>REX</span></b></a>`;
let LOGO_SRC = '';

function header(active, r, b, alt, p) {
  const link = ([k, en, ar]) => `<a href="${b}${k}/"${active === k ? ' aria-current="page"' : ''}>${t(en, ar)}</a>`;
  const sw = `<nav class="language-picker" aria-label="${t('Language','اللغة')}">${['en','ar','tr'].map(lang => {
    const alternate = p.alternates?.find(a => a.hreflang === lang);
    const target = p.kind ? (alternate ? alternate.href.replace(SITE.origin + '/', '') : CMS.hubPath(p.active === 'home' ? 'desk' : p.active || 'analysis', lang)) : (outPath(p, lang) ? outPath(p, lang) + '/' : '');
    return `<a class="lang-toggle" href="${r}${target || './'}" hreflang="${lang}" lang="${lang}" data-lang-switch="${lang}"${LANG === lang ? ' aria-current="true"' : ''} aria-label="${{en:'English',ar:'العربية',tr:'Türkçe'}[lang]}">${{en:'EN',ar:'ع',tr:'TR'}[lang]}</a>`;
  }).join('')}</nav>`;
  return `<a class="skip" href="#main">${t('Skip to content', 'انتقل إلى المحتوى')}</a>
<header class="site-head">
  <div class="wrap">
    ${logo(b)}
    <nav class="site-nav" aria-label="${AR() ? 'التنقل الرئيسي' : 'Primary'}">${NAV.map(link).join('')}</nav>
    <div class="site-head__end">
      <button class="theme-toggle" type="button" data-theme-toggle aria-label="${t('Switch to light mode','تفعيل الوضع الفاتح')}" title="${t('Theme','المظهر')}"><span aria-hidden="true">◐</span></button>
      ${sw}
      <a class="fx-btn fx-btn--primary fx-btn--sm" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">${t('Join FOXREX', 'انضم إلى FOXREX')}</a>
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="${AR() ? 'القائمة' : 'Menu'}" data-menu-btn>${I.menu}</button>
    </div>
  </div>
</header>
<nav class="mobile-nav" id="mobile-nav" aria-label="${AR() ? 'قائمة الجوال' : 'Mobile'}" data-open="false">
  ${[['', 'Home', 'الرئيسية'], ...NAV].map(([k, en, ar]) => `<a href="${b}${k ? k + '/' : ''}"${active === (k || 'home') ? ' aria-current="page"' : ''}>${t(en, ar)}</a>`).join('\n  ')}

  <div class="mobile-social">${socialLinks()}</div>
</nav>`;
}

function socialLinks() {
  return Object.entries(SITE.social).filter(([, s]) => s.url).map(([k, s]) => `<a href="${s.url}" target="_blank" rel="noopener" aria-label="${s.label}">${I[k]}</a>`).join('');
}

function footer(r, b) {
  return `<footer class="compact-footer"><div class="wrap"><div class="compact-footer__row">${logo(b)}<div class="social">${socialLinks()}</div><nav aria-label="${t('Legal','روابط الموقع')}">${[['about','About','من نحن'],['contact','Contact','تواصل معنا'],['privacy','Privacy','الخصوصية'],['terms','Terms','شروط الاستخدام'],['risk-disclosure','Risk Disclosure','إفصاح المخاطر']].map(([route,en,ar])=>`<a href="${b}${route}/">${t(en,ar)}</a>`).join('')}</nav></div><p>${t('Information and education only. Trading involves risk.', 'للمعلومات والتعليم فقط. التداول ينطوي على مخاطر.')} © <span data-year>2026</span> FOXREX</p></div></footer>`;
}

function page(p) {
  const o = outPath(p, LANG);
  const r = o ? '../'.repeat(o.split('/').length) : '';
  const b = r + (AR() ? 'ar/' : LANG === 'tr' ? 'tr/' : '');
  LOGO_SRC = `${r}assets/brand/foxrex-mark.png`;
  const altOut = outPath(p, AR() ? 'en' : 'ar');
  const alt = p.altHref != null ? (r + p.altHref) || './' : r + (altOut ? altOut + '/' : '') || './';
  const scripts = ['scripts/public/tr.js', 'scripts/public/site.js', ...(p.scripts || [])].map(s => `<script src="${r}${s}${['scripts/public/home.js','scripts/public/catalog.js','scripts/public/rex.js'].includes(s)?'?v='+createHash('sha256').update(fs.readFileSync(path.join(ROOT,s))).digest('hex').slice(0,12):''}" defer></script>`).join('\n');
  const html = `${head(p, r)}
<body data-root="${r}" data-page="${p.id}" data-lang="${LANG}">
${header(p.active || p.id, r, b, alt, p)}
<aside class="education-notice" aria-label="${t('Educational content notice','تنويه المحتوى التعليمي')}"><div class="wrap">${I.shield}<span>${t('All content and signals are educational only, not investment recommendations. Trading involves risk.','جميع المحتويات والإشارات تعليمية فقط، وليست توصيات استثمارية. التداول ينطوي على مخاطر.')}</span></div></aside>
<main id="main">
${p.body(r, b)}
</main>
${footer(r, b)}
${scripts}
</body>
</html>
`;
  return LANG === 'tr' ? turkishHtml(html) : html;
}

/* ---------- reusable blocks ---------- */
const sectionHead = (kicker, h, p, cta) => `<div class="section-head reveal"><div><span class="fx-kicker">${kicker}</span><h2>${h}</h2>${p ? `<p>${p}</p>` : ''}</div>${cta || ''}</div>`;
const pageHero = (kicker, h, p) => `<section class="page-hero"><div class="wrap"><span class="fx-kicker">${kicker}</span><h1>${h}</h1>${p ? `<p>${p}</p>` : ''}</div></section>`;
const empty = (h, p) => `<div class="fx-empty"><strong>${h}</strong><span>${p}</span></div>`;
const more = (href, en, ar) => `<a class="fx-link" href="${href}">${t(en, ar)} ${I.arrow}</a>`;

function ticker() {
  return `<section class="fx-ticker" aria-label="${AR() ? 'نظرة على الأسواق' : 'Market overview'}" data-market-ticker>
  <div class="fx-ticker__state"><span class="fx-status" data-state="off" data-market-state>${t('Market feed not connected', 'بيانات السوق غير متصلة')}</span></div>
  <ul class="fx-ticker__list">
    ${MARKETS.map(m => `<li class="fx-ticker__item" data-symbol="${m.sym}"><span class="fx-sym">${m.sym}</span><span><span class="fx-ticker__px" data-px>—</span> <span class="fx-ticker__chg" data-chg></span></span></li>`).join('\n    ')}
  </ul>
</section>`;
}

function todaySlots() {
  return `<div class="grid grid--5" data-editorial>
${SCHEDULE.map(s => `  <article class="fx-card slot reveal" data-kind="${s.kind}" data-slot="${s.id}">
    <div class="slot__time"><span class="fx-kicker">${tp(s.title)}</span><b class="ltr num" data-slot-time="${s.time}">${s.time} <abbr title="${AR() ? 'بتوقيت إسطنبول (UTC+3)' : 'Istanbul time (UTC+3)'}">IST</abbr></b></div>
    <h3 data-slot-title>${tp(s.desc)}</h3>
    <div class="fx-card__foot"><span class="fx-status" data-state="off" data-slot-status>${t('Not yet published today', 'لم يُنشر بعد اليوم')}</span></div>
  </article>`).join('\n')}
</div>
<p class="muted reveal" style="margin-top:18px;font-size:14px">${t('Also on the desk:', 'وعلى مدار اليوم:')} ${SCHEDULE_EXTRA.map(x => `<b>${tp(x.time)}</b> ${tp(x.title)}`).join(' · ')}</p>`;
}

function goldFocus(b, withCta = true) {
  const lvl = (k, en, ar) => `<div><dt>${t(en, ar)}</dt><dd data-gold="${k}">—</dd></div>`;
  return `<div class="gold reveal" data-gold-focus>
  <div class="gold__main">
    <span class="fx-kicker" style="color:var(--foxrex-warning)">${t('Gold Focus', 'تركيز الذهب')}</span>
    <div class="gold__sym"><span class="fx-sym">XAUUSD</span><span class="gold__px" data-gold="price">—</span></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="fx-badge" data-gold="bias">${t('Bias: not published', 'الاتجاه: لم يُنشر بعد')}</span><span class="fx-badge" data-gold="state">${t('Market state: unavailable', 'حالة السوق: غير متاحة')}</span></div>
    <p class="muted" data-gold="summary">${t('Today’s gold analysis has not been published yet. Levels and scenarios appear here once the FOXREX desk publishes them — we never display estimated or placeholder prices.', 'لم يُنشر تحليل الذهب لهذا اليوم بعد. تظهر المستويات والسيناريوهات هنا فور نشرها من مكتب FOXREX، ولا نعرض أسعارًا تقديرية أو وهمية أبدًا.')}</p>
    <p class="muted" data-gold="invalidation" hidden></p>
    <div data-gold="more" hidden></div>
    <p class="fx-card__meta"><span>${t('Last analysis', 'آخر تحليل')}:</span> <time data-gold="updated">—</time></p>
    ${withCta ? more(`${b}gold/`, 'Full Gold Analysis', 'تحليل الذهب الكامل') : ''}
  </div>
  <div>
    <dl class="gold__levels" style="margin:0">${lvl('support', 'Key support', 'الدعم الرئيسي')}${lvl('pivot', 'Important level', 'المستوى المحوري')}${lvl('resistance', 'Key resistance', 'المقاومة الرئيسية')}</dl>
    <div class="gold__scen">
      <div><h4 class="fx-bias fx-bias--bullish">${t('Bullish scenario', 'السيناريو الصاعد')}</h4><p data-gold="bull">${t('Published with the daily Gold Focus.', 'يُنشر مع تركيز الذهب اليومي.')}</p></div>
      <div><h4 class="fx-bias fx-bias--bearish">${t('Bearish scenario', 'السيناريو الهابط')}</h4><p data-gold="bear">${t('Published with the daily Gold Focus.', 'يُنشر مع تركيز الذهب اليومي.')}</p></div>
    </div>
  </div>
</div>`;
}

const tabs = (list, attr) => `<div class="tabs" role="toolbar" aria-label="${AR() ? 'تصفية' : 'Filter'}" ${attr}>${list.map(([k, en, ar], i) => `<button type="button" data-filter="${k}" aria-pressed="${i === 0}">${t(en, ar)}</button>`).join('')}</div>`;

const analysisGrid = limit => `<div data-analysis-list data-limit="${limit || ''}">${empty(t('No analysis published yet', 'لا توجد تحليلات منشورة بعد'), t('New FOXREX analysis will appear here as soon as it is published. Follow us on Telegram to get it first.', 'تظهر تحليلات FOXREX هنا فور نشرها. تابعنا على Telegram لتصلك أولًا.'))}</div>`;
const newsList = limit => `<div data-news-list data-limit="${limit || ''}">${empty(t('No news items published yet', 'لا توجد أخبار منشورة بعد'), t('Market news, economic releases and central-bank decisions will be listed here with their time, importance and affected markets.', 'هنا تُعرض أخبار السوق والبيانات الاقتصادية وقرارات البنوك المركزية، مع توقيتها وأهميتها والأسواق المتأثرة بها.'))}</div>`;

function rexCards(b, n) {
  return REX.slice(0, n).map(x => `<a class="fx-card rex-card reveal" href="${b}learn/#${x.id}"><span class="fx-kicker">${esc(x.type)}</span><h3>${tp(x.title)}</h3><p>${tp(x.summary)}</p><span class="fx-link">${t('Read', 'اقرأ الدرس')} ${I.arrow}</span></a>`).join('\n');
}

const riskBox = () => `<div class="risk-box"><strong>${t('Risk awareness.', 'الوعي بالمخاطر.')}</strong> ${t('Signals are trade ideas, not instructions or guarantees. Markets can move against any idea, and past results never guarantee future outcomes. Only trade with capital you can afford to lose, size positions responsibly and always use a stop-loss.', 'الإشارات أفكار تداول، لا تعليمات ولا ضمانات. قد يتحرك السوق عكس أي فكرة، والنتائج السابقة لا تضمن النتائج المستقبلية. تداول فقط بما يمكنك تحمّل خسارته، وحدّد حجم مركزك بمسؤولية، واستخدم وقف الخسارة دائمًا.')}</div>`;

function signalsBlock(b, full) {
  return `<div class="signals">
  <div class="reveal">
    <span class="fx-kicker">${t('FOXREX Signals', 'إشارات FOXREX')}</span>
    <h2 style="font-size:var(--foxrex-fs-2xl);margin-top:10px">${t('Structured trade ideas, delivered with their risk.', 'أفكار تداول منظمة...\nبمخاطر واضحة.')}</h2>
    <p class="muted" style="margin-top:14px;font-size:17px">${t('Each FOXREX Signal is a documented idea: instrument, direction, entry zone, stop-loss, targets, validity and the reasoning behind it. The stop-loss is defined before the entry, every time.', 'كل إشارة من FOXREX فكرة موثقة: الأداة والاتجاه ومنطقة الدخول ووقف الخسارة والأهداف ومدة الصلاحية، مع المنطق الذي تقوم عليه. ووقف الخسارة يُحدَّد قبل الدخول، في كل مرة.')}</p>
    ${riskBox()}
    <div class="hero__ctas"><a class="fx-btn fx-btn--primary" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">${I.telegram} ${t('Get signals on Telegram', 'تابع الإشارات على Telegram')}</a>${full ? '' : `<a class="fx-btn fx-btn--ghost" href="${b}signals/">${t('How signals work', 'كيف تعمل الإشارات')}</a>`}</div>
    ${full ? `<div style="margin-top:32px"><h3 style="font-size:16px;margin-bottom:12px">${t('Latest published signals', 'أحدث الإشارات المنشورة')}</h3><div data-signal-list data-limit="6">${empty(t('No signals published on the website yet', 'لا توجد إشارات منشورة على الموقع بعد'), t('Signals are posted first on Telegram. Published signals appear here with their entry, stop-loss, targets and risk.', 'تُنشر الإشارات أولًا على Telegram، وتظهر هنا الإشارات المنشورة بالدخول ووقف الخسارة والأهداف والمخاطرة.'))}</div></div>` : ''}
  </div>
  <div class="reveal">
    <ol class="steps">
      <li><h3>${t('Analysis first', 'التحليل أولًا')}</h3><p>${t('Ideas come from the same structure, levels and macro context we publish in our analysis.', 'تنطلق كل فكرة من البنية والمستويات والسياق الاقتصادي نفسه الذي ننشره في تحليلاتنا.')}</p></li>
      <li><h3>${t('Delivered on Telegram', 'تصل عبر Telegram')}</h3><p>${t('Signals are posted to the FOXREX Telegram channel with every parameter and the time of publication.', 'تُنشر الإشارة في قناة FOXREX على Telegram بكامل معاييرها ووقت نشرها.')}</p></li>
      <li><h3>${t('Managed in public', 'إدارة علنية')}</h3><p>${t('Updates such as moving the stop or closing early are posted in the same thread.', 'أي تحديث، مثل تحريك الوقف أو الإغلاق المبكر، يُنشر في السلسلة نفسها.')}</p></li>
      <li><h3>${t('Results recorded', 'توثيق النتائج')}</h3><p>${t('Outcomes are logged whether they win or lose.', 'تُسجَّل النتيجة سواء كانت ربحًا أو خسارة.')}</p></li>
    </ol>
    <div style="margin-top:24px">
      <h3 style="font-size:16px;margin-bottom:12px">${t('Recent results', 'أحدث النتائج')}</h3>
      <div data-signal-results>${empty(t('No verified results published yet', 'لا توجد نتائج موثقة منشورة بعد'), t('Closed signals will be listed here with entry, exit and outcome — including losses. We do not publish win rates or performance figures until they can be independently verified.', 'ستظهر هنا الإشارات المغلقة بالدخول والخروج والنتيجة، بما فيها الخاسرة. ولا ننشر نسب نجاح أو أرقام أداء قبل أن يمكن التحقق منها بشكل مستقل.'))}</div>
    </div>
  </div>
</div>`;
}

/* ---------- pages ---------- */
const PAGES = [];
// Static cards make articles discoverable without JavaScript.
function editorialShelf(b) {
  const items = FEED.items.filter(e => e.language === LANG && e.access === 'PUBLIC').sort((a,b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 6);
  return `<section class="section section--tight"><div class="wrap">${sectionHead(t('Latest editions', 'أحدث الإصدارات'), t('Latest brief & articles', 'أحدث الموجزات والمقالات'), '', more(`${b}calendar/`, 'Economic calendar', 'التقويم الاقتصادي'))}<div class="grid grid--3">${items.map(e => `<article class="fx-card editorial-card">${e.image ? `<a href="${b}${esc(e.urlPath)}" tabindex="-1" aria-hidden="true"><img class="editorial-card__image" src="/${esc(e.image.src)}" alt="" width="1600" height="900" loading="lazy"></a>` : ''}<p class="fx-card__meta"><time datetime="${esc(e.publishedAt)}">${esc(e.editorialDate)}</time></p><h3><a href="${b}${esc(e.urlPath)}">${AR() ? arText(e.title) : enText(e.title)}</a></h3><p>${AR() ? arText(e.summary) : enText(e.summary)}</p></article>`).join('')}</div></div></section>`;
}


function heroEn(b) {
  return `<section class="hero">
  <div class="wrap hero__grid">
    <div>
      <span class="fx-badge fx-badge--primary"><i></i>Market intelligence &amp; trading education</span>
      <h1><span>TRADE SMARTER.</span><span class="accent">GO FURTHER.</span></h1>
      ${LANG === 'tr' ? '<p class="hero__ar">Altın ve döviz için net bir bakış.</p>' : `<p class="hero__ar" lang="ar" dir="rtl">${esc(SITE.taglineAr)}</p>`}
      <p class="hero__lead">FOXREX turns market noise into clear, structured intelligence — technical analysis, gold coverage, economic news and trading education, always published with its risk.</p>
      <div class="hero__ctas">
        <a class="fx-btn fx-btn--primary" href="${b}markets/">Explore Markets ${I.arrow}</a>
        <a class="fx-btn fx-btn--ghost" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">Join FOXREX</a>
      </div>
    </div>
    <ul class="pillars" aria-label="What FOXREX covers">
      ${['Market Intelligence', 'Technical Analysis', 'Trading Signals', 'Economic News', 'Education'].map((x, i) => `<li><span>0${i + 1}</span>${x}</li>`).join('\n      ')}
    </ul>
  </div>
</section>`;
}

function heroAr(b) {
  return `<section class="hero hero--ar">
  <div class="wrap hero__grid">
    <div>
      <p class="hero__pos">${SITE.positioningAr.map((x, i) => `${i ? '<i aria-hidden="true">•</i>' : ''}<span>${esc(x)}</span>`).join('')}</p>
      <h1><span>تداول أذكى...</span><span class="accent">فرص أكبر</span></h1>
      <p class="hero__lead">${arText('تحوّل FOXREX ضجيج الأسواق إلى قراءة واضحة ومنظمة: تحليل فني، ومتابعة يومية للذهب، وأخبار اقتصادية، وتعليم تداول عملي... وكل ذلك يُنشر مع مخاطره.')}</p>
      <div class="hero__ctas">
        <a class="fx-btn fx-btn--primary" href="${b}markets/">استكشف الأسواق ${I.arrow}</a>
        <a class="fx-btn fx-btn--ghost" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">${arText('انضم إلى FOXREX')}</a>
      </div>
      <p class="hero__sig">${SITE.tagline}</p>
    </div>
    <ul class="pillars" aria-label="ما تغطيه FOXREX">
      ${['ذكاء الأسواق', 'التحليل الفني', 'إشارات التداول', 'الأخبار الاقتصادية', 'التعليم'].map((x, i) => `<li><span>0${i + 1}</span>${x}</li>`).join('\n      ')}
    </ul>
  </div>
</section>`;
}

function homeNews(b){
 const all=FEED.items.filter(e=>e.language===LANG&&e.access==='PUBLIC'&&['NEWS','EVENT'].includes(e.type));
 const latest=orderedNews(all).slice(0,5), upcoming=all.filter(e=>newsPhase(e)==='upcoming').sort((a,b)=>a.eventTime.localeCompare(b.eventTime)).slice(0,2);
 const list=[...new Map([...latest,...upcoming].map(e=>[e.id,e])).values()];
 const links=list.map(e=>`<a href="${b}${esc(e.urlPath)}"><span class="ticker-badge" data-ticker-urgency data-news-at="${esc(e.eventTime||'')}" data-important="${e.importance==='HIGH'}" data-soon-label="${t('Soon','قريب')}" data-important-label="${t('Important','مهم')}">${e.importance==='HIGH'?t('Important','مهم'):''}</span><time datetime="${esc(e.publishedAt)}" dir="ltr">${esc(new Intl.DateTimeFormat(LANG,{timeZone:'Europe/Istanbul',dateStyle:'short',timeStyle:'short',hour12:false}).format(new Date(e.publishedAt)))}</time><span class="news-marquee__title" dir="${AR()?'rtl':'ltr'}">${AR()?arText(e.title):enText(e.title)}</span></a>`).join('');
 return `<div class="home-news-strip"><strong>${t('NEWS DESK','شريط الأخبار')}</strong><div class="news-marquee"><div class="news-marquee__track"><div class="news-marquee__group">${links}</div><div class="news-marquee__group" aria-hidden="true" inert>${links}</div></div></div><button type="button" data-ticker-pause aria-label="${t('Pause news ticker','إيقاف شريط الأخبار مؤقتًا')}" aria-pressed="false">Ⅱ</button><a href="${b}news/" class="home-news-all">${t('All news','كل الأخبار')} ${I.arrow}</a></div>`;
}
function goldNewsLead(b,r){
 const e=orderedNews(FEED.items.filter(e=>e.language===LANG&&e.access==='PUBLIC'&&['NEWS','EVENT'].includes(e.type)&&newsPhase(e)!=='upcoming'&&(e.symbol==='XAUUSD'||e.instruments?.includes('XAUUSD'))))[0];
 return e?`<section class="wrap" style="padding-block:24px" data-gold-news-lead><p class="fx-kicker">${t('Latest gold news','أحدث أخبار الذهب')} · ${sourceDate(e)}</p><a href="${b}${esc(e.urlPath)}"><h2>${AR()?arText(e.title):enText(e.title)}</h2><p>${AR()?arText(isCompleteSignal(e)?e.summary:analysisCopy(e.summary)):enText(isCompleteSignal(e)?e.summary:analysisCopy(e.summary))}</p></a></section>`:'';
}
function homePrices(){
 return `<section class="home-prices" aria-label="${t('Indicative market prices','أسعار السوق الاسترشادية')}" data-home-quotes><div class="wrap"><div class="home-prices__head"><strong>${t('Market pulse','نبض السوق')}</strong><span>${t('Indicative prices · source timestamps shown','أسعار استرشادية · مع توقيت المصدر')}</span></div><div class="home-prices__items">${QUOTES.quotes.map(q=>`<div class="home-quote" data-quote="${q.symbol}"><bdi dir="ltr">${q.symbol}</bdi><strong data-quote-price>${Number(q.price).toLocaleString('en-US',{maximumFractionDigits:q.symbol.includes('JPY')?3:q.price<10?5:2})}</strong><span data-quote-change dir="ltr" data-direction="${Number.isFinite(q.dailyChangePct)?q.dailyChangePct>0?'up':q.dailyChangePct<0?'down':'flat':'unknown'}">${Number.isFinite(q.dailyChangePct)?(q.dailyChangePct>0?'+':'')+q.dailyChangePct.toFixed(2)+'%':'—'}</span><small><a data-quote-source href="${esc(q.sourceUrl)}" target="_blank" rel="noopener">${esc(q.source)}</a> · <time data-quote-time datetime="${q.asOf}">${esc(new Intl.DateTimeFormat(LANG,{timeZone:'Europe/Istanbul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(q.asOf)))}</time></small></div>`).join('')}</div><p class="home-prices__foot" data-quote-status>${t('Source update time in Istanbul. Indicative data, not executable prices.','وقت تحديث المصدر بتوقيت إسطنبول. بيانات استرشادية وليست أسعار تنفيذ.')}</p></div></section>`;
}
PAGES.push({ id: 'home', path: '', scripts: ['scripts/public/home.js?v='+createHash('sha256').update(fs.readFileSync(path.join(ROOT,'scripts/public/home.js'))).digest('hex').slice(0,12)],
 jsonld:ar=>({'@context':'https://schema.org','@type':'Organization',name:'FOXREX',url:SITE.origin+(LANG==='en'?'/':`/${LANG}/`),inLanguage:LANG,logo:`${SITE.origin}/assets/brand/icon-512.png`,sameAs:Object.values(SITE.social).map(x=>x.url).filter(Boolean)}),
 body:(r,b)=>`${goldNewsLead(b,r)}${homeNews(b)}<section class="home-visual"><img class="home-visual__background theme-image--dark" src="${r}assets/media/home-market-hero-v2.webp" alt="" width="1672" height="941" fetchpriority="high"><img class="home-visual__background theme-image--light" src="${r}assets/media/home-market-hero-light-v2.webp" alt="" width="1672" height="941"><div class="wrap home-visual__inner"><div><p class="fx-kicker">${t('Gold & forex, in focus','الذهب والفوركس، بوضوح')}</p><h1>${t('Read the market.','اقرأ السوق.')}<br><span>${t('Understand the move.','وافهم الحركة.')}</span></h1><p>${t('Gold, currencies and economic events. A clearer view, with education at its core.','ذهب وعملات وأحداث اقتصادية. قراءة أوضح، والتعليم في أساسها.')}</p><div class="home-visual__actions"><a class="fx-btn fx-btn--primary" href="${b}technical/">${t('Explore the charts','استكشف الشارتات')} ${I.arrow}</a><a class="fx-btn fx-btn--ghost" href="${b}learn/">${t('Learn with REX','تعلّم مع ريكس')}</a></div></div>${featuredGold(r,b)}</div></section>
${homePrices()}<div class="wrap"><aside class="event-alert" role="status" aria-live="polite" data-event-alert hidden></aside><section class="home-event-panel"><div class="home-event-panel__title"><h2>${t('Today & next releases','اليوم والإصدارات القادمة')}</h2><a class="fx-link" href="${b}calendar/">${t('Full calendar','التقويم الكامل')} ${I.arrow}</a></div><div data-home-events>${homeEventRows(b)}</div><p>${t('On-page alerts start 15 minutes before a listed release. Results appear after official verification; otherwise the status stays awaiting confirmation.','يبدأ التنبيه داخل الصفحة قبل الخبر بـ15 دقيقة. تظهر النتائج بعد التحقق الرسمي، وإلا تبقى الحالة بانتظار التأكيد.')}</p></section></div>
<section class="home-gateway"><div class="wrap"><div class="gateway-grid">${NAV.filter(([route])=>!['learn','signals'].includes(route)).map(([route,en,ar],i)=>`<a class="gateway-card" href="${b}${route}/"><span class="gateway-card__number">0${i+1}</span><h2>${t(en,ar)}</h2>${I.arrow}</a>`).join('')}</div><div class="home-bottom"><a class="gateway-learn" href="${b}learn/"><img src="${r}assets/rex/rex-educator-v2.webp" alt="" width="44" height="44"><span>${t('Meet REX. Learn the market, one idea at a time.','تعرّف على ريكس. افهم السوق، فكرة وراء فكرة.')}</span>${I.arrow}</a><div class="gateway-social"><span>${t('Follow FOXREX','تابع FOXREX')}</span>${Object.entries(SITE.social).filter(([,x])=>x.url).map(([key,x])=>`<a href="${x.url}" target="_blank" rel="noopener">${I[key]} ${x.label}</a>`).join('')}</div></div></div></section>`
});
function featuredGold(r,b){const e=FEED.items.filter(e=>e.language===LANG&&e.category==='technical'&&e.symbol==='XAUUSD'&&e.image).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];const light=e?.image.src.replace(/\.webp$/,'-light.webp');const hasLight=!!light&&fs.existsSync(path.join(ROOT,light));return e?`<a class="home-gold-feature" href="${b}${esc(e.urlPath)}"><span>${t('GOLD IN FOCUS','الذهب تحت المجهر')}</span><img${hasLight?' class="theme-image--dark"':''} src="${r}${esc(e.image.src)}" width="1960" height="1120" alt="${esc(e.image.alt)}">${hasLight?`<img class="theme-image--light" src="${r}${esc(light)}" width="1960" height="1120" alt="${esc(e.image.alt)}">`:''}<strong>XAU/USD · ${esc(e.timeframe||'D1')}</strong><small>${t('Candles, support and resistance','شموع ودعوم ومقاومات')} ${I.arrow}</small></a>`:''}
function homeEventRows(b){return [...CALENDAR.events].sort((a,b)=>a.at.localeCompare(b.at)).slice(0,4).map(e=>`<div class="home-event-row" data-home-event="${e.id}"><time datetime="${e.at}">${esc(e.at.slice(0,10))} · ${esc(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'}).format(new Date(e.at)))}</time><a href="${b}${esc(e.analysisPath||'calendar/')}">${AR()?arText(e.title.ar):enText(e.title[LANG])}</a><span class="event-result">${e.actual?esc(e.actual.value):t('Scheduled','مجدول')}</span></div>`).join('')}

PAGES.push({ id: 'markets', path: 'markets', title: 'Markets', titleAr: 'الأسواق', description: 'Markets covered by FOXREX: gold (XAUUSD), EURUSD, GBPUSD, USDJPY, Bitcoin and the US Dollar Index.', descriptionAr: 'الأسواق التي تغطيها FOXREX: الذهب XAUUSD وEURUSD وGBPUSD وUSDJPY والبيتكوين BTCUSD ومؤشر الدولار DXY.', scripts: ['scripts/public/market.js'],
  body: (r, b) => `${pageHero(t('Markets', 'الأسواق'), t('The markets we cover', 'الأسواق التي نغطيها'), t('What each instrument is and what moves it. Live quotes appear only from a connected, verified data feed.', 'ما هي كل أداة، وما الذي يحركها. الأسعار الحية تظهر فقط من مصدر بيانات متصل وموثق.'))}
${ticker()}
<section class="section section--tight"><div class="wrap">
  <div class="fx-notice fx-notice--info" style="margin-bottom:28px">${I.info}<span>${t('The FOXREX market feed is not connected yet, so no prices are shown. We will never display estimated or delayed prices as live data.', 'مصدر بيانات السوق في FOXREX غير متصل بعد، لذلك لا تظهر أي أسعار. ولن نعرض أبدًا أسعارًا تقديرية أو متأخرة على أنها حية.')}</span></div>
  <div class="grid grid--3">
  ${MARKETS.map(m => `<article class="fx-card reveal" id="${m.sym.toLowerCase()}"><div class="fx-card__meta"><span class="fx-badge">${tp(m.cls)}</span></div><h3><span class="fx-sym">${m.sym}</span></h3><p style="color:var(--foxrex-text)">${tp(m.name)}</p><p>${tp(m.about)}</p>${m.sym === 'XAUUSD' ? `<div class="fx-card__foot">${more(`${b}gold/`, 'Gold Focus', 'تركيز الذهب')}</div>` : ''}</article>`).join('\n  ')}
  </div>
</div></section>` });

PAGES.push({ id: 'gold', path: 'gold', title: 'Gold Focus — XAUUSD', titleAr: 'تركيز الذهب — XAUUSD', description: 'FOXREX Gold Focus: daily XAUUSD bias, key support and resistance and bullish and bearish scenarios.', descriptionAr: 'تركيز الذهب من FOXREX: اتجاه XAUUSD اليومي، والدعم والمقاومة الرئيسيان، والسيناريوهان الصاعد والهابط.', scripts: ['scripts/public/content.js'],
  body: (r, b) => `${pageHero(t('Gold', 'الذهب'), t('Gold Focus', 'تركيز الذهب'), t('Our daily XAUUSD view, published at 11:00 Istanbul time on trading days.', 'قراءتنا اليومية للذهب XAUUSD، تُنشر عند 11:00 بتوقيت إسطنبول في أيام التداول.'))}
<section class="section section--tight"><div class="wrap">${goldFocus(b, false)}</div></section>
<section class="section section--tight section--raised"><div class="wrap">
  ${sectionHead(t('Drivers', 'المحركات'), t('What moves gold', 'ما الذي يحرك الذهب؟'))}
  <div class="grid grid--4">
    ${[[['Real yields', 'العوائد الحقيقية'], ['Gold pays no interest, so higher inflation-adjusted yields raise the cost of holding it.', 'الذهب لا يدفع فائدة، لذلك ترفع العوائد الحقيقية المرتفعة تكلفة الاحتفاظ به.']],
       [['The US dollar', 'الدولار الأمريكي'], ['Gold is priced in dollars; a stronger dollar often weighs on it.', 'الذهب مسعّر بالدولار، وقوة الدولار تضغط عليه في الغالب.']],
       [['Risk sentiment', 'معنويات المخاطرة'], ['Stress and uncertainty can lift demand for gold as a store of value.', 'التوتر وعدم اليقين قد يرفعان الطلب على الذهب كمخزن للقيمة.']],
       [['Central banks', 'البنوك المركزية'], ['Official-sector buying and selling changes long-term demand.', 'مشتريات البنوك المركزية ومبيعاتها تغيّر الطلب على المدى الطويل.']]].map(([h, p]) => `<div class="fx-card reveal"><h3>${tp(h)}</h3><p>${tp(p)}</p></div>`).join('')}
  </div>
</div></section>
<section class="section section--tight"><div class="wrap">
  ${sectionHead(t('Gold analysis', 'تحليلات الذهب'), t('Latest gold analysis', 'أحدث تحليلات الذهب'))}
  <div data-analysis-list data-category="gold">${empty(t('No gold analysis published yet', 'لا توجد تحليلات للذهب منشورة بعد'), t('Published gold analysis will appear here.', 'تظهر هنا تحليلات الذهب فور نشرها.'))}</div>
</div></section>` });

const NEWS_TOPICS = {
 'inflation':['Inflation','التضخم'], 'labor':['Jobs & wages','العمل والأجور'], 'growth':['Growth & spending','النمو والإنفاق'], 'trade':['Trade & balances','التجارة والموازين'], 'central-banks':['Central banks','البنوك المركزية'], 'households':['Households','الأسر'], 'fx':['Currencies','العملات']
};
const sourceDate=e=>newsTime(e).slice(0,10);
const newsTopic=e=>(e.tags||[]).find(x=>x.startsWith('topic-'))?.slice(6)||(/pce|cpi|ppi|inflation/.test(e.slug)?'inflation':/employment|jobs|labor/.test(e.slug)?'labor':/fed-|ecb-|bank-/.test(e.slug)||e.category==='central-banks'?'central-banks':e.category==='fx'?'fx':'growth');
const isSignalItem=isCompleteSignal;
function aiNavigation(b){const items=FEED.items.filter(e=>e.language===LANG&&e.tags?.includes('ai-technical'));return `<aside class="wrap ai-navigation" aria-label="${t('AI technical analysis','تحليل الذكاء الاصطناعي')}"><h2>${t('AI technical analysis','تحليل الذكاء الاصطناعي')}</h2><p>${t('Select an instrument. Each view states its real candle time and data limitations.','اختر الأداة. كل قراءة توضح وقت الشموع الحقيقي وحدود البيانات.')}</p><nav>${items.map(e=>`<a href="${b}${esc(e.urlPath)}"><bdi dir="ltr">${esc(e.symbol)}</bdi></a>`).join('')}</nav></aside>`;}
function marketCatalog(kind,r,b) {
 const list=FEED.items.filter(e=>e.language===LANG && e.access==='PUBLIC' && (kind==='signals' ? isSignalItem(e) : kind==='news' ? e.type==='NEWS' || e.type==='EVENT' : !isSignalItem(e) && ['ANALYSIS','WEEKLY_OUTLOOK'].includes(e.type) && (kind==='technical' ? e.category==='technical' : e.category!=='technical'))).sort((a,b)=>(kind==='technical'?Number(!a.tags?.includes('ai-technical'))-Number(!b.tags?.includes('ai-technical')):0)||(kind==='technical'?((a.symbol==='XAUUSD'?0:a.symbol==='XAGUSD'?1:2)-(b.symbol==='XAUUSD'?0:b.symbol==='XAGUSD'?1:2)):0)||(kind==='news'?(newsPhase(a)==='upcoming')-(newsPhase(b)==='upcoming')||b.publishedAt.localeCompare(a.publishedAt):0)||b.publishedAt.localeCompare(a.publishedAt));
 const symbols=[...new Set(list.map(e=>e.symbol).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const topics=Object.keys(NEWS_TOPICS).filter(topic=>list.some(e=>newsTopic(e)===topic));
 const filters=['technical','signals'].includes(kind)?`<div class="catalog-filters" aria-label="${t('Instrument','الأداة')}">${[['all',t('All','الكل')],['XAUUSD','XAUUSD'],['XAGUSD','XAGUSD']].filter(([x])=>x==='all'||symbols.includes(x)).map(([x,label],i)=>`<button type="button" data-catalog-filter="${x}" aria-pressed="${i===0}">${label}</button>`).join('')}</div><label>${t('Choose an instrument','اختر الأداة')}<select data-catalog-select><option value="all">${t('All instruments','جميع الأدوات')}</option>${symbols.map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label>`:kind==='news'?`<label>${t('News category','تصنيف الأخبار')}<select data-catalog-select><option value="all">${t('All categories','جميع التصنيفات')}</option>${topics.map(x=>`<option value="${x}">${tp(NEWS_TOPICS[x])} (${list.filter(e=>newsTopic(e)===x).length})</option>`).join('')}</select></label>`:'';
 return `<section class="catalog-section" data-catalog data-catalog-kind="${kind}"><div class="wrap"><div class="catalog-toolbar" data-catalog-controls hidden>${filters}${kind==='news'?`<label>${t('Time period','الفترة الزمنية')}<select data-catalog-period>${[['all','All dates','كل التواريخ'],['today','Today','اليوم'],['week','Last 7 days','آخر 7 أيام'],['archive','Archive','الأرشيف'],['upcoming','Upcoming release','إصدار قادم']].map(([v,en,ar])=>`<option value="${v}">${t(en,ar)}</option>`).join('')}</select></label>`:''}<label>${t('Search articles','ابحث في المقالات')}<input data-catalog-search type="search" placeholder="${t('Title, topic or instrument','عنوان أو موضوع أو أداة')}" autocomplete="off"></label></div><p class="catalog-status" data-catalog-status aria-live="polite" data-label="${t('Matching articles','المقالات المطابقة')}"></p><div class="catalog-grid">${list.map(e=>`<article class="catalog-card"${kind==='signals'?' data-signal-card':''} data-catalog-symbol="${esc(e.symbol||'')}" data-catalog-date="${sourceDate(e)}" data-catalog-phase="${newsPhase(e)}" data-catalog-topic="${newsTopic(e)}" data-catalog-card ${kind==='technical'?'data-technical-card':''}><a href="${b}${esc(e.urlPath)}">${e.image?`<img${fs.existsSync(path.join(ROOT,e.image.src.replace(/\.webp$/,'-light.webp')))&&e.image.src.endsWith('.webp')?' class="theme-image--dark"':''} src="${r}${esc(e.image.src)}" alt="${esc(e.image.alt)}" loading="lazy" width="1600" height="900">${fs.existsSync(path.join(ROOT,e.image.src.replace(/\.webp$/,'-light.webp')))&&e.image.src.endsWith('.webp')?`<img class="theme-image--light" src="${r}${esc(e.image.src.replace(/\.webp$/,'-light.webp'))}" alt="${esc(e.image.alt)}" loading="lazy" width="1600" height="900">`:''}`:''}<div class="catalog-card__body">${e.tags?.includes('ai-technical')?`<p class="fx-kicker">${t('AI technical analysis','تحليل الذكاء الاصطناعي')}</p>`:''}<p class="catalog-card__meta">${e.symbol?`<bdi dir="ltr">${esc(e.symbol)}</bdi> · `:''}${kind==='news'?`${tp(NEWS_TOPICS[newsTopic(e)])} · ${t('Published','نُشر')} `:''}<time datetime="${esc(e.publishedAt)}">${esc(new Intl.DateTimeFormat(LANG,{timeZone:'Europe/Istanbul',dateStyle:'medium',timeStyle:'short',hour12:false}).format(new Date(e.publishedAt)))} · ${t('Istanbul','إسطنبول')}</time>${e.updatedAt!==e.publishedAt?` · ${t('Updated','حُدّث')} ${esc(new Intl.DateTimeFormat(LANG,{timeZone:'Europe/Istanbul',dateStyle:'medium',timeStyle:'short',hour12:false}).format(new Date(e.updatedAt)))}`:''}${e.timeframe?' · '+esc(e.timeframe):''}</p>${kind==='signals'?signalPanel(e,LANG,signalObservations):''}${kind==='news'?`<p class="fx-kicker">${newsPhase(e)==='upcoming'?t('Upcoming release','إصدار قادم'):sourceDate(e)===new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date())?t('Today','اليوم'):t('Archive','الأرشيف')} · ${sourceDate(e)}</p>`:''}${kind==='signals'?`<div class="signal-meta"><span class="signal-direction">${e.bias==='bullish'?t('Bullish scenario','سيناريو صاعد'):e.bias==='bearish'?t('Bearish scenario','سيناريو هابط'):t('Neutral scenario','سيناريو محايد')}</span>${e.freshness?.validUntil?`<span data-signal-until="${esc(e.freshness.validUntil)}" data-active-label="${t('Within source window','ضمن نافذة المصدر')}" data-expired-label="${t('Expired — historical','منتهية — للأرشيف')}">${t('Valid until','صالحة حتى')} ${esc(e.freshness.validUntil)}</span>`:''}</div>`:''}<h2>${AR()?arText(e.title):enText(e.title)}</h2>${kind==='signals'?'':`<p>${AR()?arText(isCompleteSignal(e)?e.summary:analysisCopy(e.summary)):enText(isCompleteSignal(e)?e.summary:analysisCopy(e.summary))}</p>`}<span class="fx-link">${kind==='signals'?t('View signal','عرض الإشارة'):kind==='news'?t('Read article','اقرأ الخبر'):t('Read analysis','اقرأ التحليل')} ${I.arrow}</span></div></a></article>`).join('')}</div><button type="button" class="catalog-more fx-btn fx-btn--ghost" data-catalog-more hidden>${t('Show more articles','عرض مقالات إضافية')}</button><p data-catalog-empty hidden>${t('No matching articles. Try another search.','لا توجد مقالات مطابقة. جرّب بحثًا آخر.')}</p></div></section>`;
}
for(const [id,en,ar,desc,descAr] of [
 ['analysis','General analysis','التحليل العام','Macro context for gold and major currencies.','قراءة اقتصادية للذهب والعملات الرئيسية.'],
 ['technical','Technical analysis','التحليل التقني','Instrument-based analysis with verified charts and price levels.','تحليل حسب الأداة، مع شارتات موثقة ومستويات سعرية واضحة.'],
 ['news','Market news','الأخبار','Verified economic and central-bank developments.','تطورات اقتصادية وقرارات بنوك مركزية بمصادر موثقة.']
]) PAGES.push({id,path:id,title:({technical:'Forex technical analysis, gold and silver',news:'Latest forex and gold news',analysis:'Forex and gold market analysis'})[id]||en,titleAr:({technical:'التحليل الفني للفوركس والذهب والفضة',news:'أحدث أخبار الفوركس والذهب',analysis:'تحليلات سوق الفوركس والذهب'})[id]||ar,description:desc,descriptionAr:descAr,scripts:['scripts/public/catalog.js'],body:(r,b)=>`${pageHero(t(en,ar),t(en,ar),t(desc,descAr))}${id==='technical'?aiNavigation(b):''}${marketCatalog(id,r,b)}`});

PAGES.push({ id:'learn',path:'learn',title:'Learn with REX',titleAr:'تعلّم مع ريكس',description:'Meet REX, your FOXREX learning companion. Five practical lessons, clear explanations and risk awareness.',descriptionAr:'تعرّف على ريكس، رفيقك التعليمي في FOXREX. خمسة دروس عملية وشروحات واضحة ووعي بالمخاطر.',scripts:['scripts/public/content.js','scripts/public/rex.js'],
 body:(r,b)=>`<section class="rex-academy"><div class="wrap rex-hero"><div class="rex-hero__copy"><p class="fx-kicker">${t('THE REX CLASSROOM','مساحة ريكس التعليمية')}</p><h1>${t('Hey, I’m REX.','أهلًا، أنا ريكس.')}<br><span>${t('Let’s make markets make sense.','خلّينا نفهم السوق معًا.')}</span></h1><p>${t('I ask the questions behind the chart. Together, we’ll unpack market moves, test ideas and put risk first.','بسأل عن الفكرة اللي وراء الشارت. معًا بنفكك حركة السوق، بنختبر الأفكار، وبنحط المخاطر أولًا.')}</p><blockquote>${t('“Understand the idea before you follow the move.”','«افهم الفكرة قبل ما تلاحق الحركة.»')}<cite>— REX</cite></blockquote><div class="rex-hero__actions"><a class="fx-btn fx-btn--primary" href="#rex-lessons">${t('Start learning','ابدأ التعلّم')} ${I.arrow}</a><a class="fx-btn fx-btn--ghost" href="#ask-rex">${t('Ask REX','اسأل ريكس')}</a></div><p class="rex-principle">${t('Curious. Clear. Risk-aware.','فضولي. واضح. واعي بالمخاطر.')}</p></div><figure class="rex-hero__portrait"><img src="${r}assets/rex/rex-educator-v2.webp" width="960" height="960" alt="${esc(AR()?'ريكس، ثعلب FOXREX التعليمي، ببدلة كحلية وربطة عنق زمردية':LANG==='tr'?tr('REX, the friendly FOXREX fox educator in a navy suit and emerald tie'):'REX, the friendly FOXREX fox educator in a navy suit and emerald tie')}" fetchpriority="high"><figcaption><strong>REX</strong> ${t('Your learning companion','رفيقك في التعلّم')}</figcaption></figure></div></section>
${rexInteractive(LANG,r,REX)}
<section id="rex-lessons" class="rex-lessons"><div class="wrap"><div class="rex-section-title"><p class="fx-kicker">${t('A SIMPLE LEARNING PATH','مسار تعلّم بسيط')}</p><h2>${t('Five ideas. A clearer market view.','خمس أفكار. قراءة أوضح للسوق.')}</h2><p>${t('Open a lesson, take the key idea, then check your understanding below.','افتح الدرس، خذ فكرته الأساسية، وبعدين اختبر فهمك تحت.')}</p></div><nav class="rex-path" aria-label="${t('Learning path','مسار الدروس')}">${REX.map((x,i)=>`<a href="#${x.id}"><span>0${i+1}</span><strong>${tp(x.title)}</strong>${I.arrow}</a>`).join('')}</nav><div class="rex-lesson-list">${REX.map((x,i)=>`<details class="rex-lesson" id="${x.id}"${i===0?' open':''}><summary><span class="rex-lesson__number">0${i+1}</span><span>${tp(x.title)}</span><span class="rex-lesson__plus" aria-hidden="true">+</span></summary><div class="rex-lesson__body">${x.body[AR()?1:0].map(p=>`<p>${AR()?arText(p):esc(p)}</p>`).join('')}<aside class="rex-note"><img src="${r}assets/rex/rex-educator-v2.webp" alt="" width="48" height="48" loading="lazy"><div><strong>${t('REX says','ريكس بيقول')}</strong><p>${tp(x.takeaway)}</p></div></aside></div></details>`).join('')}</div><div class="rex-published"><h2>${t('Keep learning with REX','كمّل التعلّم مع ريكس')}</h2><div data-learn-list></div></div></div></section>
<section class="rex-check"><div class="wrap"><p class="fx-kicker">${t('REX CHECK','اختبار ريكس')}</p><h2>${t('Before you move on…','قبل ما تكمّل…')}</h2><p>${t('Think first. Open the answer when you are ready.','فكّر بالأول، وافتح الإجابة لما تكون جاهز.')}</p>${[
[['Does touching resistance confirm a breakout?','هل لمس المقاومة يؤكد الاختراق؟'],['No. A touch alone is not confirmation. Define your timeframe and what would invalidate the idea.','لا. اللمس وحده مش تأكيد. حدد إطارك الزمني، وشو اللي يلغي الفكرة.']],
[['Can a good reward-to-risk ratio guarantee a profit?','هل نسبة العائد إلى المخاطرة الجيدة تضمن الربح؟'],['No. The ratio describes a planned payoff relative to risk; it does not establish the probability of success.','لا. النسبة تصف العائد المخطط مقارنة بالمخاطرة، وما بتحدد احتمال نجاح الفكرة.']],
[['Is a FOXREX signal an instruction to buy or sell?','هل إشارة FOXREX أمر بالشراء أو البيع؟'],['No. Signals are educational scenarios, not investment recommendations. A learning example can fail.','لا. الإشارات سيناريوهات تعليمية وليست توصيات استثمارية. والمثال التعليمي ممكن يفشل.']]
].map(([q,a])=>`<details class="rex-question"><summary>${tp(q)}</summary><p>${tp(a)}</p></details>`).join('')}</div></section>
<section id="ask-rex" class="rex-ask"><div class="wrap"><div><p class="fx-kicker">ASK REX</p><h2>${t('A question is a good place to start.','السؤال بداية الفهم.')}</h2><p>${t('Send your learning question to the FOXREX Telegram channel. Selected questions may become future lessons.','ابعث سؤالك التعليمي لقناة FOXREX على تيليجرام. ممكن نختار أسئلة ونحوّلها لدروس جديدة.')}</p></div><a class="fx-btn fx-btn--primary" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">${I.telegram} ${t('Open FOXREX on Telegram','افتح FOXREX على تيليجرام')}</a></div></section>` });

PAGES.push({id:'signals',path:'signals',title:'Forex trading signals',titleAr:'إشارات تداول الفوركس',description:'Market scenarios with real candlestick charts, source levels and validity windows.',descriptionAr:'سيناريوهات السوق مع شارتات شموع حقيقية ومستويات المصدر ومدة الصلاحية.',scripts:['scripts/public/catalog.js'],body:(r,b)=>`${pageHero(t('Signals','الإشارات'),t('Market signals, clearly charted.','إشارات السوق، واضحة على الشارت.'),t('Real candles, source levels and a clear time window for every scenario.','شموع حقيقية ومستويات موثقة ونافذة زمنية واضحة لكل سيناريو.'))}<div class="wrap signal-desk-note">${t('Educational scenarios. Missing entry or stop-loss levels are left unspecified. Chart observations can precede the source alert; each page states both times.','سيناريوهات تعليمية. أي دخول أو وقف خسارة غير وارد بالمصدر يبقى غير محدد. بيانات الشارت قد تسبق توقيت التنبيه؛ نوضح التوقيتين داخل كل صفحة.')}</div>${marketCatalog('signals',r,b)}<p class="wrap">${t('Only complete setups with entry, targets and stop-loss appear here. Other scenarios are in Technical analysis.','هنا تظهر الإشارات المكتملة بالدخول والأهداف ووقف الخسارة فقط. باقي السيناريوهات موجودة في التحليل التقني.')} <a href="${b}technical/">${t('Technical analysis','التحليل التقني')}</a></p>`});

PAGES.push({ id: 'about', path: 'about', title: 'About', titleAr: 'من نحن', description: 'About FOXREX — a market-intelligence and trading-education brand.', descriptionAr: 'عن FOXREX: علامة عربية لذكاء الأسواق وتعليم التداول.',
  body: () => `${pageHero(t('About', 'من نحن'), t('Intelligence over noise.', 'الذكاء قبل الضجيج.'), t('FOXREX is a market-intelligence and trading-education brand for traders who want structure, context and honesty about risk.', 'FOXREX علامة لذكاء الأسواق وتعليم التداول، لمن يريد البنية والسياق والصراحة الكاملة بشأن المخاطر.'))}
<section class="section section--tight"><div class="wrap prose">
  ${AR() ? `
  <h2>ماذا نقدم</h2>
  <p>${arText('ننشر تحليلات يومية للأسواق مع تركيز خاص على الذهب وأزواج العملات الرئيسية والمؤشرات والعملات الرقمية، ونشرح الأخبار الاقتصادية وقرارات البنوك المركزية، ونشارك إشارات FOXREX على Telegram، ونعلّم المفاهيم التي تقف خلفها عبر REX، هويتنا التعليمية.')}</p>
  <h2>كيف نعمل</h2>
  <ul><li><strong>لا بيانات وهمية.</strong> لا ننشر أسعارًا أو أداءً أو نسب نجاح أو أعداد مستخدمين مختلقة، وعندما لا تتوفر البيانات نقول ذلك.</li><li><strong>المخاطرة أولًا.</strong> كل فكرة تأتي مع مستوى إلغاء ورسالة مخاطر واضحة.</li><li><strong>المصادر أولًا.</strong> تربط مقالاتنا المعلومات بمصادرها، وتفصل بين الوقائع المؤكدة والتحليل المشروط.</li><li><strong>تعليم، لا نصيحة.</strong> محتوانا يساعدك على التفكير، ولا يخبرك بما تفعله بأموالك.</li></ul>
  <h2>تعرّف على REX</h2>
  <p>${arText('REX هو ثعلب FOXREX، وتوقيعنا على المحتوى التعليمي: REX يشرح، وملاحظة REX، واسأل REX.')}</p>` : `
  <h2>What we do</h2>
  <p>We publish daily market analysis with a focus on gold, major FX pairs, indices and crypto; explain economic news and central-bank decisions; share FOXREX Signals on Telegram; and teach the concepts behind them through REX, our educational identity.</p>
  <h2>How we work</h2>
  <ul><li><strong>No fake data.</strong> We never publish invented prices, performance, win rates or user numbers. When data is unavailable, we say so.</li><li><strong>Risk first.</strong> Every idea carries an invalidation level and a risk message.</li><li><strong>Source-first publishing.</strong> Our articles link to their sources and distinguish confirmed facts from conditional analysis.</li><li><strong>Education, not advice.</strong> Our content helps you think — it does not tell you what to do with your money.</li></ul>
  <h2>Meet REX</h2>
  <p>REX is the FOXREX fox — our signature for educational content such as REX Explains, REX Note and Ask REX.</p>`}
</div></section>` });

PAGES.push({ id: 'contact', path: 'contact', title: 'Contact', titleAr: 'تواصل معنا', description: 'Contact FOXREX on Telegram, Instagram or Facebook.', descriptionAr: 'تواصل مع FOXREX عبر Telegram أو Instagram أو Facebook.',
  body: () => `${pageHero(t('Contact', 'تواصل معنا'), t('Talk to FOXREX', 'تحدّث مع FOXREX'), t('The fastest way to reach us is a direct message on any of our channels.', 'أسرع طريقة للوصول إلينا رسالة مباشرة عبر أي من قنواتنا.'))}
<section class="section section--tight"><div class="wrap">
  <div class="grid grid--3">
  ${['telegram', 'instagram', 'facebook'].map(k => { const s = SITE.social[k]; return `<a class="fx-card channel reveal" href="${s.url}" target="_blank" rel="noopener"><span class="ic">${I[k]}</span><span><b class="en">${s.label}</b><small class="en" dir="ltr">${esc(s.handle)}</small></span></a>`; }).join('\n  ')}
  </div>
  <p class="muted" style="margin-top:24px;font-size:14px">${t('WhatsApp channel: coming soon. We will never ask for passwords, account access or payments through direct messages.', 'قناة WhatsApp: قريبًا. لن نطلب منك أبدًا كلمات مرور أو دخولًا إلى حسابك أو أي مدفوعات عبر الرسائل المباشرة.')}</p>
</div></section>` });

const legal = (id, title, titleAr, desc, descAr, en, ar) => PAGES.push({ id, path: id, title, titleAr, description: desc, descriptionAr: descAr,
  body: (r, b) => `${pageHero(t('Legal', 'قانوني'), t(title, titleAr))}
<section class="section section--tight"><div class="wrap prose"><p class="updated">${t('Last updated:', 'آخر تحديث:')} ${t(UPDATED.en, UPDATED.ar)}</p>${AR() ? ar(b) : en(b)}</div></section>` });

legal('privacy', 'Privacy Policy', 'سياسة الخصوصية', 'How the FOXREX website handles your data.', 'كيف يتعامل موقع FOXREX مع بياناتك.', b => `
<p>This policy explains what information the FOXREX website (foxrex.co) handles.</p>
<h2>What we collect</h2>
<p>The website does not use accounts, contact forms, advertising trackers or analytics cookies. We do not sell personal data.</p>
<h2>Stored on your device</h2>
<p>REX lesson progress and quiz answers are saved on this device only. Use Reset progress in the classroom to clear them.</p>
<p>The theme preference is saved on your device under the key <code>foxrex-theme</code>.</p>
<p>If you switch language, your choice is saved in your browser's local storage under the key <code>foxrex-lang</code>. You can clear it at any time through your browser settings.</p>
<h2>Third-party services</h2>
<ul><li><strong>Hosting:</strong> the site is served by GitHub Pages, which may log technical request data such as IP addresses for security and operations.</li><li><strong>Fonts:</strong> fonts are hosted on foxrex.co itself; no third-party font service is contacted.</li><li><strong>Social platforms:</strong> links to Telegram, Instagram and Facebook take you to those services, which apply their own privacy policies.</li></ul>
<h2>Contact</h2>
<p>Questions about this policy can be sent to FOXREX through the channels listed on the <a href="${b}contact/">Contact</a> page.</p>`, b => `
<p>يُحفظ تقدّم دروس ريكس وإجابات الاختبار على هذا الجهاز فقط. استخدم زر إعادة ضبط التقدّم في صفحة ريكس لمسحها.</p>
<p>${arText('توضح هذه السياسة المعلومات التي يتعامل معها موقع FOXREX على النطاق foxrex.co.')}</p>
<h2>ما الذي نجمعه</h2>
<p>لا يستخدم الموقع حسابات مستخدمين أو نماذج تواصل أو أدوات تتبع إعلانية أو ملفات تعريف ارتباط للتحليلات، ولا نبيع أي بيانات شخصية.</p>
<h2>ما يُحفظ على جهازك</h2>
<p>${arText('عند تغيير لغة الموقع يُحفظ اختيارك في التخزين المحلي لمتصفحك تحت المفتاح foxrex-lang، ويمكنك حذفه في أي وقت من إعدادات المتصفح.')}</p>
<h2>خدمات طرف ثالث</h2>
<ul><li><strong>الاستضافة:</strong> ${arText('يُقدَّم الموقع عبر GitHub Pages التي قد تسجّل بيانات تقنية للطلبات، مثل عنوان IP، لأغراض الأمان والتشغيل.')}</li><li><strong>الخطوط:</strong> ${arText('الخطوط مستضافة على foxrex.co نفسه، ولا يتم الاتصال بأي خدمة خطوط خارجية.')}</li><li><strong>المنصات الاجتماعية:</strong> ${arText('روابط Telegram وInstagram وFacebook تنقلك إلى تلك الخدمات، وتنطبق عليها سياسات الخصوصية الخاصة بها.')}</li></ul>
<h2>التواصل</h2>
<p>يمكن إرسال أي سؤال حول هذه السياسة إلى FOXREX عبر القنوات المذكورة في صفحة <a href="${b}contact/">تواصل معنا</a>.</p>`);

legal('terms', 'Terms of Use', 'شروط الاستخدام', 'Terms for using the FOXREX website and content.', 'شروط استخدام موقع FOXREX ومحتواه.', b => `
<p>By using foxrex.co you agree to these terms.</p>
<h2>Information only</h2>
<p>All FOXREX content — including analysis, news, signals and educational material — is provided for general information and education. It is not investment, financial, legal or tax advice, and it does not take your personal circumstances into account.</p>
<h2>Your decisions</h2>
<p>You are solely responsible for your trading and investment decisions. Consider seeking advice from an independent, licensed professional before trading.</p>
<h2>No guarantees</h2>
<p>We aim for accuracy but make no guarantee that content is complete, current or error-free. Markets change quickly and information may become outdated.</p>
<h2>Intellectual property</h2>
<p>The FOXREX name, logo, REX character and website content belong to FOXREX. Do not reproduce them for commercial use without written permission.</p>
<h2>Changes</h2>
<p>We may update these terms. The date at the top of this page shows the latest version.</p>
<p>See also the <a href="${b}risk-disclosure/">Risk Disclosure</a> and <a href="${b}privacy/">Privacy Policy</a>.</p>`, b => `
<p>${arText('باستخدامك موقع foxrex.co فإنك توافق على هذه الشروط.')}</p>
<h2>للمعلومات فقط</h2>
<p>${arText('كل محتوى FOXREX، بما في ذلك التحليلات والأخبار والإشارات والمواد التعليمية، مقدَّم للمعلومات العامة والتعليم. وهو ليس نصيحة استثمارية أو مالية أو قانونية أو ضريبية، ولا يأخذ ظروفك الشخصية في الاعتبار.')}</p>
<h2>قراراتك مسؤوليتك</h2>
<p>أنت وحدك المسؤول عن قرارات التداول والاستثمار التي تتخذها، وننصحك باستشارة مختص مستقل ومرخّص قبل التداول.</p>
<h2>لا ضمانات</h2>
<p>نحرص على الدقة، لكننا لا نضمن أن يكون المحتوى كاملًا أو محدّثًا أو خاليًا من الأخطاء. الأسواق تتغير بسرعة، وقد تصبح المعلومات قديمة.</p>
<h2>الملكية الفكرية</h2>
<p>${arText('اسم FOXREX وشعارها وشخصية REX ومحتوى الموقع ملك لـ FOXREX، ولا يجوز استخدامها تجاريًا دون إذن كتابي.')}</p>
<h2>التعديلات</h2>
<p>قد نحدّث هذه الشروط، ويوضح التاريخ في أعلى الصفحة أحدث نسخة منها.</p>
<p>راجع أيضًا <a href="${b}risk-disclosure/">إفصاح المخاطر</a> و<a href="${b}privacy/">سياسة الخصوصية</a>.</p>`);

legal('risk-disclosure', 'Risk Disclosure', 'إفصاح المخاطر', 'Risks of trading financial instruments including forex, gold, CFDs and cryptocurrencies.', 'مخاطر تداول الأدوات المالية، بما فيها العملات والذهب وعقود الفروقات والعملات الرقمية.', () => `
<p><strong>Trading financial instruments involves significant risk of loss and is not suitable for every investor.</strong></p>
<h2>Leverage</h2>
<p>Forex, CFDs and other leveraged products can magnify both gains and losses. A small market movement can have a large effect on your account, and you may lose more than you expect.</p>
<h2>Volatility</h2>
<p>Gold, currencies and cryptocurrencies can move sharply and quickly, especially around economic releases and central-bank decisions. Gaps and slippage can cause executions away from your intended price, including at your stop-loss.</p>
<h2>Signals and analysis</h2>
<p>FOXREX Signals and analysis are trade ideas based on our interpretation of the market. They can and do lose. Past results, where published, are not a reliable indicator of future results.</p>
<h2>Only risk what you can afford to lose</h2>
<p>Never trade with money you cannot afford to lose. Use risk management, including stop-losses and appropriate position sizing, and consider independent professional advice.</p>
<h2>Cryptocurrencies</h2>
<p>Crypto-assets may be unregulated in your jurisdiction and can lose most or all of their value.</p>`, () => `
<p><strong>تداول الأدوات المالية ينطوي على مخاطر كبيرة للخسارة، ولا يناسب كل المستثمرين.</strong></p>
<h2>الرافعة المالية</h2>
<p>${arText('تداول العملات وعقود الفروقات CFD وغيرها من المنتجات ذات الرافعة قد يضاعف الأرباح والخسائر معًا. حركة صغيرة في السوق قد يكون لها أثر كبير على حسابك، وقد تخسر أكثر مما تتوقع.')}</p>
<h2>التقلبات</h2>
<p>قد يتحرك الذهب والعملات والعملات الرقمية بحدة وسرعة، خصوصًا عند صدور البيانات الاقتصادية وقرارات البنوك المركزية. والفجوات السعرية والانزلاق قد يؤديان إلى تنفيذ الصفقة بسعر مختلف عن المقصود، بما في ذلك عند وقف الخسارة.</p>
<h2>الإشارات والتحليلات</h2>
<p>${arText('إشارات FOXREX وتحليلاتها أفكار تداول مبنية على قراءتنا للسوق، وهي قد تخسر وتخسر فعلًا. والنتائج السابقة، إن نُشرت، ليست مؤشرًا موثوقًا على النتائج المستقبلية.')}</p>
<h2>خاطر فقط بما يمكنك تحمّل خسارته</h2>
<p>لا تتداول أبدًا بأموال لا تستطيع تحمّل خسارتها. استخدم إدارة المخاطر، بما فيها وقف الخسارة وحجم المركز المناسب، وفكّر في استشارة مختص مستقل.</p>
<h2>العملات الرقمية</h2>
<p>قد تكون الأصول الرقمية غير منظمة في بلدك، ويمكن أن تفقد معظم قيمتها أو كلها.</p>`);

/* ---------- published content: permanent pages, withdrawn notices, archives ---------- */
let FEED;
try { FEED = CMS.normalizeFeed(JSON.parse(fs.readFileSync(FEED_FILE, 'utf8'))); }
catch (e) { console.error(`Cannot build content pages from ${FEED_FILE}: ${e.message}`); process.exit(1); }
const SIGNAL_CHART_FILE=path.join(ROOT,'data/market/2026-10-26-signal-charts.json');
const signalCharts=fs.existsSync(SIGNAL_CHART_FILE)?JSON.parse(fs.readFileSync(SIGNAL_CHART_FILE,'utf8')).charts:[];
const OBS_FILE=path.join(ROOT,'data/market/signal-outcome-observations.json');
const signalObservations=fs.existsSync(OBS_FILE)?JSON.parse(fs.readFileSync(OBS_FILE,'utf8')).charts:signalCharts;
const CONTENT = contentPages(FEED, { SITE, I, signalCharts, signalObservations });

const QUOTES = JSON.parse(fs.readFileSync(path.join(ROOT,'data/quotes.json'),'utf8'));
const CALENDAR = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/calendar.json'), 'utf8'));
const calendarErrors = validateCalendar(CALENDAR);
if (calendarErrors.length) throw new Error(calendarErrors.join('\n'));
PAGES.push({ id: 'calendar', path: 'calendar', title: 'Economic calendar', titleAr: 'التقويم الاقتصادي', description: 'Official-source economic events in Istanbul time, with gold and FX context.', descriptionAr: 'أحداث اقتصادية بمصادر رسمية ومواعيد بتوقيت إسطنبول لمتابعي الذهب والفوركس.', scripts: ['scripts/public/calendar.js'], body: () => calendarBody(CALENDAR, LANG) });

/* ---------- other generated files ---------- */
const contentSitemap = CONTENT.sitemap.map(u => `  <url><loc>${esc(u.loc)}</loc>${u.alternates.map(a => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${esc(a.href)}"/>`).join('')}${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`).join('\n');
const sitemapUrls = PAGES.map(p => {
  const pri = p.id === 'home' ? '1.0' : ['privacy', 'terms', 'risk-disclosure'].includes(p.id) ? '0.3' : '0.8';
  const freq = ['home', 'analysis', 'news', 'gold'].includes(p.id) ? 'daily' : 'monthly';
  const alts = `<xhtml:link rel="alternate" hreflang="en" href="${absUrl(p, 'en')}"/><xhtml:link rel="alternate" hreflang="ar" href="${absUrl(p, 'ar')}"/><xhtml:link rel="alternate" hreflang="tr" href="${absUrl(p, 'tr')}"/><xhtml:link rel="alternate" hreflang="x-default" href="${absUrl(p, 'en')}"/>`;
  return ['en', 'ar', 'tr'].map(l => `  <url><loc>${absUrl(p, l)}</loc>${alts}<changefreq>${freq}</changefreq><priority>${pri}</priority></url>`).join('\n');
}).join('\n');
const extra = {
  'scripts/public/tr.js': '/* Generated from data/locales/tr.json. */\nwindow.FOXREX_TR=' + JSON.stringify(TR) + ';\n',
  'robots.txt': `User-agent: *\nAllow: /\nDisallow: /studio/\nDisallow: /foxrex-studio.html\n\nSitemap: ${SITE.origin}/sitemap.xml\n`,
  'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapUrls}${contentSitemap ? '\n' + contentSitemap : ''}\n</urlset>\n`,
  'site.webmanifest': JSON.stringify({ name: 'FOXREX', short_name: 'FOXREX', description: SITE.description, start_url: '/', display: 'standalone', background_color: '#0B1320', theme_color: '#0B1320', icons: [{ src: '/assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/assets/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }] }, null, 2) + '\n'
};

/* ---------- write / check / plan ---------- */
const outputs = new Map();
for (const lang of ['en', 'ar', 'tr']) {
  LANG = lang;
  for (const p of PAGES) { const o = outPath(p, lang); outputs.set(o ? `${o}/index.html` : 'index.html', page(p)); }
}
const generated = [];
for (const p of CONTENT.pages) {
  LANG = p.lang;
  const rel = `${outPath(p, p.lang)}/index.html`;
  if (outputs.has(rel)) { console.error(`Content page ${p.id} would overwrite ${rel}`); process.exit(1); }
  outputs.set(rel, page(p)); generated.push(rel);
}
LANG = 'en';
for (const [k, v] of Object.entries(extra)) outputs.set(k, v);
generated.sort();
outputs.set(MANIFEST, JSON.stringify({ schemaVersion: 1, note: 'Generated by tools/site/build.mjs from data/content.json. Do not edit.', files: generated }, null, 2) + '\n');

// Content pages from a previous build that the feed no longer produces are removed (only files carrying the generated mark).
const prevManifest = (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, MANIFEST), 'utf8')).files || []; } catch { return []; } })();
const orphans = prevManifest.filter(f => !outputs.has(f) && /^[a-z0-9/_-]+\/index\.html$/.test(f) && fs.existsSync(path.join(OUT, f)) && fs.readFileSync(path.join(OUT, f), 'utf8').includes(GENERATED_MARK));

const stale = [], written = [];
for (const [rel, html] of outputs) {
  const file = path.join(OUT, rel);
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (cur === html) continue;
  if (CHECK || PLAN) { stale.push(rel); continue; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  written.push(rel);
  console.log('wrote', rel);
}
if (PLAN) {
  console.log(JSON.stringify({ write: stale, remove: orphans, contentPages: generated.length }, null, 2));
  process.exit(0);
}
if (CHECK) {
  if (stale.length || orphans.length) { console.error('Stale generated site files (run node tools/site/build.mjs):\n  ' + [...stale, ...orphans.map(o => `${o} (orphan)`)].join('\n  ')); process.exit(1); }
  console.log(`Public site output is up to date (${outputs.size} files, ${generated.length} content pages).`);
} else {
  for (const o of orphans) {
    fs.rmSync(path.join(OUT, o));
    let dir = path.dirname(path.join(OUT, o));
    while (dir.startsWith(OUT) && dir !== OUT && !fs.readdirSync(dir).length) { fs.rmdirSync(dir); dir = path.dirname(dir); }
    console.log('removed', o);
  }
}
