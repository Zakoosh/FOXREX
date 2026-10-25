import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const feed=JSON.parse(read('data/content.json'));
const charts=JSON.parse(read('data/market/2026-10-26-signal-charts.json')).charts;
test('signals have a distinct trilingual tab and retain permanent source-analysis routes',()=>{
 assert.equal(charts.length,6);
 for(const lang of ['en','ar','tr']){
  const prefix=lang==='en'?'':lang+'/',hub=read(prefix+'signals/index.html'),tech=read(prefix+'technical/index.html');
  assert.equal((hub.match(/data-signal-card/g)||[]).length,6);
  assert.equal((tech.match(/class="catalog-card"/g)||[]).length,25);
  assert.ok(!tech.includes('/ac-'));
  const nav=hub.match(/<nav class="site-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.match(nav,/href="[^\"]*signals\/" aria-current="page"/);
  const entries=feed.items.filter(e=>e.language===lang&&e.tags?.includes('autochartist'));
  for(const e of entries){
   assert.ok(!/autochartist/i.test(e.title));assert.ok(e.sources.some(s=>s.name==='Autochartist'));
   assert.ok(hub.includes(e.urlPath));
   const article=read(prefix+e.urlPath+'index.html');
   assert.match(article,/data-chart/);assert.match(article,/theme-image--light/);assert.match(article,/signal-chart-source/);
   assert.ok(article.includes('Yahoo Finance'));assert.ok(e.body.includes('2026-10-23'));
  }
 }
});
test('every scenario chart has actual valid completed OHLC and exact source levels in both palettes',()=>{
 for(const chart of charts){
  const e=feed.items.find(e=>e.language==='en'&&e.slug===chart.event);
  assert.ok(chart.sourceUrl.startsWith('https://query1.finance.yahoo.com/'));
  assert.ok(chart.bars.length>=14);
  const stamps=chart.bars.map(b=>b.at);assert.deepEqual(stamps,[...new Set(stamps)].sort());
  for(const b of chart.bars){
   for(const k of ['open','high','low','close'])assert.ok(Number.isFinite(b[k]));
   assert.ok(0<b.low&&b.low<=Math.min(b.open,b.close)&&Math.max(b.open,b.close)<=b.high);
   assert.ok(Date.parse(b.at)+3600000<=Date.parse(chart.retrievedAt));
  }
  assert.equal(chart.levels.lower,Number(e.keyLevels[0].split(':').at(-1)));
  assert.equal(chart.levels.upper,Number(e.keyLevels[1].split(':').at(-1)));
  for(const suffix of ['','-light'])assert.ok(fs.existsSync(new URL('../../assets/media/'+chart.assetStem+suffix+'.webp',import.meta.url)));
 }
});
