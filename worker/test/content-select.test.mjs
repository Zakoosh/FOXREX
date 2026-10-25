/* Derived placements: one canonical item → many listings. Homepage selection contract and graceful absence.
   Fixture content only (TEST). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { CMS, fixtureFeed } from './fixtures/content-v3.mjs';

const require = createRequire(import.meta.url);
const S = require('../../scripts/content/select.js');
const T = Date.parse;

test('selectors are queries over the canonical feed (no duplicated items)', () => {
  const feed = fixtureFeed(), now = T('2026-09-28T23:00:00Z');
  const en = S.publishedForLanguage(feed, 'en', now), ar = S.publishedForLanguage(feed, 'ar', now);
  assert.ok(en.every(e => e.language === 'en') && ar.every(e => e.language === 'ar'));
  assert.equal(en.length + ar.length, feed.items.length);
  assert.deepEqual(S.latestByType(en, 'GOLD_FOCUS').map(e => e.urlPath), ['gold/2026-09-28/']);
  assert.ok(S.latestByInstrument(en, 'xauusd').every(e => (e.instruments || []).includes('XAUUSD')));
  assert.deepEqual(S.latestByTag(en, 'central-banks').map(e => e.type), ['ANALYSIS']);
  assert.ok(S.latestByLayer(en, 'TRADING_INTELLIGENCE').some(e => e.type === 'GOLD_FOCUS') && S.latestByLayer(en, 'MARKET_INTELLIGENCE').some(e => e.type === 'GOLD_FOCUS'), 'Gold Focus belongs to both layers');
  assert.ok(!S.latestByLayer(en, 'TRADING_INTELLIGENCE').some(e => e.type === 'NEWS'), 'layers are not collapsed');
  assert.equal(S.publishedBetween(en, '2026-09-28T06:00:00Z', '2026-09-28T09:00:00Z').length, 3);
  assert.equal(S.todayInIstanbul(en, now, '2026-09-28').length, en.length - 1, 'the weekly outlook belongs to the 27th');
  assert.equal(S.latestMorningBrief(en, T('2026-09-28T10:00:00Z')).urlPath, 'desk/2026-09-28/morning-brief/');
  assert.equal(S.latestMorningBrief(en, T('2026-09-29T10:00:00Z')), null, 'yesterday’s brief is not today’s');
  assert.equal(S.latestMarketRecap(en, T('2026-09-28T23:00:00Z')).type, 'MARKET_RECAP');
  // Every derived placement is the same object (same id and url) as the canonical item.
  const hp = S.homepage(feed, { lang: 'en', now: T('2026-09-28T13:00:00Z') });
  const canonical = new Map(feed.items.map(i => [i.id, i]));
  for (const e of [hp.leadStory, hp.goldFocus.item, ...(hp.latestAnalysis || []), ...(hp.importantNews || [])].filter(Boolean)) assert.equal(canonical.get(e.id).urlPath, e.urlPath);
});

test('no unpublished content: future-dated, gated or withdrawn items are never selected', () => {
  const feed = fixtureFeed();
  feed.items.push({ ...feed.items.find(i => i.type === 'NEWS'), id: 'news-2030-01-01-test-future-en', translationGroupId: 'news-2030-01-01-test-future', slug: 'test-future', urlPath: 'news/test-future/', publishedAt: '2030-01-01T00:00:00Z', updatedAt: '2030-01-01T00:00:00Z' });
  feed.items.push({ ...feed.items.find(i => i.type === 'NEWS'), id: 'news-2026-09-28-test-gated-en', translationGroupId: 'news-2026-09-28-test-gated', slug: 'test-gated', urlPath: 'news/test-gated/', access: 'PREMIUM' });
  const now = T('2026-09-28T23:00:00Z');
  const en = S.publishedForLanguage(feed, 'en', now);
  assert.ok(!en.some(e => /future|gated/.test(e.id)));
  const w = CMS.removeFromFeed(fixtureFeed(), 'news-2026-09-28-test-cpi-release-en', { id: 'pub_test00000077', at: '2026-09-28T22:00:00Z', contentId: 'x', action: 'unpublish' });
  assert.ok(!S.publishedForLanguage(w, 'en', now).some(e => e.type === 'NEWS'), 'withdrawn items are not in listings');
});

test('homepage contract: each slot selected from canonical content, in Istanbul time', () => {
  const feed = fixtureFeed();
  const hp = S.homepage(feed, { lang: 'en', now: T('2026-09-28T13:00:00Z') }); // 16:00 IST Monday
  assert.equal(hp.contract, 'foxrex.homepage.v1'); assert.equal(hp.editorialDate, '2026-09-28'); assert.equal(hp.language, 'en');
  assert.equal(hp.leadStory.type, 'MORNING_BRIEF', 'the desk-flagged lead');
  assert.deepEqual(hp.today.published.map(e => e.type), ['MORNING_BRIEF', 'GOLD_FOCUS', 'EVENT', 'US_SESSION_PREVIEW']);
  assert.deepEqual(hp.today.upcoming.map(s => [s.slot, s.ist]), [['market-recap', '22:30']], 'only always-on slots, as times');
  assert.equal(hp.today.usSession.cashOpen.ist, '16:30');
  assert.equal(hp.morningBrief.id, 'morning-brief-2026-09-28-test-brief-en');
  assert.equal(hp.deskRead.regime, 'TEST mixed');
  assert.deepEqual([hp.goldFocus.item.urlPath, hp.goldFocus.current, hp.goldFocus.freshness], ['gold/2026-09-28/', true, 'FRESH']);
  assert.deepEqual(hp.tradingIntelligence.map(e => e.type), ['SIGNAL', 'TRADING_IDEA'], 'result not yet published at 16:00');
  assert.deepEqual(hp.latestAnalysis.map(e => e.type), ['ANALYSIS', 'WEEKLY_OUTLOOK']);
  assert.deepEqual(hp.importantNews.map(e => e.importance), ['HIGH']);
  assert.equal(hp.rexExplains, undefined, 'no REX note yet today → omitted, never filler');
  assert.equal(hp.marketPulse, undefined); assert.equal(hp.absent.marketPulse, 'DATA_UNAVAILABLE', 'no provider connected → pulse omitted');
  const ar = S.homepage(feed, { lang: 'ar', now: T('2026-09-28T13:00:00Z') });
  assert.ok([ar.leadStory, ar.goldFocus && ar.goldFocus.item].filter(Boolean).every(e => e.language === 'ar'), 'Arabic homepage selects Arabic records only');
  assert.equal(ar.latestAnalysis, undefined, 'no Arabic analysis → omitted (no machine translation)');
});

test('graceful absence: empty or stale slots are omitted, with an internal reason', () => {
  const empty = S.homepage(CMS.EMPTY_FEED(), { lang: 'en', now: T('2026-09-28T05:00:00Z') }); // 08:00 IST Monday
  for (const k of ['marketPulse', 'leadStory', 'morningBrief', 'goldFocus', 'tradingIntelligence', 'latestAnalysis', 'importantNews', 'rexExplains', 'deskRead']) assert.equal(empty[k], undefined, k);
  assert.equal(empty.absent.goldFocus, 'NO_CONTENT');
  assert.deepEqual(empty.today.published, []); assert.deepEqual(empty.today.upcoming.map(s => s.slot), ['morning-brief', 'gold-focus', 'us-session-preview', 'market-recap']);
  const weekend = S.homepage(CMS.EMPTY_FEED(), { lang: 'en', now: T('2026-10-03T09:00:00Z') });
  assert.equal(weekend.today, undefined, 'no desk on Saturday and nothing to show → omitted');
  const json = JSON.stringify(empty) + JSON.stringify(weekend);
  for (const phrase of ['Not published', 'Coming soon', 'No data', 'Feed unavailable', '"—"']) assert.ok(!json.includes(phrase), `contract never carries placeholder copy: ${phrase}`);

  const feed = fixtureFeed();
  const tue = S.homepage(feed, { lang: 'en', now: T('2026-09-29T10:00:00Z') }); // Tuesday 13:00 IST
  assert.deepEqual([tue.goldFocus.current, tue.goldFocus.dated, tue.goldFocus.freshness], [false, true, 'STALE'], 'yesterday’s Gold Focus is shown DATED, never as today’s');
  assert.equal(tue.morningBrief, undefined); assert.equal(tue.absent.morningBrief, 'STALE_CONTENT');
  const later = S.homepage(feed, { lang: 'en', now: T('2026-10-07T10:00:00Z') });
  assert.equal(later.goldFocus, undefined); assert.equal(later.absent.goldFocus, 'STALE_CONTENT', 'older than 7 days → omitted');
  assert.equal(later.importantNews, undefined); assert.equal(later.latestAnalysis, undefined); assert.equal(later.leadStory, undefined);
  assert.equal(later.absent.importantNews, 'STALE_CONTENT');
});

test('market pulse only shows quotes the freshness contract allows', () => {
  const now = T('2026-09-28T14:00:00Z');
  const q = (symbol, status, ageMs) => ({ symbol, status, price: 1, providerTime: new Date(now - ageMs).toISOString(), receivedAt: new Date(now).toISOString(), marketOpen: true, source: { realtime: true, attribution: 'TEST provider' } });
  const hp = S.homepage(CMS.EMPTY_FEED(), { lang: 'en', now, quotes: [q('XAUUSD', 'LIVE', 5e3), q('EURUSD', 'STALE', 40 * 60e3), { symbol: 'DXY', status: 'UNAVAILABLE' }] });
  assert.deepEqual(hp.marketPulse.quotes.map(x => [x.symbol, x.status, x.display.quoteStyle]), [['XAUUSD', 'LIVE', true]], 'stale and unavailable symbols drop out');
});

test('hreflang alternates: only published languages; x-default only when both exist', () => {
  const feed = fixtureFeed();
  const gold = feed.items.find(i => i.type === 'GOLD_FOCUS' && i.language === 'ar');
  assert.deepEqual(S.alternatesFor(feed, gold, 'https://foxrex.co'), [
    { hreflang: 'en', href: 'https://foxrex.co/gold/2026-09-28/' }, { hreflang: 'ar', href: 'https://foxrex.co/ar/gold/2026-09-28/' }, { hreflang: 'x-default', href: 'https://foxrex.co/gold/2026-09-28/' }]);
  const news = feed.items.find(i => i.type === 'NEWS');
  assert.deepEqual(S.alternatesFor(feed, news, 'https://foxrex.co'), [{ hreflang: 'en', href: 'https://foxrex.co/news/test-cpi-release/' }], 'missing translation → no fake alternate');
  assert.equal(S.translationOf(feed, news), null);
  // Independently unpublished translation: withdrawing AR removes the relationship but keeps EN intact.
  const w = CMS.removeFromFeed(feed, gold.id, { id: 'pub_test00000055', at: '2026-09-28T12:00:00Z', contentId: gold.id, action: 'unpublish' });
  const en = w.items.find(i => i.type === 'GOLD_FOCUS');
  assert.equal(S.translationOf(w, en), null); assert.equal(S.alternatesFor(w, en, '').length, 1);
});

test('archives exist only with qualifying content', () => {
  assert.deepEqual(S.archives([]), {});
  const en = S.publishedForLanguage(fixtureFeed(), 'en', T('2026-09-29T00:00:00Z'));
  const a = S.archives(en);
  assert.ok(a.desk.length && a.weeklyOutlook.length === 1 && a.signalResults.length === 1);
  assert.deepEqual(Object.keys(a.months), ['2026-09']);
  const ar = S.archives(S.publishedForLanguage(fixtureFeed(), 'ar', T('2026-09-29T00:00:00Z')));
  assert.equal(ar.weeklyOutlook, undefined); assert.equal(ar.signalResults, undefined, 'no Arabic results → no Arabic results archive');
});
