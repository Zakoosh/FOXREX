#!/usr/bin/env node
/* Builds the static FOXREX public website into the repository root.
   Usage: node tools/site/build.mjs        (writes files)
          node tools/site/build.mjs --check (exits 1 if committed output is stale)
   No dependencies. Output uses relative URLs so it works on foxrex.co and on
   a local static server. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, MARKETS, SCHEDULE, SCHEDULE_EXTRA, ANALYSIS_CATEGORIES, NEWS_CATEGORIES, REX } from './content.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CHECK = process.argv.includes('--check');
const UPDATED = '30 September 2026';

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Bilingual inline text. The inactive language is hidden with CSS (see base.css). */
const t = (en, ar) => ar == null ? esc(en) : `<span class="l-en">${esc(en)}</span><span class="l-ar" lang="ar">${esc(ar)}</span>`;
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

/* ---------- layout ---------- */
function head(p, r) {
  const url = SITE.origin + (p.path === '' ? '/' : `/${p.path}/`);
  const title = p.title ? `${p.title} — FOXREX` : 'FOXREX — Trade Smarter. Go Further.';
  const desc = p.description || SITE.description;
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="en" href="${url}">
<link rel="alternate" hreflang="ar" href="${url}?lang=ar">
<link rel="alternate" hreflang="x-default" href="${url}">
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
<meta property="og:image" content="${SITE.origin}/assets/brand/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="FOXREX — Trade smarter. Go further.">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="ar_AR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE.origin}/assets/brand/og-image.png">
<script>(function(){var d=document.documentElement,l=null;d.className+=" js";try{l=new URLSearchParams(location.search).get("lang")||localStorage.getItem("foxrex-lang")}catch(e){}if(l==="ar"){d.lang="ar";d.dir="rtl"}})();</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;1,800&display=swap">
<link rel="stylesheet" href="${r}styles/tokens.css">
<link rel="stylesheet" href="${r}styles/base.css">
<link rel="stylesheet" href="${r}styles/components.css">
<link rel="stylesheet" href="${r}styles/public.css">
${p.jsonld ? `<script type="application/ld+json">${JSON.stringify(p.jsonld)}</script>\n` : ''}</head>`;
}

const logo = r => `<a class="fx-logo" href="${r || './'}" aria-label="FOXREX home"><img src="${r}assets/brand/foxrex-mark.png" width="175" height="146" alt=""><b>FOX<span>REX</span></b></a>`;

function header(active, r) {
  const link = ([k, en, ar]) => `<a href="${r}${k}/"${active === k ? ' aria-current="page"' : ''}>${t(en, ar)}</a>`;
  return `<a class="skip" href="#main">${t('Skip to content', 'انتقل إلى المحتوى')}</a>
<header class="site-head">
  <div class="wrap">
    ${logo(r)}
    <nav class="site-nav" aria-label="Primary">${NAV.map(link).join('')}</nav>
    <div class="site-head__end">
      <button class="lang-toggle" type="button" data-lang-toggle aria-label="Switch language"><span class="l-en" lang="ar">عربي</span><span class="l-ar">EN</span></button>
      <a class="fx-btn fx-btn--primary fx-btn--sm" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">${t('Join FOXREX', 'انضم إلى FOXREX')}</a>
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="Menu" data-menu-btn>${I.menu}</button>
    </div>
  </div>
</header>
<nav class="mobile-nav" id="mobile-nav" aria-label="Mobile" data-open="false">
  ${[['', 'Home', 'الرئيسية'], ...NAV, ['gold', 'Gold', 'الذهب'], ['about', 'About', 'من نحن'], ['contact', 'Contact', 'تواصل']].map(([k, en, ar]) => `<a href="${r}${k ? k + '/' : ''}"${active === (k || 'home') ? ' aria-current="page"' : ''}>${t(en, ar)}</a>`).join('\n  ')}
  <a class="fx-btn fx-btn--primary" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">${t('Join FOXREX on Telegram', 'انضم إلى FOXREX على تيليجرام')}</a>
</nav>`;
}

function socialLinks() {
  return Object.entries(SITE.social).filter(([, s]) => s.url).map(([k, s]) => `<a href="${s.url}" target="_blank" rel="noopener" aria-label="${s.label}">${I[k]}</a>`).join('');
}

function footer(r) {
  const col = (h, items) => `<div><h2>${h}</h2><ul>${items.map(([href, label]) => `<li>${href ? `<a href="${href}">${label}</a>` : `<span class="muted">${label}</span>`}</li>`).join('')}</ul></div>`;
  const s = SITE.social;
  return `<footer class="site-foot">
  <div class="wrap">
    <div class="site-foot__grid">
      <div>
        ${logo(r)}
        <p class="site-foot__tag">${SITE.tagline}</p>
        <p style="margin-top:10px" lang="ar" class="l-any">${SITE.taglineAr}</p>
        <div class="social" aria-label="FOXREX social">${socialLinks()}</div>
      </div>
      ${col(t('Explore', 'استكشف'), [[`${r}markets/`, t('Markets', 'الأسواق')], [`${r}gold/`, t('Gold', 'الذهب')], [`${r}analysis/`, t('Analysis', 'التحليلات')], [`${r}news/`, t('News', 'الأخبار')], [`${r}learn/`, t('Learn', 'تعلّم')], [`${r}signals/`, t('Signals', 'الإشارات')]])}
      ${col(t('Company', 'الشركة'), [[`${r}about/`, t('About', 'من نحن')], [`${r}contact/`, t('Contact', 'تواصل معنا')], [`${r}privacy/`, t('Privacy', 'الخصوصية')], [`${r}terms/`, t('Terms', 'الشروط')], [`${r}risk-disclosure/`, t('Risk Disclosure', 'إفصاح المخاطر')]])}
      ${col(t('Follow', 'تابعنا'), [[s.telegram.url, 'Telegram'], [s.instagram.url, 'Instagram'], [s.facebook.url, 'Facebook'], [null, `WhatsApp · ${t('coming soon', 'قريبًا')}`]])}
    </div>
    <div class="site-foot__legal">
      <p>${t('Risk warning: trading financial instruments carries a high level of risk and may not be suitable for all investors. You can lose some or all of your capital. FOXREX content is for information and education only and is not investment advice.', 'تحذير المخاطر: ينطوي تداول الأدوات المالية على مخاطر عالية وقد لا يناسب جميع المستثمرين، وقد تخسر جزءًا من رأس مالك أو كله. محتوى FOXREX لأغراض المعلومات والتعليم فقط ولا يُعد نصيحة استثمارية.')} <a href="${r}risk-disclosure/" style="text-decoration:underline">${t('Read the full risk disclosure', 'اقرأ إفصاح المخاطر كاملًا')}</a>.</p>
      <p class="en">© <span data-year>2026</span> FOXREX. All rights reserved.</p>
    </div>
  </div>
</footer>`;
}

function page(p) {
  const r = p.path === '' ? '' : '../'.repeat(p.path.split('/').length);
  const scripts = ['scripts/public/site.js', ...(p.scripts || [])].map(s => `<script src="${r}${s}" defer></script>`).join('\n');
  return `${head(p, r)}
<body data-root="${r}" data-page="${p.id}">
${header(p.id, r)}
<main id="main">
${p.body(r)}
</main>
${footer(r)}
${scripts}
</body>
</html>
`;
}

/* ---------- reusable blocks ---------- */
const sectionHead = (kicker, h, p, cta) => `<div class="section-head reveal"><div><span class="fx-kicker">${kicker}</span><h2>${h}</h2>${p ? `<p>${p}</p>` : ''}</div>${cta || ''}</div>`;
const pageHero = (kicker, h, p) => `<section class="page-hero"><div class="wrap"><span class="fx-kicker">${kicker}</span><h1>${h}</h1>${p ? `<p>${p}</p>` : ''}</div></section>`;
const empty = (h, p) => `<div class="fx-empty"><strong>${h}</strong><span>${p}</span></div>`;

function ticker() {
  return `<section class="fx-ticker" aria-label="Market overview" data-market-ticker>
  <div class="fx-ticker__state"><span class="fx-status" data-state="off" data-market-state>${t('Market feed not connected', 'بيانات السوق غير متصلة')}</span></div>
  <ul class="fx-ticker__list">
    ${MARKETS.map(m => `<li class="fx-ticker__item" data-symbol="${m.sym}"><span class="fx-sym">${m.sym}</span><span><span class="fx-ticker__px" data-px>—</span> <span class="fx-ticker__chg" data-chg></span></span></li>`).join('\n    ')}
  </ul>
</section>`;
}

function todaySlots() {
  return `<div class="grid grid--5" data-editorial>
${SCHEDULE.map(s => `  <article class="fx-card slot reveal" data-kind="${s.kind}" data-slot="${s.id}">
    <div class="slot__time"><span class="fx-kicker">${tp(s.title)}</span><b class="ltr" data-slot-time="${s.time}">${s.time} <abbr title="Istanbul time (UTC+3)">IST</abbr></b></div>
    <h3 data-slot-title>${tp(s.desc)}</h3>
    <div class="fx-card__foot"><span class="fx-status" data-state="off" data-slot-status>${t('Not yet published today', 'لم يُنشر بعد اليوم')}</span></div>
  </article>`).join('\n')}
</div>`;
}

function goldFocus(r, withCta = true) {
  const lvl = (k, en, ar) => `<div><dt>${t(en, ar)}</dt><dd data-gold="${k}">—</dd></div>`;
  return `<div class="gold reveal" data-gold-focus>
  <div class="gold__main">
    <span class="fx-kicker" style="color:var(--foxrex-warning)">${t('Gold Focus', 'تركيز الذهب')}</span>
    <div class="gold__sym"><span class="fx-sym">XAUUSD</span><span class="gold__px" data-gold="price">—</span></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="fx-badge" data-gold="bias">${t('Bias: not published', 'الاتجاه: غير منشور')}</span><span class="fx-badge" data-gold="state">${t('Market state: unavailable', 'حالة السوق: غير متاحة')}</span></div>
    <p class="muted" data-gold="summary">${t('Today’s gold analysis has not been published yet. Levels and scenarios appear here once the FOXREX desk publishes them — we never display estimated or placeholder prices.', 'لم يُنشر تحليل الذهب لليوم بعد. تظهر المستويات والسيناريوهات هنا فور نشرها من فريق FOXREX — ولا نعرض أسعارًا تقديرية أو وهمية.')}</p>
    <p class="fx-card__meta"><span>${t('Last analysis', 'آخر تحليل')}:</span> <time data-gold="updated">—</time></p>
    ${withCta ? `<a class="fx-link" href="${r}gold/">${t('Full Gold Analysis', 'تحليل الذهب الكامل')} ${I.arrow}</a>` : ''}
  </div>
  <div>
    <dl class="gold__levels" style="margin:0">${lvl('support', 'Key support', 'الدعم الرئيسي')}${lvl('pivot', 'Important level', 'المستوى المهم')}${lvl('resistance', 'Key resistance', 'المقاومة الرئيسية')}</dl>
    <div class="gold__scen">
      <div><h4 class="fx-bias fx-bias--bullish">${t('Bullish scenario', 'السيناريو الصاعد')}</h4><p data-gold="bull">${t('Published with the daily Gold Focus.', 'يُنشر مع تركيز الذهب اليومي.')}</p></div>
      <div><h4 class="fx-bias fx-bias--bearish">${t('Bearish scenario', 'السيناريو الهابط')}</h4><p data-gold="bear">${t('Published with the daily Gold Focus.', 'يُنشر مع تركيز الذهب اليومي.')}</p></div>
    </div>
  </div>
</div>`;
}

const tabs = (list, attr) => `<div class="tabs" role="toolbar" aria-label="Filter" ${attr}>${list.map(([k, en, ar], i) => `<button type="button" data-filter="${k}" aria-pressed="${i === 0}">${t(en, ar)}</button>`).join('')}</div>`;

const analysisGrid = limit => `<div data-analysis-list data-limit="${limit || ''}">${empty(t('No analysis published yet', 'لا توجد تحليلات منشورة بعد'), t('New FOXREX analysis will appear here as soon as it is published. Follow us on Telegram to get it first.', 'ستظهر تحليلات FOXREX الجديدة هنا فور نشرها. تابعنا على تيليجرام لتصلك أولًا.'))}</div>`;
const newsList = limit => `<div data-news-list data-limit="${limit || ''}">${empty(t('No news items published yet', 'لا توجد أخبار منشورة بعد'), t('Market news, economic releases and central-bank decisions will be listed here with their time, importance and affected markets.', 'ستُعرض هنا أخبار السوق والبيانات الاقتصادية وقرارات البنوك المركزية مع وقتها وأهميتها والأسواق المتأثرة.'))}</div>`;

function rexCards(r, n) {
  return REX.slice(0, n).map(x => `<a class="fx-card rex-card reveal" href="${r}learn/#${x.id}"><span class="fx-kicker">${x.type}</span><h3>${tp(x.title)}</h3><p>${tp(x.summary)}</p><span class="fx-link">${t('Read', 'اقرأ')} ${I.arrow}</span></a>`).join('\n');
}

const riskBox = () => `<div class="risk-box"><strong>${t('Risk awareness.', 'الوعي بالمخاطر.')}</strong> ${t('Signals are trade ideas, not instructions or guarantees. Markets can move against any idea, and past results never guarantee future outcomes. Only trade with capital you can afford to lose, size positions responsibly and always use a stop-loss.', 'الإشارات أفكار تداول وليست تعليمات أو ضمانات. قد يتحرك السوق عكس أي فكرة، والنتائج السابقة لا تضمن النتائج المستقبلية. تداول فقط برأس مال يمكنك تحمل خسارته، وحدد حجم مراكزك بمسؤولية واستخدم وقف الخسارة دائمًا.')}</div>`;

function signalsBlock(r, full) {
  return `<div class="signals">
  <div class="reveal">
    <span class="fx-kicker">FOXREX Signals</span>
    <h2 style="font-size:var(--foxrex-fs-2xl);margin-top:10px">${t('Structured trade ideas, delivered with their risk.', 'أفكار تداول منظمة، تصلك مع مخاطرها.')}</h2>
    <p class="muted" style="margin-top:14px;font-size:17px">${t('Each FOXREX Signal is a documented idea: instrument, direction, entry zone, stop-loss, targets, validity and the reasoning behind it. The stop-loss is defined before the entry, every time.', 'كل إشارة من FOXREX فكرة موثقة: الأداة والاتجاه ومنطقة الدخول ووقف الخسارة والأهداف والصلاحية والمنطق وراءها. ووقف الخسارة يُحدد قبل الدخول في كل مرة.')}</p>
    ${riskBox()}
    <div class="hero__ctas"><a class="fx-btn fx-btn--primary" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">${I.telegram} ${t('Get signals on Telegram', 'تابع الإشارات على تيليجرام')}</a>${full ? '' : `<a class="fx-btn fx-btn--ghost" href="${r}signals/">${t('How signals work', 'كيف تعمل الإشارات')}</a>`}</div>
  </div>
  <div class="reveal">
    <ol class="steps">
      <li><h3>${t('Analysis first', 'التحليل أولًا')}</h3><p>${t('Ideas come from the same structure, levels and macro context we publish in our analysis.', 'تنبع الأفكار من البنية والمستويات والسياق الاقتصادي نفسه الذي ننشره في تحليلاتنا.')}</p></li>
      <li><h3>${t('Delivered on Telegram', 'تصل عبر تيليجرام')}</h3><p>${t('Signals are posted to the FOXREX Telegram channel with every parameter and the time of publication.', 'تُنشر الإشارات في قناة FOXREX على تيليجرام مع كل معاييرها ووقت نشرها.')}</p></li>
      <li><h3>${t('Managed in public', 'إدارة علنية')}</h3><p>${t('Updates such as moving the stop or closing early are posted in the same thread.', 'تُنشر التحديثات مثل تحريك الوقف أو الإغلاق المبكر في السلسلة نفسها.')}</p></li>
      <li><h3>${t('Results recorded', 'تسجيل النتائج')}</h3><p>${t('Outcomes are logged whether they win or lose.', 'تُسجل النتائج سواء كانت رابحة أو خاسرة.')}</p></li>
    </ol>
    <div style="margin-top:24px">
      <h3 style="font-size:16px;margin-bottom:12px">${t('Recent results', 'النتائج الأخيرة')}</h3>
      <div data-signal-results>${empty(t('No verified results published yet', 'لا توجد نتائج موثقة منشورة بعد'), t('Closed signals will be listed here with entry, exit and outcome — including losses. We do not publish win rates or performance figures until they can be independently verified.', 'ستُعرض هنا الإشارات المغلقة مع الدخول والخروج والنتيجة، بما فيها الخاسرة. لا ننشر نسب نجاح أو أرقام أداء قبل إمكانية التحقق منها بشكل مستقل.'))}</div>
    </div>
  </div>
</div>`;
}

/* ---------- pages ---------- */
const PAGES = [];

PAGES.push({ id: 'home', path: '', scripts: ['scripts/public/market.js', 'scripts/public/content.js'],
  jsonld: { '@context': 'https://schema.org', '@type': 'Organization', name: 'FOXREX', url: SITE.origin, logo: `${SITE.origin}/assets/brand/icon-512.png`, slogan: 'Trade smarter. Go further.', sameAs: Object.values(SITE.social).map(s => s.url).filter(Boolean) },
  body: r => `
<section class="hero">
  <div class="wrap hero__grid">
    <div>
      <span class="fx-badge fx-badge--primary"><i></i>${t('Market intelligence & trading education', 'ذكاء الأسواق وتعليم التداول')}</span>
      <h1 class="en" lang="en" dir="ltr"><span>TRADE SMARTER.</span><span class="accent">GO FURTHER.</span></h1>
      <p class="hero__ar" lang="ar" dir="rtl">${SITE.taglineAr}</p>
      <p class="hero__lead">${t('FOXREX turns market noise into clear, structured intelligence — technical analysis, gold coverage, economic news and trading education, always published with its risk.', 'تحوّل FOXREX ضجيج الأسواق إلى معلومات واضحة ومنظمة: تحليل فني وتغطية للذهب وأخبار اقتصادية وتعليم تداول، تُنشر دائمًا مع مخاطرها.')}</p>
      <div class="hero__ctas">
        <a class="fx-btn fx-btn--primary" href="${r}markets/">${t('Explore Markets', 'استكشف الأسواق')} ${I.arrow}</a>
        <a class="fx-btn fx-btn--ghost" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">${t('Join FOXREX', 'انضم إلى FOXREX')}</a>
      </div>
    </div>
    <ul class="pillars" aria-label="What FOXREX covers">
      ${[['Market Intelligence', 'ذكاء الأسواق'], ['Technical Analysis', 'التحليل الفني'], ['Trading Signals', 'إشارات التداول'], ['Economic News', 'الأخبار الاقتصادية'], ['Education', 'التعليم']].map((x, i) => `<li><span>0${i + 1}</span>${tp(x)}</li>`).join('\n      ')}
    </ul>
  </div>
</section>
${ticker()}

<section class="section">
  <div class="wrap">
    ${sectionHead(t('Today at FOXREX', 'اليوم في FOXREX'), t('The daily FOXREX desk', 'المكتب اليومي لـ FOXREX'), t('A fixed editorial rhythm, in Istanbul time, so you always know when the next update lands.', 'إيقاع تحريري ثابت بتوقيت إسطنبول، لتعرف دائمًا موعد التحديث القادم.'), `<a class="fx-link" href="${r}analysis/">${t('All analysis', 'كل التحليلات')} ${I.arrow}</a>`)}
    ${todaySlots()}
  </div>
</section>

<section class="section section--raised">
  <div class="wrap">
    ${sectionHead(t('Gold', 'الذهب'), t('Gold, every trading day.', 'الذهب، كل يوم تداول.'), t('XAUUSD is a core FOXREX pillar: bias, key levels and both scenarios in one view.', 'الذهب محور أساسي في FOXREX: الاتجاه والمستويات الرئيسية والسيناريوهان في نظرة واحدة.'))}
    ${goldFocus(r)}
  </div>
</section>

<section class="section">
  <div class="wrap">
    ${sectionHead(t('Latest analysis', 'أحدث التحليلات'), t('Analysis you can act on — or decide to skip.', 'تحليلات تساعدك على القرار، حتى لو كان القرار عدم الدخول.'), null, `<a class="fx-link" href="${r}analysis/">${t('View all', 'عرض الكل')} ${I.arrow}</a>`)}
    ${analysisGrid(3)}
  </div>
</section>

<section class="section section--raised">
  <div class="wrap">
    ${sectionHead(t('Market news', 'أخبار السوق'), t('What moved, and why it matters.', 'ما الذي تحرك، ولماذا يهم.'), null, `<a class="fx-link" href="${r}news/">${t('All news', 'كل الأخبار')} ${I.arrow}</a>`)}
    ${tabs(NEWS_CATEGORIES, 'data-news-tabs')}
    ${newsList(6)}
  </div>
</section>

<section class="section">
  <div class="wrap">${signalsBlock(r, false)}</div>
</section>

<section class="section section--raised">
  <div class="wrap rex">
    <div class="rex__id reveal">
      <div class="rex__av"><img src="${r}assets/rex/rex-arms.jpg" width="116" height="106" alt="REX, the FOXREX fox" loading="lazy"></div>
      <div><span class="fx-kicker">REX</span><h2 style="font-size:24px;margin-top:6px">${t('Learn with REX', 'تعلّم مع REX')}</h2><p class="muted" style="margin-top:8px;font-size:15px">${t('Short, clear lessons on the ideas behind every market move.', 'دروس قصيرة وواضحة عن الأفكار وراء كل حركة في السوق.')}</p></div>
      <div class="rex__types"><span class="fx-badge fx-badge--primary">REX EXPLAINS</span><span class="fx-badge">REX NOTE</span><span class="fx-badge fx-badge--ai">ASK REX</span></div>
    </div>
    <div>
      <div class="grid grid--2">${rexCards(r, 4)}</div>
      <p style="margin-top:22px" class="reveal"><a class="fx-link" href="${r}learn/">${t('All REX lessons', 'كل دروس REX')} ${I.arrow}</a> <span class="muted" style="margin-inline-start:14px;font-size:14px">${t('Have a question? Ask REX on Telegram.', 'لديك سؤال؟ اسأل REX على تيليجرام.')}</span></p>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    ${sectionHead(t('Why FOXREX', 'لماذا FOXREX'), t('An intelligence ecosystem, built in the open.', 'منظومة ذكاء مالي تُبنى بشفافية.'), t('Some capabilities are live today and others are being built. We label the difference.', 'بعض القدرات متاحة اليوم وبعضها قيد البناء، ونوضح الفرق دائمًا.'))}
    <div class="why reveal">
      <div>${I.data}<h3>${t('Data', 'البيانات')}</h3><p>${t('Verified market data only. When a feed is not connected, we say so instead of showing estimates.', 'بيانات سوق موثقة فقط. وعندما لا يكون المصدر متصلًا نقول ذلك بدل عرض تقديرات.')}</p></div>
      <div>${I.chart}<h3>${t('Market Analysis', 'تحليل الأسواق')}</h3><p>${t('Structure, levels and scenarios across gold, FX, indices and crypto.', 'البنية والمستويات والسيناريوهات للذهب والعملات والمؤشرات والعملات الرقمية.')}</p></div>
      <div>${I.ai}<h3>${t('AI Intelligence', 'الذكاء الاصطناعي')} <span class="fx-badge fx-badge--ai" style="margin-inline-start:6px">${t('In development', 'قيد التطوير')}</span></h3><p>${t('AI assists our research and content workflow. Every output is reviewed by a person before it is published.', 'يساعد الذكاء الاصطناعي في البحث وسير عمل المحتوى، وتتم مراجعة كل مخرج بشريًا قبل النشر.')}</p></div>
      <div>${I.shield}<h3>${t('Risk Awareness', 'الوعي بالمخاطر')}</h3><p>${t('Every idea ships with an invalidation level and a clear risk message.', 'كل فكرة تُنشر مع مستوى إلغاء ورسالة مخاطر واضحة.')}</p></div>
      <div>${I.bolt}<h3>${t('Speed', 'السرعة')}</h3><p>${t('A fixed daily schedule plus real-time coverage of high-impact releases.', 'جدول يومي ثابت إلى جانب تغطية لحظية للبيانات عالية التأثير.')}</p></div>
      <div>${I.research}<h3>${t('Research', 'البحث')}</h3><p>${t('Macro drivers explained, so you understand the move — not just the level.', 'شرح المحركات الاقتصادية لتفهم الحركة، لا المستوى فقط.')}</p></div>
    </div>
  </div>
</section>

<section class="section section--tight">
  <div class="wrap">
    <div class="join reveal">
      <div><h2>${t('Join the FOXREX community', 'انضم إلى مجتمع FOXREX')}</h2><p>${t('Daily briefs, gold focus, signals and REX lessons — first on Telegram.', 'الموجز اليومي وتركيز الذهب والإشارات ودروس REX، أولًا على تيليجرام.')}</p></div>
      <div class="join__ctas">
        <a class="fx-btn fx-btn--primary" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">${I.telegram} Telegram</a>
        <a class="fx-btn fx-btn--ghost" href="${SITE.social.instagram.url}" target="_blank" rel="noopener">${I.instagram} Instagram</a>
        <a class="fx-btn fx-btn--ghost" href="${SITE.social.facebook.url}" target="_blank" rel="noopener">${I.facebook} Facebook</a>
      </div>
    </div>
  </div>
</section>` });

PAGES.push({ id: 'markets', path: 'markets', title: 'Markets', description: 'Markets covered by FOXREX: gold (XAUUSD), EURUSD, GBPUSD, USDJPY, Bitcoin and the US Dollar Index.', scripts: ['scripts/public/market.js'],
  body: r => `${pageHero(t('Markets', 'الأسواق'), t('The markets we cover', 'الأسواق التي نغطيها'), t('What each instrument is and what moves it. Live quotes appear only from a connected, verified data feed.', 'ما هي كل أداة وما الذي يحركها. تظهر الأسعار الحية فقط من مصدر بيانات متصل وموثق.'))}
${ticker()}
<section class="section section--tight"><div class="wrap">
  <div class="fx-notice fx-notice--info" style="margin-bottom:28px">${I.info}<span>${t('The FOXREX market feed is not connected yet, so no prices are shown. We will never display estimated or delayed prices as live data.', 'مصدر بيانات السوق لدى FOXREX غير متصل بعد، لذلك لا تظهر أسعار. لن نعرض أبدًا أسعارًا تقديرية أو متأخرة على أنها حية.')}</span></div>
  <div class="grid grid--3">
  ${MARKETS.map(m => `<article class="fx-card reveal" id="${m.sym.toLowerCase()}"><div class="fx-card__meta"><span class="fx-badge">${tp(m.cls)}</span></div><h3><span class="fx-sym">${m.sym}</span></h3><p style="color:var(--foxrex-text)">${tp(m.name)}</p><p>${tp(m.about)}</p>${m.sym === 'XAUUSD' ? `<div class="fx-card__foot"><a class="fx-link" href="${r}gold/">${t('Gold Focus', 'تركيز الذهب')} ${I.arrow}</a></div>` : ''}</article>`).join('\n  ')}
  </div>
</div></section>` });

PAGES.push({ id: 'gold', path: 'gold', title: 'Gold Focus — XAUUSD', description: 'FOXREX Gold Focus: daily XAUUSD bias, key support and resistance and bullish and bearish scenarios.', scripts: ['scripts/public/content.js'],
  body: r => `${pageHero(t('Gold', 'الذهب'), t('Gold Focus', 'تركيز الذهب'), t('Our daily XAUUSD view, published at 11:00 Istanbul time on trading days.', 'رؤيتنا اليومية للذهب XAUUSD، تُنشر الساعة 11:00 بتوقيت إسطنبول في أيام التداول.'))}
<section class="section section--tight"><div class="wrap">${goldFocus(r, false)}</div></section>
<section class="section section--tight section--raised"><div class="wrap">
  ${sectionHead(t('Drivers', 'المحركات'), t('What moves gold', 'ما الذي يحرك الذهب'))}
  <div class="grid grid--4">
    ${[[['Real yields', 'العوائد الحقيقية'], ['Gold pays no interest, so higher inflation-adjusted yields raise the cost of holding it.', 'الذهب لا يدفع فائدة، لذا ترفع العوائد الحقيقية الأعلى تكلفة الاحتفاظ به.']],
       [['The US dollar', 'الدولار الأمريكي'], ['Gold is priced in dollars; a stronger dollar often weighs on it.', 'الذهب مسعّر بالدولار، وقوة الدولار تضغط عليه غالبًا.']],
       [['Risk sentiment', 'معنويات المخاطرة'], ['Stress and uncertainty can lift demand for gold as a store of value.', 'قد يرفع التوتر وعدم اليقين الطلب على الذهب كمخزن للقيمة.']],
       [['Central banks', 'البنوك المركزية'], ['Official-sector buying and selling changes long-term demand.', 'مشتريات ومبيعات البنوك المركزية تغير الطلب طويل الأجل.']]].map(([h, p]) => `<div class="fx-card reveal"><h3>${tp(h)}</h3><p>${tp(p)}</p></div>`).join('')}
  </div>
</div></section>
<section class="section section--tight"><div class="wrap">
  ${sectionHead(t('Gold analysis', 'تحليلات الذهب'), t('Latest gold analysis', 'أحدث تحليلات الذهب'))}
  <div data-analysis-list data-category="gold">${empty(t('No gold analysis published yet', 'لا توجد تحليلات للذهب منشورة بعد'), t('Published gold analysis will appear here.', 'ستظهر هنا تحليلات الذهب المنشورة.'))}</div>
</div></section>` });

PAGES.push({ id: 'analysis', path: 'analysis', title: 'Analysis', description: 'FOXREX market analysis: technical analysis, macro, gold, FX, indices and crypto.', scripts: ['scripts/public/content.js'],
  body: r => `${pageHero(t('Analysis', 'التحليلات'), t('Market analysis', 'تحليل الأسواق'), t('Technical structure and macro context, with a bias, levels and a clear invalidation for every idea.', 'البنية الفنية والسياق الاقتصادي، مع اتجاه ومستويات ومستوى إلغاء واضح لكل فكرة.'))}
<section class="section section--tight"><div class="wrap">
  ${tabs(ANALYSIS_CATEGORIES, 'data-analysis-tabs')}
  ${analysisGrid()}
</div></section>` });

PAGES.push({ id: 'news', path: 'news', title: 'Market News', description: 'FOXREX market news: high-impact releases, economic data, central banks, commodities and FX.', scripts: ['scripts/public/content.js'],
  body: r => `${pageHero(t('News', 'الأخبار'), t('Market news', 'أخبار السوق'), t('Economic releases and market-moving headlines with their importance and the markets they affect.', 'البيانات الاقتصادية والعناوين المؤثرة مع أهميتها والأسواق التي تتأثر بها.'))}
<section class="section section--tight"><div class="wrap">
  ${tabs(NEWS_CATEGORIES, 'data-news-tabs')}
  ${newsList()}
</div></section>` });

PAGES.push({ id: 'learn', path: 'learn', title: 'Learn with REX', description: 'REX Explains: short trading lessons on CPI, gold and yields, breakouts, market structure and risk/reward.',
  body: r => `${pageHero('REX', t('Learn with REX', 'تعلّم مع REX'), t('Clear explanations of the ideas behind market moves. Educational content only — not investment advice.', 'شرح واضح للأفكار وراء حركة الأسواق. محتوى تعليمي فقط وليس نصيحة استثمارية.'))}
<section class="section section--tight"><div class="wrap rex">
  <aside class="rex__id">
    <div class="rex__av"><img src="${r}assets/rex/rex-arms.jpg" width="116" height="106" alt="REX, the FOXREX fox"></div>
    <nav aria-label="Lessons"><ul style="list-style:none;margin:0;padding:0;display:grid;gap:8px;font-size:14px">${REX.map(x => `<li><a class="muted" href="#${x.id}">${tp(x.title)}</a></li>`).join('')}</ul></nav>
    <div class="rex__types"><span class="fx-badge fx-badge--primary">REX EXPLAINS</span><span class="fx-badge">REX NOTE</span><span class="fx-badge fx-badge--ai">ASK REX</span></div>
  </aside>
  <div>
  ${REX.map(x => `<article class="article" id="${x.id}"><span class="fx-kicker">${x.type}</span><h2>${tp(x.title)}</h2>
    <div class="l-en">${x.body[0].map(p => `<p>${esc(p)}</p>`).join('')}</div>
    <div class="l-ar" lang="ar">${x.body[1].map(p => `<p>${esc(p)}</p>`).join('')}</div>
    <p class="takeaway"><strong>REX:</strong> ${tp(x.takeaway)}</p></article>`).join('\n  ')}
    <div class="article"><span class="fx-kicker">ASK REX</span><h2>${t('Have a question?', 'لديك سؤال؟')}</h2><p>${t('Send your question to FOXREX on Telegram. Selected questions become future REX lessons.', 'أرسل سؤالك إلى FOXREX على تيليجرام، وتتحول الأسئلة المختارة إلى دروس REX قادمة.')}</p><p style="margin-top:18px"><a class="fx-btn fx-btn--primary" href="${SITE.social.telegram.url}" target="_blank" rel="noopener">${I.telegram} ${t('Ask REX', 'اسأل REX')}</a></p></div>
  </div>
</div></section>` });

PAGES.push({ id: 'signals', path: 'signals', title: 'FOXREX Signals', description: 'How FOXREX Signals work: documented trade ideas with entry, stop-loss and targets, delivered on Telegram with clear risk awareness.', scripts: ['scripts/public/content.js'],
  body: r => `${pageHero('FOXREX Signals', t('Signals, with their risk.', 'إشارات، مع مخاطرها.'), t('What a FOXREX Signal contains, how it is delivered and how results are recorded.', 'ما الذي تحتويه إشارة FOXREX، وكيف تصل، وكيف تُسجل النتائج.'))}
<section class="section section--tight"><div class="wrap">${signalsBlock(r, true)}</div></section>
<section class="section section--tight section--raised"><div class="wrap">
  ${sectionHead(t('Anatomy', 'المكونات'), t('What every signal includes', 'ما تتضمنه كل إشارة'))}
  <div class="grid grid--4">
  ${[[['Instrument & direction', 'الأداة والاتجاه'], ['For example XAUUSD — buy or sell.', 'مثل XAUUSD، شراء أو بيع.']], [['Entry zone', 'منطقة الدخول'], ['The price area where the idea is valid.', 'منطقة السعر التي تكون فيها الفكرة صالحة.']], [['Stop-loss', 'وقف الخسارة'], ['Where the idea is wrong. Always defined first.', 'حيث تصبح الفكرة خاطئة، ويُحدد دائمًا أولًا.']], [['Targets & validity', 'الأهداف والصلاحية'], ['Take-profit levels and how long the idea stays active.', 'مستويات جني الأرباح ومدة صلاحية الفكرة.']]].map(([h, p]) => `<div class="fx-card reveal"><h3>${tp(h)}</h3><p>${tp(p)}</p></div>`).join('')}
  </div>
</div></section>` });

PAGES.push({ id: 'about', path: 'about', title: 'About', description: 'About FOXREX — a market-intelligence and trading-education brand.',
  body: r => `${pageHero(t('About', 'من نحن'), t('Intelligence over noise.', 'الذكاء قبل الضجيج.'), t('FOXREX is a market-intelligence and trading-education brand for traders who want structure, context and honesty about risk.', 'FOXREX علامة لذكاء الأسواق وتعليم التداول، للمتداولين الذين يريدون البنية والسياق والصراحة بشأن المخاطر.'))}
<section class="section section--tight"><div class="wrap prose">
  <div class="l-en">
  <h2>What we do</h2>
  <p>We publish daily market analysis with a focus on gold, major FX pairs, indices and crypto; explain economic news and central-bank decisions; share FOXREX Signals on Telegram; and teach the concepts behind them through REX, our educational identity.</p>
  <h2>How we work</h2>
  <ul><li><strong>No fake data.</strong> We never publish invented prices, performance, win rates or user numbers. When data is unavailable, we say so.</li><li><strong>Risk first.</strong> Every idea carries an invalidation level and a risk message.</li><li><strong>People review AI.</strong> AI helps our research and production workflow; a person reviews every piece before it is published.</li><li><strong>Education, not advice.</strong> Our content helps you think — it does not tell you what to do with your money.</li></ul>
  <h2>Meet REX</h2>
  <p>REX is the FOXREX fox — our signature for educational content such as REX Explains, REX Note and Ask REX.</p>
  </div>
  <div class="l-ar" lang="ar">
  <h2>ماذا نقدم</h2>
  <p>ننشر تحليلات يومية للأسواق مع تركيز على الذهب وأزواج العملات الرئيسية والمؤشرات والعملات الرقمية، ونشرح الأخبار الاقتصادية وقرارات البنوك المركزية، ونشارك إشارات FOXREX على تيليجرام، ونعلّم المفاهيم التي تقف خلفها عبر REX، هويتنا التعليمية.</p>
  <h2>كيف نعمل</h2>
  <ul><li><strong>لا بيانات وهمية.</strong> لا ننشر أسعارًا أو أداءً أو نسب نجاح أو أعداد مستخدمين مختلقة. وعندما لا تتوفر البيانات نقول ذلك.</li><li><strong>المخاطرة أولًا.</strong> كل فكرة تأتي مع مستوى إلغاء ورسالة مخاطر.</li><li><strong>البشر يراجعون الذكاء الاصطناعي.</strong> يساعد الذكاء الاصطناعي في البحث والإنتاج، ويراجع شخص كل محتوى قبل نشره.</li><li><strong>تعليم لا نصيحة.</strong> محتوانا يساعدك على التفكير ولا يخبرك بما تفعله بأموالك.</li></ul>
  <h2>تعرّف على REX</h2>
  <p>REX هو ثعلب FOXREX، وتوقيعنا للمحتوى التعليمي مثل REX يشرح وملاحظة REX واسأل REX.</p>
  </div>
</div></section>` });

PAGES.push({ id: 'contact', path: 'contact', title: 'Contact', description: 'Contact FOXREX on Telegram, Instagram or Facebook.',
  body: r => `${pageHero(t('Contact', 'تواصل معنا'), t('Talk to FOXREX', 'تحدث مع FOXREX'), t('The fastest way to reach us is a direct message on any of our channels.', 'أسرع طريقة للتواصل معنا رسالة مباشرة على أي من قنواتنا.'))}
<section class="section section--tight"><div class="wrap">
  <div class="grid grid--3">
  ${['telegram', 'instagram', 'facebook'].map(k => { const s = SITE.social[k]; return `<a class="fx-card channel reveal" href="${s.url}" target="_blank" rel="noopener"><span class="ic">${I[k]}</span><span><b>${s.label}</b><small class="en">${esc(s.handle)}</small></span></a>`; }).join('\n  ')}
  </div>
  <p class="muted" style="margin-top:24px;font-size:14px">${t('WhatsApp channel: coming soon. We will never ask for passwords, account access or payments through direct messages.', 'قناة واتساب: قريبًا. لن نطلب منك أبدًا كلمات مرور أو دخولًا إلى حسابك أو أي مدفوعات عبر الرسائل المباشرة.')}</p>
</div></section>` });

const legal = (id, title, desc, html) => PAGES.push({ id, path: id, title, description: desc,
  body: () => `${pageHero(t('Legal', 'قانوني'), esc(title))}
<section class="section section--tight"><div class="wrap prose" lang="en" dir="ltr"><p class="updated">Last updated: ${UPDATED}</p>${html}</div></section>` });

legal('privacy', 'Privacy Policy', 'How the FOXREX website handles your data.', `
<p>This policy explains what information the FOXREX website (foxrex.co) handles.</p>
<h2>What we collect</h2>
<p>The website does not use accounts, contact forms, advertising trackers or analytics cookies. We do not sell personal data.</p>
<h2>Stored on your device</h2>
<p>If you switch the site language, your choice is saved in your browser's local storage under the key <code>foxrex-lang</code>. You can clear it at any time through your browser settings.</p>
<h2>Third-party services</h2>
<ul><li><strong>Hosting:</strong> the site is served by GitHub Pages, which may log technical request data such as IP addresses for security and operations.</li><li><strong>Fonts:</strong> fonts are loaded from Google Fonts, which receives your IP address when fonts are requested.</li><li><strong>Social platforms:</strong> links to Telegram, Instagram and Facebook take you to those services, which apply their own privacy policies.</li></ul>
<h2>Contact</h2>
<p>Questions about this policy can be sent to FOXREX through the channels listed on the <a href="../contact/">Contact</a> page.</p>`);

legal('terms', 'Terms of Use', 'Terms for using the FOXREX website and content.', `
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
<p>See also the <a href="../risk-disclosure/">Risk Disclosure</a> and <a href="../privacy/">Privacy Policy</a>.</p>`);

legal('risk-disclosure', 'Risk Disclosure', 'Risks of trading financial instruments including forex, gold, CFDs and cryptocurrencies.', `
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
<p>Crypto-assets may be unregulated in your jurisdiction and can lose most or all of their value.</p>`);

/* ---------- other generated files ---------- */
const extra = {
  'robots.txt': `User-agent: *\nAllow: /\nDisallow: /studio/\nDisallow: /foxrex-studio.html\n\nSitemap: ${SITE.origin}/sitemap.xml\n`,
  'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map(p => `  <url><loc>${SITE.origin}/${p.path ? p.path + '/' : ''}</loc><changefreq>${['home', 'analysis', 'news', 'gold'].includes(p.id) ? 'daily' : 'monthly'}</changefreq><priority>${p.id === 'home' ? '1.0' : ['privacy', 'terms', 'risk-disclosure'].includes(p.id) ? '0.3' : '0.8'}</priority></url>`).join('\n')}\n</urlset>\n`,
  'site.webmanifest': JSON.stringify({ name: 'FOXREX', short_name: 'FOXREX', description: SITE.description, start_url: '/', display: 'standalone', background_color: '#0B1320', theme_color: '#0B1320', icons: [{ src: '/assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/assets/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }] }, null, 2) + '\n'
};

/* ---------- write / check ---------- */
const outputs = new Map();
for (const p of PAGES) outputs.set(p.path ? `${p.path}/index.html` : 'index.html', page(p));
for (const [k, v] of Object.entries(extra)) outputs.set(k, v);

let stale = [];
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

