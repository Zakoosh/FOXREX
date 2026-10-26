export function newsTime(e){return (e.tags||[]).find(t=>t.startsWith('source-date-'))?.slice(12)||e.sources?.find(s=>s.publishedAt)?.publishedAt||e.publishedAt;}
export function newsPhase(e,now=Date.now()){return e.eventTime&&Date.parse(e.eventTime)>now?'upcoming':'published';}
export function orderedNews(items,now=Date.now()){return [...items].sort((a,b)=>(newsPhase(a,now)==='upcoming')-(newsPhase(b,now)==='upcoming')||newsTime(b).localeCompare(newsTime(a)));}
export function signalSummary(e,charts=[]){
 const c=charts.find(c=>c.event===e.slug),levels=e.keyLevels||[];
 const values=levels.map(s=>Number(s.split(':').at(-1))).filter(Number.isFinite);
 const target=e.targets?.[0]??(values.length===2?(e.bias==='bearish'?Math.min(...values):Math.max(...values)):null);
 const entry=e.entry??null,sl=e.stopLoss??null;
 let result='unverifiable';let observedThrough=null;
 if(c&&target!=null){
  const start=Date.parse(e.freshness?.dataAsOf),end=Date.parse(e.freshness?.validUntil),step=e.timeframe==='M30'?1800000:3600000;
  const bars=c.bars.filter(b=>Date.parse(b.at)>=start&&Date.parse(b.at)+step<=end);
  observedThrough=bars.at(-1)?.at||null;
  const hit=bars.some(b=>e.bias==='bearish'?b.low<=target:b.high>=target);
  // A missing interval prevents a negative conclusion; OHLC cannot resolve TP/SL ordering.
  const complete=Number.isFinite(end)&&bars.length===Math.ceil((end-start)/step)&&bars.every((b,i)=>Date.parse(b.at)===start+i*step);
  if(hit)result='objective-touched';else if(complete)result='objective-not-touched';
 }
 return {entry,sl,target,lower:values.length===2?Math.min(...values):null,result,observedThrough,tradeResult:entry==null||sl==null?'missing-trade-rules':'not-tested'};
}
export function signalPanel(e,lang,charts=[]){
 const q=signalSummary(e,charts),copy={ar:['ملخص الإشارة','غير محدد','هدف المصدر','حد النطاق','تعذّر التحقق من النتيجة','لامس هدف المصدر — ليس إثبات ربح صفقة','لم يلمس الهدف ضمن كامل النافذة','لا يمكن حساب نتيجة صفقة دون دخول ووقف خسارة'],en:['Signal summary','Not supplied','Source objective','Range boundary','Result not verifiable','Source objective touched — not a trade profit','Objective not touched in the complete window','Trade result requires entry and stop-loss rules'],tr:['Sinyal özeti','Belirtilmedi','Kaynak hedefi','Aralık sınırı','Sonuç doğrulanamadı','Kaynak hedefine temas — işlem kârı değildir','Tam süre içinde hedefe temas yok','İşlem sonucu için giriş ve zarar durdurma gerekir']}[lang]||[];
 const value=v=>v==null?copy[1]:String(v);
 const label=q.result==='objective-touched'?copy[5]:q.result==='objective-not-touched'?copy[6]:copy[4];
 return `<aside class="signal-summary" aria-label="${copy[0]}"><strong>${copy[0]}</strong><p><b>Entry:</b> ${value(q.entry)} · <b>TP (${copy[2]}):</b> ${value(q.target)} · <b>SL:</b> ${value(q.sl)}</p><p>${copy[3]}: ${value(q.lower)} · ${e.timeframe||''}</p><p><strong>${label}</strong></p>${q.tradeResult==='missing-trade-rules'?`<small>${copy[7]}</small>`:''}</aside>`;
}
