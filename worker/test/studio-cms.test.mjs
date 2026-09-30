/* Studio CMS UI rules and public-renderer safety (no browser needed). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { arText } from '../../tools/site/text.mjs';

const read = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('Studio offers Publish only for APPROVED (or due SCHEDULED) content that validates and is saved', () => {
  const ctx = { window: {}, S: {}, DB: { settings: {} }, document: { addEventListener() {} } };
  ctx.window.FOXREX_CMS = (() => { const m = { exports: {} }; vm.runInNewContext(read('studio/cms-model.js'), { module: m, self: {} }); return m.exports; })();
  vm.createContext(ctx); vm.runInContext(read('studio/cms-studio.js'), ctx);
  const acts = (status, o = {}) => ctx.window.FOXREX_CMS_UI.allowedActions({ status, scheduledAt: o.at || null, live: o.live || null }, o);
  for (const s of ['IDEA', 'DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED']) assert.ok(!acts(s).includes('publish'), `${s} must not offer publish`);
  assert.ok(acts('APPROVED').includes('publish'));
  assert.ok(!acts('APPROVED', { valid: false }).includes('publish'), 'invalid approved content cannot publish');
  assert.ok(!acts('APPROVED', { dirty: true }).includes('publish'), 'unsaved edits block publish');
  assert.ok(!acts('SCHEDULED', { at: '2999-01-01T00:00:00Z' }).includes('publish'), 'not before schedule');
  assert.ok(acts('SCHEDULED', { at: '2020-01-01T00:00:00Z' }).includes('publish'), 'due schedule can publish');
  assert.ok(!acts('DRAFT').includes('approve') && acts('REVIEW').includes('approve'), 'approve only from review');
  assert.ok(acts('PUBLISHED', { live: { publishVersion: 1 } }).includes('unpublish') && !acts('PUBLISHED', { live: { publishVersion: 1 } }).includes('archive'), 'live items unpublish, not silently archive');
});

test('public renderer escapes all text and isolates Latin runs exactly like the build-time helper', () => {
  const src = read('scripts/public/content.js');
  const body = src.slice(src.indexOf('  function esc('), src.indexOf('  /* Text in this page'));
  const ctx = {}; vm.createContext(ctx); vm.runInContext(body + ';this.esc=esc;this.arText=arText;', ctx);
  for (const s of ['تحليل XAUUSD قبل افتتاح وول ستريت عند 15:30', 'صدر CPI أعلى من التوقعات', 'الذهب XAUUSD +0.42%', 'السعر 4,328.50.', 'انضم إلى FOXREX على Telegram.'])
    assert.equal(ctx.arText(s), arText(s), s);
  const evil = '<script>alert(1)</script><img src=x onerror=alert(2)> "quote" \'x\'';
  for (const out of [ctx.esc(evil), ctx.arText(evil)]) assert.ok(!/[<>"']/.test(out.replace(/<bdi class="lt" dir="ltr">|<\/bdi>/g, '')), `raw markup survived: ${out}`);
  for (const [, rhs] of src.matchAll(/\.innerHTML\s*=\s*([^;]+)/g))
    assert.match(rhs.trim(), /^(L\(|T\(|html\b|'<|list\.length \? wrap\()/, `innerHTML must only receive escaped/templated strings: ${rhs}`);
});
