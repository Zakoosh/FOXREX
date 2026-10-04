/* FOXREX v3 entry builder (trusted side). Turns an approved Studio record into its public v3 feed
   entry with a PERMANENT identity: the id never changes; the URL is fixed at first publication and
   reused on every republish; EN and AR share one path; a path owned by another item is refused.
   Validity windows come from the shared freshness contract (scripts/content/freshness.js). */
import { createRequire } from 'node:module';
import { CMS } from './cms.js';

const require = createRequire(import.meta.url);
export const TIME = require('../../scripts/content/time.js');
export const FRESHNESS = require('../../scripts/content/freshness.js');

/** Returns { entry, errors, urlPath, canonicalUrl }. Never mutates the feed or the record. */
export function buildEntry(r, { at, feed, version, origin = 'https://foxrex.co' }) {
  const errors = [];
  const f = CMS.normalizeFeed(feed);
  const all = f.items.concat(f.withdrawn);
  const existing = all.find(i => i.id === r.id);
  const sibling = all.find(i => i.translationGroupId === r.translationGroupId && i.id !== r.id);
  if (existing && existing.slug !== r.slug) errors.push({ field: 'slug', message: `The slug is fixed after first publication (permanent URL /${CMS.pathFor(existing.urlPath, r.language)}). Restore "${existing.slug}".` });
  if (sibling && sibling.slug !== r.slug) errors.push({ field: 'slug', message: `The ${sibling.language.toUpperCase()} version is published with slug "${sibling.slug}". Both languages share one permanent path, so use the same slug.` });
  const date = (existing && existing.editorialDate) || (sibling && sibling.editorialDate) || TIME.editorialDate(at);
  const urlPath = (existing && existing.urlPath) || (sibling && sibling.urlPath) || CMS.routeFor(r, date);
  if (!urlPath) errors.push({ field: 'slug', message: 'No permanent URL can be derived — check the slug (lowercase Latin letters, digits, hyphens).' });
  const owner = urlPath && all.find(i => i.urlPath === urlPath && i.translationGroupId !== r.translationGroupId);
  if (owner) {
    const t = CMS.TYPES[r.type];
    errors.push({ field: 'slug', code: 'ROUTE_COLLISION', message: t.route === 'desk' || t.route === 'gold' || (t.route === 'rex' && CMS.formatOf(r) === 'note')
      ? `A ${CMS.TYPES[owner.type] ? CMS.TYPES[owner.type].label[0] : owner.type} for ${date} already exists at /${urlPath} (${owner.id}). Update that item instead of publishing a second one.`
      : `/${urlPath} already belongs to another item (${owner.id}). Choose a different slug.` });
  }
  const fields = r.fields || {};
  const type = CMS.feedTypeOf(r);
  let validity = null;
  try {
    validity = FRESHNESS.defaultValidity(type, { publishedAt: at, dataAsOf: fields.dataAsOf || fields.priceTime || null, format: CMS.formatOf(r), timeframe: fields.timeframe, eventTime: fields.eventTime, validUntil: fields.validUntil || null });
  } catch (e) { errors.push({ field: 'fields.validUntil', message: `Cannot compute validity: ${e.message}` }); }
  if (validity && validity.validUntil && Date.parse(validity.validUntil) <= Date.parse(fields.dataAsOf || at)) errors.push({ field: 'fields.validUntil', message: 'This item would already be stale when published: set a later valid-until time.' });
  if (errors.length) return { entry: null, errors, urlPath, canonicalUrl: urlPath ? CMS.canonicalUrl(urlPath, r.language, origin) : null };
  const entry = CMS.toFeedEntry(r, at, version, { urlPath, firstPublishedAt: existing && existing.publishedAt ? existing.publishedAt : at, editorialDate: date, validity });
  return { entry, errors, urlPath, canonicalUrl: CMS.canonicalUrl(urlPath, r.language, origin) };
}
