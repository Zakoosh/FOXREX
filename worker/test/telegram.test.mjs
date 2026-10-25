import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createTelegram,telegramText} from '../src/telegram.js';
const token='123456:abcdefghijklmnopqrstuvwxyzABCDEFG';
test('Telegram secrets are encrypted, destination verified, and delivery ambiguity cannot resend',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fx-tg-'));let calls=0,fail=false;
 const config={dataDir:dir,token:'private-worker-access',allowedOrigin:'https://foxrex.co',publish:{repoDir:dir}};
 const item={id:'id',translationGroupId:'group',language:'ar',tags:['autochartist'],title:'EURUSD <test>',summary:'Summary',body:'Original body',symbol:'EURUSD',urlPath:'analysis/ac-test/',freshness:{dataAsOf:new Date().toISOString(),validUntil:new Date(Date.now()+3600000).toISOString()}};
 fs.mkdirSync(path.join(dir,'data'));fs.writeFileSync(path.join(dir,'data/content.json'),JSON.stringify({items:[item]}));
 const t=createTelegram(config,{fetchImpl:async(url)=>{calls++;if(fail)throw Error(token);return {ok:true,json:async()=>({ok:true,result:url.endsWith('getMe')?{username:'bot'}:url.endsWith('getChat')?{id:-100123,title:'FOXREX'}:{message_id:123}})};}});
 async function req(method,payload={},suffix='',origin){let result;await t.handle({method,headers:origin?{origin}:{}},{},new URL('https://worker/api/integrations/telegram'+suffix),{body:async()=>payload,send:(_,code,data)=>{result={code,data}}});return result;}
 try{
  assert.equal((await req('PUT',{botToken:token,chatId:'@foxrex'})).code,200);
  assert.ok(!fs.readFileSync(path.join(dir,'integrations/telegram.enc'),'utf8').includes(token));
  assert.ok(!JSON.stringify((await req('GET')).data).includes(token));
  assert.equal((await req('POST',{contentId:'id'},'/send')).code,409);
  assert.equal((await req('POST',{},'/verify','https://evil.example')).code,403);
  assert.equal((await req('POST',{},'/verify')).data.destination.title,'FOXREX');assert.equal(calls,2);
  assert.equal((await req('POST',{contentId:'id'},'/send')).data.status,'SENT');
  assert.equal((await req('POST',{contentId:'id'},'/send')).data.duplicate,true);assert.equal(calls,3);
  item.translationGroupId='new-group';fs.writeFileSync(path.join(dir,'data/content.json'),JSON.stringify({items:[item]}));fail=true;
  const bad=await req('POST',{contentId:'id'},'/send');assert.equal(bad.code,502);assert.ok(!JSON.stringify(bad).includes(token));
  const again=await req('POST',{contentId:'id'},'/send');assert.equal(again.data.status,'UNKNOWN');assert.equal(calls,4);
  item.freshness.validUntil='2020-01-01T00:00:00Z';fs.writeFileSync(path.join(dir,'data/content.json'),JSON.stringify({items:[item]}));assert.equal((await req('POST',{contentId:'id'},'/send')).code,422);
  assert.ok(telegramText(item).includes('&lt;test&gt;'));assert.ok(telegramText(item).includes('https://foxrex.co/ar/analysis/ac-test/'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Telegram settings require authentication even on tokenless local worker',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fx-tg-'));try{const t=createTelegram({dataDir:dir});let code;await t.handle({method:'GET',headers:{}},{},new URL('https://worker/api/integrations/telegram'),{send:(_,c)=>code=c});assert.equal(code,401);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
