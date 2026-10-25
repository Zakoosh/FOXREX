import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { preparePackage } from '../../tools/editorial/publish.mjs';
import { validateCalendar, calendarBody } from '../../tools/editorial/calendar.mjs';
const require = createRequire(import.meta.url), CMS = require('../../studio/cms-model.js');
const sourcePackage = JSON.parse(fs.readFileSync(new URL('../../content-ops/daily/2026-10-25/package.json',import.meta.url)));
const NOW = '2026-10-25T20:50:00Z', clone = () => structuredClone(sourcePackage);
test('editorial import is bilingual, versioned, idempotent and does not masquerade as Studio approval', () => {
  const first = preparePackage(clone(), CMS.EMPTY_FEED(), { now: NOW });
  assert.equal(first.feed.items.length, 6);
  assert.ok(first.feed.items.every(e => e.origin === 'scheduled-editorial' && e.attribution.assistance === 'ai-assisted'));
  const repeat = preparePackage(clone(),first.feed,{now:'2026-10-25T20:51:00Z'});
  assert.deepEqual(repeat.feed, first.feed);
  assert.equal(repeat.receipt.records.length,0);
  const changed = clone(); changed.records[0].summary += ' Updated.';
  const next = preparePackage(changed,first.feed,{now:'2026-10-25T20:52:00Z'});
  const old = first.feed.items.find(e => e.language==='en' && e.type==='MORNING_BRIEF');
  const edited = next.feed.items.find(e => e.id===old.id);
  assert.equal(edited.urlPath,old.urlPath); assert.equal(edited.publishedAt,old.publishedAt); assert.equal(edited.publishVersion,2);
});
test('reject missing mandate, stale packages, unsourced records and incomplete translations', () => {
  for (const mutate of [p=>delete p.authorization,p=>p.date='2026-10-24',p=>p.records[0].sourceReferences=[],p=>p.records.pop()]) {
    const p=clone();mutate(p); assert.throws(()=>preparePackage(p,CMS.EMPTY_FEED(),{now:NOW}));
  }
});
test('daily publication cannot inject signals or overwrite Studio content', () => {
  const p=clone();p.records[0].type='SIGNAL';assert.throws(()=>preparePackage(p,CMS.EMPTY_FEED(),{now:NOW}),/Unsupported/);
  const first=preparePackage(clone(),CMS.EMPTY_FEED(),{now:NOW});first.feed.items.forEach(e=>e.origin='studio');
  assert.throws(()=>preparePackage(clone(),first.feed,{now:NOW}),/Studio/);
});
test('calendar rejects duplicate events, unsourced consensus and premature actuals', () => {
  assert.deepEqual(validateCalendar(clone().calendar,Date.parse(NOW)),[]);
  for (const mutate of [c=>c.events.push(c.events[0]),c=>c.events[0].forecast={value:'3%'},c=>{c.events[0].actual={value:'3%',sourceUrl:'https://example.org'};c.events[0].status='released';},c=>c.events[0].at='invalid']) {
    const c=clone().calendar;mutate(c);assert.ok(validateCalendar(c,Date.parse(NOW)).length);
  }
});
test('calendar renders New York and Frankfurt dates correctly after European DST ends and escapes text', () => {
  const c=clone().calendar;c.events[0].title.ar='<script>alert(1)</script>';
  const html=calendarBody(c,'ar');assert.ok(!html.includes('<script>'));
  assert.match(html,/21:00/);assert.match(html,/16:15/);assert.match(html,/15:30/);
  assert.match(html,/data-calendar-updated/);assert.match(html,/موعد الإصدار/);
});
