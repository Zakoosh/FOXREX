import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { enrich } from '../../tools/editorial/enrich.mjs';
const require=createRequire(import.meta.url),CMS=require('../../studio/cms-model.js');
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const feed=JSON.parse(read('data/content.json'));
test('each live article has three paired routes, native metadata, a cover, sections and working calls to action',()=>{
 const groups=new Map();
 for(const e of feed.items){groups.set(e.translationGroupId,[...(groups.get(e.translationGroupId)||[]),e.language]);const route=CMS.pathFor(e.urlPath,e.language);const html=read(route+'index.html');
  assert.match(html,new RegExp(`<html lang="${e.language}" dir="${e.language==='ar'?'rtl':'ltr'}"`));
  for(const lang of CMS.LANGS)assert.ok(html.includes(`hreflang="${lang}" href="https://foxrex.co/${CMS.pathFor(e.urlPath,lang)}"`));
  assert.match(html,/<figure class="editorial-cover">/);assert.match(html,/<h2 id="section-1">/);assert.match(html,/class="editorial-toc"/);assert.match(html,/class="editorial-cta"/);
  assert.ok(fs.existsSync(new URL('../../'+e.image.src,import.meta.url)));
  assert.ok(html.includes('calendar/'));assert.ok(html.includes('https://t.me/fooxrex'));
  assert.ok(!html.includes('By FOXREX Desk')&&!html.includes('AI-assisted editorial')&&!html.includes('تحرير بمساعدة الذكاء الاصطناعي'));
 }
 for(const langs of groups.values())assert.deepEqual(langs.sort(),['ar','en','tr']);
});
test('Turkish pages translate navigation, dates, CTA and calendar without changing content identity',()=>{
 const article=read('tr/analysis/gold-fx-policy-week-2026-10-25/index.html');
 for(const text of ['Altın ve döviz','Ekonomik takvimi aç','Bu yazıda','İstanbul','dk okuma','Kaynaklar'])assert.ok(article.includes(text),text);
 assert.ok(!article.includes('min read')&&!article.includes('This Analysis is from'));
 const calendar=read('tr/calendar/index.html');for(const text of ['Piyasayı etkileyen gelişmeler','Fed faiz kararı','Gerçekleşen','İstanbul'])assert.ok(calendar.includes(text),text);
 for(const lang of ['en','ar','tr'])assert.ok(read((lang==='en'?'':lang+'/')+'index.html').includes('data-theme-toggle'));
});
test('theme toggle changes appearance, persists the preference, and labels the next action in each language',()=>{
 for(const lang of ['en','ar','tr']){
  const listeners={},attributes={},storage={};const button={setAttribute:(k,v)=>attributes[k]=v,addEventListener:(k,fn)=>listeners[k]=fn};
  const document={documentElement:{lang,dataset:{theme:'dark'}},querySelector:s=>s==='[data-theme-toggle]'?button:null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener:()=>{}};
  const context={document,window:{matchMedia:()=>({matches:false})},localStorage:{setItem:(k,v)=>storage[k]=v}};vm.runInNewContext(read('scripts/public/site.js'),context);
  assert.equal(attributes['aria-pressed'],'false');listeners.click();assert.equal(document.documentElement.dataset.theme,'light');assert.equal(storage['foxrex-theme'],'light');assert.equal(attributes['aria-pressed'],'true');
  assert.ok(attributes['aria-label'].includes(lang==='ar'?'الداكن':lang==='tr'?'Koyu':'dark'));
  listeners.click();assert.equal(document.documentElement.dataset.theme,'dark');assert.equal(storage['foxrex-theme'],'dark');
 }
});
test('presentation migration preserves original URLs, source timestamps, and existing article count on retry',()=>{
 const patch=JSON.parse(read('content-ops/updates/2026-10-26-tr-presentation.json'));
 const again=enrich(feed,patch);
 assert.deepEqual(again,feed);
 for(const source of feed.items.filter(x=>x.language==='en')){
  const translated=feed.items.find(x=>x.translationGroupId===source.translationGroupId&&x.language==='tr');assert.equal(translated.urlPath,source.urlPath);assert.deepEqual(translated.sources,source.sources);
 }
});
