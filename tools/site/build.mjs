#!/usr/bin/env node
/* Builds the static FOXREX public website into the repository root, in two editions:
     English  → /            <html lang="en" dir="ltr">
     Arabic   → /ar/         <html lang="ar" dir="rtl">
   Each edition is real, URL-addressable HTML with its own canonical, hreflang, titles and
   Open Graph. Arabic is composed for Arabic (styles/ar.css, --ar-* tokens), not toggled.
   Usage: node tools/site/build.mjs          (writes files)
          node tools/site/build.mjs --check  (exits 1 if committed output is stale)
   No dependencies. Output uses relative URLs so it works on foxrex.co and a local server. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, MARKETS, MARKET_API, SCHEDULE, SCHEDULE_EXTRA, ANALYSIS_CATEGORIES, NEWS_CATEGORIES, REX } from './content.mjs';
if (MARKET_API && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(MARKET_API)) throw new Error('MARKET_API must be an https origin without a path (or empty)');
import { esc, enText, arText } from './text.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CHECK = process.argv.includes('--check');
const UPDATED = { en: '30 September 2026', ar: '30 سبتمبر 2026' };

/* ---------- language context ---------- */
let LANG = 'en';
const AR = () => LANG === 'ar';
/** Localised text: t(english, arabic). Arabic isolates Latin/number runs in <bdi class="lt">. "\n" → line break. */
const t = (en, ar) => AR() ? arText(ar ?? en) : enText(en);
const tp = pair => t(pair[0], pair[1]);

const I = {
  arrow: '<svg class="fx-flip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
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
  ['markets', 'Markets', 'الأسواق'], ['analysis', 'Analysis', 'التحليلات'], ['news', 'News', 'الأخبار'],
  ['learn', 'Learn', 'تعلّم'], ['signals', 'Signals', 'الإشارات']
];

/* ---------- URL helpers ---------- */
const outPath = (p, lang) => [lang === 'ar' ? 'ar' : '', p.path].filter(Boolean).join('/');
const absUrl = (p, lang) => { const o = outPath(p, lang); return SITE.origin + (o ? `/${o}/` : '/'); };

/* ---------- layout ---------- */
function head(p, r) {
  const ar = AR();
  const url = absUrl(p, LANG);
  const pt = ar ? (p.titleAr ?? p.title) : p.title;
  const title = pt ? `${pt} — FOXREX` : (ar ? 'FOXREX — تداول أذكى... فرص أكبر' : 'FOXREX — Trade Smarter. Go Further.');
  const desc = ar ? (p.descriptionAr || SITE.descriptionAr) : (p.description || SITE.description);
  const og = ar ? 'og-image-ar.png' : 'og-image.png';
  const preload = (ar ? ['ibm-plex-sans-arabic-arabic-400-normal', 'ibm-plex-sans-arabic-arabic-700-normal'] : ['inter-latin-400-normal', 'inter-latin-800-normal'])
    .map(f => `<link rel="preload" href="${r}assets/fonts/${f}.woff2" as="font" type="font/woff2" crossorigin>`).join('\n');
  return `<!doctype html>
<html lang="${ar ? 'ar' : 'en'}" dir="${ar ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="en" href="${absUrl(p, 'en')}">
<link rel="alternate" hreflang="ar" href="${absUrl(p, 'ar')}">
<link rel="alternate" hreflang="x-default" href="${absUrl(p, 'en')}">
<meta name="theme-color" content="#0B1320">
<meta name="color-scheme" content="dark">
<link rel="icon" type="image/png" sizes="32x32" href="${r}assets/brand/favicon-32.png">
<link rel="apple-touch-icon" href="${r}assets/brand/apple-touch-icon.png">
<link rel="manifest" href="${r}site.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="FOXREX">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE.origin}/assets/brand/${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${ar ? 'FOXREX — تداول أذكى... فرص أكبر' : 'FOXREX — Trade smarter. Go further.'}">
<meta property="og:locale" content="${ar ? 'ar_AR' : 'en_US'}">
<meta property="og:locale:alternate" content="${ar ? 'en_US' : 'ar_AR'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE.origin}/assets/brand/${og}">
<script>document.documentElement.className+=" js";</script>
${preload}
<link rel="stylesheet" href="${r}styles/fonts.css">
<link rel="stylesheet" href="${r}styles/tokens.css">
<link rel="stylesheet" href="${r}styles/base.css">
<link rel="stylesheet" href="${r}styles/components.css">
<link rel="stylesheet" href="${r}styles/public.css">
${ar ? `<link rel="stylesheet" href="${r}styles/ar.css">\n` : ''}${p.jsonld ? `<script type="application/ld+json">${JSON.stringify(p.jsonld(ar))}</script>\n` : ''}</head>`;
}

const logo = b => `<a class="fx-logo" href="${b || './'}" aria-label="${AR() ? 'FOXREX — الرئيسية' : 'FOXREX home'}"><img src="${LOGO_SRC}" width="175" height="146" alt=""><b>FOX<span>REX</span></b></a>`;
let LOGO_SRC = '';

function header(active, r, b, alt) {
  const link = ([k, en, ar]) => `<a href="${b}${k}/"${active === k ? ' aria-current="page"' : ''}>${t(en, ar)}</a>`;
  const sw = AR()
    ? `<a class="lang-toggle" href="${alt}" hreflang="en" lang="en" data-lang-switch="en">English</a>`
    : `<a class="lang-toggle" href="${alt}" hreflang="ar" lang="ar" data-lang-switch="ar">العربية</a>`;
  return `<a class="skip" href="#main">${t('Skip to content', 'انتقل إلى المحتوى')}</a>
<header class="site-head">
  <div class="wrap">
    ${logo(b)}
    <nav class="site-nav" aria-label="${AR() ? 'التنقل الرئيسي' : 'Primary'}">${NAV.map(link).join('')}</nav>
    <div class="site-head__end">
      ${sw}
      <a class="fx-btn fx-btn--primary fx-btn--sm" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">${t('Join FOXREX', 'انضم إلى FOXREX')}</a>
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="${AR() ? 'القائمة' : 'Menu'}" data-menu-btn>${I.menu}</button>
    </div>
  </div>
</header>
<nav class="mobile-nav" id="mobile-nav" aria-label="${AR() ? 'قائمة الجوال' : 'Mobile'}" data-open="false">
  ${[['', 'Home', 'الرئيسية'], ...NAV, ['gold', 'Gold', 'الذهب'], ['about', 'About', 'من نحن'], ['contact', 'Contact', 'تواصل معنا']].map(([k, en, ar]) => `<a href="${b}${k ? k + '/' : ''}"${active === (k || 'home') ? ' aria-current="page"' : ''}>${t(en, ar)}</a>`).join('\n  ')}
  <a href="${alt}" hreflang="${AR() ? 'en' : 'ar'}" lang="${AR() ? 'en' : 'ar'}" data-lang-switch="${AR() ? 'en' : 'ar'}">${AR() ? 'English' : 'العربية'}</a>
  <a class="fx-btn fx-btn--primary" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">${t('Join FOXREX on Telegram', 'انضم إلى FOXREX على Telegram')}</a>
</nav>`;
}

function socialLinks() {
  return Object.entries(SITE.social).filter(([, s]) => s.url).map(([k, s]) => `<a href="${s.url}" target="_blank" rel="noopener" aria-label="${s.label}">${I[k]}</a>`).join('');
}

function footer(r, b) {
  const col = (h, items) => `<div><h2>${h}</h2><ul>${items.map(([href, label]) => `<li>${href ? `<a href="${href}">${label}</a>` : `<span class="muted">${label}</span>`}</li>`).join('')}</ul></div>`;
  const s = SITE.social;
  return `<footer class="site-foot">
  <div class="wrap">
    <div class="site-foot__grid">
      <div>
        ${logo(b)}
        ${AR() ? `<p class="site-foot__ar">${esc(SITE.taglineAr)}</p><p class="site-foot__tag">${SITE.tagline}</p>`
               : `<p class="site-foot__tag">${SITE.tagline}</p><p style="margin-top:10px" lang="ar" dir="rtl">${esc(SITE.taglineAr)}</p>`}
        <div class="social" aria-label="${AR() ? 'حسابات FOXREX' : 'FOXREX social'}">${socialLinks()}</div>
      </div>
      ${col(t('Explore', 'استكشف'), [[`${b}markets/`, t('Markets', 'الأسواق')], [`${b}gold/`, t('Gold', 'الذهب')], [`${b}analysis/`, t('Analysis', 'التحليلات')], [`${b}news/`, t('News', 'الأخبار')], [`${b}learn/`, t('Learn', 'تعلّم')], [`${b}signals/`, t('Signals', 'الإشارات')]])}
      ${col(t('Company', 'FOXREX'), [[`${b}about/`, t('About', 'من نحن')], [`${b}contact/`, t('Contact', 'تواصل معنا')], [`${b}privacy/`, t('Privacy', 'الخصوصية')], [`${b}terms/`, t('Terms', 'شروط الاستخدام')], [`${b}risk-disclosure/`, t('Risk Disclosure', 'إفصاح المخاطر')]])}
      ${col(t('Follow', 'تابعنا'), [[s.telegram.url, 'Telegram'], [s.instagram.url, 'Instagram'], [s.facebook.url, 'Facebook'], [null, AR() ? `${arText('WhatsApp')} · قريبًا` : 'WhatsApp · coming soon']])}
    </div>
    <div class="site-foot__legal">
      <p>${t('Risk warning: trading financial instruments carries a high level of risk and may not be suitable for all investors. You can lose some or all of your capital. FOXREX content is for information and education only and is not investment advice.', 'تحذير المخاطر: تداول الأدوات المالية ينطوي على مخاطر عالية وقد لا يناسب جميع المستثمرين، وقد تخسر جزءًا من رأس مالك أو كله. محتوى FOXREX للمعلومات والتعليم فقط، ولا يُعد نصيحة استثمارية.')} <a href="${b}risk-disclosure/" style="text-decoration:underline">${t('Read the full risk disclosure', 'اقرأ إفصاح المخاطر كاملًا')}</a>.</p>
      <p class="en" dir="ltr">© <span data-year>2026</span> FOXREX. All rights reserved.</p>
    </div>
  </div>
</footer>`;
}

function page(p) {
  const o = outPath(p, LANG);
  const r = o ? '../'.repeat(o.split('/').length) : '';
  const b = r + (AR() ? 'ar/' : '');
  LOGO_SRC = `${r}assets/brand/foxrex-mark.png`;
  const altOut = outPath(p, AR() ? 'en' : 'ar');
  const alt = r + (altOut ? altOut + '/' : '') || './';
  const scripts = ['scripts/public/site.js', ...(p.scripts || [])].map(s => `<script src="${r}${s}" defer></script>`).join('\n');
  return `${head(p, r)}
<body data-root="${r}" data-page="${p.id}" data-lang="${LANG}">
${header(p.id, r, b, alt)}
<main id="main">
${p.body(r, b)}
</main>
${footer(r, b)}
${scripts}
</body>
</html>
`;
}

/* ---------- reusable blocks ---------- */
const sectionHead = (kicker, h, p, cta) => `<div class="section-head reveal"><div><span class="fx-kicker">${kicker}</span><h2>${h}</h2>${p ? `<p>${p}</p>` : ''}</div>${cta || ''}</div>`;
const pageHero = (kicker, h, p) => `<section class="page-hero"><div class="wrap"><span class="fx-kicker">${kicker}</span><h1>${h}</h1>${p ? `<p>${p}</p>` : ''}</div></section>`;
const empty = (h, p) => `<div class="fx-empty"><strong>${h}</strong><span>${p}</span></div>`;
const more = (href, en, ar) => `<a class="fx-link" href="${href}">${t(en, ar)} ${I.arrow}</a>`;

function ticker() {
  return `<section class="fx-ticker" aria-label="${AR() ? 'نظرة على الأسواق' : 'Market overview'}" data-market-ticker${MARKET_API ? ` data-market-api="${esc(MARKET_API)}"` : ''}>
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
    <p class="fx-card__meta" data-gold="pricenote" hidden></p>
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

function heroEn(b) {
  return `<section class="hero">
  <div class="wrap hero__grid">
    <div>
      <span class="fx-badge fx-badge--primary"><i></i>Market intelligence &amp; trading education</span>
      <h1><span>TRADE SMARTER.</span><span class="accent">GO FURTHER.</span></h1>
      <p class="hero__ar" lang="ar" dir="rtl">${esc(SITE.taglineAr)}</p>
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

PAGES.push({ id: 'home', path: '', scripts: ['scripts/public/market.js', 'scripts/public/content.js'],
  jsonld: ar => ({ '@context': 'https://schema.org', '@type': 'Organization', name: 'FOXREX', url: SITE.origin + (ar ? '/ar/' : '/'), inLanguage: ar ? 'ar' : 'en', logo: `${SITE.origin}/assets/brand/icon-512.png`, slogan: ar ? SITE.taglineAr : 'Trade smarter. Go further.', sameAs: Object.values(SITE.social).map(s => s.url).filter(Boolean) }),
  body: (r, b) => `
${AR() ? heroAr(b) : heroEn(b)}
${ticker()}

<section class="section">
  <div class="wrap">
    ${sectionHead(t('Today at FOXREX', 'اليوم في FOXREX'), t('The daily FOXREX desk', 'كل ما تحتاجه لمتابعة يوم التداول.'), t('A fixed editorial rhythm, in Istanbul time, so you always know when the next update lands.', 'إيقاع تحريري ثابت بتوقيت إسطنبول، لتعرف دائمًا متى يصلك التحديث التالي.'), more(`${b}analysis/`, 'All analysis', 'كل التحليلات'))}
    ${todaySlots()}
  </div>
</section>

<section class="section section--raised">
  <div class="wrap">
    ${sectionHead(t('Gold', 'تركيز الذهب'), t('Gold, every trading day.', 'الذهب... كل يوم تداول.'), t('XAUUSD is a core FOXREX pillar: bias, key levels and both scenarios in one view.', 'الذهب XAUUSD محور أساسي في FOXREX: الاتجاه، والمستويات الرئيسية، والسيناريوهان في قراءة واحدة.'))}
    ${goldFocus(b)}
  </div>
</section>

<section class="section">
  <div class="wrap">
    ${sectionHead(t('Latest analysis', 'أحدث التحليلات'), t('Analysis you can act on — or decide to skip.', 'تحليل يساعدك على التحرك...\nأو الانتظار.'), null, more(`${b}analysis/`, 'View all', 'عرض الكل'))}
    ${analysisGrid(3)}
  </div>
</section>

<section class="section section--raised">
  <div class="wrap">
    ${sectionHead(t('Market news', 'أخبار السوق'), t('What moved, and why it matters.', 'ما الذي تحرك...\nولماذا يهم؟'), null, more(`${b}news/`, 'All news', 'كل الأخبار'))}
    ${tabs(NEWS_CATEGORIES, 'data-news-tabs')}
    ${newsList(6)}
  </div>
</section>

<section class="section">
  <div class="wrap">${signalsBlock(b, false)}</div>
</section>

<section class="section section--raised">
  <div class="wrap rex">
    <div class="rex__id reveal">
      <div class="rex__av"><img src="${r}assets/rex/rex-arms.jpg" width="116" height="106" alt="${AR() ? 'REX، ثعلب FOXREX' : 'REX, the FOXREX fox'}" loading="lazy"></div>
      <div><span class="fx-kicker">REX</span><h2 style="font-size:24px;margin-top:6px">${t('Learn with REX', 'تعلّم مع REX')}</h2><p class="muted" style="margin-top:8px;font-size:15px">${t('Short, clear lessons on the ideas behind every market move.', 'دروس قصيرة وواضحة عن الأفكار التي تقف خلف كل حركة في السوق.')}</p></div>
      <div class="rex__types"><span class="fx-badge fx-badge--primary">REX EXPLAINS</span><span class="fx-badge">REX NOTE</span><span class="fx-badge fx-badge--ai">ASK REX</span></div>
    </div>
    <div>
      <div class="grid grid--2">${rexCards(b, 4)}</div>
      <p style="margin-top:22px" class="reveal">${more(`${b}learn/`, 'All REX lessons', 'كل دروس REX')} <span class="muted" style="margin-inline-start:14px;font-size:14px">${t('Have a question? Ask REX on Telegram.', 'لديك سؤال؟ اسأل REX على Telegram.')}</span></p>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    ${sectionHead(t('Why FOXREX', 'لماذا FOXREX'), t('An intelligence ecosystem, built in the open.', 'منظومة ذكاء للأسواق...\nمبنية على نظام واحد.'), t('Some capabilities are live today and others are being built. We label the difference.', 'بعض القدرات متاحة اليوم، وبعضها قيد البناء، ونوضّح الفرق دائمًا.'))}
    <div class="why reveal">
      <div>${I.data}<h3>${t('Data', 'البيانات')}</h3><p>${t('Verified market data only. When a feed is not connected, we say so instead of showing estimates.', 'بيانات سوق موثقة فقط. وعندما لا يكون المصدر متصلًا نقول ذلك بوضوح بدل عرض تقديرات.')}</p></div>
      <div>${I.chart}<h3>${t('Market Analysis', 'تحليل الأسواق')}</h3><p>${t('Structure, levels and scenarios across gold, FX, indices and crypto.', 'البنية والمستويات والسيناريوهات للذهب والعملات والمؤشرات والعملات الرقمية.')}</p></div>
      <div>${I.ai}<h3>${t('AI Intelligence', 'الذكاء الاصطناعي')} <span class="fx-badge fx-badge--ai" style="margin-inline-start:6px">${t('In development', 'قيد التطوير')}</span></h3><p>${t('AI assists our research and content workflow. Every output is reviewed by a person before it is published.', 'يساعد الذكاء الاصطناعي في البحث وإنتاج المحتوى، ويُراجع كل مخرج بشريًا قبل نشره.')}</p></div>
      <div>${I.shield}<h3>${t('Risk Awareness', 'الوعي بالمخاطر')}</h3><p>${t('Every idea ships with an invalidation level and a clear risk message.', 'كل فكرة تُنشر مع مستوى إلغاء ورسالة مخاطر واضحة.')}</p></div>
      <div>${I.bolt}<h3>${t('Speed', 'السرعة')}</h3><p>${t('A fixed daily schedule plus real-time coverage of high-impact releases.', 'جدول يومي ثابت، وتغطية لحظية للبيانات عالية التأثير.')}</p></div>
      <div>${I.research}<h3>${t('Research', 'البحث')}</h3><p>${t('Macro drivers explained, so you understand the move — not just the level.', 'نشرح المحركات الاقتصادية لتفهم الحركة نفسها، لا المستوى فقط.')}</p></div>
    </div>
  </div>
</section>

<section class="section section--tight">
  <div class="wrap">
    <div class="join reveal">
      <div><h2>${t('Join the FOXREX community', 'انضم إلى مجتمع FOXREX')}</h2><p>${t('Daily briefs, gold focus, signals and REX lessons — first on Telegram.', 'الموجز اليومي، وتركيز الذهب، والإشارات، ودروس REX... أولًا على Telegram.')}</p></div>
      <div class="join__ctas">
        <a class="fx-btn fx-btn--primary" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">${I.telegram} Telegram</a>
        <a class="fx-btn fx-btn--ghost" href="${SITE.social.instagram.url}" target="_blank" rel="noopener">${I.instagram} Instagram</a>
        <a class="fx-btn fx-btn--ghost" href="${SITE.social.facebook.url}" target="_blank" rel="noopener">${I.facebook} Facebook</a>
      </div>
    </div>
  </div>
</section>` });

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

PAGES.push({ id: 'analysis', path: 'analysis', title: 'Analysis', titleAr: 'التحليلات', description: 'FOXREX market analysis: technical analysis, macro, gold, FX, indices and crypto.', descriptionAr: 'تحليلات FOXREX للأسواق: تحليل فني، واقتصاد كلي، والذهب، والعملات، والمؤشرات، والعملات الرقمية.', scripts: ['scripts/public/content.js'],
  body: () => `${pageHero(t('Analysis', 'التحليلات'), t('Market analysis', 'تحليل يساعدك على التحرك...\nأو الانتظار.'), t('Technical structure and macro context, with a bias, levels and a clear invalidation for every idea.', 'بنية فنية وسياق اقتصادي، مع اتجاه ومستويات ومستوى إلغاء واضح لكل فكرة.'))}
<section class="section section--tight"><div class="wrap">
  ${tabs(ANALYSIS_CATEGORIES, 'data-analysis-tabs')}
  ${analysisGrid()}
</div></section>` });

PAGES.push({ id: 'news', path: 'news', title: 'Market News', titleAr: 'أخبار السوق', description: 'FOXREX market news: high-impact releases, economic data, central banks, commodities and FX.', descriptionAr: 'أخبار السوق من FOXREX: البيانات عالية التأثير، والاقتصاد، والبنوك المركزية، والسلع، والعملات.', scripts: ['scripts/public/content.js'],
  body: () => `${pageHero(t('News', 'الأخبار'), t('Market news', 'ما الذي تحرك...\nولماذا يهم؟'), t('Economic releases and market-moving headlines with their importance and the markets they affect.', 'البيانات الاقتصادية والعناوين المؤثرة، مع أهميتها والأسواق التي تتأثر بها.'))}
<section class="section section--tight"><div class="wrap">
  ${tabs(NEWS_CATEGORIES, 'data-news-tabs')}
  ${newsList()}
</div></section>` });

PAGES.push({ id: 'learn', path: 'learn', title: 'Learn with REX', titleAr: 'تعلّم مع REX', description: 'REX Explains: short trading lessons on CPI, gold and yields, breakouts, market structure and risk/reward.', descriptionAr: 'REX يشرح: دروس تداول قصيرة عن CPI، والذهب والعوائد، والاختراق، وبنية السوق، ونسبة المخاطرة إلى العائد.', scripts: ['scripts/public/content.js'],
  body: (r) => `${pageHero('REX', t('Learn with REX', 'تعلّم مع REX'), t('Clear explanations of the ideas behind market moves. Educational content only — not investment advice.', 'شرح واضح للأفكار التي تقف خلف حركة الأسواق. محتوى تعليمي فقط، وليس نصيحة استثمارية.'))}
<section class="section section--tight"><div class="wrap rex">
  <aside class="rex__id">
    <div class="rex__av"><img src="${r}assets/rex/rex-arms.jpg" width="116" height="106" alt="${AR() ? 'REX، ثعلب FOXREX' : 'REX, the FOXREX fox'}"></div>
    <nav aria-label="${AR() ? 'الدروس' : 'Lessons'}"><ul style="list-style:none;margin:0;padding:0;display:grid;gap:8px;font-size:14px">${REX.map(x => `<li><a class="muted" href="#${x.id}">${tp(x.title)}</a></li>`).join('')}</ul></nav>
    <div class="rex__types"><span class="fx-badge fx-badge--primary">REX EXPLAINS</span><span class="fx-badge">REX NOTE</span><span class="fx-badge fx-badge--ai">ASK REX</span></div>
  </aside>
  <div>
  <div data-learn-list style="margin-bottom:48px"></div>
  ${REX.map(x => `<article class="article" id="${x.id}"><span class="fx-kicker">${esc(x.type)}</span><h2>${tp(x.title)}</h2>
    ${x.body[AR() ? 1 : 0].map(p => `<p>${AR() ? arText(p) : esc(p)}</p>`).join('')}
    <p class="takeaway"><strong>REX:</strong> ${tp(x.takeaway)}</p></article>`).join('\n  ')}
    <div class="article"><span class="fx-kicker">ASK REX</span><h2>${t('Have a question?', 'لديك سؤال؟')}</h2><p>${t('Send your question to FOXREX on Telegram. Selected questions become future REX lessons.', 'أرسل سؤالك إلى FOXREX على Telegram، وتتحول الأسئلة المختارة إلى دروس REX قادمة.')}</p><p style="margin-top:18px"><a class="fx-btn fx-btn--primary" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">${I.telegram} ${t('Ask REX', 'اسأل REX')}</a></p></div>
  </div>
</div></section>` });

PAGES.push({ id: 'signals', path: 'signals', title: 'FOXREX Signals', titleAr: 'إشارات FOXREX', description: 'How FOXREX Signals work: documented trade ideas with entry, stop-loss and targets, delivered on Telegram with clear risk awareness.', descriptionAr: 'كيف تعمل إشارات FOXREX: أفكار تداول موثقة بالدخول ووقف الخسارة والأهداف، تصل عبر Telegram مع وضوح كامل بشأن المخاطر.', scripts: ['scripts/public/content.js'],
  body: (r, b) => `${pageHero(t('FOXREX Signals', 'إشارات FOXREX'), t('Signals, with their risk.', 'إشارات... مع مخاطرها.'), t('What a FOXREX Signal contains, how it is delivered and how results are recorded.', 'ما الذي تتضمنه إشارة FOXREX، وكيف تصلك، وكيف تُوثَّق نتائجها.'))}
<section class="section section--tight"><div class="wrap">${signalsBlock(b, true)}</div></section>
<section class="section section--tight section--raised"><div class="wrap">
  ${sectionHead(t('Anatomy', 'مكونات الإشارة'), t('What every signal includes', 'ما الذي تتضمنه كل إشارة؟'))}
  <div class="grid grid--4">
  ${[[['Instrument & direction', 'الأداة والاتجاه'], ['For example XAUUSD — buy or sell.', 'مثل XAUUSD، شراءً أو بيعًا.']], [['Entry zone', 'منطقة الدخول'], ['The price area where the idea is valid.', 'نطاق السعر الذي تكون فيه الفكرة صالحة.']], [['Stop-loss', 'وقف الخسارة'], ['Where the idea is wrong. Always defined first.', 'النقطة التي تصبح عندها الفكرة خاطئة، ويُحدَّد دائمًا أولًا.']], [['Targets & validity', 'الأهداف والصلاحية'], ['Take-profit levels and how long the idea stays active.', 'مستويات جني الأرباح، والمدة التي تبقى فيها الفكرة قائمة.']]].map(([h, p]) => `<div class="fx-card reveal"><h3>${tp(h)}</h3><p>${tp(p)}</p></div>`).join('')}
  </div>
</div></section>` });

PAGES.push({ id: 'about', path: 'about', title: 'About', titleAr: 'من نحن', description: 'About FOXREX — a market-intelligence and trading-education brand.', descriptionAr: 'عن FOXREX: علامة عربية لذكاء الأسواق وتعليم التداول.',
  body: () => `${pageHero(t('About', 'من نحن'), t('Intelligence over noise.', 'الذكاء قبل الضجيج.'), t('FOXREX is a market-intelligence and trading-education brand for traders who want structure, context and honesty about risk.', 'FOXREX علامة لذكاء الأسواق وتعليم التداول، لمن يريد البنية والسياق والصراحة الكاملة بشأن المخاطر.'))}
<section class="section section--tight"><div class="wrap prose">
  ${AR() ? `
  <h2>ماذا نقدم</h2>
  <p>${arText('ننشر تحليلات يومية للأسواق مع تركيز خاص على الذهب وأزواج العملات الرئيسية والمؤشرات والعملات الرقمية، ونشرح الأخبار الاقتصادية وقرارات البنوك المركزية، ونشارك إشارات FOXREX على Telegram، ونعلّم المفاهيم التي تقف خلفها عبر REX، هويتنا التعليمية.')}</p>
  <h2>كيف نعمل</h2>
  <ul><li><strong>لا بيانات وهمية.</strong> لا ننشر أسعارًا أو أداءً أو نسب نجاح أو أعداد مستخدمين مختلقة، وعندما لا تتوفر البيانات نقول ذلك.</li><li><strong>المخاطرة أولًا.</strong> كل فكرة تأتي مع مستوى إلغاء ورسالة مخاطر واضحة.</li><li><strong>الإنسان يراجع الذكاء الاصطناعي.</strong> يساعد الذكاء الاصطناعي في البحث والإنتاج، ويراجع شخص من الفريق كل محتوى قبل نشره.</li><li><strong>تعليم، لا نصيحة.</strong> محتوانا يساعدك على التفكير، ولا يخبرك بما تفعله بأموالك.</li></ul>
  <h2>تعرّف على REX</h2>
  <p>${arText('REX هو ثعلب FOXREX، وتوقيعنا على المحتوى التعليمي: REX يشرح، وملاحظة REX، واسأل REX.')}</p>` : `
  <h2>What we do</h2>
  <p>We publish daily market analysis with a focus on gold, major FX pairs, indices and crypto; explain economic news and central-bank decisions; share FOXREX Signals on Telegram; and teach the concepts behind them through REX, our educational identity.</p>
  <h2>How we work</h2>
  <ul><li><strong>No fake data.</strong> We never publish invented prices, performance, win rates or user numbers. When data is unavailable, we say so.</li><li><strong>Risk first.</strong> Every idea carries an invalidation level and a risk message.</li><li><strong>People review AI.</strong> AI helps our research and production workflow; a person reviews every piece before it is published.</li><li><strong>Education, not advice.</strong> Our content helps you think — it does not tell you what to do with your money.</li></ul>
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
<p>If you switch language, your choice is saved in your browser's local storage under the key <code>foxrex-lang</code>. You can clear it at any time through your browser settings.</p>
<h2>Third-party services</h2>
<ul><li><strong>Hosting:</strong> the site is served by GitHub Pages, which may log technical request data such as IP addresses for security and operations.</li><li><strong>Fonts:</strong> fonts are hosted on foxrex.co itself; no third-party font service is contacted.</li><li><strong>Social platforms:</strong> links to Telegram, Instagram and Facebook take you to those services, which apply their own privacy policies.</li></ul>
<h2>Contact</h2>
<p>Questions about this policy can be sent to FOXREX through the channels listed on the <a href="${b}contact/">Contact</a> page.</p>`, b => `
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

/* ---------- other generated files ---------- */
const sitemapUrls = PAGES.map(p => {
  const pri = p.id === 'home' ? '1.0' : ['privacy', 'terms', 'risk-disclosure'].includes(p.id) ? '0.3' : '0.8';
  const freq = ['home', 'analysis', 'news', 'gold'].includes(p.id) ? 'daily' : 'monthly';
  const alts = `<xhtml:link rel="alternate" hreflang="en" href="${absUrl(p, 'en')}"/><xhtml:link rel="alternate" hreflang="ar" href="${absUrl(p, 'ar')}"/><xhtml:link rel="alternate" hreflang="x-default" href="${absUrl(p, 'en')}"/>`;
  return ['en', 'ar'].map(l => `  <url><loc>${absUrl(p, l)}</loc>${alts}<changefreq>${freq}</changefreq><priority>${pri}</priority></url>`).join('\n');
}).join('\n');
const extra = {
  'robots.txt': `User-agent: *\nAllow: /\nDisallow: /studio/\nDisallow: /foxrex-studio.html\n\nSitemap: ${SITE.origin}/sitemap.xml\n`,
  'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapUrls}\n</urlset>\n`,
  'site.webmanifest': JSON.stringify({ name: 'FOXREX', short_name: 'FOXREX', description: SITE.description, start_url: '/', display: 'standalone', background_color: '#0B1320', theme_color: '#0B1320', icons: [{ src: '/assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/assets/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }] }, null, 2) + '\n'
};

/* ---------- write / check ---------- */
const outputs = new Map();
for (const lang of ['en', 'ar']) {
  LANG = lang;
  for (const p of PAGES) { const o = outPath(p, lang); outputs.set(o ? `${o}/index.html` : 'index.html', page(p)); }
}
LANG = 'en';
for (const [k, v] of Object.entries(extra)) outputs.set(k, v);

const stale = [];
for (const [rel, html] of outputs) {
  const file = path.join(ROOT, rel);
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (cur === html) continue;
  if (CHECK) { stale.push(rel); continue; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  console.log('wrote', rel);
}
if (CHECK) {
  if (stale.length) { console.error('Stale generated site files (run node tools/site/build.mjs):\n  ' + stale.join('\n  ')); process.exit(1); }
  console.log(`Public site output is up to date (${outputs.size} files).`);
}
