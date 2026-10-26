import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAutochartist} from '../../tools/editorial/autochartist.mjs';
const now='2026-10-26T01:00:00Z';
const base={authorization:'owner-autochartist-2026-10-26',sender:'alerts@autochartist.email',authenticatedSender:true,alerts:[{symbol:'EURUSD',pattern:'Triangle',timeframe:'H1',direction:'bullish',detectedAt:'2026-10-26T00:00:00Z',validUntil:'2026-10-26T04:00:00Z',sourceTimezone:'Australia/Sydney',sourceEvidence:'Full original source checked',records:[]}],calendar:{}};
test('email intake rejects old alerts, spoofed senders, and missing source timezones',()=>{
 const run=v=>prepareAutochartist(v,{items:[]},{processedEvents:[]},{now});
 assert.throws(()=>run({...base,sender:'fake@example.com'}),/Sender/);
 assert.throws(()=>run({...base,authenticatedSender:false}),/authentication/);
 assert.throws(()=>run({...base,sourcePublishedAt:'2026-10-27T00:00:00Z'}),/publication time/);
 assert.throws(()=>run({...base,alerts:[{...base.alerts[0],validUntil:'2026-10-25T01:00:00Z'}]}),/Stale/);
 assert.throws(()=>run({...base,alerts:[{...base.alerts[0],sourceTimezone:''}]}),/source facts/);
 assert.throws(()=>run(base),/EN\/AR\/TR/);
});
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
test('verified three-language intake publishes once across retries and subsequent dates',()=>{
 const pkg=read('content-ops/daily/2026-10-26/package.json'),source=pkg.records.find(r=>r.type==='ANALYSIS'),records=pkg.records.filter(r=>r.type==='ANALYSIS'&&r.slug===source.slug);
 const calendar=read('data/calendar.json');calendar.updatedAt=now;
 for(const event of calendar.events){
  event.source.checkedAt=now;
  // Reconstruct the calendar as of the fixture's historical clock.
  if(Date.parse(event.at)>Date.parse(now)&&event.actual){event.actual=null;event.status='scheduled';}
 }
 const alert={...base.alerts[0],records};
 const input={...base,sourcePublishedAt:'2026-10-25T23:30:00Z',calendar,alerts:[alert]},feed=read('data/content.json');
 // This fixture runs at a fixed historical time, before later daily editions.
 feed.items=feed.items.filter(e=>Date.parse(e.publishedAt)<=Date.parse(now));
 const result=prepareAutochartist(input,feed,{processedEvents:[]},{now});
 assert.equal(result.receipt.events.length,1);assert.equal(result.receipt.records.length,3);
 assert.equal(result.feed.items.length,feed.items.length+3);
 for(const id of result.receipt.events)assert.ok(result.operations.processedEvents.includes(id));
 for(const r of result.receipt.records){
  const entry=result.feed.items.find(e=>e.id===r.id);
  assert.equal(entry.sources[0].publishedAt,input.sourcePublishedAt);
  assert.equal(entry.freshness.dataAsOf,alert.detectedAt);
 }
 const again=prepareAutochartist(input,result.feed,result.operations,{now:'2026-10-26T02:00:00Z'});assert.equal(again.receipt.events.length,0);
 const withoutLedger=prepareAutochartist(input,result.feed,{processedEvents:[]},{now:'2026-10-26T02:00:00Z'});assert.equal(withoutLedger.receipt.events.length,0);
 assert.equal(JSON.stringify(result.feed).includes('alerts@autochartist'),false);
});

// Regression: source-report illustrations must not be presented as OHLC charts.
import {contentPages} from '../../tools/site/content-pages.mjs';
test('Autochartist illustrations are distinct from candle charts and levels are localized',()=>{
 const feed=read('data/content.json');
 const result=contentPages(feed,{SITE:{origin:'https://foxrex.co',social:{telegram:{url:'https://t.me/fooxrex'}}},I:{arrow:''}});
 for(const lang of ['en','ar','tr']){
  const page=result.pages.find(p=>p.lang===lang&&p.path==='analysis/ac-22b0ed55eb7c1e4453c293a4');
  const html=page.body('../../','/');
  assert.ok(!html.includes('data-chart'));
  assert.ok(!html.includes('Tap the chart'));
  if(lang==='ar'){assert.ok(html.includes('الحد الأدنى للتقلب'));assert.ok(!html.includes('Lower volatility boundary'));}
  if(lang==='tr')assert.ok(html.includes('Alt volatilite sınırı'));
 }
 const chart=result.pages.find(p=>p.lang==='en'&&p.path==='analysis/xauusd-w1-outlook-2026-10-26');
 assert.ok(chart.body('../../','/').includes('data-chart'));
});
