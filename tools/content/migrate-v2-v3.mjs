#!/usr/bin/env node
/* FOXREX content feed migration: schema v2 → v3 (permanent URLs, layers, attribution, freshness).
   Deterministic and repeatable: the same input always gives byte-identical output; a v3 feed is
   left unchanged. Lossless: every v2 field is kept verbatim (renamed types keep legacyType) and the
   report proves it. It never commits, pushes or publishes — it only writes a file when asked.

   Usage:
     node tools/content/migrate-v2-v3.mjs                      dry run on data/content.json (default)
     node tools/content/migrate-v2-v3.mjs --in f.json          dry run on another file
     node tools/content/migrate-v2-v3.mjs --write              write the v3 feed in place (backup first)
     node tools/content/migrate-v2-v3.mjs --write --out o.json write elsewhere
     --backup <file>   where the untouched v2 input is copied before writing (default <in>.v2-backup.json)
     --report <file>   also write the JSON report
   Rollback: restore the backup file (or `git checkout -- data/content.json`); nothing else is touched.
   Exit: 0 = ok / nothing to do, 1 = invalid input or output, 2 = usage error. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { validateSchema } from '../site/jsonschema.mjs';
import { checkFeed } from '../site/check-feed.mjs';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CMS = require(path.join(ROOT, 'studio/cms-model.js'));
const FRESHNESS = require(path.join(ROOT, 'scripts/content/freshness.js'));

export const serialize = feed => JSON.stringify({ $schema: './content.schema.json', ...withoutSchema(feed) }, null, 2) + '\n';
const withoutSchema = f => { const { $schema, ...rest } = f; void $schema; return rest; };

/** Pure migration of a parsed feed. Returns { feed, report, errors }. */
export function migrate(input, { root = ROOT, allowTestContent = false } = {}) {
  const errors = [];
  if (input && input.schemaVersion === 2) {
    const v2schema = JSON.parse(fs.readFileSync(path.join(root, 'data/content.schema.v2.json'), 'utf8'));
    errors.push(...validateSchema(v2schema, input).map(e => `input: ${e}`));
    if (errors.length) return { feed: null, report: null, errors };
  }
  let out;
  try { out = CMS.migrateFeedV2(input, FRESHNESS.defaultValidity); } catch (e) { return { feed: null, report: null, errors: [e.message] }; }
  const { feed, report } = out;
  if (!report.alreadyV3 && feed.items.length) feed.publication = { id: 'migration-v2-v3', at: feed.updated || feed.items[0].updatedAt, contentId: 'feed', action: 'migrate', version: 0 };
  for (const c of report.collisions) errors.push(`collision: ${c.id}${c.urlPath ? ` (${c.urlPath})` : ''} — ${c.reason}. Resolve the slug in Studio, then migrate again.`);
  if (!report.lossless) errors.push(`data loss detected in: ${report.losses.join(', ')}`);
  if (!errors.length) errors.push(...checkFeed(feed, { root, allowTestContent }).map(e => `output: ${e}`));
  return { feed, report, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const known = new Set(['--write', '--in', '--out', '--backup', '--report']);
  for (const a of args) if (a.startsWith('--') && !known.has(a)) { console.error(`Unknown option ${a}`); process.exit(2); }
  const inFile = path.resolve(opt('--in') || path.join(ROOT, 'data/content.json'));
  const write = args.includes('--write');
  const outFile = path.resolve(opt('--out') || inFile);
  let raw, input;
  try { raw = fs.readFileSync(inFile, 'utf8'); input = JSON.parse(raw); } catch (e) { console.error(`Cannot read ${inFile}: ${e.message}`); process.exit(1); }
  const { feed, report, errors } = migrate(input);
  const result = { mode: write ? 'write' : 'dry-run', input: path.relative(process.cwd(), inFile) || inFile, report, errors };
  if (opt('--report')) fs.writeFileSync(path.resolve(opt('--report')), JSON.stringify(result, null, 2) + '\n');
  if (errors.length) { console.error(`Migration FAILED (${errors.length}):\n  ` + errors.slice(0, 50).join('\n  ')); process.exit(1); }
  const next = serialize(feed);
  const changed = next !== raw;
  console.log(`${report.alreadyV3 ? 'Already schema v3' : `schema v${report.from} → v${report.to}`}: ${report.items} item(s), lossless=${report.lossless}, renamed types=${report.renamedTypes.length}, collisions=${report.collisions.length}.`);
  for (const [t, n] of Object.entries(report.byType)) console.log(`  ${t}: ${n}`);
  if (!write) { console.log(changed ? `DRY RUN — ${path.relative(process.cwd(), outFile)} would change. Re-run with --write to apply.` : 'DRY RUN — no change needed.'); process.exit(0); }
  if (!changed && outFile === inFile) { console.log('No change needed; nothing written.'); process.exit(0); }
  if (outFile === inFile) {
    const backup = path.resolve(opt('--backup') || inFile.replace(/\.json$/, '') + '.v2-backup.json');
    fs.writeFileSync(backup, raw);
    console.log(`Backup of the original: ${path.relative(process.cwd(), backup)}`);
  }
  fs.writeFileSync(outFile + '.tmp', next); fs.renameSync(outFile + '.tmp', outFile);
  console.log(`Wrote ${path.relative(process.cwd(), outFile)} (nothing committed or published).`);
}
