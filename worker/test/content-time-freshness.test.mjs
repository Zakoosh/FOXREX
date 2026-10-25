/* Istanbul editorial day, New York DST, market sessions, and the freshness contract
   (LIVE · FRESH · AGING · STALE · UNAVAILABLE; market CLOSED is separate from STALE). No prices are invented:
   every value below is a synthetic TEST input to the contract. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const TIME = require('../../scripts/content/time.js');
const F = require('../../scripts/content/freshness.js');
const MIN = 60e3, HOUR = 3600e3;

test('Istanbul editorial date is the Istanbul calendar day, never the UTC day', () => {
  assert.equal(TIME.editorialDate('2026-09-28T20:59:00Z'), '2026-09-28'); // 23:59 IST
  assert.equal(TIME.editorialDate('2026-09-28T21:00:00Z'), '2026-09-29'); // 00:00 IST, still the 28th in UTC
  assert.equal(TIME.editorialDate('2026-12-31T22:30:00Z'), '2027-01-01');
  assert.equal(TIME.offsetMinutes('2026-01-15T12:00:00Z', TIME.IST), 180); assert.equal(TIME.offsetMinutes('2026-07-15T12:00:00Z', TIME.IST), 180, 'Türkiye: UTC+3 all year');
  assert.equal(TIME.slotAt('2026-09-28', 'morning-brief').toISOString(), '2026-09-28T06:00:00.000Z');
  assert.equal(TIME.slotAt('2026-09-28', 'gold-focus').toISOString(), '2026-09-28T08:00:00.000Z');
  assert.equal(TIME.slotAt('2026-09-28', 'us-session-preview').toISOString(), '2026-09-28T12:30:00.000Z');
  assert.equal(TIME.slotAt('2026-09-28', 'market-recap').toISOString(), '2026-09-28T19:30:00.000Z');
  assert.equal(TIME.nextWeekday('2026-10-02'), '2026-10-05', 'Friday → Monday'); assert.ok(!TIME.isWeekday('2026-10-03'));
});

test('New York DST: the US cash open moves in Istanbul time; 15:30 IST is a preview, not the open', () => {
  const summer = TIME.usSession('2026-09-28'), winter = TIME.usSession('2026-12-07');
  assert.equal(summer.cashOpen.ist, '16:30'); assert.equal(summer.dataRelease.ist, '15:30'); assert.equal(summer.usDaylightTime, true);
  assert.equal(winter.cashOpen.ist, '17:30'); assert.equal(winter.dataRelease.ist, '16:30'); assert.equal(winter.usDaylightTime, false);
  for (const s of [summer, winter]) { assert.equal(s.preview.ist, '15:30'); assert.notEqual(s.cashOpen.ist, s.preview.ist); }
  // Transition weeks: US switches on 8 Mar and 1 Nov 2026.
  assert.equal(TIME.usSession('2026-03-06').cashOpen.ist, '17:30'); assert.equal(TIME.usSession('2026-03-09').cashOpen.ist, '16:30');
  assert.equal(TIME.usSession('2026-10-30').cashOpen.ist, '16:30'); assert.equal(TIME.usSession('2026-11-02').cashOpen.ist, '17:30');
  assert.equal(TIME.zonedToUtc('2026-03-08', '02:30', TIME.NY).toISOString(), '2026-03-08T07:30:00.000Z', 'spring-forward gap resolves forward');
  assert.equal(TIME.zonedToUtc('2026-11-01', '09:30', TIME.NY).toISOString(), '2026-11-01T14:30:00.000Z');
});

test('market sessions from the New York trading week; holidays are not modelled (they age into STALE)', () => {
  assert.equal(TIME.marketState('fx', '2026-10-03T12:00:00Z'), 'CLOSED', 'Saturday');
  assert.equal(TIME.marketState('fx', '2026-10-04T20:00:00Z'), 'CLOSED', 'Sunday 16:00 NY, before 17:00');
  assert.equal(TIME.marketState('fx', '2026-10-04T21:30:00Z'), 'OPEN', 'Sunday 17:30 NY');
  assert.equal(TIME.marketState('fx', '2026-10-02T21:30:00Z'), 'CLOSED', 'Friday after 17:00 NY');
  assert.equal(TIME.marketState('metal', '2026-09-28T21:30:00Z'), 'CLOSED', 'daily 17:00–18:00 NY break');
  assert.equal(TIME.marketState('metal', '2026-09-28T14:00:00Z'), 'OPEN');
  assert.equal(TIME.marketState('crypto', '2026-10-03T12:00:00Z'), 'OPEN', 'crypto trades 24/7');
  assert.equal(TIME.marketState('unknown-class', '2026-10-03T12:00:00Z'), 'UNKNOWN');
});

test('quote freshness: LIVE / FRESH / AGING / STALE / UNAVAILABLE with per-asset-class thresholds', () => {
  const now = Date.parse('2026-09-28T14:00:00Z'); // Monday, markets open
  const q = (ageMs, extra = {}) => ({ symbol: 'EURUSD', price: 1, sourceTimestamp: new Date(now - ageMs).toISOString(), realtime: true, ...extra });
  assert.equal(F.quoteFreshness(q(30e3), { now }).status, 'LIVE');
  assert.equal(F.quoteFreshness(q(30e3, { realtime: false }), { now }).status, 'FRESH', 'a delayed entitlement is never LIVE');
  assert.equal(F.quoteFreshness(q(3 * MIN), { now }).status, 'FRESH');
  assert.equal(F.quoteFreshness(q(10 * MIN), { now }).status, 'AGING');
  assert.equal(F.quoteFreshness(q(25 * MIN), { now }).status, 'STALE');
  assert.equal(F.quoteFreshness(q(12 * MIN, { symbol: 'BTCUSD' }), { now }).status, 'STALE', 'crypto goes stale after 10 min');
  assert.equal(F.quoteFreshness(q(12 * MIN, { symbol: 'EURUSD' }), { now }).status, 'AGING', 'FX allows 20 min');
  assert.equal(F.quoteFreshness(q(90e3, { symbol: 'DXY' }), { now }).status, 'LIVE', 'indices: 120 s live window');
  assert.equal(F.quoteFreshness(q(25 * MIN), { now, overrides: { fx: { staleMs: 30 * MIN } } }).status, 'AGING', 'thresholds are configurable per class');
  assert.equal(F.quoteFreshness(q(2 * HOUR, { assetClass: undefined, symbol: 'X1', dataType: 'calendar' }), { now }).status, 'FRESH', 'calendar data has its own clock');
  for (const [v, reason] of [[null, 'NO_VALUE'], [{ symbol: 'EURUSD', sourceTimestamp: new Date(now).toISOString() }, 'NO_VALID_VALUE'], [{ symbol: 'EURUSD', price: -1, sourceTimestamp: new Date(now).toISOString() }, 'NO_VALID_VALUE'],
    [{ symbol: 'EURUSD', price: 1 }, 'NO_SOURCE_TIMESTAMP'], [{ symbol: 'EURUSD', price: 1, sourceTimestamp: new Date(now + MIN).toISOString() }, 'FUTURE_SOURCE_TIMESTAMP'], [{ symbol: 'ZZZ', price: 1, sourceTimestamp: new Date(now).toISOString() }, 'UNKNOWN_ASSET_CLASS']]) {
    const r = F.quoteFreshness(v, { now }); assert.equal(r.status, 'UNAVAILABLE'); assert.equal(r.reason, reason);
  }
  // A frozen feed: received just now, but the provider timestamp is old → STALE, never LIVE.
  assert.equal(F.quoteFreshness(q(40 * MIN, { receivedAt: new Date(now).toISOString() }), { now }).status, 'STALE');
});

test('a closed market is not stale: the last value AGES (CLOSED), and only becomes STALE when too old', () => {
  const sat = Date.parse('2026-10-03T12:00:00Z'), friClose = '2026-10-02T20:59:00Z';
  const r = F.quoteFreshness({ symbol: 'XAUUSD', price: 1, sourceTimestamp: friClose, realtime: true }, { now: sat });
  assert.deepEqual([r.status, r.marketState, r.reason], ['AGING', 'CLOSED', 'MARKET_CLOSED']);
  const old = F.quoteFreshness({ symbol: 'XAUUSD', price: 1, sourceTimestamp: '2026-09-25T20:59:00Z', realtime: true }, { now: sat });
  assert.deepEqual([old.status, old.marketState], ['STALE', 'CLOSED']);
  const open = F.quoteFreshness({ symbol: 'XAUUSD', price: 1, sourceTimestamp: friClose, realtime: true }, { now: Date.parse('2026-10-05T14:00:00Z') });
  assert.deepEqual([open.status, open.marketState], ['STALE', 'OPEN'], 'once the market reopens, Friday’s close is stale');
  assert.equal(F.display('STALE').quoteStyle, false); assert.equal(F.display('STALE').showValue, false);
  assert.equal(F.display('AGING').quoteStyle, false); assert.equal(F.display('LIVE').quoteStyle, true); assert.equal(F.display('UNAVAILABLE').showValue, false);
});

test('Market Data Layer (PR #6) quotes map onto the public statuses', () => {
  const now = Date.parse('2026-09-28T14:00:00Z');
  const base = { symbol: 'XAUUSD', price: 1, providerTime: new Date(now - 20e3).toISOString(), receivedAt: new Date(now).toISOString(), marketOpen: true, source: { realtime: true, attribution: 'TEST provider' } };
  assert.equal(F.fromMarketApi({ ...base, status: 'LIVE' }, { now }).status, 'LIVE');
  assert.equal(F.fromMarketApi({ ...base, status: 'DELAYED' }, { now }).status, 'FRESH');
  assert.equal(F.fromMarketApi({ ...base, status: 'STALE' }, { now }).status, 'STALE');
  const closed = F.fromMarketApi({ ...base, status: 'MARKET_CLOSED', marketOpen: false }, { now });
  assert.deepEqual([closed.status, closed.marketState], ['AGING', 'CLOSED']);
  const un = F.fromMarketApi({ symbol: 'XAUUSD', status: 'UNAVAILABLE', reason: 'NO_PROVIDER_CONFIGURED' }, { now });
  assert.deepEqual([un.status, un.quote, un.reason], ['UNAVAILABLE', null, 'NO_PROVIDER_CONFIGURED']);
  assert.equal(F.fromMarketApi({ ...base, status: 'LIVE' }, { now }).quote.sourceTimestamp, base.providerTime, 'age is measured from the provider time');
});

test('editorial freshness: never LIVE; FRESH → AGING → STALE by validity; evergreen stays FRESH', () => {
  const item = { publishedAt: '2026-09-28T08:00:00Z', freshness: { dataAsOf: '2026-09-28T08:00:00Z', validUntil: '2026-09-29T08:00:00Z' } };
  assert.equal(F.itemFreshness(item, Date.parse('2026-09-28T09:00:00Z')).status, 'FRESH');
  assert.equal(F.itemFreshness(item, Date.parse('2026-09-28T21:00:00Z')).status, 'AGING');
  assert.equal(F.itemFreshness(item, Date.parse('2026-09-29T08:00:00Z')).status, 'STALE');
  assert.equal(F.itemFreshness({ publishedAt: '2026-09-28T08:00:00Z' }, Date.parse('2030-01-01T00:00:00Z')).status, 'FRESH', 'evergreen lesson');
  assert.equal(F.itemFreshness({ publishedAt: '2026-09-30T08:00:00Z' }, Date.parse('2026-09-28T08:00:00Z')).status, 'UNAVAILABLE', 'not yet published');
  assert.ok(!['LIVE'].includes(F.itemFreshness(item, Date.parse('2026-09-28T08:00:01Z')).status));
});

test('default validity windows follow the desk calendar (and New York for the US session)', () => {
  const v = (type, publishedAt, extra = {}) => F.defaultValidity(type, { publishedAt, ...extra });
  assert.equal(v('GOLD_FOCUS', '2026-09-28T08:00:00Z').validUntil, '2026-09-29T08:00:00Z');
  assert.equal(v('GOLD_FOCUS', '2026-10-02T08:00:00Z').validUntil, '2026-10-05T08:00:00Z', 'Friday’s Gold Focus is current until Monday 11:00');
  assert.equal(v('MARKET_RECAP', '2026-10-02T19:30:00Z').validUntil, '2026-10-05T06:00:00Z');
  assert.equal(v('US_SESSION_PREVIEW', '2026-09-28T12:30:00Z').validUntil, '2026-09-28T20:00:00Z', 'until the US cash close (summer)');
  assert.equal(v('US_SESSION_PREVIEW', '2026-12-07T12:30:00Z').validUntil, '2026-12-07T21:00:00Z', 'until the US cash close (winter)');
  assert.equal(v('NEWS', '2026-09-28T12:35:00Z').validUntil, '2026-09-30T12:35:00Z');
  assert.equal(v('ANALYSIS', '2026-09-28T07:00:00Z', { timeframe: 'H4' }).validUntil, '2026-10-01T07:00:00Z');
  assert.equal(v('EVENT', '2026-09-28T11:00:00Z').validUntil, '2026-09-28T21:00:00Z', 'end of the Istanbul day');
  assert.equal(v('REX_EXPLAINS', '2026-09-28T16:00:00Z', { format: 'lesson' }), null, 'lessons are evergreen');
  assert.equal(v('SIGNAL_RESULT', '2026-09-28T16:00:00Z'), null);
  assert.equal(v('TRADING_IDEA', '2026-09-28T16:00:00Z'), null, 'a trading idea must state its own validity');
  assert.equal(v('ANALYSIS', '2026-09-28T07:00:00Z', { validUntil: '2026-09-28T12:00:00Z' }).validUntil, '2026-09-28T12:00:00Z');
});

test('Layer A data contracts: market snapshot and economic event require provenance; nothing is invented', () => {
  assert.deepEqual(F.validateMarketSnapshot({ symbol: 'XAUUSD', price: 1.5, sourceTimestamp: '2026-09-28T14:00:00Z', receivedAt: '2026-09-28T14:00:01Z', source: 'TEST provider', marketState: 'OPEN' }), []);
  assert.ok(F.validateMarketSnapshot({ symbol: 'XAUUSD', price: 0, sourceTimestamp: 'yesterday' }).length >= 3);
  const ev = { id: 'test-us-cpi-2026-09', name: 'TEST US CPI', scheduledAt: '2026-09-28T12:30:00Z', timezone: 'America/New_York', importance: 'HIGH', source: { name: 'TEST calendar', url: 'https://example.org/calendar' } };
  assert.deepEqual(F.validateEconomicEvent(ev), []);
  assert.ok(F.validateEconomicEvent({ ...ev, source: { name: 'x' } }).some(e => /never invented/.test(e)));
  assert.ok(F.validateEconomicEvent({ ...ev, actual: '0.3%' }).some(e => /releasedAt/.test(e)), 'an actual figure needs its release time');
  assert.equal(F.assetClassOf('xauusd'), 'metal'); assert.equal(F.assetClassOf('SPX500'), 'index'); assert.equal(F.assetClassOf('NOPE'), null);
});
