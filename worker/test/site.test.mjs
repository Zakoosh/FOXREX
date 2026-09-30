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
  const files = [...PAGES.map(pageFile), '404.html', 'studio/index.html', 'foxrex-studio.html'];
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
  const text = PAGES.map(p => read(pageFile(p)).replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ')).join(' ');
  assert.ok(!/\d+(\.\d+)?\s*%/.test(text), 'no percentage figures (performance, accuracy, returns) in public copy');
});

test('Studio is served from /studio/, legacy URL redirects, and no credentials or fake auth ship in static files', () => {
  const studio = read('studio/index.html');
  assert.match(studio, /noindex/);
  assert.ok(!/data-protected|auth\.js|FoxAuth|login\.html/.test(studio), 'no client-side pseudo-authentication');
  assert.match(read('foxrex-studio.html'), /location\.replace\("studio\/"/);
  const shipped = [studio, read('studio/creative-studio.js'), ...PAGES.map(p => read(pageFile(p))), ...fs.readdirSync(path.join(root, 'scripts/public')).map(f => read('scripts/public/' + f))].join('\n');
  assert.ok(!/Bearer\s+[A-Za-z0-9._-]{12,}/.test(shipped), 'hard-coded bearer token');
  assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}/.test(shipped), 'secret-like value');
});
