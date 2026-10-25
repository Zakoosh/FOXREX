import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const feed=JSON.parse(read('data/content.json'));
test('all editions expose four populated market hubs plus REX and a compact social gateway',()=>{
 for(const prefix of ['','ar/','tr/']){
  const lang=prefix.slice(0,-1)||'en',home=read(prefix+'index.html');
  const nav=home.match(/<nav class="site-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.equal((nav.match(/<a /g)||[]).length,5);
  for(const route of ['analysis','technical','calendar','news','learn'])assert.ok(nav.includes(route+'/'));
  assert.equal((home.match(/class="gateway-card"/g)||[]).length,4);
  assert.ok(home.includes('gateway-social')&&home.includes('https://t.me/fooxrex'));
  assert.ok(!home.includes('data-slot=')&&!home.includes('data-px'));
  for(const route of ['analysis','technical','news']){
   const html=read(prefix+route+'/index.html');
   assert.ok((html.match(/class="catalog-card"/g)||[]).length>=5,lang+' '+route);
  }
  const tech=read(prefix+'technical/index.html');
  assert.equal(tech.match(/data-catalog-symbol="([^"]+)"/)[1],'XAUUSD');
  assert.equal((tech.match(/data-catalog-filter="XAUUSD"/g)||[]).length,1);
 }
});
test('technical chart levels reproduce checked OHLC, without fabricated or future candles',()=>{
 const ds=JSON.parse(read('data/market/2026-10-23-technical.json'));
 assert.deepEqual(ds.map(d=>d.symbol),['XAUUSD','XAGUSD','EURUSD','GBPUSD','USDJPY']);
 for(const d of ds){
  assert.ok(d.sourceUrl.startsWith('https://'));assert.ok(d.bars.length>=14);
  assert.deepEqual(d.bars.map(b=>b.date),[...new Set(d.bars.map(b=>b.date))].sort());
  for(const b of d.bars){assert.ok(b.date<='2026-10-23');assert.ok(b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close));}
  const b=d.bars.at(-1),p=(b.high+b.low+b.close)/3;
  for(const [key,value] of Object.entries({pivot:p,s1:2*p-b.high,r1:2*p-b.low,s2:p-(b.high-b.low),r2:p+(b.high-b.low)}))assert.ok(Math.abs(d.metrics[key]-value)<1e-10);
  const items=feed.items.filter(e=>e.category==='technical'&&e.symbol===d.symbol);assert.equal(items.length,3);
  for(const e of items){assert.ok(e.body.includes('2026')&&e.keyLevels.length===5);assert.ok(e.image.src.includes(d.symbol.toLowerCase()));}
  for(const b of d.excludedBars||[])assert.ok(!d.bars.some(good=>good.date===b.date));
 }
});
test('instrument filter updates selection and restores all cards',()=>{
 const buttons=['all','XAUUSD','EURUSD'].map(symbol=>({symbol,attrs:{},getAttribute:()=>symbol,setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){this.click=fn}}));
 const cards=['XAUUSD','EURUSD','XAGUSD'].map(symbol=>({hidden:false,getAttribute:()=>symbol}));
 vm.runInNewContext(read('scripts/public/catalog.js'),{document:{querySelectorAll:s=>s==='[data-catalog-filter]'?buttons:cards}});
 buttons[1].click();assert.deepEqual(cards.map(c=>c.hidden),[false,true,true]);assert.equal(buttons[1].attrs['aria-pressed'],'true');
 buttons[0].click();assert.ok(cards.every(c=>!c.hidden));assert.equal(buttons[1].attrs['aria-pressed'],'false');
});
test('article sources are compact disclosures and navigation arrows have intrinsic dimensions',()=>{
 const html=read('ar/analysis/xauusd-technical-2026-10-23/index.html');
 assert.match(html,/styles\/editorial\.css\?v=[a-f0-9]{12}/);
 assert.match(html,/<details class="editorial-sources"><summary>/);
 assert.match(html,/<svg class="fx-flip" width="16" height="16"/);
 assert.ok(!/<img[^>]*alt="[^"]*<bdi/.test(html), 'alt text must never contain bidi markup');
 assert.match(html,/<figure class="editorial-cover" data-chart><a /);
 assert.match(read('styles/editorial.css'),/\.editorial-sources a\{font-size:12px/);
});
test('REX has a character-led classroom and educational notice in all editions; root defaults to English',()=>{
 const titles={en:'Hey, I’m REX.',ar:'أهلًا، أنا ريكس.',tr:'Merhaba, ben REX.'};
 for(const lang of ['en','ar','tr']){
  const prefix=lang==='en'?'':lang+'/',html=read(prefix+'learn/index.html');
  assert.ok(html.includes(titles[lang]));
  assert.equal((html.match(/class="rex-lesson"/g)||[]).length,5);
  assert.equal((html.match(/class="rex-question"/g)||[]).length,3);
  assert.ok(html.includes('assets/rex/rex-educator-v2.webp'));
  assert.ok(!/<img[^>]*alt="[^"]*<bdi/.test(html));
  for(const p of ['','analysis/','technical/','news/','calendar/','learn/'])assert.match(read(prefix+p+'index.html'),/class="education-notice"/);
 }
 assert.match(read('index.html'),/<html lang="en" dir="ltr">/);
 assert.match(read('index.html'),/hreflang="x-default" href="https:\/\/foxrex.co\/"/);
 assert.ok(!/location\.(assign|replace|href)/.test(read('scripts/public/site.js')),'no automatic language redirect');
 assert.match(read('styles/editorial.css'),/\.education-notice\{position:sticky/);
});
