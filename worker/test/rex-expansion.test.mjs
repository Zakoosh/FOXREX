import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { REX_QUIZ } from '../../tools/site/rex-interactive.mjs';
const require=createRequire(import.meta.url),rex=require('../../scripts/public/rex.js'),catalog=require('../../scripts/public/catalog.js');
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const feed=JSON.parse(read('data/content.json')),added=feed.items.filter(x=>x.tags?.includes('expansion-2026-10-26'));
test('twenty additional original news and twenty technical analyses have three complete editions and distinct covers',()=>{
 assert.equal(added.length,120);
 for(const lang of ['en','ar','tr']){const items=added.filter(x=>x.language===lang);assert.equal(items.filter(x=>x.type==='NEWS').length,20);assert.equal(items.filter(x=>x.category==='technical').length,20);assert.equal(new Set(items.map(x=>x.image.src)).size,40);}
 for(const e of added){assert.ok(e.sources.length);assert.ok(fs.existsSync(new URL('../../'+e.image.src,import.meta.url)));if(e.type==='NEWS'){const date=e.tags.find(t=>t.startsWith('source-date-')).slice(12);assert.ok(e.body.includes(date));assert.ok(e.tags.some(t=>t.startsWith('topic-')));}else assert.equal(e.keyLevels.length,5);}
 for(const prefix of ['','ar/','tr/']){const news=read(prefix+'news/index.html');assert.equal((news.match(/class="catalog-card"/g)||[]).length,feed.items.filter(x=>x.language===(prefix?prefix.slice(0,2):'en')&&x.type==='NEWS').length);assert.match(news,/data-catalog-search/);assert.match(news,/data-catalog-more hidden/);assert.match(news,/value="inflation"/);assert.match(news,/value="central-banks"/);const tech=read(prefix+'technical/index.html');assert.equal((tech.match(/class="catalog-card"/g)||[]).length,feed.items.filter(x=>x.language===(prefix?prefix.slice(0,2):'en')&&x.category==='technical').length);assert.match(tech,/value="ETHUSD"/);const latestGold=feed.items.filter(x=>x.language===(prefix?prefix.slice(0,2):'en')&&x.category==='technical'&&x.symbol==='XAUUSD'&&x.image).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];assert.ok(read(prefix+'index.html').includes('XAU/USD · '+latestGold.timeframe));}
});
test('catalog combines category or instrument with search and progressive display',()=>{
 const cards=Array.from({length:20},(_,i)=>({symbol:i%2?'EURUSD':'XAUUSD',topic:i%2?'labor':'inflation',text:i%2?'US jobs':'Gold inflation'}));
 assert.equal(catalog.selectCards(cards).visible.length,9);assert.equal(catalog.selectCards(cards,{limit:18}).visible.length,18);
 assert.equal(catalog.selectCards(cards,{kind:'news',filter:'inflation',query:'GOLD',limit:18}).matching.length,10);
 assert.equal(catalog.selectCards(cards,{filter:'EURUSD',query:'inflation'}).matching.length,0);
 assert.equal(catalog.selectCards(cards,{filter:'XAUUSD',query:' gold '}).matching.length,10);
});
test('REX answers, progress sanitization and risk calculations handle errors without invented lot sizes',()=>{
 for(const q of REX_QUIZ){assert.ok(rex.checkAnswer(q,q.answer));assert.equal(rex.checkAnswer(q,1-q.answer),false);assert.equal(rex.checkAnswer(q,null),false);assert.ok(q.explain.every(x=>x.length>30));}
 assert.deepEqual(rex.normalizeProgress({lessons:[0,0,4,99,'1'],answers:[1,99,0]}),{lessons:[0,4],answers:[1,null,0,null,null]});
 assert.deepEqual(rex.calculateRisk({equity:10000,percent:1,entry:100,stop:95,target:110}),{risk:100,units:20,ratio:2});
 assert.deepEqual(rex.calculateRisk({equity:10000,percent:1,entry:100,stop:105,target:90}),{risk:100,units:20,ratio:2});
 for(const bad of [{stop:100},{target:95},{percent:101},{entry:'NaN'},{equity:-1},{target:0}])assert.equal(rex.calculateRisk({equity:10000,percent:1,entry:100,stop:95,target:110,...bad}),null);
 for(const prefix of ['','ar/','tr/']){const html=read(prefix+'learn/index.html');assert.match(html,/rex-teaching-v3.webp/);assert.match(html,/rex-celebrating-v3.webp/);assert.equal((html.match(/data-rex-question="/g)||[]).length,5);assert.equal((html.match(/data-rex-complete="/g)||[]).length,5);assert.match(html,/data-rex-calculator/);assert.match(html,/rex.js\?v=[a-f0-9]{12}/);}
});
test('new candlestick samples and their pivots and momentum are reproducible from valid completed bars',()=>{
 const data=JSON.parse(read('data/market/2026-10-26-expansion.json'));assert.equal(data.length,20);assert.equal(new Set(data.map(x=>x.symbol)).size,20);
 for(const d of data){assert.equal(d.chartType,'candlestick');assert.equal(d.bars.length,d.timeframe==='W1'?4:70);for(const b of d.bars){assert.ok(b.date<='2026-10-24');assert.ok([b.open,b.high,b.low,b.close].every(x=>Number.isFinite(x)&&x>0));assert.ok(b.low<=Math.min(b.open,b.close)&&Math.max(b.open,b.close)<=b.high);assert.ok(!d.excludedBars.some(x=>x.date===b.date));}const b=d.bars.at(-1),p=(b.high+b.low+b.close)/3;assert.ok(Math.abs(p-d.metrics.pivot)<1e-9);assert.ok(Math.abs(2*p-b.high-d.metrics.s1)<1e-9);assert.ok(Math.abs(2*p-b.low-d.metrics.r1)<1e-9);
 if(d.timeframe==='W1'){assert.equal(d.metrics.rsi14,undefined);assert.ok(d.bars.every(x=>new Date(x.date).getUTCDay()===5));continue;}
 const closes=d.bars.map(x=>x.close);let ema=closes[0];for(const c of closes.slice(1))ema=c*2/21+ema*19/21;assert.ok(Math.abs(ema-d.metrics.ema20)<1e-8);let changes=closes.slice(1).map((x,i)=>x-closes[i]),g=changes.slice(0,14).reduce((s,x)=>s+Math.max(x,0),0)/14,l=changes.slice(0,14).reduce((s,x)=>s+Math.max(-x,0),0)/14;for(const x of changes.slice(14)){g=(13*g+Math.max(x,0))/14;l=(13*l+Math.max(-x,0))/14;}const rsi=l===0?100:100-100/(1+g/l);assert.ok(Math.abs(rsi-d.metrics.rsi14)<1e-9);if(!['BTCUSD','ETHUSD'].includes(d.symbol)){assert.equal(d.sourceTimezone,'Europe/London');assert.equal(b.date,'2026-10-23');}}
});
