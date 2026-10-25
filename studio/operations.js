/* Public read-only overview plus authenticated server-only Telegram settings. */
function installOperations(){
 const state={feed:null,quotes:null,calendar:null,operations:null,error:'',integration:null,message:'',loading:false,attempted:false};
 const safe=esc,stamp=s=>s?new Date(s).toLocaleString('ar',{timeZone:'Europe/Istanbul'}):'—';
 async function api(method,route,data){
  const raw=DB.settings.workerUrl;if(!raw||!DB.settings.workerToken)throw Error('اربط عامل Studio المحمي من الإعدادات أولًا.');
  const u=new URL(raw);if(u.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw Error('استخدم HTTPS لاتصال الخادم.');
  const r=await fetch(raw.replace(/\/$/,'')+'/api/integrations/telegram'+route,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+DB.settings.workerToken},body:data?JSON.stringify(data):undefined});
  const j=await r.json();if(!r.ok)throw Error(j.error||'فشل الاتصال');return j;
 }
 async function load(){state.attempted=true;state.loading=true;state.error='';try{
  const result=await Promise.all(['content','quotes','calendar','operations'].map(async key=>{const r=await fetch('../data/'+key+'.json',{cache:'no-store'});if(!r.ok)throw Error('تعذّر تحميل '+key);return [key,await r.json()];}));
  for(const [key,v]of result)state[key==='content'?'feed':key]=v;
 }catch(e){state.error=e.message;}finally{state.loading=false;if(S.view==='home')render();}}
 const previousHome=VIEWS.home;VIEWS.production=previousHome;
 NAV.find(x=>x[0]==='create')[3].push('production');VIEW_LABEL.production='الإنتاج الإبداعي';
 function pending(){return `<section class="panel"><h2>مهام الربط المعلّقة</h2><div class="warnbox"><b>Instagram + Facebook · بانتظار الربط</b><p>اربط حساب إنستغرام احترافي وصفحة فيسبوك عبر مزوّد النشر. لم يُفعّل النشر عليهما. تذكير يومي طالما الربط معلّق.</p></div><p class="hint">تلجرام منفصل: يلزم بوت ووجهة محددة والتحقق منهما عبر الخادم.</p></section>`;}
 VIEWS.home=()=>{
  if(!state.attempted&&!state.loading)setTimeout(load,0);
  const items=state.feed?.items||[],ar=items.filter(x=>x.language==='ar'),q=state.quotes?.quotes||[];
  const counts=[['مقالات منشورة',new Set(items.map(x=>x.translationGroupId)).size],['نسخ اللغات',items.length],['تحليلات تقنية',ar.filter(x=>x.category==='technical').length],['أخبار',ar.filter(x=>x.type==='NEWS').length]];
  return `<div class="head"><div><p class="fx-kicker">FOXREX · CONTROL CENTER</p><h1>إدارة الموقع والمحتوى</h1><p>مؤشرات من الموقع المنشور؛ بيانات الإنتاج والمراجعة متاحة في أقسامها.</p></div><div class="row"><button class="btn" data-act="ops-refresh">تحديث</button><a class="btn" href="../" target="_blank" rel="noopener">زيارة الموقع ↗</a></div></div>${state.error?`<p class="errbox">${safe(state.error)}</p>`:''}
  <div class="grid2" style="margin-bottom:16px">${counts.map(([t,n])=>`<section class="panel"><p class="hint">${t}</p><strong class="num" style="font-size:34px">${state.feed?n:'—'}</strong></section>`).join('')}</div>
  <div class="grid2" style="margin-bottom:16px"><section class="panel"><h2>Autochartist · البريد والتحليلات</h2><p>${safe(state.operations?.autochartist?.message||'جارٍ تحميل آخر حالة موثقة…')}</p><p class="hint">آخر فحص: ${stamp(state.operations?.checkedAt)}</p><span class="pill">الفحص كل ساعة · بدون تكرار</span><p class="hint">أي تقرير بلا دخول أو وقف خسارة يبقى تحليلًا، وليس إشارة مكتملة.</p></section>${pending()}</div>
  <div class="grid2" style="margin-bottom:16px"><section class="panel"><h2>الأسعار ومواعيد المصدر</h2><p class="hint">وقت إسطنبول · الأسعار استرشادية</p>${q.map(x=>`<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--faint)"><b class="num">${safe(x.symbol)}</b><span class="num">${safe(x.price)}</span><small>${stamp(x.asOf)} · ${Date.now()-Date.parse(x.asOf)>(x.source==='Gold API'?900000:7200000)?'قديم':'ضمن حد الحداثة'}</small></div>`).join('')||'<p class="hint">لا توجد بيانات محملة.</p>'}</section><section class="panel"><h2>أقرب الأخبار الاقتصادية</h2>${(state.calendar?.events||[]).filter(e=>Date.parse(e.at)>Date.now()).slice(0,5).map(e=>`<p><b>${safe(e.title.ar)}</b><br><small>${stamp(e.at)} · ${safe(e.currency)}</small></p>`).join('')||'<p class="hint">لا أحداث محملة.</p>'}<a href="../ar/calendar/">فتح التقويم ↗</a></section></div>
  <section class="panel"><div class="head"><h2>أحدث المحتوى المنشور</h2><button class="btn" data-act="go" data-v="cms">المحرر والمراجعة</button></div><div class="grid3">${ar.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,9).map(x=>`<a class="card" href="../ar/${safe(x.urlPath)}" target="_blank" rel="noopener">${x.image?`<img src="../${safe(x.image.src)}" alt="${safe(x.image.alt)}" style="width:100%;aspect-ratio:16/9;object-fit:cover">`:''}<div class="b"><b>${safe(x.title)}</b><small>${stamp(x.updatedAt)}</small></div></a>`).join('')}</div></section>`;
 };
 const settings=VIEWS.settings;
 VIEWS.settings=()=>`<div class="head"><div><h1>قنوات النشر والمفاتيح</h1><p>المفاتيح الحساسة تُرسل إلى العامل المحمي وتُحفظ مشفّرة فيه.</p></div></div><div class="grid2" style="margin-bottom:20px"><section class="panel"><h2>Telegram Bot</h2><p class="hint">لا يُحفظ مفتاح البوت في المتصفح أو GitHub. يلزم تشغيل عامل Studio أولًا، وتغيير رمز العامل بعد الحفظ يستلزم إعادة إدخال مفتاح تلجرام.</p><label class="f" for="tg-token">Bot token · اتركه فارغًا للاحتفاظ بالمحفوظ</label><input id="tg-token" type="password" autocomplete="new-password" class="ltr" placeholder="أدخل المفتاح هنا فقط"><label class="f" for="tg-chat">القناة أو Chat ID</label><input id="tg-chat" type="text" class="ltr" placeholder="@your_channel أو -100…" value="${safe(state.integration?.chatId||'')}"><div class="row" style="margin-top:12px"><button class="btn pri" data-act="tg-save">حفظ آمن</button><button class="btn" data-act="tg-verify">فحص البوت والوجهة</button><button class="btn" data-act="tg-status">عرض الحالة</button></div><p class="hint" role="status">${safe(state.message||'غير متصل حتى يتم الحفظ والفحص.')}</p>${state.integration?.destination?`<p>الوجهة المؤكدة: ${safe(state.integration.destination.title)} · ${safe(state.integration.destination.id)}</p>`:''}</section>${pending()}</div><details><summary class="btn">إعدادات العامل والمحتوى والإنتاج</summary>${settings()}</details>`;
 ACT['ops-refresh']=load;
 async function telegram(fn){try{state.integration=await fn();state.message=state.integration.verified?'تم التحقق من البوت والوجهة. لم تُرسل رسالة اختبار.':state.integration.configured?'المفتاح محفوظ بالخادم؛ افحص الوجهة قبل الإرسال.':'لم يتم الإعداد بعد.';}catch(e){state.message=e.message;}render();}
 ACT['tg-save']=()=>{const token=document.getElementById('tg-token'),data={botToken:token.value,chatId:document.getElementById('tg-chat').value.trim()};token.value='';return telegram(()=>api('PUT','',data));};
 ACT['tg-verify']=()=>telegram(()=>api('POST','/verify',{}));ACT['tg-status']=()=>telegram(()=>api('GET',''));
 load();
}
