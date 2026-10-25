#!/usr/bin/env node
/* Owner-authorized editorial batch import. Studio approval gates remain unchanged.
   Dry run by default; --apply writes validated feed, calendar and provenance together.
   Deployment is an atomic Git commit AFTER site generation and checks pass. No git/network here. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { checkFeed } from '../site/check-feed.mjs';
import { validateCalendar } from './calendar.mjs';
const require = createRequire(import.meta.url), CMS = require('../../studio/cms-model.js');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export function preparePackage(input, previous, { now = new Date().toISOString(), root = ROOT } = {}) {
  if (input.authorization !== 'owner-authorized-2026-10-25') throw new Error('Missing editorial mandate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date !== CMS.editorialDate(now)) throw new Error('Package must use the current Istanbul date');
  if (!Array.isArray(input.records) || !input.records.length) throw new Error('No editorial records');
  if (!input.calendar || CMS.editorialDate(input.calendar.updatedAt) !== input.date) throw new Error('Calendar must be verified on package day');
  const ce = validateCalendar(input.calendar, Date.parse(now)); if (ce.length) throw new Error(ce.join('\n'));
  let feed = CMS.normalizeFeed(structuredClone(previous));
  const seen = new Set(), records = [];
  const allowed = ['MORNING_BRIEF', 'MARKET_RECAP', 'US_SESSION_PREVIEW', 'ANALYSIS', 'WEEKLY_OUTLOOK', 'REX_EXPLAINS', 'NEWS', 'EVENT', 'GOLD_FOCUS'];
  for (const raw of input.records) {
    if (!allowed.includes(raw.type)) throw new Error('Unsupported daily type');
    if (!CMS.LANGS.includes(raw.language)) throw new Error('Invalid language');
    if (raw.editorialDate && raw.editorialDate !== input.date) throw new Error('Mismatched record date');
    const r = { ...CMS.blankRecord(raw.type, raw.language, now, 'FOXREX Editorial Automation'), ...raw, status: 'DRAFT', byline: 'FOXREX Desk', aiGenerated: true };
    // IDs, publication times, routes and versions are never supplied by generated copy.
    r.translationGroupId = `daily-${input.date}-${r.slug}`;
    r.id = CMS.makeId(r.translationGroupId, r.language);
    if (seen.has(r.id)) throw new Error('Duplicate package ID'); seen.add(r.id);
    if (!r.sourceReferences?.length || r.sourceReferences.some(s => !s.url || !s.retrievedAt || CMS.editorialDate(s.retrievedAt) !== input.date || Date.parse(s.retrievedAt) > Date.parse(now))) throw new Error(`${r.id}: sources must be checked on publication day`);
    r.riskDisclosure = CMS.DEFAULT_RISK[r.language];
    const errors = CMS.validateRecord(r, 'publish'); if (errors.length) throw new Error(JSON.stringify(errors));
    const old = feed.items.find(x => x.id === r.id);
    if (old && old.origin !== 'scheduled-editorial') throw new Error('Refusing to overwrite Studio content');
    const pub = { id: 'pub_' + createHash('sha256').update(`${r.id}:${now}`).digest('hex').slice(0,24), at: now, contentId: r.id, action: 'publish', version: (old?.publishVersion || 0) + 1 };
    const entry = CMS.toFeedEntry(r, now, pub.version, { urlPath: old?.urlPath, firstPublishedAt: old?.publishedAt, editorialDate: input.date });
    entry.origin = 'scheduled-editorial';
    // Identical retry: do not increment a version or refresh freshness timestamps.
    const stable = e => Object.fromEntries(Object.entries(e).filter(([k]) => !['publishedAt','updatedAt','publishVersion','freshness'].includes(k)));
    if (old && JSON.stringify(stable(old)) === JSON.stringify(stable(entry))) continue;
    feed = CMS.applyToFeed(feed, entry, pub); records.push({ id: entry.id, urlPath: entry.urlPath, language: entry.language, publishVersion: entry.publishVersion });
  }
  const groups = new Map();
  for (const e of input.records) { const k = `${e.type}:${e.slug}`; groups.set(k, [...(groups.get(k) || []), e.language]); }
  for (const langs of groups.values()) if (!['en','ar'].every(l => langs.includes(l))) throw new Error('Each item needs both EN and AR');
  const errors = checkFeed(feed, { root, now: Date.parse(now) }); if (errors.length) throw new Error(errors.join('\n'));
  return { feed, calendar: input.calendar, receipt: { date: input.date, at: now, authorization: input.authorization, actor: 'FOXREX Editorial Automation', records } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv.slice(2).find(a => !a.startsWith('--')); if (!file) throw new Error('Usage: node tools/editorial/publish.mjs package.json [--apply]');
  const result = preparePackage(JSON.parse(fs.readFileSync(file,'utf8')), JSON.parse(fs.readFileSync(path.join(ROOT,'data/content.json'),'utf8')));
  if (process.argv.includes('--apply')) {
    const write = (rel, v) => { const f = path.join(ROOT,rel); fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n'); };
    write('data/content.json', result.feed); write('data/calendar.json',result.calendar);
    if (result.receipt.records.length) write(`content-ops/daily/${result.receipt.date}/publication.json`,result.receipt);
  }
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'applied' : 'dry-run', ...result.receipt },null,2));
}
