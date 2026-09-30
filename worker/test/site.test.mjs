/* Public website + Studio route integrity: generated output, custom domain, paths, no fake data, no shipped secrets. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const PAGES = ['', 'markets', 'gold', 'analysis', 'news', 'learn', 'signals', 'about', 'contact', 'privacy', 'terms', 'risk-disclosure'];
const pageFile = p => (p ? `${p}/` : '') + 'index.html';
const arFile = p => 'ar/' + pageFile(p);
const ALL = [...PAGES.map(pageFile), ...PAGES.map(arFile)];
const url = (p, ar) => `https://foxrex.co/${ar ? 'ar/' : ''}${p ? p + '/' : ''}`;

test('generated public pages are committed and up to date', () => {
  const r = spawnSync(process.execPath, [path.join(root, 'tools/site/build.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('every public page uses the foxrex.co canonical identity and complete social metadata', () => {
  for (const p of PAGES) {
    const html = read(pageFile(p));
    assert.match(html, new RegExp(`<link rel="canonical" href="https://foxrex\\.co/${p ? p + '/' : ''}">`), p);
    for (const tag of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card', 'description', 'theme-color']) assert.ok(html.includes(`"${tag}"`), `${p || 'home'} missing ${tag}`);
    assert.ok(!html.includes('zakoosh.github.io'), `${p || 'home'} references github.io`);
    assert.ok(!/creative-studio\.js|studio\/index/.test(html), `${p || 'home'} loads Studio code`);
  }
  assert.equal(read('CNAME').trim(), 'foxrex.co');
  assert.match(read('robots.txt'), /Disallow: \/studio\//);
  assert.match(read('sitemap.xml'), /<loc>https:\/\/foxrex\.co\/<\/loc>/);
  assert.ok(fs.existsSync(path.join(root, 'assets/brand/og-image.png')));
});

test('relative links and assets on every page resolve to real files', () => {
  const files = [...ALL, '404.html', 'studio/index.html', 'foxrex-studio.html'];
  for (const f of files) {
    const html = read(f), dir = path.dirname(path.join(root, f));
    for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^(https?:|mailto:|tel:|#|data:|javascript:)/.test(url) || url.includes('${')) continue;
      const clean = url.split(/[?#]/)[0]; if (!clean) continue;
      let target = clean.startsWith('/') ? path.join(root, clean) : path.resolve(dir, clean);
      if (clean.endsWith('/')) target = path.join(target, 'index.html');
      assert.ok(fs.existsSync(target), `${f}: broken ${url}`);
    }
  }
});

test('no fabricated market data ships with the site', () => {
  const home = read('index.html');
  const pxs = [...home.matchAll(/data-px>([^<]*)</g)].map(m => m[1]);
  assert.equal(pxs.length, 6);
  assert.ok(pxs.every(v => v === '—'), 'ticker must start empty');
  assert.match(home, /Market feed not connected/);
  const c = JSON.parse(read('data/content.json'));
  if (c.gold && c.gold.price != null) assert.ok(c.gold.priceSource && c.gold.priceTime, 'gold price requires a source and time');
  for (const a of c.analysis) assert.ok(a.symbol && a.title && a.publishedAt);
  for (const r of c.signals.results) assert.ok(r.entry != null && r.exit != null && r.closedAt, 'signal results must be complete records');
  for (const f of ['index.html', 'ar/index.html']) assert.ok([...read(f).matchAll(/data-px>([^<]*)</g)].every(m => m[1] === '—'), `${f} ticker must start empty`);
  const text = ALL.map(f => read(f).replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ')).join(' ');
  assert.ok(!/\d+(\.\d+)?\s*%/.test(text), 'no percentage figures (performance, accuracy, returns) in public copy');
});

test('Studio is served from /studio/, legacy URL redirects, and no credentials or fake auth ship in static files', () => {
  const studio = read('studio/index.html');
  assert.match(studio, /noindex/);
  assert.ok(!/data-protected|auth\.js|FoxAuth|login\.html/.test(studio), 'no client-side pseudo-authentication');
  assert.match(read('foxrex-studio.html'), /location\.replace\("studio\/"/);
  const shipped = [studio, read('studio/creative-studio.js'), ...ALL.map(read), ...fs.readdirSync(path.join(root, 'scripts/public')).map(f => read('scripts/public/' + f))].join('\n');
  assert.ok(!/Bearer\s+[A-Za-z0-9._-]{12,}/.test(shipped), 'hard-coded bearer token');
  assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}/.test(shipped), 'secret-like value');
});

test('Arabic edition: every page exists at /ar/ with lang="ar" dir="rtl", Arabic metadata and its own canonical', () => {
  for (const p of PAGES) {
    const en = read(pageFile(p)), ar = read(arFile(p));
    assert.match(en, /<html lang="en" dir="ltr">/, `${p || 'home'} EN lang/dir`);
    assert.match(ar, /<html lang="ar" dir="rtl">/, `${p || 'home'} AR lang/dir`);
    assert.ok(en.includes(`<link rel="canonical" href="${url(p)}">`), `${p || 'home'} EN canonical`);
    assert.ok(ar.includes(`<link rel="canonical" href="${url(p, true)}">`), `${p || 'home'} AR canonical`);
    for (const html of [en, ar]) {
      assert.ok(html.includes(`<link rel="alternate" hreflang="en" href="${url(p)}">`), 'hreflang en');
      assert.ok(html.includes(`<link rel="alternate" hreflang="ar" href="${url(p, true)}">`), 'hreflang ar');
      assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${url(p)}">`), 'hreflang x-default');
      assert.ok(!html.includes('?lang='), 'no query-string language variants');
    }
    const arabic = /[\u0600-\u06FF]/;
    const title = ar.match(/<title>([^<]*)<\/title>/)[1], desc = ar.match(/<meta name="description" content="([^"]*)"/)[1];
    const ogt = ar.match(/<meta property="og:title" content="([^"]*)"/)[1], ogd = ar.match(/<meta property="og:description" content="([^"]*)"/)[1];
    for (const [k, v] of Object.entries({ title, desc, ogt, ogd })) assert.match(v, arabic, `${p || 'home'} AR ${k} must be Arabic`);
    assert.match(ar, /og:locale" content="ar_AR"/);
    assert.match(ar, /og-image-ar\.png/);
    assert.ok(!/class="l-(en|ar)"/.test(en + ar), 'no hidden dual-language DOM in generated pages');
  }
  assert.ok(fs.existsSync(path.join(root, 'assets/brand/og-image-ar.png')));
  assert.match(read('sitemap.xml'), /<loc>https:\/\/foxrex\.co\/ar\/<\/loc>/);
});

test('language switch links to the equivalent page in the other edition', () => {
  for (const p of PAGES) {
    for (const [file, target, lang] of [[pageFile(p), arFile(p), 'ar'], [arFile(p), pageFile(p), 'en']]) {
      const html = read(file);
      const m = html.match(new RegExp(`<a class="lang-toggle" href="([^"]+)" hreflang="${lang}"`));
      assert.ok(m, `${file} has a ${lang} switch`);
      const resolved = path.join(path.resolve(path.dirname(path.join(root, file)), m[1]), m[1].endsWith('/') || m[1] === './' ? 'index.html' : '');
      assert.equal(path.relative(root, resolved), target, `${file} switch resolves to ${target}`);
    }
  }
});

test('Arabic typography path: IBM Plex Sans Arabic + Inter self-hosted, AR tokens defined, no tracking on Arabic', () => {
  const fonts = read('styles/fonts.css'), tokens = read('styles/tokens.css'), arcss = read('styles/ar.css');
  assert.match(fonts, /font-family:"IBM Plex Sans Arabic"[^}]*unicode-range:U\+0600-06FF/);
  for (const [, file] of fonts.matchAll(/url\(\.\.\/([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(root, file)), `missing font ${file}`);
  for (const w of [400, 500, 600, 700]) assert.ok(fonts.includes(`ibm-plex-sans-arabic-arabic-${w}-normal.woff2`));
  assert.match(tokens, /--foxrex-font-ar:"IBM Plex Sans Arabic"/);
  for (const k of ['display', 'hero', 'h1', 'h2', 'section', 'card-title', 'body', 'caption', 'label', 'cta', 'data']) assert.match(tokens, new RegExp(`--ar-${k}:`), `--ar-${k}`);
  assert.match(tokens, /--ar-data:[^;]*var\(--foxrex-font-en\)/, 'AR data uses Inter');
  assert.match(arcss, /letter-spacing:0/);
  const ar = read('ar/index.html');
  assert.match(ar, /styles\/fonts\.css/); assert.match(ar, /styles\/ar\.css/);
  assert.match(ar, /preload" href="assets\/fonts\/ibm-plex-sans-arabic-arabic-400-normal\.woff2|preload" href="\.\.\/assets\/fonts\/ibm-plex-sans-arabic-arabic-400-normal\.woff2/);
  assert.ok(!/fonts\.googleapis/.test(ALL.map(read).join('') + read('studio/index.html')), 'no third-party font dependency');
  assert.match(read('studio/index.html'), /\.\.\/styles\/fonts\.css[\s\S]*\.\.\/styles\/tokens\.css/, 'Studio shares the typography system');
  assert.ok(fs.existsSync(path.join(root, 'docs/ARABIC-BRAND-TYPOGRAPHY.md')));
});

test('Arabic copy and bidi: specified headlines present, Latin/number runs isolated in Inter LTR', async () => {
  const ar = read('ar/index.html');
  for (const line of ['تداول أذكى...', 'فرص أكبر', 'ذكاء الأسواق', 'اليوم في', 'كل ما تحتاجه لمتابعة يوم التداول.', 'الذهب... كل يوم تداول.', 'تحليل يساعدك على التحرك...<br>أو الانتظار.', 'ما الذي تحرك...<br>ولماذا يهم؟', 'أفكار تداول منظمة...<br>بمخاطر واضحة.', 'تعلّم مع', 'منظومة ذكاء للأسواق...<br>مبنية على نظام واحد.', 'انضم إلى مجتمع'])
    assert.ok(ar.includes(line), `missing Arabic copy: ${line}`);
  assert.match(ar, /تحليل <bdi class="lt" dir="ltr">XAUUSD<\/bdi> قبل افتتاح وول ستريت عند <bdi class="lt" dir="ltr">15:30<\/bdi>/);
  const { arText } = await import('../../tools/site/text.mjs');
  assert.equal(arText('صدر CPI أعلى من التوقعات'), 'صدر <bdi class="lt" dir="ltr">CPI</bdi> أعلى من التوقعات');
  assert.equal(arText('الذهب XAUUSD +0.42%'), 'الذهب <bdi class="lt" dir="ltr">XAUUSD +0.42%</bdi>');
  assert.equal(arText('السعر 4,328.50.'), 'السعر <bdi class="lt" dir="ltr">4,328.50</bdi>.', 'sentence punctuation stays outside the isolate');
  assert.equal(arText('A & <b>'), '<bdi class="lt" dir="ltr">A</bdi> &amp; &lt;<bdi class="lt" dir="ltr">b</bdi>&gt;', 'escaping is preserved');
});
