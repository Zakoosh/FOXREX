/* FOXREX admin · Trading desk: session checklist (gold + US indices) and market-data health.
   Runs inside the admin app (admin/index.html) and uses its globals: NAV, VIEW_LABEL, VIEWS, ACT, S, esc, toast, render.
   Factor values come from, in order of precedence:
     1. the operator's own choice for today (browser only),
     2. automatic rules on verified data: data/quotes.json (DXY, US10Y, VIX, oil, ES/NQ), live Gold API,
        data/market/ai-technical.json (gold D1 trend and prior-day range) and data/calendar.json (events),
     3. today's research file data/desk/session-research.json (judgement factors, and fallback values).
   Nothing is estimated: a factor without data stays empty and is marked for a manual read. */
function installTradingDesk(){
 const TZ='Europe/Istanbul', KEY='foxrex-desk-v1';
 const dayOf=t=>new Date(t).toLocaleDateString('en-CA',{timeZone:TZ});
 const today=()=>dayOf(Date.now());
 const hm=t=>new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:TZ});
 const when=t=>dayOf(t)===dayOf(Date.now())?hm(t):new Date(t).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:TZ});
 const num=(n,dp)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:dp,maximumFractionDigits:dp});
 const D={quotes:null,cal:null,tech:null,research:null,gold:null,loaded:false,loading:false,error:''};

 /* ---------- factors: w = [gold weight, indices weight] when the factor is in its first state ---------- */
 const GROUPS=[
  {title:'الماكرو والسيولة',items:[
   {id:'dxy',t:'مؤشر الدولار DXY',h:'الدولار القوي يضغط على الذهب ويخفف شهية المخاطرة.',s:['يرتفع','مستقر','ينخفض'],w:[-2,-1]},
   {id:'y10',t:'عائد السندات الأمريكية 10 سنوات',h:'ارتفاع العوائد يرفع تكلفة الاحتفاظ بالذهب ويضغط على تقييمات التكنولوجيا.',s:['يرتفع','مستقر','ينخفض'],w:[-2,-2]},
   {id:'real',t:'العوائد الحقيقية (TIPS 10Y)',h:'أقوى عامل عكسي تاريخياً مع الذهب.',s:['ترتفع','مستقرة','تنخفض'],w:[-2,-1]},
   {id:'fed',t:'توقعات الفيدرالي (CME FedWatch)',h:'تسعير التشدد يضغط على الذهب والمؤشرات معاً.',s:['تشدد','ثابتة','تيسير'],w:[-2,-2]}]},
  {title:'المخاطر والمعنويات',items:[
   {id:'vix',t:'مؤشر الخوف VIX',h:'ارتفاعه طلب على الملاذات وبيع للأسهم.',s:['يرتفع','مستقر','ينخفض'],w:[1,-2]},
   {id:'geo',t:'التوترات الجيوسياسية',h:'التصعيد يدعم الذهب كملاذ آمن.',s:['تصعيد','هدوء','تهدئة'],w:[2,-1]},
   {id:'oil',t:'النفط (برنت / WTI)',h:'ارتفاعه يغذي التضخم ورهانات التشدد ويضغط على الأسهم.',s:['يرتفع','مستقر','ينخفض'],w:[1,-1]},
   {id:'flows',t:'تدفقات صناديق الذهب ومشتريات البنوك المركزية',h:'طلب هيكلي داعم للذهب على المدى المتوسط.',s:['شراء','محايد','بيع'],w:[1,0]}]},
  {title:'ما قبل افتتاح نيويورك',items:[
   {id:'fut',t:'العقود الآجلة ES / NQ',h:'اتجاه العقود قبل الافتتاح يحدد نبرة أول ساعة.',s:['خضراء','قرب الصفر','حمراء'],w:[0,2]},
   {id:'eu',t:'جلسة أوروبا (DAX / Stoxx 600)',h:'شهية المخاطرة العالمية قبل دخول السيولة الأمريكية.',s:['إيجابية','مختلطة','سلبية'],w:[0,1]},
   {id:'earn',t:'نتائج الشركات الكبرى (Mega-caps)',h:'مفاجأة من شركة كبرى تحرك ناسداك كاملاً.',s:['إيجابية','لا يوجد','سلبية'],w:[0,2]}]},
  {title:'الصورة الفنية',items:[
   {id:'gLvl',t:'الذهب مقابل أعلى/أدنى أمس',h:'فوق أعلى أمس قوة، وتحت أدنى أمس ضعف.',s:['فوق','داخل النطاق','تحت'],w:[2,0]},
   {id:'gTr',t:'اتجاه الذهب على الفريم اليومي',h:'لا تعاكس الاتجاه الأكبر إلا مع سبب أساسي واضح.',s:['صاعد','عرضي','هابط'],w:[2,0]},
   {id:'iLvl',t:'المؤشرات مقابل أعلى/أدنى أمس و VWAP',h:'راقب الفجوة: هل تُملأ أم تستمر؟',s:['فوق','داخل النطاق','تحت'],w:[0,2]},
   {id:'iTr',t:'اتجاه المؤشرات على 4H واليومي',h:'والمتوسط 200 يوم كمرجع للاتجاه العام.',s:['صاعد','عرضي','هابط'],w:[0,2]}]},
  {title:'أجندة اليوم',flag:true,items:[
   {id:'hi',t:'بيانات أمريكية عالية التأثير اليوم',h:'CPI · NFP · FOMC · PCE · GDP. تصدر غالباً 15:30 أو 17:00 بتوقيت إسطنبول.',s:['نعم','—','لا'],w:[0,0],flag:'بيانات عالية التأثير'},
   {id:'spk',t:'خطاب رئيس الفيدرالي أو أحد الأعضاء',h:'نبرة الخطاب قد تعكس اتجاه الجلسة بالكامل.',s:['نعم','—','لا'],w:[0,0],flag:'خطاب فيدرالي'},
   {id:'ah',t:'نتائج شركة كبرى بعد الإغلاق',h:'توقع حذراً وتقلصاً في الحركة قبل الإغلاق.',s:['نعم','—','لا'],w:[0,0],flag:'نتائج بعد الإغلاق'}]}];
 const ALL=GROUPS.flatMap(g=>g.items);
 const RISK=['حددت مكان الستوب والهدف قبل الدخول','المخاطرة لا تتجاوز 1% من الحساب في الصفقة','لا دخول قبل خبر قوي بـ15 دقيقة ولا بعده بـ5 دقائق','انتظرت تأكيد الاتجاه على فريم 5 أو 15 دقيقة','حد الخسارة اليومي واضح (3 صفقات خاسرة = توقف)'];

 /* ---------- per-day operator state (browser only) ---------- */
 let st=null;
 function loadState(){ try{ const s=JSON.parse(localStorage.getItem(KEY)||'null'); if(s&&s.d===today()) return s; }catch(e){} return {d:today(),f:{},r:{},ng:null,ni:null}; }
 function saveState(){ try{ localStorage.setItem(KEY,JSON.stringify(st)); }catch(e){} }
 st=loadState();

 /* ---------- data ---------- */
 const getJSON=u=>fetch(u,{cache:'no-store'}).then(r=>{ if(!r.ok) throw Error(u+' '+r.status); return r.json(); });
 async function load(){
  if(D.loading) return; const first=!D.loaded; D.loading=true; D.error='';
  const v=Math.floor(Date.now()/60000);
  const [q,c,t,r,g,gd,yd]=await Promise.allSettled([getJSON('../data/quotes.json?v='+v),getJSON('../data/calendar.json?v='+v),getJSON('../data/market/ai-technical.json?v='+v),getJSON('../data/desk/session-research.json?v='+v),getJSON('https://api.gold-api.com/price/XAU'),getJSON('../data/market/gold-daily.json?v='+v),getJSON('../data/market/us30-daily.json?v='+v)]);
  D.gcd=gd.status==='fulfilled'&&Array.isArray(gd.value.bars)?gd.value:null;
  D.ymd=yd.status==='fulfilled'&&Array.isArray(yd.value.bars)?yd.value:null;
  D.quotes=q.status==='fulfilled'?q.value:null; D.cal=c.status==='fulfilled'?c.value:null; D.tech=t.status==='fulfilled'?t.value:null; D.research=r.status==='fulfilled'?r.value:null;
  D.gold=g.status==='fulfilled'&&g.value.symbol==='XAU'&&g.value.currency==='USD'?g.value:null;
  if(q.status!=='fulfilled') D.error='تعذّر تحميل data/quotes.json';
  D.loaded=true; D.loading=false;
  if(st.d!==today()) st=loadState();
  if(!first&&S.view==='checklist'&&document.getElementById('td-facts')&&D._mounted){ document.getElementById('td-facts').innerHTML=factsHtml(); paint(); }
  else if(['checklist','marketdata','tvscript'].includes(S.view)) render();
 }
 const quote=sym=>(D.quotes&&D.quotes.quotes||[]).find(x=>x.symbol===sym);
 const ageMin=iso=>iso?(Date.now()-Date.parse(iso))/60000:Infinity;
 const fresh=(q,maxMin)=>q&&typeof q.price==='number'&&ageMin(q.asOf)<=maxMin;
 const pctOf=q=>q&&typeof q.dailyChangePct==='number'&&isFinite(q.dailyChangePct)?q.dailyChangePct:null;
 const tri=(x,up,down)=>x>up?0:x<down?2:1;
 const sgn=x=>(x>0?'+':'')+x.toFixed(2)+'%';
 function prevWeekday(day){ const d=new Date(day+'T12:00:00Z'); do{ d.setUTCDate(d.getUTCDate()-1); }while([0,6].includes(d.getUTCDay())); return d.toISOString().slice(0,10); }
 function goldSeries(){ return (D.tech&&D.tech.instruments||[]).find(i=>i.symbol==='XAUUSD'&&i.timeframe==='D1'); }
 function goldNow(){ if(D.gold) return {price:D.gold.price,at:D.gold.updatedAt,src:'Gold API'}; const q=quote('XAUUSD'); return q?{price:q.price,at:q.asOf,src:q.source}:null; }
 const sma=(a,n)=>a.length>=n?a.slice(-n).reduce((s,x)=>s+x,0)/n:null;
 const emaOf=(a,n)=>{ if(a.length<n) return null; let v=a.slice(0,n).reduce((s,x)=>s+x,0)/n; for(const x of a.slice(n)) v+=(x-v)*2/(n+1); return v; };

 /* ---------- gold daily bars in spot terms ----------
    1) spot D1 bars (ai-technical.json) when the last one is the previous weekday;
    2) otherwise COMEX GC daily bars (gold-daily.json, refreshed by the market-data workflow) shifted by the
       spot–futures basis measured at the same moment (XAUUSD vs GC in quotes.json, or live Gold API vs GC);
    3) otherwise the latest spot bars, marked stale. */
 function goldBars(){
  const prev=prevWeekday(today());
  const spot=goldSeries(), sb=spot&&spot.bars?spot.bars.map(b=>({date:b.at.slice(0,10),open:b.open,high:b.high,low:b.low,close:b.close})):[];
  if(sb.length>=20&&sb[sb.length-1].date===prev) return {bars:sb,basis:0,src:'سعر فوري يومي ('+(spot.provider||'Investing.com')+')',fresh:true};
  const gc=D.gcd&&D.gcd.bars||[], gq=quote('GCFUT'), xq=quote('XAUUSD');
  let basis=null, basisNote='';
  if(gq&&xq&&Math.abs(Date.parse(gq.asOf)-Date.parse(xq.asOf))<=25*60000){ basis=xq.price-gq.price; basisNote=when(xq.asOf); }
  else if(gq&&D.gold&&Math.abs(Date.parse(gq.asOf)-Date.parse(D.gold.updatedAt))<=25*60000){ basis=D.gold.price-gq.price; basisNote=when(D.gold.updatedAt); }
  if(gc.length>=20&&basis!==null){ const last=gc[gc.length-1].date; return {bars:gc.map(b=>({date:b.date,open:b.open+basis,high:b.high+basis,low:b.low+basis,close:b.close+basis})),basis,basisNote,src:'عقود COMEX الآجلة GC محوّلة للفوري',fresh:last>=prevWeekday(prev)}; }
  if(sb.length>=20) return {bars:sb,basis:0,src:'سعر فوري يومي (قديم)',fresh:false};
  return null;
 }
 function us30Bars(){
  const ym=D.ymd&&D.ymd.bars||[], b=D.ymd&&D.ymd.basis; if(ym.length<20) return null;
  const basis=b&&typeof b.value==='number'?b.value:0, last=ym[ym.length-1].date;
  return {bars:ym.map(x=>({date:x.date,open:x.open+basis,high:x.high+basis,low:x.low+basis,close:x.close+basis})),basis,basisNote:b?when(b.at):'',src:b?'عقود داو الآجلة YM محوّلة لسعر الكاش':'عقود داو الآجلة YM',fresh:last>=prevWeekday(prevWeekday(today()))};
 }
 function us30Now(){
  const c=quote('US30'), f=quote('YMFUT'), b=D.ymd&&D.ymd.basis;
  if(c&&ageMin(c.asOf)<=30) return {price:c.price,at:c.asOf,src:'مؤشر داو (الكاش)'};
  if(f&&b&&typeof b.value==='number') return {price:f.price+b.value,at:f.asOf,src:'عقود YM + فرق الكاش'};
  if(f) return {price:f.price,at:f.asOf,src:'عقود YM'};
  if(c) return {price:c.price,at:c.asOf,src:'مؤشر داو (آخر إغلاق)'};
  return null;
 }
 const INSTR=[
  {id:'gold',title:'الذهب XAU/USD',sym:'XAU/USD',u:'$',pdp:2,steps:[[50,.5],[100,1]],bars:()=>goldBars(),now:()=>goldNow(),analyst:r=>r&&r.levels&&r.levels.goldLevels,ix:0,live:'السعر كل 20 ثانية'},
  {id:'us30',title:'US30 CFD · داو جونز',sym:'US30',u:' نقطة',pdp:0,steps:[[250,.5],[500,1]],bars:()=>us30Bars(),now:()=>us30Now(),analyst:r=>r&&r.levels&&r.levels.us30Levels,ix:1,live:'لقطات كل 15 دقيقة'}];
 /* Support/resistance zones around the current price. Each source level carries a weight; nearby levels merge into a zone. */
 function levelsFor(inst){
  const gb=inst.bars(), g=inst.now(); if(!gb||!g) return null;
  const B=gb.bars, last=B[B.length-1], price=g.price, closes=B.map(b=>b.close);
  const tr=B.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-B[i].close),Math.abs(b.low-B[i].close)));
  let atr=tr.slice(0,14).reduce((s,x)=>s+x,0)/14; for(const x of tr.slice(14)) atr=(atr*13+x)/14;
  const L=[], add=(p,label,w)=>{ if(isFinite(p)&&Math.abs(p-price)<=4*atr) L.push({p,label,w}); };
  const H=last.high, Lo=last.low, C=last.close, P=(H+Lo+C)/3, yd=last.date===prevWeekday(today()), sess=yd?'أمس':'جلسة '+arDay(last.date);
  add(H,'أعلى '+sess,3); add(Lo,'أدنى '+sess,3); add(C,'إغلاق '+sess,1);
  add(P,'المحور اليومي P',1.5); add(2*P-Lo,'R1',1.5); add(2*P-H,'S1',1.5); add(P+(H-Lo),'R2',1); add(P-(H-Lo),'S2',1);
  const wk=d=>{ const x=new Date(d+'T12:00:00Z'); x.setUTCDate(x.getUTCDate()-((x.getUTCDay()+6)%7)); return x.toISOString().slice(0,10); };
  const thisWk=wk(today()), pw=B.filter(b=>wk(b.date)<thisWk), pwKey=pw.length?wk(pw[pw.length-1].date):null, pwb=pw.filter(b=>wk(b.date)===pwKey);
  if(pwb.length){ add(Math.max(...pwb.map(b=>b.high)),'أعلى الأسبوع الماضي',2.5); add(Math.min(...pwb.map(b=>b.low)),'أدنى الأسبوع الماضي',2.5); }
  const r20=B.slice(-20); add(Math.max(...r20.map(b=>b.high)),'أعلى 20 يوماً',2); add(Math.min(...r20.map(b=>b.low)),'أدنى 20 يوماً',2);
  const sw=B.slice(-60); for(let i=2;i<sw.length-2;i++){ const b=sw[i];
   if(b.high>sw[i-1].high&&b.high>sw[i-2].high&&b.high>sw[i+1].high&&b.high>sw[i+2].high) add(b.high,'قمة '+arDay(b.date),1.5);
   if(b.low<sw[i-1].low&&b.low<sw[i-2].low&&b.low<sw[i+1].low&&b.low<sw[i+2].low) add(b.low,'قاع '+arDay(b.date),1.5); }
  const e20=emaOf(closes,20), e50=emaOf(closes,50); if(e20) add(e20,'متوسط 20 يوم',1); if(e50) add(e50,'متوسط 50 يوم',1);
  for(const [step,w] of inst.steps){ const lo=Math.floor(price/step)*step; [lo,lo+step].forEach(x=>add(x,'رقم نفسي '+num(x,0),w)); }
  (inst.analyst(research())||[]).forEach(x=>add(+x.p,x.l,2.5));
  L.sort((a,b)=>a.p-b.p); const tol=Math.max(atr*.12,price*.0012), Z=[];
  for(const l of L){ const z=Z[Z.length-1]; if(z&&l.p-z.hi<=tol){ z.hi=l.p; z.items.push(l); } else Z.push({lo:l.p,hi:l.p,items:[l]}); }
  Z.forEach(z=>{ z.w=z.items.reduce((s,x)=>s+x.w,0); z.mid=z.items.reduce((s,x)=>s+x.p*x.w,0)/z.w; z.labels=[...new Set(z.items.map(x=>x.label))]; });
  const res=Z.filter(z=>z.lo>price).sort((a,b)=>a.lo-b.lo).slice(0,3), sup=Z.filter(z=>z.hi<price).sort((a,b)=>b.hi-a.hi).slice(0,3);
  const inside=Z.find(z=>z.lo<=price&&z.hi>=price);
  const trend=last.close>e20&&e20>(e50||e20)?1:last.close<e20&&e20<(e50||e20)?-1:0;
  return {price,at:g.at,src:g.src,atr,last,res,sup,inside,gb,pdc:C,e20,e50,trend};
 }
 function goldLevels(){ return levelsFor(INSTR[0]); }

 /* Automatic readings: each returns {k, why} or null when the data is missing or stale. */
 function auto(){
  const out={}, MAXQ=36*60; // quotes older than 36h are ignored (weekend-aware enough for a session read)
  const dxy=quote('DXY'); if(fresh(dxy,MAXQ)&&pctOf(dxy)!==null) out.dxy={k:tri(pctOf(dxy),.15,-.15),why:`DXY ${num(dxy.price,2)} (${sgn(pctOf(dxy))}) · ${dxy.source} ${when(dxy.asOf)}`};
  const y=quote('US10Y'); if(fresh(y,MAXQ)&&pctOf(y)!==null){ const bp=(y.price-y.price/(1+pctOf(y)/100))*100; out.y10={k:tri(bp,3,-3),why:`العائد ${num(y.price,3)}% (${bp>0?'+':''}${bp.toFixed(1)} نقطة أساس) · ${when(y.asOf)}`}; }
  const vix=quote('VIX'); if(fresh(vix,MAXQ)&&pctOf(vix)!==null) out.vix={k:tri(pctOf(vix),3,-3),why:`VIX ${num(vix.price,2)} (${sgn(pctOf(vix))}) · ${when(vix.asOf)}`};
  const oil=[quote('BRENT'),quote('WTI')].find(q=>fresh(q,MAXQ)&&pctOf(q)!==null); if(oil) out.oil={k:tri(pctOf(oil),1,-1),why:`${oil.symbol==='BRENT'?'برنت':'WTI'} ${num(oil.price,2)}$ (${sgn(pctOf(oil))}) · ${when(oil.asOf)}`};
  const fut=['ESFUT','NQFUT'].map(quote).filter(q=>fresh(q,12*60)&&pctOf(q)!==null);
  if(fut.length){ const avg=fut.reduce((s,q)=>s+pctOf(q),0)/fut.length; out.fut={k:tri(avg,.2,-.2),why:fut.map(q=>`${q.symbol.replace('FUT','')} ${sgn(pctOf(q))}`).join(' · ')+` · ${when(fut[0].asOf)}`}; }
  const gb=goldBars();
  if(gb&&gb.bars.length>=20){
   const bars=gb.bars, last=bars[bars.length-1], closes=bars.map(b=>b.close);
   if((Date.now()-Date.parse(last.date+'T22:00:00Z'))/864e5<=5){
    const f=emaOf(closes,20), sl=emaOf(closes,50)||sma(closes,20);
    const k=last.close>f&&f>sl?0:last.close<f&&f<sl?2:1;
    out.gTr={k,why:`آخر إغلاق يومي ${num(last.close,2)} بتاريخ ${last.date} · متوسط 20 يوماً ${num(f,2)} · ${emaOf(closes,50)?'متوسط 50 يوماً':'متوسط 20 بسيط'} ${num(sl,2)} · ${gb.src}`};
   }
   const g=goldNow();
   if(g&&last.date===prevWeekday(today())){ const k=g.price>last.high?0:g.price<last.low?2:1; out.gLvl={k,why:`السعر ${num(g.price,2)} · أعلى أمس ${num(last.high,2)} · أدنى أمس ${num(last.low,2)} (${last.date})`}; }
  }
  const ub=us30Bars(), un=us30Now();
  if(ub&&ub.bars.length>=20){
   const bars=ub.bars, last=bars[bars.length-1], closes=bars.map(b=>b.close), f=emaOf(closes,20), sl=emaOf(closes,50)||sma(closes,20);
   if((Date.now()-Date.parse(last.date+'T22:00:00Z'))/864e5<=5) out.iTr={k:last.close>f&&f>sl?0:last.close<f&&f<sl?2:1,why:`US30: آخر إغلاق ${num(last.close,0)} · متوسط 20 يوماً ${num(f,0)} · متوسط 50 يوماً ${num(sl,0)}`};
   if(un&&last.date===prevWeekday(today())) out.iLvl={k:un.price>last.high?0:un.price<last.low?2:1,why:`US30 ${num(un.price,0)} · أعلى أمس ${num(last.high,0)} · أدنى أمس ${num(last.low,0)}`};
  }
  if(D.cal&&Array.isArray(D.cal.events)){
   const t=today(), ev=D.cal.events.filter(e=>dayOf(e.at)===t&&e.currency==='USD'&&e.impact==='HIGH');
   out.hi=ev.length?{k:0,why:ev.map(e=>`${hm(e.at)} ${e.title.ar}`).join(' · ')}:{k:2,why:'لا أحداث أمريكية عالية التأثير اليوم في التقويم الموثق (تغطية انتقائية).'};
  }
  return out;
 }
 function research(){ const r=D.research; return r&&r.date===today()?r:null; }
 /* Effective value per factor and where it came from. */
 function resolve(){
  const a=auto(), r=research(), res={};
  ALL.forEach(it=>{
   if(st.f[it.id]!==undefined) res[it.id]={k:st.f[it.id],src:'manual',why:(a[it.id]||{}).why||(r&&r.why&&r.why[it.id])||''};
   else if(a[it.id]) res[it.id]={k:a[it.id].k,src:'auto',why:a[it.id].why};
   else if(r&&r.values&&r.values[it.id]!==undefined) res[it.id]={k:r.values[it.id],src:'research',why:(r.why||{})[it.id]||''};
   else res[it.id]={k:undefined,src:'none',why:''};
  });
  return res;
 }
 function bias(v){ if(v>=.4) return ['صاعد','var(--teal)']; if(v>=.15) return ['ميل صاعد','var(--teal)']; if(v<=-.4) return ['هابط','var(--sell)']; if(v<=-.15) return ['ميل هابط','var(--sell)']; return ['محايد / تذبذب','var(--muted)']; }
 function score(res,ix){ let s=0,m=0,n=0,tot=0; ALL.forEach(it=>{ const w=it.w[ix]; if(!w) return; tot++; const k=res[it.id].k; if(k===undefined) return; n++; s+=w*(k===0?1:k===2?-1:0); m+=Math.abs(w); }); return {v:m?s/m:0,n,tot}; }

 /* ---------- sessions (DST-aware, shown in Istanbul time) ---------- */
 function tzOff(tz,d){ const a=new Date(d.toLocaleString('en-US',{timeZone:tz})), b=new Date(d.toLocaleString('en-US',{timeZone:'UTC'})); return (a-b)/60000; }
 function at(tz,h,m){ const n=new Date(), base=Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate(),h,m); return new Date(base-tzOff(tz,new Date(base))*60000); }
 function sessions(){ return [['افتتاح لندن',at('Europe/London',8,0)],['بيانات أمريكا',at('America/New_York',8,30)],['افتتاح نيويورك',at('America/New_York',9,30)],['تثبيت الذهب PM',at('Europe/London',15,0)],['إغلاق نيويورك',at('America/New_York',16,0)]]; }
 function clockHtml(){
  const S5=sessions(), now=new Date(), ny=S5[2][1], cl=S5[4][1], diff=Math.round((ny-now)/60000);
  const wk=[0,6].includes(new Date(today()+'T12:00:00Z').getUTCDay());
  const st=wk?'<span class="chip">عطلة نهاية الأسبوع</span>':diff>0?`<span class="chip td-live">افتتاح نيويورك بعد <b class="num">${Math.floor(diff/60)}:${String(diff%60).padStart(2,'0')}</b> ساعة</span>`:now<cl?'<span class="chip td-live">جلسة نيويورك <b>مفتوحة</b></span>':'<span class="chip">نيويورك مغلقة</span>';
  return `<span class="chip">إسطنبول <b class="num">${hm(now)}</b></span>${st}${S5.map(([n,t])=>`<span class="chip">${n} <b class="num">${hm(t)}</b></span>`).join('')}`;
 }

 /* ---------- styles (scoped to the desk) ---------- */
 if(!document.getElementById('td-style')){ const css=document.createElement('style'); css.id='td-style'; css.textContent=`
  .td-clock{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}.td-clock .chip{cursor:default}.td-live b{color:var(--teal)}
  .td-gauges{position:sticky;top:0;z-index:4;background:var(--ink);padding:6px 0 10px;margin-bottom:6px}
  .td-g{display:grid;gap:6px}.td-g .top{display:flex;justify-content:space-between;align-items:baseline}.td-g .name{font-weight:700}.td-g .lbl{font-size:22px;font-weight:700;line-height:1.3}
  .td-track{position:relative;height:8px;border-radius:4px;background:linear-gradient(to left,var(--teal),var(--faint) 50%,var(--sell))}
  .td-pin{position:absolute;top:-4px;width:4px;height:16px;border-radius:2px;background:var(--text);transition:right .25s}
  .td-scale{display:flex;justify-content:space-between;font-size:12px;color:var(--muted)}
  .td-rows{display:grid}.td-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px;align-items:center;padding:12px 0;border-top:1px solid var(--faint)}.td-row:first-of-type{border-top:0}
  .td-row .t{font-weight:600}.td-row .h{color:var(--muted);font-size:13px}
  .td-why{font-size:12.5px;margin-top:6px;color:var(--text);opacity:.85}
  .td-src{font-size:11.5px;border-radius:999px;padding:1px 8px;margin-inline-start:6px;border:1px solid var(--faint);color:var(--muted);white-space:nowrap}
  .td-src.auto{border-color:rgba(0,212,167,.45);color:var(--teal)}.td-src.research{border-color:rgba(91,141,239,.45);color:var(--info)}.td-src.manual{border-color:rgba(245,185,66,.45);color:var(--pend)}
  .td-w{font-size:11.5px;color:var(--muted);margin-inline-start:6px}
  .td-seg{display:inline-flex;border:1px solid var(--faint);border-radius:var(--r1);overflow:hidden}
  .td-seg button{all:unset;cursor:pointer;font-size:13px;padding:6px 12px;min-width:62px;text-align:center;color:var(--muted);border-inline-start:1px solid var(--faint)}
  .td-seg button:first-child{border-inline-start:0}.td-seg button:hover{color:var(--text)}.td-seg button:focus-visible{outline:2px solid var(--teal);outline-offset:-2px}
  .td-seg button[aria-pressed="true"].up{background:var(--teal);color:var(--ink);font-weight:600}
  .td-seg button[aria-pressed="true"].mid{background:#485563;color:#fff}
  .td-seg button[aria-pressed="true"].dn{background:var(--sell);color:#fff;font-weight:600}
  .td-seg.flag button[aria-pressed="true"].up{background:var(--pend);color:var(--ink)}
  .td-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:12px}
  .td-fact{border:1px solid var(--faint);border-radius:var(--r1);padding:8px 10px}.td-fact .k{font-size:12px;color:var(--muted)}.td-fact .v{font-family:var(--num);font-size:17px;font-weight:600}.td-fact .d{font-size:12px;color:var(--muted)}
  .td-up{color:var(--teal)}.td-dn{color:var(--sell)}
  .td-brief{margin:0;padding-inline-start:18px;display:grid;gap:4px;font-size:14px}
  .td-tv{min-height:120px}.td-tv-note{font-size:12px;color:var(--muted);margin:6px 0 0}
  .td-notes textarea{width:100%;min-height:90px;background:var(--ink);border:1px solid var(--faint);border-radius:var(--r1);padding:10px;font-family:var(--num);font-size:13px;direction:ltr;text-align:left;resize:vertical}
  .td-check{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--faint);cursor:pointer}.td-check:first-child{border-top:0}.td-check input{margin-top:6px;accent-color:var(--teal)}
  .td-plan p{margin:0 0 8px}
  .td-lv-wrap{display:grid;gap:16px;margin-bottom:6px}
  .td-lv{border-color:rgba(245,185,66,.35)}
  .td-disclaimer{margin:0 0 16px;font-size:12px}
  .td-ai{border-radius:var(--r2);padding:12px 14px;margin-bottom:12px;border:1px solid var(--faint)}
  .td-ai.bear{background:rgba(255,92,122,.08);border-color:rgba(255,92,122,.4)}.td-ai.bull{background:rgba(0,212,167,.08);border-color:rgba(0,212,167,.4)}.td-ai.wait{background:rgba(245,185,66,.08);border-color:rgba(245,185,66,.4)}
  .td-ai-top{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px}.td-ai-k{font-size:12px;color:var(--muted);letter-spacing:.02em}
  .td-ai-v{font-size:19px}.td-ai.bear .td-ai-v{color:var(--sell)}.td-ai.bull .td-ai-v{color:var(--teal)}.td-ai.wait .td-ai-v{color:var(--pend)}
  .td-ai-c{font-size:12.5px;color:var(--muted);margin-inline-start:auto}
  .td-ai-why{margin:4px 0 6px;font-size:13px;color:var(--muted)}
  .td-ai ul{margin:0;padding-inline-start:18px;display:grid;gap:3px;font-size:14px}
  .td-lv-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:10px}.td-lv-head h2{margin:0 0 2px}
  .td-lv-now{display:grid;justify-items:end;gap:2px}.td-lv-now>b{font-size:28px;line-height:1.1}
  .td-lv-sum{margin:0 0 12px;font-size:15px;line-height:1.8;background:rgba(229,231,235,.04);border-radius:var(--r1);padding:10px 12px}
  .td-lv-ladder{list-style:none;margin:0;padding:0;display:grid;gap:4px}
  .td-lv-row{display:grid;grid-template-columns:78px 150px 62px minmax(0,1fr) auto;gap:10px;align-items:center;padding:7px 10px;border-radius:var(--r1);border-inline-start:3px solid transparent;font-size:13.5px}
  .td-lv-row.r{background:rgba(255,92,122,.06);border-inline-start-color:var(--sell)}.td-lv-row.s{background:rgba(0,212,167,.06);border-inline-start-color:var(--teal)}
  .td-lv-row.now{background:rgba(245,185,66,.14);border-inline-start-color:var(--pend);font-weight:600}
  .td-lv-tag{font-size:12.5px;color:var(--muted)}.td-lv-row.now .td-lv-tag{color:var(--pend)}
  .td-lv-p{font-size:15px;white-space:nowrap}.td-lv-str{letter-spacing:1px;color:var(--pend);font-size:12px}
  .td-lv-why{color:var(--muted);font-size:12.5px;min-width:0}.td-lv-d{font-size:12.5px;color:var(--muted);white-space:nowrap}
  @media (max-width:760px){.td-lv-row{grid-template-columns:auto 1fr auto;row-gap:2px}.td-lv-str{grid-column:3}.td-lv-why{grid-column:1/-1}.td-lv-d{grid-column:2/-1;text-align:end}.td-lv-now{justify-items:start}}
  table.t td.ok{color:var(--teal)}table.t td.old{color:var(--pend)}table.t td.bad{color:var(--sell)}
  @media (max-width:760px){.td-gauges{position:static}.td-row{grid-template-columns:1fr}.td-seg{width:100%}.td-seg button{flex:1;min-width:0}.td-g .lbl{font-size:17px}}
  @media (prefers-reduced-motion:reduce){.td-pin{transition:none}}`; document.head.appendChild(css); }

 /* ---------- view: checklist ---------- */
 const cls=['up','mid','dn'], SRC={auto:'تلقائي',research:'بحث اليوم',manual:'يدوي',none:'حدده من الشارت'};
 function gauge(id,name){ return `<section class="panel td-g" id="td-${id}"><div class="top"><span class="name">${name}</span><span class="num hint" style="margin:0;direction:ltr" data-score></span></div><div class="lbl" data-label>—</div><div class="td-track"><span class="td-pin" data-pin></span></div><div class="td-scale"><span>صعود</span><span>هبوط</span></div><p class="hint" style="margin:0" data-meta></p></section>`; }
 function factorRow(it,g,res){
  const r=res[it.id], tag=`<span class="td-src ${r.src}" data-src>${SRC[r.src]}</span>`;
  const w=g.flag?'':`<span class="td-w">${it.w[0]?`ذهب ${it.w[0]>0?'+':'−'}${Math.abs(it.w[0])}`:''}${it.w[0]&&it.w[1]?' · ':''}${it.w[1]?`مؤشرات ${it.w[1]>0?'+':'−'}${Math.abs(it.w[1])}`:''}</span>`;
  return `<div class="td-row"><div><div class="t">${it.t}${tag}${w}</div><div class="h">${it.h}</div><div class="td-why" data-why="${it.id}"${r.why?'':' hidden'}>${iso(esc(r.why))}</div></div>
  <div class="td-seg${g.flag?' flag':''}" role="group" aria-label="${it.t}">${(g.flag?[0,2]:[0,1,2]).map(k=>`<button type="button" class="${cls[k]}" data-act="td-set" data-id="${it.id}" data-k="${k}" aria-pressed="${r.k===k}">${it.s[k]}</button>`).join('')}</div></div>`;
 }
 const iso=t=>String(t).replace(/(?<![A-Za-z])\d[\d,.]*(?:\s?[–-]\s?\d[\d,.]*)?/g,m=>'\u2066'+m+'\u2069');
 const arDay=d=>new Date(d+'T12:00:00Z').toLocaleDateString('ar',{day:'numeric',month:'long',timeZone:'UTC'});
 const strength=w=>w>=6?[4,'قوي جداً']:w>=4?[3,'قوي']:w>=2.5?[2,'متوسط']:[1,'ضعيف'];
 const zp=z=>z.hi-z.lo<0.5?num(z.mid,0):`${num(z.lo,0)}–${num(z.hi,0)}`;
 /* Rules-based session recommendation: daily trend + checklist bias + nearest zones + event risk. Educational, not advice. */
 function advice(inst,V){
  const sc=score(resolve(),inst.ix), bias=sc.n?(sc.v>=.15?1:sc.v<=-.15?-1:0):0, trend=V.trend;
  const {price,res:R,sup:Sp,atr}=V, r1=R[0],r2=R[1],s1=Sp[0],s2=Sp[1], buf=atr*.25, f=x=>num(x,0), u=inst.u;
  const dir=(trend<0&&bias<=0)||(trend===0&&bias<0)?-1:(trend>0&&bias>=0)||(trend===0&&bias>0)?1:0;
  const tTxt=trend>0?'صاعد':trend<0?'هابط':'عرضي', bTxt=!sc.n?'غير محددة':bias>0?'داعمة للصعود':bias<0?'ضاغطة للهبوط':'محايدة';
  let conf=dir?(Math.abs(trend)+Math.abs(bias)>=2?'عالية':'متوسطة'):'منخفضة';
  if(!V.gb.fresh&&conf==='عالية') conf='متوسطة';
  const L=[]; let verdict, tone;
  if(dir<0){ verdict=(trend<0?'الاتجاه هابط':'الميل هابط')+' · تجنّب الشراء'; tone='bear';
   if(r1) L.push(`البيع عند الارتداد إلى <b class="num">${zp(r1)}</b> مع وقف فوق <b class="num">${f(r1.hi+buf)}</b> (مخاطرة نحو <b class="num">${f(r1.hi+buf-r1.lo)}${u}</b> من أدنى المنطقة).`);
   if(s1) L.push(`الهدف الأول <b class="num">${zp(s1)}</b>${s2?`، ثم <b class="num">${zp(s2)}</b>`:''}.`);
   if(s1&&price-s1.hi<atr*.3) L.push(`السعر قريب من دعم <b class="num">${zp(s1)}</b>: لا تبع هنا. انتظر ارتداداً للمقاومة أو إغلاق ساعة تحت <b class="num">${f(s1.lo)}</b>.`);
   L.push(`يتغير الرأي بإغلاق يومي فوق <b class="num">${f((r2||r1||{hi:price+atr}).hi)}</b>.`);
  } else if(dir>0){ verdict=(trend>0?'الاتجاه صاعد':'الميل صاعد')+' · تجنّب البيع'; tone='bull';
   if(s1) L.push(`الشراء عند التراجع إلى <b class="num">${zp(s1)}</b> مع وقف تحت <b class="num">${f(s1.lo-buf)}</b> (مخاطرة نحو <b class="num">${f(s1.hi-(s1.lo-buf))}${u}</b> من أعلى المنطقة).`);
   if(r1) L.push(`الهدف الأول <b class="num">${zp(r1)}</b>${r2?`، ثم <b class="num">${zp(r2)}</b>`:''}.`);
   if(r1&&r1.lo-price<atr*.3) L.push(`السعر قريب من مقاومة <b class="num">${zp(r1)}</b>: لا تشترِ هنا. انتظر تراجعاً للدعم أو إغلاق ساعة فوق <b class="num">${f(r1.hi)}</b>.`);
   L.push(`يتغير الرأي بإغلاق يومي تحت <b class="num">${f((s2||s1||{lo:price-atr}).lo)}</b>.`);
  } else { verdict='لا اتجاه واضح · انتظر الاختراق'; tone='wait';
   if(r1) L.push(`شراء فقط بعد إغلاق ساعة فوق <b class="num">${f(r1.hi)}</b>${r2?`، والهدف <b class="num">${zp(r2)}</b>`:''}.`);
   if(s1) L.push(`بيع فقط بعد إغلاق ساعة تحت <b class="num">${f(s1.lo)}</b>${s2?`، والهدف <b class="num">${zp(s2)}</b>`:''}.`);
   L.push('بين المستويين السوق متذبذب: أحجام صغيرة أو بلا صفقات.');
  }
  const ev=((D.cal&&D.cal.events)||[]).filter(e=>e.impact==='HIGH'&&e.currency==='USD'&&Date.parse(e.at)>Date.now()&&Date.parse(e.at)-Date.now()<36*36e5);
  if(ev.length) L.push(`<span style="color:var(--pend)">تنبيه:</span> ${esc(ev.slice(0,2).map(e=>e.title.ar+' '+(dayOf(e.at)===today()?'اليوم':'غداً')+' '+hm(e.at)).join(' · '))}. خفّف الحجم وتجنّب الدخول قبل الخبر بـ15 دقيقة.`);
  return {verdict,tone,conf,why:`الاتجاه اليومي ${tTxt} · عوامل التشيك ليست ${bTxt}`,lines:L};
 }
 function levelsHtml(inst){
  const V=levelsFor(inst);
  if(!V) return `<div class="td-lv-head"><h2>${inst.title}</h2></div><p class="hint" style="margin:0">${D.loaded?'لا تتوفر بيانات يومية حديثة بعد. تتحدث تلقائياً مع تشغيل تحديث الأسعار التالي.':'جارٍ تحميل المستويات…'}</p>`;
  const {price,res,sup,inside,atr,pdc,gb}=V, chg=price-pdc, u=inst.u, ddp=inst.pdp?1:0;
  const row=(z,kind,i)=>{ const [n,lbl]=strength(z.w), d=kind==='r'?z.lo-price:price-z.hi, pct=d/price*100;
   return `<li class="td-lv-row ${kind}"><span class="td-lv-tag">${kind==='r'?'مقاومة':'دعم'} ${i+1}</span><b class="num td-lv-p">${zp(z)}</b><span class="td-lv-str" title="${lbl}" aria-label="قوة المستوى: ${lbl}">${'●'.repeat(n)}${'○'.repeat(4-n)}</span><span class="td-lv-why">${iso(esc(z.labels.slice(0,4).join(' · ')))}</span><span class="td-lv-d"><span class="num">${kind==='r'?'+':'−'}${num(d,ddp)}</span>${u} · <span class="num">${pct.toFixed(2)}%</span></span></li>`; };
  const r1=res[0], r2=res[1], s1=sup[0], s2=sup[1];
  let sum=`السعر <b class="num">${num(price,inst.pdp)}</b> ${s1&&r1?`بين دعم <b class="num">${zp(s1)}</b> ومقاومة <b class="num">${zp(r1)}</b>.`:''}`;
  if(inside) sum+=` السعر الآن داخل منطقة <b class="num">${zp(inside)}</b> (${iso(esc(inside.labels.slice(0,2).join('، ')))}).`;
  if(r1) sum+=` الإغلاق فوق <b class="num">${num(r1.hi,0)}</b> يفتح الطريق إلى <b class="num">${r2?zp(r2):'—'}</b>`;
  if(s1) sum+=`${r1?'، و':' '}الكسر تحت <b class="num">${num(s1.lo,0)}</b> يفتح <b class="num">${s2?zp(s2):'—'}</b>.`;
  const A=advice(inst,V);
  return `<div class="td-lv-head"><div><h2>${inst.title}</h2><p class="hint" style="margin:0">دعوم ومقاومات تتحدث يومياً · ${inst.live}</p></div>
   <div class="td-lv-now"><b class="num">${num(price,inst.pdp)}</b><span><span class="num ${chg>=0?'td-up':'td-dn'}">${chg>=0?'+':'−'}${num(Math.abs(chg),inst.pdp)} (${(chg/pdc*100).toFixed(2)}%)</span> عن إغلاق ${arDay(V.last.date)}</span><span class="hint" style="margin:0">${esc(V.src)} · <span class="num">${when(V.at)}</span></span></div></div>
  <div class="td-ai ${A.tone}"><div class="td-ai-top"><span class="td-ai-k">توصية الذكاء الاصطناعي</span><b class="td-ai-v">${A.verdict}</b><span class="td-ai-c">الثقة: ${A.conf}</span></div>
   <p class="td-ai-why">${A.why}</p><ul>${A.lines.map(l=>`<li>${l}</li>`).join('')}</ul></div>
  <p class="td-lv-sum">${sum}</p>
  <ol class="td-lv-ladder">${res.slice().reverse().map((z,i,a)=>row(z,'r',a.length-1-i)).join('')}
   <li class="td-lv-row now"><span class="td-lv-tag">السعر</span><b class="num td-lv-p">${num(price,inst.pdp)}</b><span></span><span class="td-lv-why">${inside?'داخل منطقة '+iso(esc(zp(inside))):''}</span><span></span></li>
   ${sup.map((z,i)=>row(z,'s',i)).join('')}</ol>
  <p class="hint" style="margin:10px 0 0">متوسط المدى اليومي (ATR 14): <b class="num">${num(atr,0)}</b>${u} · المدى المعتاد اليوم: <b class="num">${num(pdc-atr,0)}–${num(pdc+atr,0)}</b> · المصدر: ${esc(gb.src)}${gb.basis?` · فرق الأساس <span class="num">${gb.basis>0?'+':'−'}${num(Math.abs(gb.basis),1)}</span> (${esc(gb.basisNote||'')})`:''}${gb.fresh?'':' · <span style="color:var(--pend)">البيانات اليومية ليست من أمس</span>'}.${inst.id==='us30'&&!gb.basis?' <span style="color:var(--pend)">قبل قياس فرق الكاش (يُقاس تلقائياً بعد افتتاح نيويورك 16:30) تُعرض المستويات بأسعار العقود YM، وقد يختلف سعر US30 CFD عند وسيطك بعشرات النقاط.</span>':''}</p>`;
 }
 function paintLevels(){ INSTR.forEach(inst=>{ const el=document.getElementById('td-lv-'+inst.id); if(el) el.innerHTML=levelsHtml(inst); }); }
 function factsHtml(){
  const g=goldNow(), r=research();
  const live=['DXY','US10Y','VIX','BRENT','ESFUT','NQFUT','SPX','NAS100'].map(quote).filter(Boolean).slice(0,6);
  return (g?`<div class="td-fact"><div class="k">الذهب الآن</div><div class="v">${num(g.price,2)}</div><div class="d">${esc(g.src)} · <span class="num">${when(g.at)}</span></div></div>`:'')+
   live.map(q=>{const p=pctOf(q);return `<div class="td-fact"><div class="k">${esc(q.symbol)}</div><div class="v">${num(q.price,q.symbol==='US10Y'?3:2)}</div><div class="d"><span class="num ${p>0?'td-up':p<0?'td-dn':''}">${p!==null?sgn(p):'—'}</span> · <span class="num">${when(q.asOf)}</span></div></div>`;}).join('')+
   (r?(r.facts||[]).map(f=>`<div class="td-fact"><div class="k">${esc(f.k)}</div><div class="v">${esc(f.v)}</div><div class="d">${esc(f.d)}</div></div>`).join(''):'');
 }
 VIEWS.checklist=()=>{
  D._mounted=false;
  if(!D.loaded&&!D.loading) setTimeout(load,0);
  if(st.d!==today()) st=loadState();
  const r=research(), anyR=D.research;
  const rStamp=r?`بحث اليوم · ${new Date(r.checkedAt).toLocaleString('ar',{timeZone:TZ,hour:'2-digit',minute:'2-digit',day:'numeric',month:'long'})}`:anyR?`<span style="color:var(--pend)">بحث قديم (${esc(anyR.date)}) — لم يُطبّق. حدّث data/desk/session-research.json</span>`:'لا يوجد ملف بحث';
  const ng=st.ng!==null?st.ng:(r&&r.levels?r.levels.gold:''), ni=st.ni!==null?st.ni:(r&&r.levels?r.levels.indices:'');
  setTimeout(mount,0);
  return `<div class="head"><div><p class="fx-kicker">FOXREX · TRADING DESK</p><h1>تشيك ليست بداية الجلسة</h1><p>الذهب والمؤشرات الأمريكية · ${new Date().toLocaleDateString('ar',{weekday:'long',day:'numeric',month:'long',timeZone:TZ})}</p></div>
   <div class="row"><button class="btn" data-act="td-refresh">${D.loading?'جارٍ التحديث…':'تحديث البيانات'}</button><button class="btn" data-act="td-reset">إلغاء تعديلاتي</button></div></div>
  <div id="td-levels" class="td-lv-wrap">${INSTR.map(inst=>`<section class="panel td-lv" id="td-lv-${inst.id}" aria-live="polite">${levelsHtml(inst)}</section>`).join('')}</div>
  <p class="hint td-disclaimer">التوصيات آلية وتعليمية، مبنية على الاتجاه اليومي وعوامل التشيك ليست والمستويات. ليست نصيحة استثمارية، وأكّد الدخول من حركة السعر.</p>
  <div class="td-clock" id="td-clock">${clockHtml()}</div>
  <div class="td-gauges grid2">${gauge('gold','الذهب XAU/USD')}${gauge('idx','المؤشرات الأمريكية')}</div>
  <div class="warnbox" id="td-alert" hidden style="margin:0 0 16px"></div>
  ${D.error?`<div class="warnbox" style="margin:0 0 16px">${esc(D.error)}</div>`:''}
  <section class="panel" style="margin-bottom:16px"><div class="head" style="margin-bottom:10px"><h2 style="margin:0">ملخص السوق</h2><span class="hint" style="margin:0">${rStamp}</span></div>
   <div class="td-facts" id="td-facts">${factsHtml()}</div>
   ${r&&r.brief?`<ul class="td-brief">${r.brief.map(b=>`<li>${esc(b)}</li>`).join('')}</ul>`:''}
   ${r&&r.sources?`<p class="hint" style="margin:10px 0 0">المصادر: ${r.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(' · ')}</p>`:''}</section>
  ${(()=>{const res=resolve();return GROUPS.map(gr=>`<section class="panel" style="margin-bottom:16px"><h2>${gr.title}</h2><div class="td-rows">${gr.items.map(it=>factorRow(it,gr,res)).join('')}</div></section>`).join('');})()}
  <div class="grid2" style="margin-bottom:16px">
   <section class="panel"><h2>الذهب لحظياً</h2><div class="td-tv" id="td-tv-gold"></div></section>
   <section class="panel"><h2>ناسداك 100 لحظياً</h2><div class="td-tv" id="td-tv-nas"></div></section></div>
  <section class="panel" style="margin-bottom:16px"><h2>التقويم الاقتصادي الحي</h2><div class="td-tv" id="td-tv-cal"></div><p class="td-tv-note">الرسوم والتقويم من TradingView وتحتاج اتصال إنترنت. الأرقام في الأعلى من مصادر FOXREX الموثقة.</p></section>
  <div class="grid2" style="margin-bottom:16px">
   <section class="panel td-notes"><h2>مستويات الذهب</h2><textarea id="td-ng" aria-label="مستويات الذهب">${esc(ng)}</textarea></section>
   <section class="panel td-notes"><h2>مستويات المؤشرات</h2><textarea id="td-ni" aria-label="مستويات المؤشرات">${esc(ni)}</textarea></section></div>
  <div class="grid2"><section class="panel"><h2>قبل أول صفقة</h2><div>${RISK.map((x,i)=>`<label class="td-check" for="td-rk${i}"><input type="checkbox" id="td-rk${i}" data-td-risk="${i}"${st.r[i]?' checked':''}><span>${x}</span></label>`).join('')}</div></section>
   <section class="panel td-plan"><h2>المسار المقترح</h2><div id="td-plan"></div></section></div>`;
 };
 function paint(){
  paintLevels();
  const res=resolve();
  ALL.forEach(it=>{ const r=res[it.id];
   document.querySelectorAll(`[data-act="td-set"][data-id="${it.id}"]`).forEach(b=>b.setAttribute('aria-pressed',String(r.k===+b.dataset.k)));
   const row=document.querySelector(`[data-why="${it.id}"]`); if(row){ const tag=row.parentElement.querySelector('[data-src]'); if(tag){ tag.className='td-src '+r.src; tag.textContent=SRC[r.src]; } row.hidden=!r.why; row.textContent=iso(r.why); } });
  const out={};
  [['gold',0,'الذهب'],['idx',1,'المؤشرات']].forEach(([id,ix,name])=>{ const el=document.getElementById('td-'+id); if(!el) return; const s=score(res,ix), [l,c]=bias(s.v);
   el.querySelector('[data-label]').textContent=s.n?l:'—'; el.querySelector('[data-label]').style.color=s.n?c:'var(--muted)';
   el.querySelector('[data-score]').textContent=(s.v>0?'+':'')+Math.round(s.v*100)+'%';
   el.querySelector('[data-pin]').style.right=`calc(${(1-(s.v+1)/2)*100}% - 2px)`;
   el.querySelector('[data-meta]').textContent=`عوامل محددة ${s.n} من ${s.tot}`; out[id]={...s,l,name}; });
  const t=today(), tm=dayOf(Date.now()+864e5), ev=(D.cal&&D.cal.events)||[];
  const todayEv=ev.filter(e=>dayOf(e.at)===t&&e.impact==='HIGH').map(e=>`${hm(e.at)} ${e.title.ar}`), tmrEv=ev.filter(e=>dayOf(e.at)===tm&&e.impact==='HIGH').map(e=>`${hm(e.at)} ${e.title.ar}`);
  const flags=ALL.filter(it=>it.flag&&res[it.id].k===0).map(it=>it.flag);
  const A=document.getElementById('td-alert');
  if(A){ A.hidden=!(todayEv.length||tmrEv.length||flags.length);
   A.innerHTML=(todayEv.length?`<b>اليوم:</b> ${esc(todayEv.join(' · '))}. لا دخول قبل الخبر بـ15 دقيقة.<br>`:'')+(tmrEv.length?`<b>غداً:</b> ${esc(tmrEv.join(' · '))}. خفّف المراكز المفتوحة للمبيت.<br>`:'')+(flags.length?`<b>علامات:</b> ${flags.join(' · ')}. قلّل حجم العقد.`:''); }
  const P=document.getElementById('td-plan'); if(P&&out.gold){ const line=o=>{ if(!o.n) return `<p><b>${o.name}:</b> حدد العوامل أولاً.</p>`; const act=o.v>=.15?'الأفضلية للشراء عند الارتداد لمستويات الدعم':o.v<=-.15?'الأفضلية للبيع عند الارتداد لمستويات المقاومة':'لا اتجاه واضح؛ تداول النطاق بأحجام صغيرة أو انتظر الكسر'; return `<p><b>${o.name}: ${o.l}.</b> ${act}.${o.n<o.tot/2?' <span class="hint">(قراءة ضعيفة: أكثر من نصف العوامل غير محدد)</span>':''}</p>`; };
   const g=out.gold,i=out.idx; let ctx='';
   if(g.n&&i.n&&g.v>=.15&&i.v>=.15) ctx='<p class="hint">صعود الذهب والمؤشرات معاً غالباً سببه تسعير التيسير. راقب الدولار والعوائد كأول إشارة انعكاس.</p>';
   if(g.n&&i.n&&g.v>=.15&&i.v<=-.15) ctx='<p class="hint">نمط هروب من المخاطرة: الذهب ملاذ والأسهم تحت ضغط.</p>';
   if(g.n&&i.n&&g.v<=-.15&&i.v>=.15) ctx='<p class="hint">إقبال على المخاطرة مع دولار قوي: السيولة تخرج من الذهب إلى الأسهم.</p>';
   const done=RISK.filter((_,k)=>st.r[k]).length;
   P.innerHTML=line(g)+line(i)+ctx+`<p style="color:${done===RISK.length?'var(--teal)':'var(--pend)'}">إدارة المخاطر: ${done} من ${RISK.length}${done===RISK.length?' — جاهز للتنفيذ.':' — أكمل البنود قبل الدخول.'}</p>`; }
 }
 let clockTimer=null, goldTimer=null;
 function mount(){
  if(S.view!=='checklist'||!document.getElementById('td-gold')) return;
  D._mounted=true;
  paint();
  clearInterval(clockTimer); clockTimer=setInterval(()=>{ const c=document.getElementById('td-clock'); if(!c||S.view!=='checklist'){ clearInterval(clockTimer); return; } c.innerHTML=clockHtml(); },30000);
  clearInterval(goldTimer); goldTimer=setInterval(()=>{ if(S.view!=='checklist'||!document.getElementById('td-levels')){ clearInterval(goldTimer); return; } if(document.visibilityState!=='visible') return;
   getJSON('https://api.gold-api.com/price/XAU').then(g=>{ if(g.symbol==='XAU'&&g.currency==='USD'){ D.gold=g; paintLevels(); } }).catch(()=>{}); },20000);
  const ng=document.getElementById('td-ng'), ni=document.getElementById('td-ni');
  if(ng) ng.oninput=()=>{ st.ng=ng.value; saveState(); }; if(ni) ni.oninput=()=>{ st.ni=ni.value; saveState(); };
  document.querySelectorAll('[data-td-risk]').forEach(c=>c.onchange=()=>{ st.r[c.dataset.tdRisk]=c.checked; saveState(); paint(); });
  tv('td-tv-gold','technical-analysis',{interval:'15m',width:'100%',height:380,symbol:'OANDA:XAUUSD',showIntervalTabs:true,displayMode:'single'});
  tv('td-tv-nas','technical-analysis',{interval:'15m',width:'100%',height:380,symbol:'FOREXCOM:NSXUSD',showIntervalTabs:true,displayMode:'single'});
  tv('td-tv-cal','events',{width:'100%',height:460,importanceFilter:'0,1',countryFilter:'us'});
 }
 function tv(id,file,cfg){
  const host=document.getElementById(id); if(!host||host.dataset.mounted) return; host.dataset.mounted='1';
  const c=document.createElement('div'); c.className='tradingview-widget-container';
  const w=document.createElement('div'); w.className='tradingview-widget-container__widget'; c.appendChild(w);
  const s=document.createElement('script'); s.src=`https://s3.tradingview.com/external-embedding/embed-widget-${file}.js`; s.async=true;
  s.textContent=JSON.stringify(Object.assign({colorTheme:'dark',isTransparent:true,locale:'ar_AE'},cfg)); c.appendChild(s); host.appendChild(c);
 }

 /* ---------- view: market data health ---------- */
 VIEWS.marketdata=()=>{
  if(!D.loaded&&!D.loading) setTimeout(load,0);
  const q=(D.quotes&&D.quotes.quotes)||[], errs=(D.quotes&&D.quotes.errors)||[];
  const age=iso=>{ const m=ageMin(iso); return !isFinite(m)?'—':m<60?`${Math.round(m)} د`:m<48*60?`${(m/60).toFixed(1)} س`:`${Math.round(m/1440)} يوم`; };
  const cls=m=>m<=30?'ok':m<=24*60?'old':'bad';
  const upd=D.quotes&&D.quotes.updatedAt, updAge=ageMin(upd);
  const row=(name,iso,note)=>`<tr><td>${name}</td><td><span class="num">${iso?new Date(iso).toLocaleString('en-GB',{timeZone:TZ,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—'}</span></td><td class="${cls(ageMin(iso))}">${age(iso)}</td><td class="hint" style="margin:0">${note}</td></tr>`;
  return `<div class="head"><div><p class="fx-kicker">FOXREX · DATA</p><h1>صحة بيانات الأسواق</h1><p>من أين تأتي الأسعار في الموقع ولوحة التداول، ومتى تحدّثت آخر مرة.</p></div><div class="row"><button class="btn" data-act="td-refresh">${D.loading?'جارٍ التحديث…':'تحديث'}</button><a class="btn" href="https://github.com/Zakoosh/FOXREX/actions/workflows/market-data.yml" target="_blank" rel="noopener">سجل التحديث التلقائي</a></div></div>
  ${updAge>60?`<div class="warnbox" style="margin:0 0 16px">آخر تحديث للقطات الأسعار قبل ${age(upd)}. التحديث التلقائي يعمل كل 15 دقيقة أيام الأسبوع؛ إن توقف افتح سجل التحديث التلقائي وشغّله يدوياً (Run workflow).</div>`:''}
  <section class="panel" style="margin-bottom:16px"><h2>مصادر البيانات</h2><div class="scroll"><table class="t"><thead><tr><th>الملف</th><th>آخر تحديث (إسطنبول)</th><th>العمر</th><th>ملاحظة</th></tr></thead><tbody>
   ${row('data/quotes.json',upd,'لقطات Gold API و Yahoo Finance · تحديث كل 15 دقيقة عبر GitHub Actions')}
   ${row('Gold API مباشر (XAU)',D.gold&&D.gold.updatedAt,'يُقرأ مباشرة من المتصفح كل 20 ثانية في صفحة الأسواق')}
   ${row('data/calendar.json',D.cal&&D.cal.updatedAt,'التقويم الموثق · المهمة التحريرية اليومية')}
   ${row('data/market/ai-technical.json',D.tech&&D.tech.lastCheckedAt,'شموع الذهب اليومية للاتجاه وأعلى/أدنى أمس')}
   ${row('data/desk/session-research.json',D.research&&D.research.checkedAt,'بحث الجلسة اليومي (عوامل التقدير)')}
  </tbody></table></div></section>
  <section class="panel"><h2>الأسعار المسجلة</h2>${errs.length?`<div class="warnbox" style="margin:0 0 10px">مصادر فشلت في آخر تحديث: ${errs.map(e=>esc(e.symbol)+' ('+esc(e.message)+')').join(' · ')}. تبقى آخر قيمة موثقة دون تغيير وقتها.</div>`:''}
   <div class="scroll"><table class="t"><thead><tr><th>الرمز</th><th>السعر</th><th>التغير</th><th>وقت الملاحظة</th><th>العمر</th><th>المصدر</th></tr></thead><tbody>
   ${q.length?q.map(x=>{const p=pctOf(x);return `<tr><td><span class="num">${esc(x.symbol)}</span></td><td><span class="num">${num(x.price,x.price<10?4:2)}</span></td><td><span class="num ${p>0?'td-up':p<0?'td-dn':''}">${p!==null?sgn(p):'—'}</span></td><td><span class="num">${new Date(x.asOf).toLocaleString('en-GB',{timeZone:TZ,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span></td><td class="${cls(ageMin(x.asOf))}">${age(x.asOf)}</td><td><a href="${esc(x.sourceUrl)}" target="_blank" rel="noopener">${esc(x.source)}</a></td></tr>`;}).join(''):`<tr><td colspan="6">${D.loading?'جارٍ التحميل…':'لا توجد بيانات'}</td></tr>`}
   </tbody></table></div><p class="hint" style="margin:10px 0 0">أوقات Yahoo هي وقت آخر ملاحظة في السوق (قد تكون قديمة خارج ساعات التداول)، وأوقات Gold API وقت جلب المزوّد. لا تُعرض أي أسعار تقديرية.</p></section>`;
 };


 /* ---------- view: TradingView indicator (copy the Pine script + today's analyst levels) ---------- */
 const TV={code:null,loading:false,error:''};
 function loadTv(){ if(TV.loading) return; TV.loading=true; fetch('../tools/tradingview/foxrex-levels-scalper.pine?v='+Math.floor(Date.now()/60000),{cache:'no-store'}).then(r=>{ if(!r.ok) throw Error('HTTP '+r.status); return r.text(); }).then(t=>{ TV.code=t; }).catch(e=>{ TV.error='تعذّر تحميل ملف المؤشر ('+e.message+')'; }).finally(()=>{ TV.loading=false; if(S.view==='tvscript') render(); }); }
 const lvStr=a=>(a||[]).map(x=>+x.p).filter(x=>isFinite(x)).join(', ');
 VIEWS.tvscript=()=>{
  if(!TV.code&&!TV.loading&&!TV.error) setTimeout(loadTv,0);
  if(!D.loaded&&!D.loading) setTimeout(load,0);
  const r=research(), g=lvStr(r&&r.levels&&r.levels.goldLevels), u=lvStr(r&&r.levels&&r.levels.us30Levels);
  const lines=TV.code?TV.code.split('\n').length:0;
  return `<div class="head"><div><p class="fx-kicker">FOXREX · TRADINGVIEW</p><h1>مؤشر FOXREX على TradingView</h1><p>نفس مستويات الدعم والمقاومة اليومية، مع تقاطع EMA قابل للتعديل وإشارات سكالبينج، ووحدتي LuxAlgo وسكالب SMA.</p></div>
   <div class="row"><button class="btn pri" data-act="tv-copy"${TV.code?'':' disabled'}>نسخ كود المؤشر</button><a class="btn" href="../tools/tradingview/foxrex-levels-scalper.pine" download>تنزيل الملف</a></div></div>
  ${TV.error?`<div class="warnbox" style="margin:0 0 16px">${esc(TV.error)}</div>`:''}
  <div class="grid2" style="margin-bottom:16px">
   <section class="panel"><h2>طريقة الإضافة</h2><ol style="margin:0;padding-inline-start:20px;display:grid;gap:6px;font-size:14px">
    <li>اضغط «نسخ كود المؤشر».</li><li>في TradingView افتح الشارت، ثم <b>Pine Editor</b> أسفل الشاشة.</li>
    <li>امسح الكود الموجود والصق الكود، ثم <b>Save</b> باسم FOXREX.</li><li>اضغط <b>Add to chart</b>.</li>
    <li>من إعدادات المؤشر (⚙) تظهر وتخفي كل وحدة، وتعدّل أطوال EMA والفلاتر.</li>
    <li>للتنبيهات: Alert ← Condition: FOXREX ← اختر «Any alert() function call» لتصلك الإشارة مع الوقف والأهداف.</li></ol></section>
   <section class="panel"><h2>مستويات المحللين اليوم</h2><p class="hint">الصقها في إعداد «مستويات المحللين» داخل المؤشر. تتحدث كل صباح مع ملف البحث${r?'':' (لا يوجد بحث لليوم بعد)'}.</p>
    <dl class="kv"><dt>الذهب XAU/USD</dt><dd><span class="num ltr">${esc(g||'—')}</span> ${g?`<button class="btn" data-act="tv-copy-lv" data-v="${esc(g)}">نسخ</button>`:''}</dd>
    <dt>US30</dt><dd><span class="num ltr">${esc(u||'—')}</span> ${u?`<button class="btn" data-act="tv-copy-lv" data-v="${esc(u)}">نسخ</button>`:''}</dd></dl></section></div>
  <section class="panel"><h2>الكود <span class="hint num" style="margin:0">${lines?lines+' سطر · Pine Script v6':''}</span></h2><pre class="scroll" dir="ltr" style="margin:0;max-height:420px;overflow:auto;background:var(--ink);border:1px solid var(--faint);border-radius:var(--r1);padding:12px;font-size:12px;line-height:1.5;text-align:left"><code>${TV.code?esc(TV.code):(TV.loading?'جارٍ التحميل…':'')}</code></pre>
   <p class="hint" style="margin:10px 0 0">يتضمن كوداً مقتبساً من LuxAlgo (CC BY-NC-SA 4.0) وnicks1008 (MPL 2.0): للاستخدام غير التجاري مع إبقاء الإسناد. أداة تعليمية وليست نصيحة استثمارية.</p></section>`;
 };
 ACT['tv-copy']=()=>{ if(TV.code) copy(TV.code,'تم نسخ كود المؤشر'); };
 ACT['tv-copy-lv']=a=>copy(a.dataset.v,'تم نسخ المستويات');
 /* ---------- actions & navigation ---------- */
 ACT['td-set']=a=>{ const id=a.dataset.id,k=+a.dataset.k; if(st.f[id]===k) delete st.f[id]; else if(st.f[id]===undefined&&resolve()[id].k===k) return; else st.f[id]=k; saveState(); paint(); };
 ACT['td-reset']=()=>{ st={d:today(),f:{},r:{},ng:null,ni:null}; saveState(); render(); toast('عادت القراءات التلقائية وقراءات البحث'); };
 ACT['td-refresh']=()=>{ load().then(()=>toast('تم تحديث البيانات')); };
 NAV.splice(1,0,['trading','التداول','Trading',['checklist','tvscript','marketdata']]);
 VIEW_LABEL.checklist='تشيك ليست الجلسة'; VIEW_LABEL.tvscript='مؤشر TradingView'; VIEW_LABEL.marketdata='صحة بيانات الأسواق';
 setInterval(()=>{ if(['checklist','marketdata'].includes(S.view)&&document.visibilityState==='visible') load(); },2*60000);
}
