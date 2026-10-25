import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const E=s=>String(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
export function telegramText(item){
 const lines=['🦊 <b>FOXREX · Autochartist</b>',`<b>${E(String(item.title).slice(0,200))}</b>`,
  `📌 ${E(item.symbol||'')} · ${E(item.timeframe||'')} · ${E(item.bias||'تحليل مشروط')}`,
  E(String(item.summary).slice(0,400)),
  '','🎯 <b>المستويات والسيناريو</b>',...(item.keyLevels||[]).slice(0,8).map(x=>'• '+E(String(x).slice(0,140))),
  `الدخول: ${E(item.entry||'غير محدد بالمصدر')}`,`وقف الخسارة: ${E(item.stopLoss||'غير محدد بالمصدر')}`,
  E(String(item.body).slice(0,1000)),'',
  `🕒 البيانات: ${E(item.freshness?.dataAsOf||item.updatedAt)}`,
  `⌛ الصلاحية: ${E(item.freshness?.validUntil||'غير محددة')}`,
  'المصدر: Autochartist · https://autochartist.com/',
  '⚠️ تحليل تعليمي؛ ليس توصية أو سعر تنفيذ. لا تُعامل الأهداف كأوامر دخول.'];
 const prefix=item.language==='en'?'':item.language+'/';
 lines.push('https://foxrex.co/'+prefix+item.urlPath);return lines.join('\n');
}
export function createTelegram(config,{fetchImpl=fetch}={}){
 const dir=path.join(config.dataDir,'integrations');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const secret=path.join(dir,'telegram.enc'),ledgerFile=path.join(dir,'telegram-deliveries.json');
 const key=crypto.scryptSync(config.token||'disabled','FOXREX-telegram-v1',32);
 function read(){if(!fs.existsSync(secret))return {};const j=JSON.parse(fs.readFileSync(secret,'utf8')),d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(j.iv,'hex'));d.setAuthTag(Buffer.from(j.tag,'hex'));return JSON.parse(Buffer.concat([d.update(Buffer.from(j.data,'hex')),d.final()]).toString());}
 function write(v){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(JSON.stringify(v)),c.final()]);atomic(secret,{iv:iv.toString('hex'),tag:c.getAuthTag().toString('hex'),data:data.toString('hex')});}
 function atomic(file,v){fs.writeFileSync(file+'.tmp',JSON.stringify(v),{mode:0o600});fs.renameSync(file+'.tmp',file);}
 function ledger(){return fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile,'utf8')):{};}
 async function call(s,method,payload){try{const r=await fetchImpl(`https://api.telegram.org/bot${s.botToken}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok||!j.ok)throw Error();return j.result;}catch{throw new Error('Telegram request failed; credentials are never included in errors');}}
 function status(s){return {configured:!!s.botToken,chatId:s.chatId||'',verified:!!s.verifiedAt,verifiedAt:s.verifiedAt||null,destination:s.destination||null,deliveries:Object.values(ledger()).map(({id,status,at,messageId})=>({id,status,at,messageId}))};}
 return {async handle(req,res,url,{send,body}){
  if(!url.pathname.startsWith('/api/integrations/telegram'))return false;
  if(!config.token){send(res,401,{error:'Configure a worker access token first'});return true;}
  // A configured CORS origin is mandatory for browser mutations; server clients omit Origin.
  if(req.headers.origin&&!String(config.allowedOrigin||'').split(',').map(s=>s.trim()).includes(req.headers.origin)){send(res,403,{error:'Origin not allowed'});return true;}
  try{
   const s=read(),p=url.pathname;
   if(p==='/api/integrations/telegram'&&req.method==='GET')send(res,200,status(s));
   else if(p==='/api/integrations/telegram'&&req.method==='PUT'){
    const b=await body(req),token=b.botToken||s.botToken;
    if(!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token||'')||!/^(-?\d+|@[A-Za-z0-9_]{5,})$/.test(b.chatId||''))return send(res,422,{error:'Valid bot token and explicit channel/chat ID required'}),true;
    const next={botToken:token,chatId:b.chatId};write(next);send(res,200,status(next));
   }else if(p==='/api/integrations/telegram/verify'&&req.method==='POST'){
    if(!s.botToken||!s.chatId)return send(res,409,{error:'Telegram not configured'}),true;
    const me=await call(s,'getMe',{}),chat=await call(s,'getChat',{chat_id:s.chatId});
    s.destination={id:String(chat.id),title:chat.title||chat.username||'Private chat',bot:me.username};s.verifiedAt=new Date().toISOString();write(s);send(res,200,status(s));
   }else if(p==='/api/integrations/telegram/send'&&req.method==='POST'){
    if(!s.verifiedAt||!s.destination)return send(res,409,{error:'Verify the explicit destination first'}),true;
    const b=await body(req),feed=JSON.parse(fs.readFileSync(path.join(config.publish.repoDir,'data/content.json'),'utf8'));
    const item=feed.items.find(x=>x.id===b.contentId&&x.language==='ar'&&x.tags?.includes('autochartist'));
    if(!item||!item.freshness?.validUntil||Date.parse(item.freshness.validUntil)<=Date.now())return send(res,422,{error:'A published, unexpired Arabic Autochartist analysis is required'}),true;
    const id=crypto.createHash('sha256').update(`${s.destination.id}:${item.translationGroupId}`).digest('hex'),l=ledger();
    if(l[id])return send(res,200,{duplicate:true,...l[id]}),true;
    l[id]={id,status:'UNKNOWN',at:new Date().toISOString()};atomic(ledgerFile,l);
    const result=await call(s,'sendMessage',{chat_id:s.destination.id,text:telegramText(item),parse_mode:'HTML',link_preview_options:{is_disabled:true}});
    l[id]={...l[id],status:'SENT',messageId:result.message_id};atomic(ledgerFile,l);send(res,200,l[id]);
   }else send(res,404,{error:'Integration route not found'});
  }catch{send(res,502,{error:'Integration request failed. An ambiguous delivery remains UNKNOWN; do not retry it automatically.'});}
  return true;
 }};
}
