import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const root=new URL('../../',import.meta.url);
test('Studio dashboard loads real published records and integration settings never persist Telegram credentials',async()=>{
 const source=fs.readFileSync(new URL('studio/operations.js',root),'utf8'),VIEWS={settings:()=>'<section>worker settings</section>',home:()=>''},ACT={},S={view:'home'};
 const state={VIEWS,ACT,S,NAV:[['create','إنشاء','Create',[]]],VIEW_LABEL:{},DB:{settings:{}},esc:s=>String(s??'').replace(/</g,'&lt;'),Date,URL,setTimeout,render:()=>{},fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL(url.replace('../',''),root),'utf8'))})};
 vm.createContext(state);vm.runInContext(source,state);vm.runInContext('installOperations()',state);await new Promise(r=>setTimeout(r,20));
 const h=VIEWS.home();assert.ok(h.includes('إدارة الموقع والمحتوى'));assert.ok(h.includes('أحدث المحتوى المنشور'));assert.ok(h.includes('بطاقة')||h.includes('أسعار')||h.includes('الأسعار'));
 const settings=VIEWS.settings();assert.ok(settings.includes('type="password"'));assert.ok(settings.includes('tg-chat'));assert.ok(settings.includes('Instagram + Facebook'));assert.ok(settings.includes('worker settings'));
 assert.equal(source.includes('localStorage'),false);assert.equal(source.includes('api.telegram.org'),false);assert.equal(typeof ACT['tg-save'],'function');assert.equal(typeof ACT['ops-refresh'],'function');
});
