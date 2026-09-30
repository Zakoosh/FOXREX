#!/usr/bin/env node
/* Validates a FOXREX public content feed: JSON Schema (data/content.schema.json) + integrity rules
   (studio/cms-model.js feedIntegrity) + referenced media files exist.
   Usage: node tools/site/check-feed.mjs [feed.json] [--root <repo dir>]
   Exit 0 = valid. Used by the publishing engine before any commit, and by tests. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { validateSchema } from './jsonschema.mjs';

const require = createRequire(import.meta.url);
const HERE = fileURLToPath(new URL('../../', import.meta.url));

export function checkFeed(feed, { root = HERE, now, allowTestContent = process.env.FOXREX_ALLOW_TEST_CONTENT === '1' } = {}) {
  const CMS = require(path.join(HERE, 'studio/cms-model.js'));
  const schema = JSON.parse(fs.readFileSync(path.join(HERE, 'data/content.schema.json'), 'utf8'));
  const errors = [...validateSchema(schema, feed)];
  if (!errors.length) errors.push(...CMS.feedIntegrity(feed, { now, allowTestContent }));
  for (const it of (feed && feed.items) || []) if (it.image && !fs.existsSync(path.join(root, it.image.src))) errors.push(`items[${it.id}]: image file missing: ${it.image.src}`);
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--root'); const root = ri >= 0 ? path.resolve(args[ri + 1]) : HERE;
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--root') || path.join(root, 'data/content.json');
  let feed; try { feed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`Cannot read feed: ${e.message}`); process.exit(2); }
  const errors = checkFeed(feed, { root });
  if (errors.length) { console.error(`Feed INVALID (${errors.length}):\n  ` + errors.slice(0, 50).join('\n  ')); process.exit(1); }
  console.log(`Feed valid: ${feed.items.length} item(s), schemaVersion ${feed.schemaVersion}.`);
}
