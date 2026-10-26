import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { prepareResults } from '../../tools/editorial/results.mjs';
const require=createRequire(import.meta.url),model=require('../../scripts/public/home.js');
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const calendar=JSON.parse(read('data/calendar.json')),feed=JSON.parse(read('data/content.json'));
test('event alert boundaries distinguish pre-release countdown, waiting and a verified actual',()=>{
 const at='2026-10-29T12:30:00Z',e={at,status:'scheduled'};
 assert.equal(model.eventState(e,Date.parse(at)-16*60000),'scheduled');
 assert.equal(model.eventState(e,Date.parse(at)-15*60000),'soon');
 assert.equal(model.eventState(e,Date.parse(at)),'awaiting');
 assert.equal(model.eventState(e,Date.parse(at)+3600000),'awaiting');
 assert.equal(model.eventState({...e,status:'released',actual:{value:'TEST'}},Date.parse(at)+1000),'released');
 assert.equal(model.eventState({...e,status:'cancelled'},Date.parse(at)),'cancelled');
});
test('quote observations reject missing/future timestamps and invalid values; source dates are preserved',()=>{
 const now=Date.parse('2026-10-26T00:00:00Z'),q={symbol:'XAUUSD',price:3996.9,asOf:'2026-10-25T22:00:12Z'};
 assert.equal(model.validQuote(q,now),true);assert.equal(model.validQuote({...q,price:NaN},now),false);assert.equal(model.validQuote({...q,price:-1},now),false);assert.equal(model.validQuote({...q,asOf:'2026-10-27T00:00:00Z'},now),false);
 const qs=JSON.parse(read('data/quotes.json'));assert.equal(qs.quotes.length,9);
 for(const q of qs.quotes){assert.equal(model.validQuote(q,Date.now()),true);assert.ok(q.sourceUrl.startsWith('https://'));}
});
function packageFor(){
 const e=calendar.events.find(e=>e.id==='gdp-q3-advance-2026-10-29'),group=feed.items.filter(x=>x.slug==='us-gdp-q3-october-29-2026');
 return {authorization:'owner-authorized-release-results-2026-10-26',results:[{eventId:e.id,actual:{value:'TEST 0.0%',sourceUrl:'https://www.bea.gov/news/test-release'},translationGroupId:group[0].translationGroupId}],articleUpdates:group.map(x=>({id:x.id,summary:x.summary+' TEST',body:x.body+'\n\nTEST\nTEST 0.0%'}))};
}
test('release publication refuses early, unsourced or untranslated results without touching original data',()=>{
 const original=JSON.stringify(calendar),p=packageFor();
 assert.throws(()=>prepareResults(calendar,feed,p,'2026-10-29T12:29:59Z'),/before scheduled/);
 const bad=structuredClone(p);bad.results[0].actual.sourceUrl='https://unrelated.example/result';assert.throws(()=>prepareResults(calendar,feed,bad,'2026-10-29T12:32:00Z'),/official releasing/);
 const missing=structuredClone(p);missing.articleUpdates.pop();assert.throws(()=>prepareResults(calendar,feed,missing,'2026-10-29T12:32:00Z'),/EN\/AR\/TR/);
 assert.equal(JSON.stringify(calendar),original);
});
test('verified release and three-language analysis are prepared together, retaining URLs and source evidence',()=>{
 const p=packageFor(),r=prepareResults(calendar,feed,p,'2026-10-29T12:32:00Z');
 const e=r.calendar.events.find(e=>e.id===p.results[0].eventId);assert.equal(e.status,'released');assert.equal(e.actual.value,'TEST 0.0%');
 for(const u of p.articleUpdates){const before=feed.items.find(x=>x.id===u.id),after=r.feed.items.find(x=>x.id===u.id);assert.equal(after.urlPath,before.urlPath);assert.equal(after.publishedAt,before.publishedAt);assert.ok(after.sources.some(s=>s.url===p.results[0].actual.sourceUrl));}
 assert.equal(calendar.events.find(e=>e.id===p.results[0].eventId).actual,null);
});
test('home has photographic hero, real quote slots, a news strip and candle chart; every article group has its own cover',()=>{
 for(const prefix of ['','ar/','tr/']){const html=read(prefix+'index.html');for(const marker of ['home-visual__background','data-home-quotes','home-news-strip','data-home-events','data-event-alert'])assert.ok(html.includes(marker));}
 const covers=new Map();for(const e of feed.items.filter(e=>e.language==='en')){assert.ok(!covers.has(e.image.src),`shared cover: ${e.image.src}`);covers.set(e.image.src,e.translationGroupId);}
 assert.ok(read('tools/charts/render.py').includes('Rectangle('));assert.ok(read('tools/charts/render.py').includes('ax.vlines('));
});

test('source observations age independently of fetch success',()=>{
 const q={source:'Gold API',asOf:'2026-10-25T22:00:00Z'},t=Date.parse(q.asOf);
 assert.equal(model.staleQuote(q,t+900000),false);
 assert.equal(model.staleQuote(q,t+900001),true);
 assert.equal(model.staleQuote({...q,source:'Yahoo Finance'},t+7200000),false);
 assert.equal(model.staleQuote({...q,source:'Yahoo Finance'},t+7200001),true);
});
