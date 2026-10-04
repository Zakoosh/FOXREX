/* Content model v3: layers, type-specific validation, identity, permanent URLs, EN/AR pairing, schema, security.
   All content here is TEST fixture data (worker/test/fixtures/content-v3.mjs). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEntry } from '../src/content-v3.js';
import { checkFeed } from '../../tools/site/check-feed.mjs';
import { CMS, record, fixtureRecords, fixtureFeed, GOLD_FIELDS, at, DAY } from './fixtures/content-v3.mjs';

const fieldsOf = errs => errs.map(e => e.field);
const ok = r => assert.deepEqual(CMS.validateRecord(r, 'publish'), [], r.id);
const feedOk = (feed, now) => checkFeed(feed, { allowTestContent: true, now });

test('every v3 type has an explicit layer; social formats have none and never reach the website', () => {
  for (const t of CMS.FEED_TYPES) assert.ok(['MARKET_INTELLIGENCE', 'TRADING_INTELLIGENCE'].includes(CMS.TYPES[t].layer), t);
  for (const t of ['TRADING_IDEA', 'SIGNAL', 'SIGNAL_RESULT', 'GOLD_FOCUS']) assert.equal(CMS.TYPES[t].layer, 'TRADING_INTELLIGENCE', t);
  for (const t of ['MORNING_BRIEF', 'NEWS', 'ANALYSIS', 'WEEKLY_OUTLOOK', 'REX_EXPLAINS', 'US_SESSION_PREVIEW', 'MARKET_RECAP', 'EVENT']) assert.equal(CMS.TYPES[t].layer, 'MARKET_INTELLIGENCE', t);
  assert.deepEqual(CMS.TYPES.GOLD_FOCUS.layers, ['MARKET_INTELLIGENCE', 'TRADING_INTELLIGENCE'], 'Gold Focus spans both');
  assert.ok(!CMS.LAYERS.includes(undefined) && CMS.LAYERS.includes('MARKET_DATA'), 'Market Data is a layer but never an editorial type');
  for (const t of ['REEL', 'STORY', 'CAROUSEL', 'CAMPAIGN']) {
    assert.equal(CMS.TYPES[t].website, false); assert.ok(!CMS.FEED_TYPES.includes(t));
    assert.equal(CMS.routeFor({ type: t, slug: 'test-x' }, DAY), null, `${t} has no URL`);
    assert.ok(CMS.validateRecord({ ...CMS.blankRecord(t, 'en'), id: 'reel-x-test-en', status: 'APPROVED' }, 'publish').some(e => /Social-only/.test(e.message)));
  }
});

test('valid fixture records of every type pass publish validation', () => {
  for (const [r] of fixtureRecords()) ok(r);
});

test('type-specific validation rejects what each type requires', () => {
  const idea = record('TRADING_IDEA', 'en', 'idea', { symbol: 'XAUUSD', fields: { stance: 'BUY', condition: 'c', invalidation: 'i', rationale: 'r', validUntil: '2026-10-02T00:00:00Z' } });
  assert.ok(fieldsOf(CMS.validateRecord(idea, 'publish')).includes('fields.zone'), 'BUY/SELL idea needs a zone');
  const wait = record('TRADING_IDEA', 'en', 'idea', { symbol: 'XAUUSD', fields: { stance: 'WAIT', condition: 'c', invalidation: 'i', rationale: 'r', validUntil: '2026-10-02T00:00:00Z' } });
  ok(wait); // WAIT is a first-class stance without a zone
  const noUntil = record('TRADING_IDEA', 'en', 'idea', { symbol: 'XAUUSD', fields: { stance: 'WAIT', condition: 'c', invalidation: 'i', rationale: 'r' } });
  assert.ok(fieldsOf(CMS.validateRecord(noUntil, 'publish')).includes('fields.validUntil'));
  assert.ok(fieldsOf(CMS.validateRecord(record('TRADING_IDEA', 'en', 'idea', { symbol: 'XAUUSD', fields: { stance: 'MAYBE' } }), 'publish')).includes('fields.stance'));
  assert.ok(fieldsOf(CMS.validateRecord(record('WEEKLY_OUTLOOK', 'en', 'wo', { body: '' }), 'publish')).includes('body'));
  assert.ok(fieldsOf(CMS.validateRecord(record('REX_EXPLAINS', 'en', 'rx', { fields: { format: 'poem' } }), 'publish')).includes('fields.format'));
  const gold = record('GOLD_FOCUS', 'en', 'gold', { bias: 'neutral', fields: { ...GOLD_FIELDS, keySupport: [] } });
  assert.ok(fieldsOf(CMS.validateRecord(gold, 'publish')).includes('fields.keySupport'));
  const px = record('GOLD_FOCUS', 'en', 'gold', { bias: 'neutral', fields: { ...GOLD_FIELDS, priceSource: '' } });
  assert.ok(fieldsOf(CMS.validateRecord(px, 'publish')).includes('fields.priceSource'), 'a price needs its source');
  const fresh = record('ANALYSIS', 'en', 'a', { symbol: 'EURUSD', category: 'fx', bias: 'neutral', fields: { dataAsOf: '2026-09-28T10:00:00Z', validUntil: '2026-09-28T09:00:00Z' } });
  assert.ok(fieldsOf(CMS.validateRecord(fresh, 'publish')).includes('fields.validUntil'), 'validUntil after dataAsOf');
});

test('sources: provenance fields, type enum, https only; news needs an EXTERNAL linked source', () => {
  const news = s => record('NEWS', 'en', 'n', { category: 'fx', sourceReferences: s, fields: { importance: 'HIGH', affectedMarkets: ['EURUSD'] } });
  ok(news([{ name: 'ECB', url: 'https://example.org/ecb', publisher: 'Example', sourceType: 'central-bank', publishedAt: '2026-09-28T12:15:00Z', retrievedAt: '2026-09-28T12:16:00Z' }]));
  assert.ok(fieldsOf(CMS.validateRecord(news([{ name: 'Desk', url: 'https://example.org/x', sourceType: 'internal-analysis' }]), 'publish')).includes('sourceReferences'), 'internal analysis is not a news source');
  assert.ok(fieldsOf(CMS.validateRecord(news([{ name: 'X', url: 'https://example.org/x', sourceType: 'rumour' }]), 'publish')).includes('sourceReferences.0.sourceType'));
  for (const url of ['javascript:alert(1)', 'http://example.org/x', 'https://exa mple.org', 'data:text/html,<b>x</b>', 'https://example.org/"onmouseover="x'])
    assert.ok(CMS.validateRecord(news([{ name: 'X', url }]), 'draft').some(e => /sourceReferences\.0\.url|HTML/.test(e.field + e.message)), `rejected: ${url}`);
  assert.ok(fieldsOf(CMS.validateRecord(news([]), 'publish')).includes('sourceReferences'), 'no source → not publishable');
});

test('access: PUBLIC publishes; MEMBER and PREMIUM are reserved (no paywall yet)', () => {
  const [[gold]] = fixtureRecords().filter(([r]) => r.type === 'GOLD_FOCUS');
  for (const a of ['MEMBER', 'PREMIUM']) assert.ok(fieldsOf(CMS.validateRecord({ ...gold, access: a }, 'publish')).includes('access'));
  assert.ok(fieldsOf(CMS.validateRecord({ ...gold, access: 'VIP' }, 'draft')).includes('access'));
  const feed = fixtureFeed();
  feed.items[0] = { ...feed.items[0], access: 'PREMIUM' };
  assert.ok(feedOk(feed).some(e => /only PUBLIC/.test(e)), 'integrity blocks gated content in the public feed');
});

test('security: markup and script injection are rejected in records and in the feed', () => {
  for (const evil of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'click javascript:alert(1)', 'x onload=alert(1)', '<iframe src=//evil>'])
    assert.ok(CMS.validateRecord(record('ANALYSIS', 'en', 'a', { title: evil }), 'draft').some(e => e.field === 'title'), evil);
  assert.ok(CMS.validateRecord(record('ANALYSIS', 'en', 'a', { fields: { invalidation: '<b>x</b>' } }), 'draft').some(e => e.field === 'fields.invalidation'));
  const feed = fixtureFeed(); feed.items[1] = { ...feed.items[1], summary: '<svg onload=alert(1)>' };
  assert.ok(feedOk(feed).some(e => /markup/.test(e)));
  const feed2 = fixtureFeed(); feed2.items[1] = { ...feed2.items[1], sources: [{ name: 'x', url: 'javascript:alert(1)' }] };
  assert.ok(checkFeed(feed2, { allowTestContent: true }).length, 'unsafe source URL rejected by schema');
  assert.equal(CMS.routeFor({ type: 'NEWS', slug: '../../etc/passwd' }), null, 'path traversal cannot become a route');
  assert.equal(CMS.routeFor({ type: 'NEWS', slug: 'Test Slug' }), null);
});

test('stable identity: id is not derived from the title; a title change keeps id, URL and first publication time', () => {
  const r = record('ANALYSIS', 'en', 'eurusd-ecb', { symbol: 'EURUSD', category: 'fx', bias: 'bearish' });
  let feed = CMS.EMPTY_FEED();
  const v1 = buildEntry(r, { at: at('10:00'), feed, version: 1 }).entry;
  feed = CMS.applyToFeed(feed, v1, { id: 'pub_test00000001', at: v1.updatedAt, contentId: r.id, action: 'publish' });
  const renamed = { ...r, title: 'TEST a completely different headline' };
  const v2 = buildEntry(renamed, { at: '2026-09-29T07:00:00Z', feed, version: 2 }).entry;
  assert.equal(v2.id, r.id); assert.equal(v2.urlPath, v1.urlPath); assert.equal(v2.urlPath, 'analysis/test-eurusd-ecb/');
  assert.equal(v2.publishedAt, v1.publishedAt, 'publishedAt is the first publication'); assert.equal(v2.updatedAt, '2026-09-29T07:00:00Z');
  assert.equal(v2.editorialDate, v1.editorialDate);
  const slugChange = buildEntry({ ...r, slug: 'test-other' }, { at: '2026-09-29T07:00:00Z', feed, version: 2 });
  assert.ok(slugChange.errors.some(e => /fixed after first publication/.test(e.message)), 'slug is locked once published');
});

test('permanent URL rules: deterministic routes per type; desk and gold routes use the Istanbul editorial date', () => {
  const feed = fixtureFeed();
  const path = (type, lang = 'en') => feed.items.find(i => i.type === type && i.language === lang).urlPath;
  assert.equal(path('MORNING_BRIEF'), 'desk/2026-09-28/morning-brief/');
  assert.equal(path('MARKET_RECAP'), 'desk/2026-09-28/market-recap/');
  assert.equal(path('US_SESSION_PREVIEW'), 'desk/2026-09-28/us-session-preview/');
  assert.equal(path('EVENT'), 'desk/2026-09-28/event/');
  assert.equal(path('GOLD_FOCUS'), 'gold/2026-09-28/');
  assert.equal(path('NEWS'), 'news/test-cpi-release/');
  assert.equal(path('TRADING_IDEA'), 'signals/test-xau-wait/');
  assert.equal(path('SIGNAL'), 'signals/test-xau-long/');
  assert.equal(path('SIGNAL_RESULT'), 'signals/results/test-xau-long-result/');
  assert.equal(path('WEEKLY_OUTLOOK'), 'analysis/test-week-41/');
  assert.ok(feed.items.some(i => i.urlPath === 'learn/test-yields/') && feed.items.some(i => i.urlPath === 'desk/2026-09-28/rex-note/'));
  // 23:30 IST on 28 Sep is 20:30Z — still the 28th in Istanbul; 00:30 IST on the 29th is 21:30Z on the 28th UTC.
  const late = buildEntry(record('MARKET_RECAP', 'en', 'late'), { at: '2026-09-28T21:30:00Z', feed: CMS.EMPTY_FEED(), version: 1 }).entry;
  assert.equal(late.urlPath, 'desk/2026-09-29/market-recap/', 'editorial date is the Istanbul day, not the UTC day');
  for (const e of feed.items) { assert.ok(CMS.ROUTE_RE.test(e.urlPath), e.urlPath); assert.ok(!e.urlPath.includes('?')); }
  assert.equal(CMS.canonicalUrl('news/test-x/', 'ar', 'https://foxrex.co'), 'https://foxrex.co/ar/news/test-x/', 'Arabic under /ar/, never ?lang=');
  assert.ok(CMS.validateRecord(record('ANALYSIS', 'en', 'x', { slug: 'weekly-outlook' }), 'publish').some(e => /reserved/.test(e.message)), 'reserved slugs');
  assert.ok(CMS.validateRecord(record('SIGNAL', 'en', 'x', { slug: 'results' }), 'publish').some(e => /reserved/.test(e.message)));
});

test('slug collisions: a path owned by another item, or a second desk piece for the same day, is refused', () => {
  const feed = fixtureFeed();
  const other = buildEntry(record('NEWS', 'en', 'cpi-release', { category: 'economic', sourceReferences: [{ name: 'x', url: 'https://example.org/x' }], fields: { importance: 'LOW' } }, 'news-2026-09-28-test-cpi-release-2'), { at: at('16:00'), feed, version: 1 });
  assert.ok(other.errors.some(e => e.code === 'ROUTE_COLLISION' && /already belongs to another item/.test(e.message)));
  const second = buildEntry(record('MORNING_BRIEF', 'en', 'brief-two', {}, 'morning-brief-2026-09-28-test-brief-two'), { at: at('09:30'), feed, version: 1 });
  assert.ok(second.errors.some(e => e.code === 'ROUTE_COLLISION' && /Update that item instead/.test(e.message)));
  const dup = fixtureFeed(); dup.items.push({ ...dup.items.find(i => i.type === 'NEWS'), id: 'news-2026-09-28-test-dup-en', translationGroupId: 'news-2026-09-28-test-dup' });
  assert.ok(feedOk(dup).some(e => /already used by another item|belongs to another translation group/.test(e)), 'integrity catches duplicates too');
});

test('EN/AR: separate records sharing translationGroupId and one path; AR keeps the EN date even when published later', () => {
  const feed = fixtureFeed();
  const en = feed.items.find(i => i.type === 'GOLD_FOCUS' && i.language === 'en'), ar = feed.items.find(i => i.type === 'GOLD_FOCUS' && i.language === 'ar');
  assert.notEqual(en.id, ar.id); assert.equal(en.translationGroupId, ar.translationGroupId); assert.equal(en.urlPath, ar.urlPath);
  assert.notEqual(en.title, ar.title); assert.notEqual(en.publishedAt, ar.publishedAt, 'each language has its own timestamps');
  const lateAr = record('ANALYSIS', 'ar', 'eurusd-ecb', { symbol: 'EURUSD', category: 'fx', bias: 'bearish' }, feed.items.find(i => i.type === 'ANALYSIS').translationGroupId);
  assert.equal(buildEntry(lateAr, { at: '2026-09-30T09:00:00Z', feed, version: 1 }).entry.urlPath, 'analysis/test-eurusd-ecb/');
  const arBrief = buildEntry(record('MARKET_RECAP', 'ar', 'recap', {}, feed.items.find(i => i.type === 'MARKET_RECAP').translationGroupId), { at: '2026-09-29T08:00:00Z', feed, version: 1 }).entry;
  assert.equal(arBrief.urlPath, 'desk/2026-09-28/market-recap/', 'the pair shares the first edition date');
  const mismatch = buildEntry({ ...lateAr, slug: 'test-different' }, { at: '2026-09-30T09:00:00Z', feed, version: 1 });
  assert.ok(mismatch.errors.some(e => /share one permanent path/.test(e.message)));
  const bad = fixtureFeed(); const i = bad.items.findIndex(x => x.type === 'GOLD_FOCUS' && x.language === 'ar'); bad.items[i] = { ...bad.items[i], urlPath: 'gold/2026-09-29/', editorialDate: '2026-09-29' };
  assert.ok(feedOk(bad).some(e => /must share the same permanent path/.test(e)));
});

test('feed schema v3: fixture feed validates; missing contract fields are rejected', () => {
  const feed = fixtureFeed();
  assert.deepEqual(feedOk(feed), []);
  assert.equal(feed.schemaVersion, 3);
  for (const k of ['urlPath', 'layer', 'attribution', 'access', 'editorialDate']) {
    const f = fixtureFeed(); delete f.items[0][k];
    assert.ok(feedOk(f).some(e => e.includes(k)), `missing ${k} rejected`);
  }
  const wrongLayer = fixtureFeed(); const s = wrongLayer.items.findIndex(x => x.type === 'SIGNAL'); wrongLayer.items[s] = { ...wrongLayer.items[s], layer: 'MARKET_INTELLIGENCE' };
  assert.ok(feedOk(wrongLayer).length, 'a signal cannot be filed as market intelligence');
  const noSignal = fixtureFeed(); noSignal.items = noSignal.items.filter(x => x.type !== 'SIGNAL');
  assert.ok(feedOk(noSignal).some(e => /result references a signal/.test(e)));
  const legacy = fixtureFeed(); legacy.items[0] = { ...legacy.items[0], type: 'US_OPEN' };
  assert.ok(feedOk(legacy).length, 'legacy type names never enter the v3 feed');
  assert.ok(checkFeed(fixtureFeed(), { allowTestContent: false }).some(e => /test fixture/.test(e)), 'fixtures are blocked outside test repos');
});

test('freshness block: price-sensitive entries carry dataAsOf/validUntil; evergreen lessons and results do not expire', () => {
  const feed = fixtureFeed();
  const by = t => feed.items.find(i => i.type === t && i.language === 'en');
  assert.deepEqual(by('GOLD_FOCUS').freshness, { dataAsOf: '2026-09-28T07:58:00Z', dataAsOfBasis: 'price-snapshot', sourceTimestamp: '2026-09-28T07:58:00Z', validUntil: '2026-09-29T08:00:00Z', stalePolicy: 'label-dated' });
  assert.deepEqual(by('GOLD_FOCUS').priceRef, { symbol: 'XAUUSD', price: 2361.4, source: 'TEST fixture provider', sourceTimestamp: '2026-09-28T07:58:00Z' });
  assert.equal(by('MORNING_BRIEF').freshness.validUntil, '2026-09-29T06:00:00Z', 'brief valid until the next 09:00 IST');
  assert.equal(by('TRADING_IDEA').freshness.validUntil, '2026-10-02T14:00:00Z', 'editor-set validity wins');
  assert.equal(by('SIGNAL_RESULT').freshness, undefined);
  assert.equal(feed.items.find(i => i.format === 'lesson').freshness, undefined);
  assert.equal(by('MORNING_BRIEF').attribution.byline, 'FOXREX Desk');
  assert.equal(by('MORNING_BRIEF').author, undefined, 'no author identity is invented');
  assert.deepEqual(by('MORNING_BRIEF').deskRead, { regime: 'TEST mixed', usd: 'TEST firm', yields: 'TEST higher', volatility: 'TEST low', nextEvent: 'TEST US data 15:30 IST' });
});

test('withdrawn items keep their URL as a tombstone and leave every listing', () => {
  let feed = fixtureFeed();
  const news = feed.items.find(i => i.type === 'NEWS');
  feed = CMS.removeFromFeed(feed, news.id, { id: 'pub_test00000099', at: '2026-09-29T09:00:00Z', contentId: news.id, action: 'unpublish' });
  assert.ok(!feed.items.some(i => i.id === news.id));
  assert.deepEqual(feed.withdrawn.map(w => [w.id, w.urlPath, w.withdrawnAt]), [[news.id, news.urlPath, '2026-09-29T09:00:00Z']]);
  assert.deepEqual(feedOk(feed), []);
  const again = buildEntry(record('NEWS', 'en', 'cpi-release', {}, news.translationGroupId), { at: '2026-09-30T09:00:00Z', feed, version: 2 });
  assert.equal(again.urlPath, news.urlPath, 'republishing restores the same URL');
  const other = buildEntry(record('NEWS', 'en', 'cpi-release', {}, 'news-2026-09-30-test-cpi-release'), { at: '2026-09-30T09:00:00Z', feed, version: 1 });
  assert.ok(other.errors.some(e => e.code === 'ROUTE_COLLISION'), 'a withdrawn URL is never reused by different content');
});
