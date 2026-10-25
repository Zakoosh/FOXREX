/* TEST FIXTURES ONLY — never production content.
   Every title starts with "TEST", every slug/id contains "test", sources point at the reserved
   example.org domain, and prices are labelled fixture data. The feed integrity guard rejects all of
   them outside isolated test repositories (FOXREX_ALLOW_TEST_CONTENT=1 is set only by tests). */
import { createRequire } from 'node:module';
import { buildEntry } from '../../src/content-v3.js';

const require = createRequire(import.meta.url);
export const CMS = require('../../../studio/cms-model.js');

/** Monday 28 September 2026 in Istanbul. */
export const DAY = '2026-09-28';
export const at = (hhmmIst, day = DAY) => new Date(Date.parse(`${day}T${hhmmIst}:00+03:00`)).toISOString().replace(/\.000Z$/, 'Z');
const SRC = [{ name: 'TEST fixture source', url: 'https://example.org/foxrex-test-source', publisher: 'Example', sourceType: 'news', publishedAt: '2026-09-28T05:00:00Z' }];

/** An approved Studio record (as the CMS store would hold it), ready for buildEntry. */
export function record(type, lang, slug, patch = {}, group) {
  const r = CMS.blankRecord(type, lang, '2026-09-28T04:00:00Z', 'TEST editor');
  const g = group || CMS.makeGroupId(type, DAY, `test-${slug}`);
  Object.assign(r, {
    id: CMS.makeId(g, lang), translationGroupId: g, slug: `test-${slug}`, status: 'APPROVED', approvedAt: '2026-09-28T04:30:00Z',
    title: lang === 'ar' ? `TEST اختبار ${slug}` : `TEST ${slug.replace(/-/g, ' ')}`, summary: lang === 'ar' ? 'TEST محتوى اختباري فقط.' : 'TEST fixture content only.',
    body: lang === 'ar' ? 'TEST فقرة اختبارية.\n\nفقرة ثانية: الذهب XAUUSD عند 2350.' : 'TEST paragraph one.\n\nParagraph two: gold XAUUSD at 2350.'
  }, patch);
  r.audit.approvedBy = 'TEST editor';
  r.fields = { ...r.fields, ...(patch.fields || {}) };
  return r;
}

export const GOLD_FIELDS = { marketState: 'TEST range-bound', keySupport: ['2350', '2335'], keyResistance: ['2400'], importantLevel: '2375', bullishScenario: 'TEST break above 2400 opens 2420.', bearishScenario: 'TEST loss of 2350 shifts the bias lower.', invalidation: 'TEST daily close below 2340.', price: 2361.4, priceSource: 'TEST fixture provider', priceTime: '2026-09-28T07:58:00Z' };
export const GOLD_FIELDS_AR = { ...GOLD_FIELDS, marketState: 'TEST نطاق عرضي', bullishScenario: 'TEST اختراق 2400 يفتح المجال نحو 2420.', bearishScenario: 'TEST كسر 2350 يغيّر الاتجاه.', invalidation: 'TEST إغلاق يومي تحت 2340.' };

/** [record, publishAt] pairs covering every v3 type, EN + AR where the desk publishes both. */
export function fixtureRecords() {
  const gold = 'gold-focus-2026-09-28-test-gold';
  const sig = 'signal-2026-09-28-test-xau-long';
  const lesson = 'rex-explains-2026-09-28-test-yields';
  return [
    [record('MORNING_BRIEF', 'en', 'brief', { lead: true, fields: { deskRegime: 'TEST mixed', deskUsd: 'TEST firm', deskYields: 'TEST higher', deskVolatility: 'TEST low', deskNextEvent: 'TEST US data 15:30 IST' } }, 'morning-brief-2026-09-28-test-brief'), at('09:00')],
    [record('MORNING_BRIEF', 'ar', 'brief', { fields: { deskRegime: 'TEST مختلط' } }, 'morning-brief-2026-09-28-test-brief'), at('09:05')],
    [record('GOLD_FOCUS', 'en', 'gold', { bias: 'neutral', sourceReferences: SRC, fields: GOLD_FIELDS }, gold), at('11:00')],
    [record('GOLD_FOCUS', 'ar', 'gold', { bias: 'neutral', sourceReferences: SRC, fields: GOLD_FIELDS_AR }, gold), at('11:10')],
    [record('ANALYSIS', 'en', 'eurusd-ecb', { symbol: 'EURUSD', category: 'fx', bias: 'bearish', tags: ['central-banks'], fields: { timeframe: 'H4', keyLevels: ['1.1000', '1.0950'], bullishScenario: 'TEST reclaim 1.1000.', bearishScenario: 'TEST break of 1.0950.', invalidation: 'TEST H4 close above 1.1050.' } }), at('10:00')],
    [record('NEWS', 'en', 'cpi-release', { category: 'economic', sourceReferences: SRC, fields: { importance: 'HIGH', affectedMarkets: ['XAUUSD', 'DXY'], eventTime: '2026-09-28T12:30:00Z' } }), at('15:35')],
    [record('EVENT', 'en', 'cpi', { sourceReferences: SRC, fields: { importance: 'HIGH', affectedMarkets: ['DXY'], eventTime: '2026-09-28T12:30:00Z' } }), at('14:00')],
    [record('US_SESSION_PREVIEW', 'en', 'us-preview'), at('15:30')],
    [record('MARKET_RECAP', 'en', 'recap'), at('22:30')],
    [record('TRADING_IDEA', 'en', 'xau-wait', { symbol: 'XAUUSD', fields: { stance: 'WAIT', condition: 'TEST wait for a daily close above 2400.', invalidation: 'TEST daily close below 2340.', rationale: 'TEST the range is intact; no edge yet.', timeframe: 'D1', validUntil: '2026-10-02T14:00:00Z' } }), at('12:00')],
    [record('SIGNAL', 'en', 'xau-long', { symbol: 'XAUUSD', fields: { direction: 'BUY', entry: '2352', stopLoss: '2338', targets: ['2380', '2400'], riskMessage: 'TEST risk at most 1% per idea.', analysisContext: 'TEST support retest inside the range.', validity: 'TEST 3 days' } }, sig), at('12:30')],
    [record('SIGNAL_RESULT', 'en', 'xau-long-result', { symbol: 'XAUUSD', fields: { signalId: `${sig}-en`, direction: 'BUY', entry: '2352', exit: '2338', outcome: 'STOPPED_OUT', closedAt: '2026-09-28T17:00:00Z', resultNotes: 'TEST stopped out; recorded as a loss.' } }), at('20:05')],
    [record('REX_EXPLAINS', 'en', 'yields', { fields: { format: 'lesson', takeaway: 'TEST higher real yields raise the cost of holding gold.' } }, lesson), at('19:00')],
    [record('REX_EXPLAINS', 'ar', 'yields', { fields: { format: 'lesson', takeaway: 'TEST ارتفاع العوائد الحقيقية يرفع تكلفة الاحتفاظ بالذهب.' } }, lesson), at('19:10')],
    [record('REX_EXPLAINS', 'en', 'why-gold-fell', { fields: { format: 'note', takeaway: 'TEST a firmer dollar weighed on gold today.' } }), at('19:00')],
    [record('WEEKLY_OUTLOOK', 'en', 'week-41', { fields: { timeframe: 'W1', keyLevels: ['2300', '2450'] } }), at('20:00', '2026-09-27')]
  ];
}

/** Publishes the fixture records through the real entry builder, in time order. Returns the v3 feed. */
export function fixtureFeed(records = fixtureRecords()) {
  let feed = CMS.EMPTY_FEED();
  for (const [r, when] of [...records].sort((a, b) => a[1].localeCompare(b[1]))) {
    const { entry, errors } = buildEntry(r, { at: when, feed, version: 1 });
    if (errors.length) throw new Error(`fixture ${r.id}: ${errors.map(e => e.message).join('; ')}`);
    feed = CMS.applyToFeed(feed, entry, { id: 'pub_test' + String(feed.items.length).padStart(8, '0'), at: when, contentId: r.id, action: 'publish', version: 1 });
  }
  return feed;
}
