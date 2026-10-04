/* v2 → v3 migration: lossless, deterministic, repeatable, dry run by default, never publishes.
   The v2 input below is a TEST fixture covering every v2 type, including the renamed legacy types. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { migrate, serialize } from '../../tools/content/migrate-v2-v3.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CLI = path.join(ROOT, 'tools/content/migrate-v2-v3.mjs');
const base = (type, slug, extra = {}) => ({ id: `${type.toLowerCase().replace(/_/g, '-')}-2026-09-28-test-${slug}-en`, type, language: 'en', translationGroupId: `${type.toLowerCase().replace(/_/g, '-')}-2026-09-28-test-${slug}`,
  section: extra.section, slug: `test-${slug}`, title: `TEST ${slug}`, summary: 'TEST fixture.', publishedAt: '2026-09-28T09:00:00Z', updatedAt: '2026-09-28T09:00:00Z', publishVersion: 1, ...extra });
export function v2Feed() {
  return { schemaVersion: 2, updated: '2026-09-28T20:00:00Z', publication: { id: 'pub_test0000aaaa', at: '2026-09-28T20:00:00Z', contentId: 'morning-brief-2026-09-28-test-brief-en', action: 'publish', version: 1 }, items: [
    base('MORNING_BRIEF', 'brief', { section: 'desk', slot: 'brief', body: 'TEST body.' }),
    base('US_OPEN', 'open', { section: 'desk', slot: 'open', publishedAt: '2026-09-28T12:30:00Z', updatedAt: '2026-09-28T12:30:00Z' }),
    base('GOLD_FOCUS', 'gold', { section: 'gold', slot: 'gold', symbol: 'XAUUSD', market: 'commodities', category: 'gold', bias: 'neutral', marketState: 'TEST range', keySupport: ['2350'], keyResistance: ['2400'], importantLevel: '2375', bullishScenario: 'TEST up.', bearishScenario: 'TEST down.', invalidation: 'TEST below 2340.', price: 2361.4, priceSource: 'TEST provider', priceTime: '2026-09-28T07:58:00Z', riskDisclosure: 'TEST risk.' }),
    base('ANALYSIS', 'eurusd', { section: 'analysis', symbol: 'EURUSD', category: 'fx', bias: 'bearish', timeframe: 'H4', keyLevels: ['1.1000'], riskDisclosure: 'TEST risk.', tags: ['central-banks'], image: { src: 'assets/media/test.png', alt: 'TEST chart' } }),
    base('NEWS', 'cpi', { section: 'news', category: 'economic', importance: 'HIGH', affectedMarkets: ['DXY'], sources: [{ name: 'TEST', url: 'https://example.org/x', publishedAt: '2026-09-28T08:00:00Z' }], seo: { title: 'TEST', description: 'TEST seo' } }),
    base('LEARN', 'cpi-basics', { section: 'learn', body: 'TEST lesson.' }),
    base('REX_NOTE', 'why', { section: 'learn', body: 'TEST note.' }),
    base('ASK_REX', 'question', { section: 'learn', body: 'TEST answer.' }),
    base('REX_EXPLAINS', 'explainer', { section: 'learn', body: 'TEST explainer.' }),
    base('SIGNAL', 'long', { section: 'signals', symbol: 'XAUUSD', direction: 'BUY', entry: '2352', stopLoss: '2338', targets: ['2380'], riskMessage: 'TEST risk 1%.', analysisContext: 'TEST context.', riskDisclosure: 'TEST risk.' }),
    base('SIGNAL_RESULT', 'long-result', { section: 'signals', symbol: 'XAUUSD', signalId: 'signal-2026-09-28-test-long-en', direction: 'BUY', entry: '2352', exit: '2338', outcome: 'STOPPED_OUT', closedAt: '2026-09-28T17:00:00Z', resultNotes: 'TEST loss recorded.' })
  ] };
}
const opts = { allowTestContent: true, root: makeRoot() };
function makeRoot() { // a copy of the repo root with the referenced fixture image, so the media check can pass
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fxmig-'));
  for (const f of ['data/content.schema.json', 'data/content.schema.v2.json']) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(d, f)); }
  fs.mkdirSync(path.join(d, 'assets/media'), { recursive: true }); fs.writeFileSync(path.join(d, 'assets/media/test.png'), 'x');
  return d;
}

test('v2 → v3 is lossless: every v2 field kept verbatim; renamed types keep legacyType', () => {
  const input = v2Feed();
  const { feed, report, errors } = migrate(input, opts);
  assert.deepEqual(errors, []);
  assert.equal(report.lossless, true); assert.deepEqual(report.losses, []); assert.equal(report.items, input.items.length);
  for (const src of input.items) {
    const out = feed.items.find(e => e.id === src.id);
    for (const [k, v] of Object.entries(src)) if (k !== 'type') assert.deepEqual(out[k], v, `${src.id}.${k}`);
  }
  const by = id => feed.items.find(e => e.id.includes(id));
  assert.deepEqual([by('test-open').type, by('test-open').legacyType, by('test-open').urlPath], ['US_SESSION_PREVIEW', 'US_OPEN', 'desk/2026-09-28/us-session-preview/']);
  assert.deepEqual([by('test-cpi-basics').type, by('test-cpi-basics').format, by('test-cpi-basics').urlPath], ['REX_EXPLAINS', 'lesson', 'learn/test-cpi-basics/']);
  assert.deepEqual([by('test-why').format, by('test-why').urlPath], ['note', 'desk/2026-09-28/rex-note/']);
  assert.equal(by('test-question').format, 'qa'); assert.equal(by('test-explainer').format, 'explainer');
  assert.deepEqual(report.renamedTypes.map(r => r.from).sort(), ['ASK_REX', 'LEARN', 'REX_NOTE', 'US_OPEN']);
  const gold = by('test-gold');
  assert.deepEqual(gold.freshness, { dataAsOf: '2026-09-28T07:58:00Z', dataAsOfBasis: 'migration', sourceTimestamp: '2026-09-28T07:58:00Z', validUntil: '2026-09-29T08:00:00Z', stalePolicy: 'label-dated' });
  assert.deepEqual(gold.attribution, { byline: 'FOXREX Desk', assistance: 'unknown' }, 'migration does not claim how content was produced');
  assert.equal(gold.origin, 'migration-v2'); assert.equal(gold.access, 'PUBLIC'); assert.deepEqual(gold.layers, ['MARKET_INTELLIGENCE', 'TRADING_INTELLIGENCE']);
  assert.equal(feed.schemaVersion, 3); assert.deepEqual(feed.withdrawn, []);
  assert.equal(feed.publication.action, 'migrate');
});

test('deterministic and repeatable: same input → byte-identical output; a v3 feed is left unchanged', () => {
  const a = serialize(migrate(v2Feed(), opts).feed), b = serialize(migrate(v2Feed(), opts).feed);
  assert.equal(a, b);
  const again = migrate(JSON.parse(a), opts);
  assert.equal(again.report.alreadyV3, true); assert.deepEqual(again.errors, []); assert.equal(serialize(again.feed), a);
});

test('collisions and invalid input are reported, never silently resolved', () => {
  const input = v2Feed();
  input.items.push({ ...input.items.find(i => i.type === 'NEWS'), id: 'news-2026-09-28-test-cpi-other-en', translationGroupId: 'news-2026-09-28-test-cpi-other' });
  const { errors } = migrate(input, opts);
  assert.ok(errors.some(e => /collision: news-2026-09-28-test-cpi-other-en \(news\/test-cpi\/\)/.test(e)));
  assert.ok(migrate({ schemaVersion: 2, items: 'nope' }, opts).errors.length, 'malformed v2 rejected');
  assert.ok(migrate({ schemaVersion: 7, items: [] }, opts).errors.length, 'unknown version rejected');
  assert.ok(migrate({ ...v2Feed(), items: [{ ...v2Feed().items[0], title: '<b>x</b>' }] }, opts).errors.length, 'output still passes integrity (markup rejected)');
});

test('CLI: dry run by default writes nothing; --write keeps a backup; nothing is committed or published', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fxmigcli-'));
  const file = path.join(dir, 'content.json'), raw = JSON.stringify({ schemaVersion: 2, updated: null, publication: null, items: [] }, null, 2) + '\n';
  fs.writeFileSync(file, raw);
  const dry = spawnSync(process.execPath, [CLI, '--in', file], { encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr); assert.match(dry.stdout, /DRY RUN/); assert.equal(fs.readFileSync(file, 'utf8'), raw);
  const wr = spawnSync(process.execPath, [CLI, '--in', file, '--write', '--report', path.join(dir, 'report.json')], { encoding: 'utf8' });
  assert.equal(wr.status, 0, wr.stderr);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).schemaVersion, 3);
  assert.equal(fs.readFileSync(path.join(dir, 'content.v2-backup.json'), 'utf8'), raw, 'rollback copy of the original');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')).report.lossless, true);
  const rerun = spawnSync(process.execPath, [CLI, '--in', file, '--write'], { encoding: 'utf8' });
  assert.match(rerun.stdout, /No change needed/);
  assert.equal(spawnSync(process.execPath, [CLI, '--bogus'], { encoding: 'utf8' }).status, 2);
  assert.ok(!/child_process|execFile|spawn|fetch\(/.test(fs.readFileSync(CLI, 'utf8')), 'the tool cannot run git or publish: it only reads and writes one file');
});

test('the production feed is already v3, empty, and the migration reports no change for it', () => {
  const prod = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content.json'), 'utf8'));
  assert.equal(prod.schemaVersion, 3); assert.deepEqual(prod.items, []); assert.deepEqual(prod.withdrawn, []);
  const r = spawnSync(process.execPath, [CLI], { encoding: 'utf8', cwd: ROOT });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Already schema v3: 0 item\(s\)[\s\S]*no change needed/);
});
