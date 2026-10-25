/* FOXREX CMS store — the authoritative editorial record store behind FOXREX Studio.
   Lives in DATA_DIR/cms (git-ignored, never committed: the repository is public).
   Every write is revision-checked (optimistic concurrency) and audited. Approval is recorded
   here, server-side, with the actor — a browser flag is never trusted as approval. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const CMS = require('../../studio/cms-model.js');

const EDITABLE = ['title', 'slug', 'summary', 'body', 'symbol', 'market', 'bias', 'category', 'tags', 'image', 'visualPrompt',
  'sourceReferences', 'riskDisclosure', 'seo', 'social', 'fields', 'translationGroupId', 'byline', 'lead', 'access'];
const httpError = (status, message, extra) => Object.assign(new Error(message), { status, ...extra });

export function cleanActor(v) {
  const a = String(v || '').replace(/[^\p{L}\p{N} ._@-]/gu, '').trim().slice(0, 60);
  return a || null;
}

export class CmsStore {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'cms'); fs.mkdirSync(this.dir, { recursive: true });
    this.file = path.join(this.dir, 'records.json');
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { schemaVersion: 1, records: {} };
  }
  persist() { fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data, null, 2)); fs.renameSync(this.file + '.tmp', this.file); }
  get(id) { const r = this.data.records[id]; if (!r) throw httpError(404, 'Content not found'); return r; }
  list() { return Object.values(this.data.records).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')); }
  group(groupId) { return this.list().filter(r => r.translationGroupId === groupId); }

  #audit(r, action, actor, extra) {
    r.history = r.history || [];
    r.history.push({ at: new Date().toISOString(), action, actor, from: extra && extra.from, to: r.status, revision: r.revision, note: extra && extra.note });
    if (r.history.length > 200) r.history = r.history.slice(-200);
  }
  #checkRevision(r, expected) {
    if (expected == null) throw httpError(428, 'expectedRevision is required');
    if (+expected !== r.revision) throw httpError(409, 'This item changed since you loaded it. Refresh before saving.', { code: 'REVISION_CONFLICT', current: r.revision });
  }
  #uniqueId(groupId, lang) {
    let g = groupId, n = 2;
    while (this.data.records[CMS.makeId(g, lang)] && n < 100) g = `${groupId}-${n++}`;
    return g;
  }

  create(input, actor) {
    const type = input && input.type;
    if (!CMS.TYPES[type]) throw httpError(422, 'Unknown content type');
    const lang = input.language || 'en';
    if (!CMS.LANGS.includes(lang)) throw httpError(422, 'Language must be en or ar');
    const now = new Date().toISOString();
    const r = CMS.blankRecord(type, lang, now, actor);
    for (const k of EDITABLE) if (input[k] !== undefined) r[k] = input[k];
    r.slug = r.slug || CMS.slugify(r.title) || 'untitled';
    let group = r.translationGroupId && CMS.RE.group.test(r.translationGroupId) ? r.translationGroupId : CMS.makeGroupId(type, CMS.editorialDate(now), r.slug);
    if (!input.translationGroupId) group = this.#uniqueId(group, lang);
    r.translationGroupId = group; r.id = CMS.makeId(group, lang);
    if (this.data.records[r.id]) throw httpError(409, `A ${lang} version already exists in this translation group`, { code: 'DUPLICATE_ID' });
    r.status = input.status === 'IDEA' ? 'IDEA' : 'DRAFT';
    if (input.aiGenerated) r.aiGenerated = input.aiGenerated;
    r.revision = 1; r.live = null;
    const errs = CMS.validateRecord(r, 'draft');
    if (errs.length) throw httpError(422, 'Invalid content', { errors: errs });
    this.#audit(r, 'create', actor);
    this.data.records[r.id] = r; this.persist();
    return r;
  }

  update(id, patch, expectedRevision, actor) {
    const r = this.get(id); this.#checkRevision(r, expectedRevision);
    if (r.status === 'ARCHIVED') throw httpError(409, 'Restore archived content before editing');
    // Identity is permanent: the id never changes, and once published the slug (and so the URL) is fixed. Titles may change freely.
    if ((r.live || (r.publishing && r.publishing.publishVersion > 0)) && patch.slug !== undefined && patch.slug !== r.slug)
      throw httpError(409, `The slug is fixed after first publication (its permanent URL depends on it). Keep "${r.slug}".`, { code: 'SLUG_LOCKED' });
    const next = JSON.parse(JSON.stringify(r));
    for (const k of EDITABLE) if (patch[k] !== undefined && k !== 'translationGroupId') next[k] = patch[k];
    const errs = CMS.validateRecord(next, 'draft');
    if (errs.length) throw httpError(422, 'Invalid content', { errors: errs });
    const from = r.status;
    // Approval never survives an edit. A published item keeps serving its live version until republished.
    if (CMS.EDIT_RESETS.includes(from)) { next.status = 'DRAFT'; next.approvedAt = null; next.reviewedAt = null; next.scheduledAt = null; next.audit.approvedBy = null; }
    if (from === 'IDEA') next.status = 'IDEA';
    next.updatedAt = new Date().toISOString(); next.audit.updatedBy = actor; next.revision = r.revision + 1;
    this.#audit(next, from !== next.status ? `edit (approval cleared)` : 'edit', actor, { from });
    this.data.records[id] = next; this.persist();
    return next;
  }

  transition(id, action, { expectedRevision, scheduledAt, note } = {}, actor) {
    const r = this.get(id); this.#checkRevision(r, expectedRevision);
    if (!actor) throw httpError(400, 'Operator name is required (Studio Settings → operator)');
    const e = CMS.transitionError(r, action, { scheduledAt });
    if (e) throw httpError(422, e, { errors: CMS.validateRecord(r, 'publish') });
    if (action === 'archive' && r.live) throw httpError(409, 'This item is live on the website. Use Unpublish, which removes it from the public feed and archives it.');
    const from = r.status, now = new Date().toISOString();
    r.status = CMS.TRANSITIONS[action].to;
    if (action === 'submit') r.reviewedAt = null;
    if (action === 'approve') { r.reviewedAt = now; r.approvedAt = now; r.reviewer = actor; r.audit.approvedBy = actor; }
    if (action === 'reject') { r.approvedAt = null; r.audit.approvedBy = null; }
    if (action === 'schedule') r.scheduledAt = scheduledAt;
    if (action === 'unschedule') r.scheduledAt = null;
    r.updatedAt = now; r.audit.updatedBy = actor; r.revision += 1;
    this.#audit(r, action, actor, { from, note });
    this.persist();
    return r;
  }

  duplicate(id, actor) {
    const src = this.get(id);
    const copy = JSON.parse(JSON.stringify(src));
    for (const k of ['id', 'translationGroupId', 'live', 'history', 'aiGenerated']) delete copy[k];
    copy.title = src.title ? `${src.title} (copy)` : ''; copy.slug = `${src.slug}-copy`;
    return this.create({ ...copy, type: src.type, language: src.language }, actor);
  }

  /** New DRAFT in the other language, same translation group. Never approved, never published. */
  createTranslation(id, text, actor, aiGenerated) {
    const src = this.get(id); const lang = src.language === 'en' ? 'ar' : 'en';
    if (this.data.records[CMS.makeId(src.translationGroupId, lang)]) throw httpError(409, `The ${lang} version already exists`, { code: 'TRANSLATION_EXISTS' });
    const base = {
      type: src.type, language: lang, translationGroupId: src.translationGroupId, slug: src.slug,
      symbol: src.symbol, market: src.market, bias: src.bias, category: src.category, tags: src.tags,
      image: src.image ? { src: src.image.src, alt: '' } : null, sourceReferences: src.sourceReferences,
      riskDisclosure: CMS.TYPES[src.type].risk ? CMS.DEFAULT_RISK[lang] : '',
      fields: JSON.parse(JSON.stringify(src.fields || {})),
      title: '', summary: '', body: '', seo: { title: '', description: '' }, social: { caption: '', hashtags: [] }
    };
    // Structured trading text (scenarios, messages) is language-specific: blank unless translated.
    for (const k of ['marketState', 'bullishScenario', 'bearishScenario', 'invalidation', 'riskMessage', 'analysisContext', 'resultNotes', 'validity']) if (k in base.fields) base.fields[k] = '';
    if (text) Object.assign(base, pick(text, ['title', 'summary', 'body']), { fields: { ...base.fields, ...pick(text.fields || {}, ['marketState', 'bullishScenario', 'bearishScenario', 'invalidation', 'riskMessage', 'analysisContext', 'resultNotes', 'validity']) } });
    if (text && text.imageAlt && base.image) base.image.alt = text.imageAlt;
    return this.create({ ...base, aiGenerated }, actor);
  }

  markPublished(id, pub, actor) {
    const r = this.get(id); const from = r.status;
    r.status = 'PUBLISHED'; r.publishedAt = pub.publishedAt; r.scheduledAt = null;
    r.publishing = { ...r.publishing, publishVersion: pub.version, lastPublishedAt: pub.publishedAt, destinations: pub.destinations };
    r.audit.publishedBy = actor;
    r.live = { publishVersion: pub.version, revision: r.revision, publicationId: pub.publicationId, commitSha: pub.commitSha, publishedAt: pub.publishedAt, mode: pub.mode };
    r.revision += 1; r.updatedAt = pub.publishedAt;
    this.#audit(r, 'publish', actor, { from, note: `v${pub.version} ${pub.commitSha || ''}`.trim() });
    this.persist(); return r;
  }
  markUnpublished(id, pub, actor) {
    const r = this.get(id); const from = r.status;
    r.status = 'ARCHIVED'; r.live = null; r.revision += 1; r.updatedAt = pub.publishedAt;
    this.#audit(r, 'unpublish', actor, { from, note: pub.commitSha || '' });
    this.persist(); return r;
  }
}
const pick = (o, keys) => Object.fromEntries(keys.filter(k => typeof o[k] === 'string').map(k => [k, o[k]]));

/* ---------- AI translation (assistant only: produces a DRAFT, never an approval) ---------- */
const TRANSLATE_SCHEMA = {
  type: 'object', required: ['title', 'summary', 'body', 'fields'],
  properties: { title: { type: 'string' }, summary: { type: 'string' }, body: { type: 'string' }, imageAlt: { type: 'string' },
    fields: { type: 'object', properties: Object.fromEntries(['marketState', 'bullishScenario', 'bearishScenario', 'invalidation', 'riskMessage', 'analysisContext', 'resultNotes'].map(k => [k, { type: 'string' }])) } }
};
export async function aiTranslate(provider, src) {
  if (!provider || typeof provider.health !== 'function') throw httpError(503, 'AI translation needs a local reasoning provider (CREATIVE_PROVIDER=ollama). Use "Blank translation draft" instead.');
  if (!(await provider.health()).available) throw httpError(503, 'Selected local model is not installed');
  const target = src.language === 'en' ? 'Arabic' : 'English';
  const f = src.fields || {};
  const payload = { title: src.title, summary: src.summary, body: src.body, imageAlt: src.image && src.image.alt || '',
    fields: Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v === 'string' && v.trim() && !/^-?\d+(\.\d+)?$/.test(v))) };
  const rules = [
    `Translate the JSON values into ${target} for the FOXREX market-intelligence editorial desk.`,
    'Keep EVERY market symbol (e.g. XAUUSD, EURUSD, DXY), data name (CPI, NFP), number, price, percentage and time EXACTLY as written, in Latin characters and Western digits.',
    'Do not add facts, prices, forecasts, sources or claims that are not in the input. Do not remove risk information.',
    target === 'Arabic' ? 'Write natural Arabic financial editorial prose (FOXREX voice): concise, clear, no machine-translation phrasing, no diacritics.' : 'Write concise professional English.',
    'Return only JSON with the same keys.'
  ].join('\n');
  const r = await provider.fetcher(`${provider.base}/api/chat`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180000), headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: provider.model, stream: false, think: false, format: TRANSLATE_SCHEMA, options: { temperature: 0.2, num_predict: 6000 },
      messages: [{ role: 'system', content: rules }, { role: 'user', content: JSON.stringify(payload) }] }) });
  if (!r.ok) throw httpError(502, `Translation provider HTTP ${r.status}`);
  const data = await r.json();
  let out; try { out = JSON.parse(data.message.content); } catch { throw httpError(422, 'Translation provider returned invalid JSON'); }
  const joinedSrc = [payload.title, payload.summary, payload.body, ...Object.values(payload.fields)].join('\n');
  const joinedOut = [out.title, out.summary, out.body, ...Object.values(out.fields || {})].join('\n');
  return { text: out, warnings: CMS.missingTokens(joinedSrc, joinedOut).map(t => `Token "${t}" from the source is missing in the translation — check before submitting.`), provider: provider.id, model: provider.model };
}
