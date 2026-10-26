/* Public market pulse. Actual source values only. No fabricated price ticks or event results.
   Gold API is CORS-enabled and keyless; quotes update on a 30s cadence, only while visible.
   FX uses the verified repository snapshot, maintained by the hourly publishing task. */
(function(){'use strict';
 function validQuote(q,now){return !!q&&/^[A-Z0-9]{3,10}$/.test(q.symbol)&&typeof q.price==='number'&&isFinite(q.price)&&q.price>0&&Number.isFinite(Date.parse(q.asOf))&&Date.parse(q.asOf)<=now+60000;}
 function previousTradingDate(iso){var day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date(iso)),d=new Date(day+'T12:00:00Z');do{d.setUTCDate(d.getUTCDate()-1);}while(d.getUTCDay()===0||d.getUTCDay()===6);return d.toISOString().slice(0,10);}
 function dailyPercent(q,previous){if(Number.isFinite(q.dailyChangePct))return q;var base=previous&&previous.previousClose;if(Number.isFinite(base)&&base>0&&previous.previousCloseDate===previousTradingDate(q.asOf))return Object.assign({},q,{previousClose:base,previousCloseDate:previous.previousCloseDate,dailyChangePct:(q.price/base-1)*100,changeBasis:previous.changeBasis,changeSourceUrl:previous.changeSourceUrl});return q;}
 function mergeQuote(q,current,baseline){if(Number.isFinite(q.previousClose)&&q.previousClose>0)baseline=q;if(current&&Date.parse(q.asOf)<Date.parse(current.asOf))q=current;return {quote:dailyPercent(q,baseline||current),baseline:baseline};}
 function staleQuote(q,now){return now-Date.parse(q.asOf)>(q.source==='Gold API'?15*60000:2*3600000);}
 function eventState(e,now){
  if(e.status==='cancelled'||e.status==='postponed')return e.status;
  if(e.status==='released'&&e.actual)return 'released';
  var diff=Date.parse(e.at)-now;
  return diff<=0?'awaiting':diff<=15*60000?'soon':'scheduled';
 }
 function visibleEvents(events,now){return events.filter(function(e){return !['cancelled','postponed'].includes(e.status)&&Date.parse(e.at)>=now-86400000;}).sort(function(a,b){return a.at.localeCompare(b.at);}).slice(0,4);}
 if(typeof module==='object'&&module.exports)module.exports={validQuote:validQuote,staleQuote:staleQuote,eventState:eventState,visibleEvents:visibleEvents,dailyPercent:dailyPercent,mergeQuote:mergeQuote};
 if(typeof document==='undefined'||!document.querySelector('[data-home-quotes]'))return;
 var defaultStatus=document.querySelector('[data-quote-status]').textContent;
 var lang=document.documentElement.lang,root=document.body.getAttribute('data-root')||'',prefix=lang==='en'?'/':'/'+lang+'/',calendar=null,quotes={},baselines={},pending=false;
 var copy={en:{scheduled:'Scheduled',soon:'Release in',awaiting:'Awaiting official confirmation',released:'Released',previous:'Previous quote',min:'min',alert:'High-impact event approaching',confirm:'Release time reached — checking the official result',failed:'Some sources are unavailable; last verified values keep their original timestamps.'},ar:{scheduled:'مجدول',soon:'الخبر بعد',awaiting:'بانتظار التأكيد الرسمي',released:'صدر',previous:'سعر سابق',min:'دقيقة',alert:'اقترب موعد خبر عالي التأثير',confirm:'حان موعد الخبر — بانتظار النتيجة الرسمية',failed:'بعض المصادر غير متاحة؛ تبقى آخر القيم الموثقة مع توقيتها الأصلي.'},tr:{scheduled:'Planlandı',soon:'Açıklamaya kalan',awaiting:'Resmî doğrulama bekleniyor',released:'Açıklandı',previous:'Önceki fiyat',min:'dk',alert:'Önemli veri yaklaşıyor',confirm:'Açıklama saati geldi — resmî sonuç bekleniyor',failed:'Bazı kaynaklara erişilemiyor; son doğrulanmış değerler özgün saatleriyle korunur.'}}[lang]||{};
 function el(tag,text,cls){var e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;}
 function stamp(iso){return new Intl.DateTimeFormat(lang,{timeZone:'Europe/Istanbul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));}
 function putQuote(q){if(!validQuote(q,Date.now()))return;var merged=mergeQuote(q,quotes[q.symbol],baselines[q.symbol]);baselines[q.symbol]=merged.baseline;q=merged.quote;quotes[q.symbol]=q;var item=document.querySelector('[data-quote="'+q.symbol+'"]');if(!item)return;
  item.querySelector('[data-quote-price]').textContent=q.price.toLocaleString('en-US',{maximumFractionDigits:q.symbol.endsWith('JPY')?3:q.price<10?5:2});
  var change=item.querySelector('[data-quote-change]');if(change){var pct=q.dailyChangePct;change.textContent=Number.isFinite(pct)?(pct>0?'+':'')+pct.toFixed(2)+'%':'—';change.dataset.direction=Number.isFinite(pct)?pct>0?'up':pct<0?'down':'flat':'unknown';change.title=Number.isFinite(pct)?(q.previousCloseDate||'')+' '+(q.changeBasis||''):'';}
  var time=item.querySelector('[data-quote-time]');time.textContent=stamp(q.asOf);time.dateTime=q.asOf;
  var a=item.querySelector('[data-quote-source]');a.textContent=q.source;if(/^https:\/\//.test(q.sourceUrl))a.href=q.sourceUrl;
  var stale=staleQuote(q,Date.now());item.dataset.stale=String(stale);item.title=stale?copy.previous:'';
 }
 function ageQuotes(){Object.keys(quotes).forEach(function(symbol){putQuote(quotes[symbol]);});}
 function events(){if(!calendar)return;var now=Date.now(),host=document.querySelector('[data-home-events]');host.replaceChildren();
  visibleEvents(calendar.events,now).forEach(function(e){var state=eventState(e,now),row=el('div',null,'home-event-row'),time=el('time',stamp(e.at));time.dateTime=e.at;row.append(time);var a=el('a',e.title[lang]||e.title.en);a.href=prefix+(/^(?:news|analysis)\/[a-z0-9/-]+\/$/.test(e.analysisPath||'')?e.analysisPath:'calendar/');row.append(a);
   var label=state==='released'?copy.released+': '+e.actual.value:state==='soon'?copy.soon+' '+Math.ceil((Date.parse(e.at)-now)/60000)+' '+copy.min:copy[state]||copy.scheduled;row.append(el('span',label,'event-result event-result--'+state));host.append(row);
  });
  var soon=calendar.events.filter(function(e){return e.impact==='HIGH'&&eventState(e,now)==='soon';})[0];
  var due=calendar.events.filter(function(e){return e.impact==='HIGH'&&eventState(e,now)==='awaiting'&&now-Date.parse(e.at)<2*3600000;})[0];var alert=document.querySelector('[data-event-alert]');alert.hidden=!soon&&!due;if(soon||due){var e=soon||due;alert.textContent=(soon?copy.alert:copy.confirm)+' · '+(e.title[lang]||e.title.en)+' · '+stamp(e.at);}
 }
 async function json(url){var ctl=new AbortController(),timer=setTimeout(function(){ctl.abort()},8000);try{var r=await fetch(url,{signal:ctl.signal,cache:'no-store'});if(!r.ok)throw Error('Unavailable');return await r.json();}finally{clearTimeout(timer);}}
 async function refresh(){if(pending||document.hidden)return;pending=true;try{
  var bucket=Math.floor(Date.now()/60000);var jobs=[json(root+'data/calendar.json?v='+bucket).then(function(c){if(c.schemaVersion===1&&Array.isArray(c.events)){calendar=c;events();}}),json(root+'data/quotes.json?v='+bucket).then(function(q){(q.quotes||[]).forEach(putQuote);})];
  [['XAU','XAUUSD'],['XAG','XAGUSD'],['BTC','BTCUSD']].forEach(function(pair){jobs.push(json('https://api.gold-api.com/price/'+pair[0]).then(function(q){if(q.symbol!==pair[0]||q.currency!=='USD')throw Error('Symbol mismatch');putQuote({symbol:pair[1],price:q.price,asOf:q.updatedAt,source:'Gold API',sourceUrl:'https://api.gold-api.com/price/'+pair[0]});}));});
  var rs=await Promise.allSettled(jobs);if(rs.some(function(r){return r.status==='rejected'}))document.querySelector('[data-quote-status]').textContent=copy.failed;else document.querySelector('[data-quote-status]').textContent=defaultStatus;
 }finally{pending=false;}}
 function ticker(){var now=Date.now();document.querySelectorAll('[data-ticker-urgency]').forEach(function(e){var at=Date.parse(e.dataset.newsAt),soon=at>now&&at-now<=3600000;e.dataset.soon=String(soon);e.textContent=soon?e.dataset.soonLabel:e.dataset.important==='true'?e.dataset.importantLabel:'';});}
 var pause=document.querySelector('[data-ticker-pause]'),marquee=document.querySelector('.news-marquee');if(pause&&marquee)pause.addEventListener('click',function(){var paused=marquee.dataset.paused!=='true';marquee.dataset.paused=String(paused);pause.setAttribute('aria-pressed',String(paused));pause.textContent=paused?'▶':'Ⅱ';});ticker();setInterval(ticker,15000);
 refresh();setInterval(ageQuotes,15000);setInterval(refresh,30000);setInterval(events,15000);document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh();});
})();
