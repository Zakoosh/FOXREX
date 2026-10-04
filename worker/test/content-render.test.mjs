/* Static renderer: permanent pages from the canonical v3 feed — canonical, hreflang, SEO, escaping,
   withdrawn notices, archives only with content, sitemap, orphan removal, determinism.
   Builds TEST fixtures into a temporary directory; the repository is never written. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CMS, fixtureFeed } from './fixtures/content-v3.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BUILD = path.join(ROOT, 'tools/site/build.mjs');
function build(feed, out, ...flags) {
  const dir = out || fs.mkdtempSync(path.join(os.tmpdir(), 'fxsite-'));
  const f = path.join(dir, '.feed.json'); fs.writeFileSync(f, JSON.stringify(feed));
  const r = spawnSync(process.execPath, [BUILD, '--feed', f, '--out', dir, ...flags], { encoding: 'utf8' });
  return { dir, r, read: rel => fs.readFileSync(path.join(dir, rel), 'utf8'), exists: rel => fs.existsSync(path.join(dir, rel)) };
}
const once = (() => { let b; return () => (b = b || build(fixtureFeed())); })();

test('every published item gets a permanent page in its own language; EN at /, AR under /ar/', () => {
  const { r, exists } = once();
  assert.equal(r.status, 0, r.stderr);
  for (const e of fixtureFeed().items) assert.ok(exists(CMS.pathFor(e.urlPath, e.language) + 'index.html'), `${e.language} ${e.urlPath}`);
  assert.ok(!exists('news/test-cpi-release/index.html') || !exists('ar/news/test-cpi-release/index.html'), 'no page for a translation that does not exist');
  assert.ok(!exists('ar/news/test-cpi-release/index.html'));
});

test('canonical, hreflang, Open Graph, Twitter and article metadata on item pages', () => {
  const { read } = once();
  const en = read('gold/2026-09-28/index.html'), ar = read('ar/gold/2026-09-28/index.html');
  assert.match(en, /<html lang="en" dir="ltr">/); assert.match(ar, /<html lang="ar" dir="rtl">/);
  assert.ok(en.includes('<link rel="canonical" href="https://foxrex.co/gold/2026-09-28/">'));
  assert.ok(ar.includes('<link rel="canonical" href="https://foxrex.co/ar/gold/2026-09-28/">'));
  for (const h of [en, ar]) {
    assert.ok(h.includes('<link rel="alternate" hreflang="en" href="https://foxrex.co/gold/2026-09-28/">'));
    assert.ok(h.includes('<link rel="alternate" hreflang="ar" href="https://foxrex.co/ar/gold/2026-09-28/">'));
    assert.ok(h.includes('<link rel="alternate" hreflang="x-default" href="https://foxrex.co/gold/2026-09-28/">'));
    for (const tag of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card', 'twitter:title', 'article:published_time', 'article:modified_time']) assert.ok(h.includes(`"${tag}"`), tag);
    assert.match(h, /<meta property="og:type" content="article">/);
    assert.ok(!h.includes('?lang='));
  }
  const news = read('news/test-cpi-release/index.html');
  assert.ok(!news.includes('<link rel="alternate" hreflang="ar"') && !news.includes('hreflang="x-default"'), 'no alternate for a missing translation');
  assert.ok(!news.includes('og:locale:alternate'));
  assert.match(news, /class="lang-toggle" href="\.\.\/\.\.\/ar\/news\/"/, 'language switch falls back to the Arabic hub, not a fake URL');
  assert.match(en, /class="lang-toggle" href="\.\.\/\.\.\/ar\/gold\/2026-09-28\/"/, 'switch goes to the published translation');
  assert.match(ar, /class="lang-toggle" href="\.\.\/\.\.\/\.\.\/gold\/2026-09-28\/"/);
});

test('structured data only where accurate: Article/NewsArticle, organisation author, never for signals', () => {
  const { read } = once();
  const ld = h => { const m = h.match(/<script type="application\/ld\+json">([^<]*)<\/script>/); return m ? JSON.parse(m[1]) : null; };
  const news = ld(read('news/test-cpi-release/index.html'));
  assert.equal(news['@type'], 'NewsArticle'); assert.equal(news.datePublished, '2026-09-28T12:35:00Z'); assert.equal(news.inLanguage, 'en');
  assert.deepEqual(news.author, { '@type': 'Organization', name: 'FOXREX', url: 'https://foxrex.co/' }, 'no invented person');
  assert.equal(ld(read('analysis/test-eurusd-ecb/index.html'))['@type'], 'Article');
  for (const f of ['signals/test-xau-long/index.html', 'signals/test-xau-wait/index.html', 'signals/results/test-xau-long-result/index.html']) assert.equal(ld(read(f)), null, f);
  const all = fs.readdirSync(once().dir, { recursive: true }).filter(f => f.endsWith('.html')).map(f => read(f)).join('');
  assert.ok(!/legalName|"license"|"address"|"foundingDate"/.test(all), 'no legal or organisation claims');
});

test('item pages show freshness honestly: "as of" time, snapshot price with source, stale notice decided in the browser', () => {
  const { read } = once();
  const g = read('gold/2026-09-28/index.html');
  assert.match(g, /data-valid-until="2026-09-29T08:00:00Z" data-data-as-of="2026-09-28T07:58:00Z">Levels as of/);
  assert.match(g, /Price at time of writing: <span class="fx-sym">XAUUSD<\/span> <span class="ltr num">2,361\.4<\/span> · TEST fixture provider · <time/);
  assert.match(g, /<div class="fx-notice fx-notice--info" data-stale-notice hidden>/);
  assert.match(g, /scripts\/public\/item\.js/);
  assert.ok(!/fx-ticker|data-px/.test(g), 'no live-quote widget on editorial pages');
  const lesson = read('learn/test-yields/index.html');
  assert.ok(!lesson.includes('data-stale-notice') && !lesson.includes('item.js'), 'evergreen lessons never expire');
  const pre = read('desk/2026-09-28/us-session-preview/index.html');
  assert.match(pre, /US cash open: 09:30 New York = 16:30 IST/, 'the preview states the computed open; 15:30 is not the open');
  assert.match(read('signals/test-xau-wait/index.html'), /not an order or an instruction/);
});

test('attribution and sources on every item; result links to its signal', () => {
  const { read } = once();
  assert.match(read('news/test-cpi-release/index.html'), /By FOXREX Desk/);
  assert.match(read('news/test-cpi-release/index.html'), /<a href="https:\/\/example\.org\/foxrex-test-source" rel="noopener nofollow" target="_blank">TEST fixture source \(Example\)<\/a>/);
  assert.match(read('signals/results/test-xau-long-result/index.html'), /href="\.\.\/\.\.\/\.\.\/signals\/test-xau-long\/">The original signal/);
});

test('escaping: content is plain text in, escaped HTML out (renderer does not trust the feed)', () => {
  const feed = fixtureFeed();
  const i = feed.items.findIndex(e => e.type === 'ANALYSIS');
  feed.items[i] = { ...feed.items[i], title: 'TEST Gold & "yields" < 2400 \'q\'', summary: 'TEST <script>alert(1)</script>', body: 'TEST <img src=x onerror=alert(1)>', sources: [{ name: 'x', url: 'javascript:alert(1)' }] };
  const { r, read } = build(feed);
  assert.equal(r.status, 0, r.stderr);
  const h = read('analysis/test-eurusd-ecb/index.html');
  assert.ok(h.includes('TEST Gold &amp; &quot;yields&quot; &lt; 2400'));
  assert.ok(!h.includes('<script>alert(1)') && !h.includes('<img src=x') && h.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!h.includes('href="javascript:'), 'unsafe source URLs are never linked');
});

test('withdrawn items: the URL answers with a noindex notice and leaves listings and the sitemap', () => {
  const feed = CMS.removeFromFeed(fixtureFeed(), 'news-2026-09-28-test-cpi-release-en', { id: 'pub_test00000042', at: '2026-09-29T09:00:00Z', contentId: 'x', action: 'unpublish' });
  const { r, read } = build(feed);
  assert.equal(r.status, 0, r.stderr);
  const h = read('news/test-cpi-release/index.html');
  assert.match(h, /<meta name="robots" content="noindex">/); assert.match(h, /withdrawn on 29 Sept 2026, 12:00 IST/);
  assert.ok(!h.includes('TEST paragraph one'), 'the withdrawn body is not served');
  assert.ok(!read('sitemap.xml').includes('news/test-cpi-release/'));
  assert.ok(!read('archive/2026-09/index.html').includes('news/test-cpi-release/'));
});

test('archives and listings exist only with qualifying content', () => {
  const { exists, read } = once();
  for (const f of ['desk/index.html', 'archive/index.html', 'archive/2026-09/index.html', 'analysis/weekly-outlook/index.html', 'signals/results/index.html', 'ar/desk/index.html', 'ar/archive/2026-09/index.html']) assert.ok(exists(f), f);
  for (const f of ['ar/analysis/weekly-outlook/index.html', 'ar/signals/results/index.html']) assert.ok(!exists(f), `${f}: no Arabic items → no page`);
  assert.match(read('signals/results/index.html'), /href="\.\.\/\.\.\/signals\/results\/test-xau-long-result\/"/);
  const empty = build(CMS.EMPTY_FEED());
  assert.equal(empty.r.status, 0, empty.r.stderr);
  for (const f of ['desk/index.html', 'archive/index.html', 'signals/results/index.html', 'analysis/weekly-outlook/index.html']) assert.ok(!empty.exists(f), `${f} must not exist without content`);
  assert.deepEqual(JSON.parse(empty.read('data/generated-content.json')).files, []);
  // Generated content pages carry no placeholder states at all (the page exists only because content exists).
  const generated = JSON.parse(read('data/generated-content.json')).files.map(f => read(f).replace(/<footer[\s\S]*<\/footer>/, '')).join('');
  for (const phrase of ['Not yet published', 'not published', 'Coming soon', 'coming soon', 'No data', 'Feed unavailable', 'fx-empty', '>—<']) assert.ok(!generated.includes(phrase), phrase);
});

test('sitemap lists every published item with lastmod and alternates', () => {
  const { read } = once();
  const sm = read('sitemap.xml');
  for (const e of fixtureFeed().items) assert.ok(sm.includes(`<loc>https://foxrex.co/${CMS.pathFor(e.urlPath, e.language)}</loc>`), e.urlPath);
  assert.match(sm, /<loc>https:\/\/foxrex\.co\/gold\/2026-09-28\/<\/loc><xhtml:link rel="alternate" hreflang="en" href="https:\/\/foxrex\.co\/gold\/2026-09-28\/"\/><xhtml:link rel="alternate" hreflang="ar" href="https:\/\/foxrex\.co\/ar\/gold\/2026-09-28\/"\/><xhtml:link rel="alternate" hreflang="x-default"[^>]*\/><lastmod>2026-09-28T08:00:00Z<\/lastmod>/);
  assert.match(sm, /<loc>https:\/\/foxrex\.co\/<\/loc>/, 'static pages stay');
});

test('deterministic, planned and orphan-safe: same feed → no change; removed items lose their generated page only', () => {
  const b = build(fixtureFeed());
  const again = build(fixtureFeed(), b.dir, '--check');
  assert.equal(again.r.status, 0, again.r.stderr + again.r.stdout);
  const plan = build(fixtureFeed(), b.dir, '--plan');
  assert.deepEqual(JSON.parse(plan.r.stdout).write, [], 'nothing to write when up to date');
  fs.mkdirSync(path.join(b.dir, 'analysis/hand-made'), { recursive: true }); fs.writeFileSync(path.join(b.dir, 'analysis/hand-made/index.html'), 'not generated');
  const smaller = fixtureFeed(); smaller.items = smaller.items.filter(e => e.type !== 'WEEKLY_OUTLOOK');
  const p = JSON.parse(build(smaller, b.dir, '--plan').r.stdout);
  assert.deepEqual(p.remove.sort(), ['analysis/test-week-41/index.html', 'analysis/weekly-outlook/index.html']);
  assert.equal(build(smaller, b.dir, '--check').r.status, 1, '--check reports orphans');
  build(smaller, b.dir);
  assert.ok(!b.exists('analysis/test-week-41/index.html') && !b.exists('analysis/weekly-outlook/index.html'));
  assert.ok(b.exists('analysis/hand-made/index.html'), 'files not generated by the content build are never removed');
});

test('relative links on generated pages resolve (within the build or the repository assets)', () => {
  const { dir } = once();
  for (const f of fs.readdirSync(dir, { recursive: true }).filter(f => f.endsWith('index.html'))) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^(https?:|mailto:|#)/.test(url)) continue;
      const clean = url.split(/[?#]/)[0]; if (!clean) continue;
      const rel = path.relative(dir, path.resolve(path.dirname(path.join(dir, f)), clean));
      assert.ok(!rel.startsWith('..'), `${f}: ${url} escapes the site root`);
      const target = clean.endsWith('/') ? path.join(rel, 'index.html') : rel;
      assert.ok(fs.existsSync(path.join(dir, target)) || fs.existsSync(path.join(ROOT, target)), `${f}: broken ${url}`);
    }
  }
});
