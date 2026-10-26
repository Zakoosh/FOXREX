"""Reproducible inputs and original AI-assisted conditional technical briefs.
Run before each authorized editorial refresh; no paid models/APIs or trade orders.
Text is a transparent rules-based briefing authored with AI assistance, not a runtime
LLM call. Hourly editorial agents may deepen the interpretation from these inputs.
"""
import concurrent.futures, datetime as dt, hashlib, io, json, math, urllib.request
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
SYMBOLS={'EURUSD':'EURUSD=X','GBPUSD':'GBPUSD=X','USDJPY':'JPY=X','USDCHF':'CHF=X','USDCAD':'CAD=X','AUDUSD':'AUDUSD=X','NZDUSD':'NZDUSD=X'}
UNIVERSE=['XAUUSD','XAGUSD',*SYMBOLS]
def iso(t):return dt.datetime.fromtimestamp(t,dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
def epoch(s):return dt.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()
def fetch(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 FOXREX educational research'}),timeout=25) as r:return json.load(r)
def valid(b):return all(type(b.get(k)) in (float,int) and math.isfinite(b[k]) for k in ('open','high','low','close')) and 0<b['low']<=min(b['open'],b['close'])<=max(b['open'],b['close'])<=b['high']
def ema(values,n):
 if len(values)<n:return None
 v=sum(values[:n])/n
 for x in values[n:]:v+=(x-v)*2/(n+1)
 return v

def metrics(bars):
 assert len(bars)>=20 and all(valid(b) for b in bars)
 c=[b['close'] for b in bars];changes=[c[i]-c[i-1] for i in range(1,len(c))]
 gain=sum(max(v,0) for v in changes[:14])/14;loss=sum(max(-v,0) for v in changes[:14])/14
 for v in changes[14:]:gain=(13*gain+max(v,0))/14;loss=(13*loss+max(-v,0))/14
 rsi=100 if loss==0 and gain else 50 if loss==gain==0 else 100-100/(1+gain/loss)
 tr=[max(b['high']-b['low'],abs(b['high']-bars[i-1]['close']),abs(b['low']-bars[i-1]['close'])) for i,b in enumerate(bars) if i]
 atr=sum(tr[:14])/14
 for v in tr[14:]:atr=(atr*13+v)/14
 low=min(b['low'] for b in bars[-20:]);high=max(b['high'] for b in bars[-20:]);e20=ema(c,20);e50=ema(c,50)
 trend='bullish' if e50 is not None and c[-1]>e20>e50 and rsi>50 else 'bearish' if e50 is not None and c[-1]<e20<e50 and rsi<50 else 'neutral'
 return dict(close=c[-1],support=low,resistance=high,ema20=e20,ema50=e50,ema200=ema(c,200),rsi14=rsi,atr14=atr,bias=trend)

def intake(symbol,now):
 if symbol not in SYMBOLS:
  # A known verified SPOT history is safer than a futures substitute. Never re-date it.
  source=next(x for x in json.loads((ROOT/'data/market/2026-10-23-technical.json').read_text()) if x['symbol']==symbol)
  bars=[dict(at=b['date']+'T00:00:00Z',**{k:b[k] for k in ('open','high','low','close')}) for b in source['bars']]
  quote=None
  try:
   key=symbol[:3];url='https://api.gold-api.com/price/'+key;j=fetch(url)
   assert j['symbol']==key and j['currency']=='USD' and type(j['price']) in (int,float) and math.isfinite(j['price']) and j['price']>0 and epoch(j['updatedAt'])<=now+60
   quote=dict(price=j['price'],asOf=j['updatedAt'],source='Gold API',sourceUrl=url)
  except Exception:pass
  # Older spot sample has <50 bars: extend nothing; use only computable indicators.
  return dict(symbol=symbol,timeframe='D1',seconds=86400,bars=bars,sourceUrl=source['sourceUrl'],provider=source['provider'],retrievedAt=source['retrievedAt'],dataAsOf=bars[-1]['at'],limitation='Spot H1 unavailable; dated daily spot history retained; no futures substitution',quote=quote,excluded=[])
 key=SYMBOLS[symbol];url='https://query1.finance.yahoo.com/v8/finance/chart/'+key.replace('=','%3D')+'?interval=60m&range=1mo'
 result=fetch(url)['chart']['result'][0];meta=result['meta']
 assert meta['symbol']==key and meta['currency']==symbol[-3:] and meta['instrumentType']=='CURRENCY' and meta['dataGranularity'] in ('1h','60m')
 q=result['indicators']['quote'][0];bars=[];excluded=[]
 for i,t in enumerate(result['timestamp']):
  b=dict(at=iso(t),**{k:q[k][i] for k in ('open','high','low','close')})
  if t+3600>now or not valid(b):excluded.append(b['at']);continue
  bars.append(b)
 assert len(bars)>=50 and [b['at'] for b in bars]==sorted(set(b['at'] for b in bars))
 price=meta['regularMarketPrice'];at=meta['regularMarketTime'];assert type(price) in (int,float) and math.isfinite(price) and price>0 and at<=now+60
 return dict(symbol=symbol,timeframe='H1',seconds=3600,bars=bars,sourceUrl=url,provider='Yahoo Finance',retrievedAt=iso(now),dataAsOf=iso(epoch(bars[-1]['at'])+3600),limitation='',quote=dict(price=price,asOf=iso(at),source='Yahoo Finance',sourceUrl=url),excluded=excluded)

def calculate(d):
 bars=d['bars']
 if len(bars)>=20:return metrics(bars)
 # Dated metals sample: EMA20 and observed range only; do not seed long indicators from short data.
 c=[b['close'] for b in bars];e20=ema(c,20)
 return dict(close=c[-1],support=min(b['low'] for b in bars[-20:]),resistance=max(b['high'] for b in bars[-20:]),ema20=e20,ema50=None,ema200=None,rsi14=None,atr14=None,bias='neutral')

def render(d,light=False):
 bars=d['bars'][-60:];m=d['metrics'];fg='#162838' if light else '#edf2f6';muted='#506879' if light else '#b3c3d2';bg='#ffffff' if light else '#0d1b28';green='#007c64' if light else '#57d8b0';red='#bc3152' if light else '#f28fa6'
 plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'text.color':fg,'axes.labelcolor':fg,'xtick.color':muted,'ytick.color':muted})
 fig,ax=plt.subplots(figsize=(14,8),dpi=140,facecolor=bg);ax.set_facecolor(bg)
 for i,b in enumerate(bars):
  color=green if b['close']>=b['open'] else red;ax.vlines(i,b['low'],b['high'],color=color,lw=1)
  if b['close']!=b['open']:ax.add_patch(Rectangle((i-.3,min(b['close'],b['open'])),.6,abs(b['close']-b['open']),facecolor=color))
  else:ax.hlines(b['close'],i-.3,i+.3,color=color)
 for key,color in [('support',green),('resistance',red)]:
  v=m[key];ax.axhline(v,color=color,ls='--');ax.text(len(bars)+.5,v,f'{key.title()} {v:.5f}',va='center',color=color)
 q=d.get('quote')
 if q and abs(epoch(q['asOf'])-epoch(d['dataAsOf']))<7200:
  ax.axhline(q['price'],color=muted,ls=':',lw=.8);ax.text(.01,.97,f"Indicative quote: {q['price']:.5f} | {q['asOf']}",transform=ax.transAxes,va='top',color=fg)
 ax.set_xlim(-1,len(bars)+18);ticks=list(range(0,len(bars),max(1,len(bars)//5)));ax.set_xticks(ticks);ax.set_xticklabels([bars[i]['at'][5:16].replace('T',' ') for i in ticks]);ax.grid(axis='y',alpha=.15)
 ax.set_ylabel(d['symbol'][-3:]+' per '+('troy ounce' if d['symbol'].startswith('XA') else d['symbol'][:3]))
 for spine in ax.spines.values():spine.set_visible(False)
 fig.text(.075,.94,f"FOXREX / {d['symbol']} / {d['timeframe']} / AI-ASSISTED ANALYSIS",fontsize=20,color=green,weight='bold')
 fig.text(.075,.89,f"Actual candles through {d['dataAsOf']} UTC | {len(d['bars'])} valid observations",fontsize=11)
 fig.text(.075,.05,'20 completed-bar observed range; calculated references, not guaranteed support or resistance.',fontsize=10)
 fig.text(.075,.025,'Dated spot history; H1 unavailable.' if d['timeframe']=='D1' else 'Partial/invalid candles excluded. Gaps not filled. Chart times UTC. Educational scenarios.',fontsize=9,color=muted)
 fig.subplots_adjust(left=.075,right=.98,top=.83,bottom=.14);buf=io.BytesIO();fig.savefig(buf,format='png');plt.close(fig)
 asset='assets/media/ai-'+d['symbol'].lower()+('-light' if light else '')+'.webp';Image.open(buf).convert('RGB').save(ROOT/asset,'WEBP',quality=90)
 return asset

def article(d,lang,now,old,risk):
 m=d['metrics'];s=d['symbol'];tf=d['timeframe'];q=d.get('quote');price=q['price'] if q else m['close'];at=q['asOf'] if q else d['dataAsOf'];fmt=lambda v:f'{v:.5f}' if v<200 else f'{v:.2f}';su,re=fmt(m['support']),fmt(m['resistance']);px=fmt(price);gapS=f"{(price/m['support']-1)*100:+.2f}%";gapR=f"{(m['resistance']/price-1)*100:+.2f}%"
 trend={'ar':{'bullish':'صاعد','bearish':'هابط','neutral':'نطاق / مختلط'},'en':{'bullish':'bullish','bearish':'bearish','neutral':'range / mixed'},'tr':{'bullish':'yükseliş','bearish':'düşüş','neutral':'yatay / karışık'}}[lang][m['bias']]
 labels={'ar':['تحليل الذكاء الاصطناعي','لقطة السعر والاتجاه','المستويات المهمة ورأينا','الزخم والمنهج','سيناريوهات مشروطة','عمر البيانات والحدود','خطر اقتصادي قادم'], 'en':['AI technical analysis','Price and direction','Important levels and our interpretation','Momentum and methodology','Conditional scenarios','Data age and limitations','Next economic risk'],'tr':['Yapay zekâ teknik analizi','Fiyat ve yön','Önemli seviyeler ve yorumumuz','Momentum ve yöntem','Koşullu senaryolar','Veri yaşı ve sınırlamalar','Sonraki ekonomik risk']}[lang]
 stale=now-epoch(d['dataAsOf'])>d['seconds']*2
 reason='; '.join(f'{k.upper()} {fmt(v)}' for k,v in m.items() if k in ('ema20','ema50','ema200','rsi14','atr14') and v is not None)
 omitted=', '.join(k.upper() for k in ('ema20','ema50','ema200','rsi14','atr14') if m[k] is None)
 if lang=='ar':
  summary=f'{s}: الاتجاه {trend}، السعر المرجعي {px}، دعم {su} ومقاومة {re}؛ إطار {tf}.'
  parts=[f'السعر {px} ({s[-3:]} لكل '+('أونصة تروي' if s.startswith('XA') else s[:3])+f') عند {at}. الاتجاه {trend}. '+('السعر من لقطة مؤشرّة منفصلة عن إغلاق الشمعة؛ لا يعني تحديث الشارت.' if q else 'هذا آخر إغلاق تاريخي متاح، وليس سعرًا حاليًا.'),f'الدعم {su} هو أدنى سعر في آخر 20 شمعة مكتملة؛ بُعد السعر عنه {gapS}. رأينا: الهبوط تحته ثم الفشل باستعادته يضعف توازن المشترين. المقاومة {re} أعلى سعر في نفس العينة؛ المسافة إليها {gapR}. رأينا: الاختراق يحتاج إغلاقًا ثم ثباتًا أو إعادة اختبار، واللمسة وحدها لا تثبت تحول الاتجاه.',f'{reason}. الاتجاه الصاعد يتطلب إغلاقًا فوق EMA20 فوق EMA50 وRSI فوق 50؛ والهابط عكس ذلك. غير ذلك نصنفه مختلطًا. EMA يبدأ بمتوسط أول N إغلاقات؛ RSI وATR بطريقة Wilder. '+(f'لم تُحسب {omitted} لنقص العينة. ' if omitted else '')+'اخترنا هذه المؤشرات فقط؛ لا نستخدم حجم تداول الفوركس غير الحقيقي. الاستبعادات والفجوات لا تُملأ ببيانات مصطنعة.',f'فوق {re}: نراقب الإغلاق ثم إعادة الاختبار قبل تقوية قراءة الصعود؛ العودة تحته تلغي الاختراق. دون {su}: ثبات الكسر يدعم الحذر من استمرار الضغط؛ استعادته تلغي قراءة الكسر. هذه شروط تحليل وليست مستويات دخول أو TP/SL.',('بيانات قديمة: ' if stale else 'الشموع مكتملة حتى ')+d['dataAsOf']+f'. آخر فحص {iso(now)}. '+('تعذّر الحصول على شموع H1 للذهب/الفضة الفورية؛ نعرض الشارت اليومي المؤرّخ فقط. السعر الحديث لا يحدّث عمر الشارت.' if tf=='D1' else f'استُبعدت {len(d["excluded"])} مشاهدة ناقصة أو جزئية. السعر والمؤشرات قد يختلفان بالتوقيت. لا يُضاف سياق H4/D1 دون سلسلة موثقة مستقلة.')+' النص الأصلي أُعدّ بمساعدة الذكاء الاصطناعي وفق قواعد معلنة؛ أمر التحديث يعيد الحسابات والصياغة القاعدية، ولا يستدعي نموذجًا مدفوعًا ولا يزعم مراجعة بشرية.',risk['title']['ar']+' — '+risk['at']+'. قد تزيد التقلبات والانزلاقات وقت الخبر؛ لا نفترض نتيجة قبل صدورها.']
 elif lang=='tr':
  summary=f'{s}: yön {trend}, referans fiyat {px}, destek {su}, direnç {re}; {tf}.'
  parts=[f'Fiyat {px} ({s[-3:]} / '+('troy ons' if s.startswith('XA') else s[:3])+f'), zaman {at}. Yön {trend}. '+('Gösterge kotasyonu mum kapanışından ayrıdır.' if q else 'Bu son tarihli kapanıştır; güncel fiyat değildir.'),f'Destek {su}, son 20 tamamlanmış mumun en düşüğü; fiyat uzaklığı {gapS}. Altında kalıcılık ve başarısız geri alma alıcı dengesini zayıflatır. Direnç {re}, aynı örneğin en yükseği; uzaklık {gapR}. Kırılma yorumunu güçlendirmek için kapanış ve kalıcılık veya yeniden test gerekir; tek temas yeterli değildir.',f'{reason}. Yükseliş: kapanış > EMA20 > EMA50 ve RSI > 50. Düşüş bunun tersidir; aksi halde karışık. EMA ilk N kapanışın ortalamasından başlar; RSI/ATR Wilder yöntemi. '+(f'Yetersiz örnek nedeniyle hesaplanmayanlar: {omitted}. ' if omitted else '')+'Yalnız bu göstergeler seçildi; sahte forex hacmi kullanılmaz, boşluklar doldurulmaz.',f'{re} üzerinde kapanış ve yeniden test yükseliş yorumunu destekler; altına dönüş kırılmayı geçersiz kılar. {su} altında kalıcılık baskıyı destekler; geri alma düşüş kırılmasını geçersiz kılar. İşlem emri veya giriş/TP/SL değildir.',('Eski veri: ' if stale else 'Tamamlanmış mumların sonu: ')+d['dataAsOf']+f'. Son kontrol {iso(now)}. '+('Spot altın/gümüş H1 verisi yok; yalnız tarihli günlük grafik. Yeni fiyat eski mumları güncellemez.' if tf=='D1' else f'{len(d["excluded"])} eksik/kısmi gözlem dışlandı. Kotasyon zamanı farklı olabilir; doğrulanmış bağımsız seri olmadan H4/D1 bağlamı eklenmez.')+' Özgün metin açıklanan kurallarla yapay zekâ yardımıyla hazırlanmıştır. Yenileme komutu kurallı hesap ve metni yeniler; ücretli model çağrısı veya insan incelemesi iddiası yoktur.',risk['title']['tr']+' — '+risk['at']+'. Haber sırasında oynaklık ve kayma artabilir; açıklanmamış sonuç varsayılmaz.']
 else:
  summary=f'{s}: {trend} bias, reference price {px}, support {su}, resistance {re}; {tf}.'
  parts=[f'Price {px} ({s[-3:]} per '+('troy ounce' if s.startswith('XA') else s[:3])+f') at {at}. Direction: {trend}. '+('Indicative quote is separate from the completed candle close.' if q else 'This is the last dated close, not a current quote.'),f'Support {su} is the lowest low of the last 20 completed bars; price distance {gapS}. A sustained break and failed recovery would weaken the buyer balance. Resistance {re} is the highest high of that same sample; distance {gapR}. A close followed by acceptance or a retest matters more than a touch; these are calculated references, not repeatedly validated zones.',f'{reason}. Bullish requires close > EMA20 > EMA50 and RSI > 50; bearish is the reverse; otherwise mixed. EMA starts with the mean of the first N closes; RSI/ATR use Wilder smoothing. '+(f'Omitted for insufficient history: {omitted}. ' if omitted else '')+'Only these indicators are selected; no artificial FX volume or filled gaps. Calculations use valid completed observations, not calendar intervals.',f'Above {re}: a confirmed close and successful retest strengthen the upside reading; a return below invalidates the breakout. Below {su}: acceptance supports downside caution; recovery invalidates that break. These are analytical conditions, not entry, TP or SL orders.',('Stale data: ' if stale else 'Completed candles through ')+d['dataAsOf']+f'. Last checked {iso(now)}. '+('Spot metals H1 unavailable; dated daily spot chart only. A newer quote cannot refresh old candles.' if tf=='D1' else f'{len(d["excluded"])} missing/partial observations excluded. Quote and candle times can differ; H4/D1 context is omitted without an independently verified series.')+' Original text was authored with AI assistance using disclosed rules. The refresh command recalculates and updates rule-based wording; it does not call a paid model or imply human review.',risk['title']['en']+' — '+risk['at']+'. Release-time volatility and slippage can rise; no unreleased outcome is assumed.']
 body='\n\n'.join(h+'\n'+p for h,p in zip(labels[1:],parts));group='ai-technical-'+s.lower();slug=group;published=old['publishedAt'] if old else iso(now)
 out=dict(id=group+'-'+lang,type='ANALYSIS',layer='MARKET_INTELLIGENCE',language=lang,translationGroupId=group,section='analysis',slug=slug,urlPath='analysis/'+slug+'/',title=s+': '+labels[0]+' — '+tf,summary=summary,publishedAt=published,updatedAt=iso(now),publishVersion=(old.get('publishVersion',0)+1 if old else 1),editorialDate=iso(now)[:10],access='PUBLIC',origin='scheduled-editorial',attribution=dict(byline='FOXREX AI',assistance='ai-assisted'),author=dict(name='FOXREX AI'),body=body,symbol=s,category='technical',bias=m['bias'],tags=['ai-technical','candlesticks','dated-data' if stale else 'completed-bars'],image=dict(src='assets/media/ai-'+s.lower()+'.webp',alt=s+' '+tf+' '+labels[0]),sources=[dict(name=d['provider'],url=d['sourceUrl'],retrievedAt=d['retrievedAt'])]+([dict(name=q['source'],url=q['sourceUrl'],retrievedAt=iso(now))] if q and q['source']!=d['provider'] else []),riskDisclosure={'ar':'محتوى تعليمي فقط، وليس توصية استثمارية. التداول ينطوي على مخاطر الخسارة.','en':'Educational information only, not investment advice. Trading involves risk of loss.','tr':'Yalnız eğitim amaçlıdır; yatırım tavsiyesi değildir. İşlem kayıp riski taşır.'}[lang],timeframe=tf,instruments=[s],timeframes=[tf],keyLevels=['Support '+su,'Resistance '+re],freshness=dict(dataAsOf=d['dataAsOf'],dataAsOfBasis='editor',validUntil=iso(epoch(d['dataAsOf'])+d['seconds']*2),stalePolicy='label-dated'))
 if q:out['priceRef']=dict(symbol=s,price=q['price'],source=q['source'],sourceTimestamp=q['asOf'])
 return out

def main():
 now=dt.datetime.now(dt.timezone.utc).timestamp();snap=ROOT/'data/market/ai-technical.json';previous=json.loads(snap.read_text()) if snap.exists() else {'instruments':[]};prior={d['symbol']:d for d in previous['instruments']};errors=[];series={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  futures={pool.submit(intake,s,now):s for s in UNIVERSE}
  for f in concurrent.futures.as_completed(futures):
   s=futures[f]
   try:
    d=f.result()
    if s in prior and epoch(d['dataAsOf'])<epoch(prior[s]['dataAsOf']):raise ValueError('Source timestamp regression')
    series[s]=d
   except Exception as e:
    errors.append(dict(symbol=s,error=type(e).__name__,detail=str(e)))
    if s in prior:series[s]=prior[s]
 feedpath=ROOT/'data/content.json';feed=json.loads(feedpath.read_text());old={e['id']:e for e in feed['items']};calendar=json.loads((ROOT/'data/calendar.json').read_text());future=[e for e in calendar['events'] if epoch(e['at'])>now and e.get('impact')=='HIGH'];risk=min(future,key=lambda e:e['at']) if future else dict(at=iso(now),title={l:'Check economic calendar' for l in ('en','ar','tr')})
 for s in UNIVERSE:
  if s not in series:continue
  d=series[s];d['metrics']=calculate(d);d['lastCheckedAt']=iso(now)
  for light in (False,True):render(d,light)
  for lang in ('en','ar','tr'):
   id='ai-technical-'+s.lower()+'-'+lang
   # Preserve prior content when the source fetch fails; never stamp it as freshly analyzed.
   if any(e['symbol']==s for e in errors) and id in old:continue
   old[id]=article(d,lang,now,old.get(id),risk)
 feed['items']=list(old.values());feed.pop('updatedAt',None);feed['updated']=iso(now)
 feedpath.write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n');snapshot=dict(schemaVersion=1,lastCheckedAt=iso(now),method='Completed observations; SMA-seeded EMA; Wilder RSI/ATR; 20-bar range. Rule-based AI-assisted prose.',instruments=[series[s] for s in UNIVERSE if s in series],errors=errors)
 snap.write_text(json.dumps(snapshot,indent=2)+'\n');revision=ROOT/'data/market/ai-revisions'/ (iso(now)[:13].replace(':','-')+'.json');revision.parent.mkdir(exist_ok=True);revision.write_text(json.dumps(dict(at=iso(now),hash=hashlib.sha256(snap.read_bytes()).hexdigest(),instruments=[dict(symbol=d['symbol'],dataAsOf=d['dataAsOf'],metrics=d['metrics']) for d in series.values()],errors=errors),indent=2)+'\n')
 print(json.dumps(dict(instruments=len(series),errors=errors,dated=[s for s,d in series.items() if now-epoch(d['dataAsOf'])>2*d['seconds']])))
if __name__=='__main__':main()
