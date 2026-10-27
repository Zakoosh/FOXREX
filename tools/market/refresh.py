"""Refresh indicative source snapshots without keys or paid endpoints.
Gold API /price observations are provider fetch times, not executed-trade timestamps.
Yahoo FX timestamps retain their original market observation time. Failed sources keep
last verified values and never refresh their observation timestamp.
"""
import json,datetime,urllib.request,urllib.parse,urllib.error,concurrent.futures,math,time
from zoneinfo import ZoneInfo
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def fetch(url,retries=2):
 # One polite retry on rate limiting/temporary errors; Yahoo also serves the same API from query2.
 urls=[url]+([url.replace('://query1.','://query2.')] if '://query1.' in url else [])
 last=None
 for attempt in range(retries):
  for u in urls:
   try:
    req=urllib.request.Request(u,headers={'User-Agent':'FOXREX/1.0 (educational market snapshots)'})
    with urllib.request.urlopen(req,timeout=20) as r:return json.load(r)
   except urllib.error.HTTPError as e:
    last=e
    if e.code not in (429,500,502,503,504):raise
   except urllib.error.URLError as e:last=e
  time.sleep(3*(attempt+1))
 raise last
def iso(t):return datetime.datetime.fromtimestamp(t,datetime.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
def checked(q,now):
 assert type(q['price']) in (int,float) and math.isfinite(q['price']) and q['price']>0
 at=datetime.datetime.fromisoformat(q['asOf'].replace('Z','+00:00'))
 assert at.tzinfo is not None, 'Source timestamp must include timezone'
 assert at<=now+datetime.timedelta(minutes=1)
 return q

def previous_weekday(day):
 day-=datetime.timedelta(days=1)
 while day.weekday()>4:day-=datetime.timedelta(days=1)
 return day

def metal_change(q,now):
 path=ROOT/'data/market/2026-10-23-technical.json'
 if not path.exists():return q
 series=next((s for s in json.loads(path.read_text()) if s['symbol']==q['symbol']),None)
 if not series:return q
 day=datetime.datetime.fromisoformat(q['asOf'].replace('Z','+00:00')).astimezone(ZoneInfo('America/New_York')).date()
 bar=series['bars'][-1]
 if datetime.date.fromisoformat(bar['date'])!=previous_weekday(day):return q
 base=bar['close']
 if not math.isfinite(base) or base<=0:return q
 q.update(previousClose=base,previousCloseDate=bar['date'],changeSourceUrl=series['sourceUrl'],dailyChangePct=(q['price']/base-1)*100,changeBasis='previous verified spot daily close')
 return q

def yahoo_change(q,result):
 meta=result['meta'];pct=meta.get('regularMarketChangePercent')
 if type(pct) in (int,float) and math.isfinite(pct):
  q.update(dailyChangePct=pct,changeBasis='provider regular-session change',changeSourceUrl=q['sourceUrl'])
  return q
 zone=ZoneInfo(meta.get('exchangeTimezoneName','UTC'))
 day=datetime.datetime.fromtimestamp(meta['regularMarketTime'],zone).date()
 closes=result.get('indicators',{}).get('quote',[{}])[0].get('close',[])
 candidates=[(t,c) for t,c in zip(result.get('timestamp',[]),closes) if type(c) in (int,float) and math.isfinite(c) and c>0 and datetime.datetime.fromtimestamp(t,zone).date()==previous_weekday(day)]
 if candidates:
  t,base=candidates[-1];q.update(previousClose=base,previousCloseDate=iso(t)[:10],dailyChangePct=(q['price']/base-1)*100,changeBasis='previous provider daily close',changeSourceUrl=q['sourceUrl'])
 return q

def quote(pair,now):
 symbol,key=pair
 if key in ('XAU','XAG','BTC'):
  url='https://api.gold-api.com/price/'+key;j=fetch(url)
  assert j['symbol']==key and j['currency']=='USD'
  return metal_change(checked(dict(symbol=symbol,price=j['price'],asOf=j['updatedAt'],source='Gold API',sourceUrl=url,timeBasis='provider-fetch',currency='USD',unit='USD per troy ounce' if key in ('XAU','XAG') else 'USD per BTC',fetchedAt=iso(datetime.datetime.now(datetime.timezone.utc).timestamp())),now),now)
 url='https://query1.finance.yahoo.com/v8/finance/chart/'+urllib.parse.quote(key,safe='')+'?interval=1d&range=5d'
 result=fetch(url)['chart']['result'][0];j=result['meta']
 assert j['symbol']==key and j['currency']==('JPY' if key=='JPY=X' else 'USD')
 if key.startswith('^'):assert j.get('instrumentType')=='INDEX'
 q=checked(dict(symbol=symbol,price=j['regularMarketPrice'],asOf=iso(j['regularMarketTime']),source='Yahoo Finance',sourceUrl=url,timeBasis='market-observation',currency=j['currency'],unit=UNITS[symbol],fetchedAt=iso(datetime.datetime.now(datetime.timezone.utc).timestamp())),now)
 return yahoo_change(q,result)

UNITS={'EURUSD':'USD per EUR','GBPUSD':'USD per GBP','USDJPY':'JPY per USD','SPX':'index points','NAS100':'index points','US30':'index points','DXY':'index points','VIX':'index points','US10Y':'percent yield','WTI':'USD per barrel','BRENT':'USD per barrel','ES':'futures index points','NQ':'futures index points'}
# Core site quotes first (rendered on the public site), then session-desk context used by the admin checklist.
PAIRS=[('XAUUSD','XAU'),('XAGUSD','XAG'),('EURUSD','EURUSD=X'),('GBPUSD','GBPUSD=X'),('USDJPY','JPY=X'),('BTCUSD','BTC'),('SPX','^GSPC'),('NAS100','^NDX'),('US30','^DJI'),
 ('DXY','DX-Y.NYB'),('US10Y','^TNX'),('VIX','^VIX'),('WTI','CL=F'),('BRENT','BZ=F'),('ES','ES=F'),('NQ','NQ=F')]

if __name__=='__main__':
 now=datetime.datetime.now(datetime.timezone.utc);p=ROOT/'data/quotes.json';old=json.loads(p.read_text()) if p.exists() else {'quotes':[]};qs={q['symbol']:q for q in old['quotes']};errors=[]
 pairs=PAIRS
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  future={pool.submit(quote,pair,now):pair[0] for pair in pairs}
  for f in concurrent.futures.as_completed(future):
   try:
    q=f.result();previous=qs.get(q['symbol'])
    if previous and datetime.datetime.fromisoformat(q['asOf'].replace('Z','+00:00'))<datetime.datetime.fromisoformat(previous['asOf'].replace('Z','+00:00')):raise ValueError('Provider observation regressed')
    qs[q['symbol']]=q
   except Exception as e:errors.append({'symbol':future[f],'message':type(e).__name__})
 data=dict(schemaVersion=1,updatedAt=iso(datetime.datetime.now(datetime.timezone.utc).timestamp()),quotes=[qs[s] for s,_ in pairs if s in qs],errors=errors)
 assert data['quotes'],'No verified quotes available'
 p.write_text(json.dumps(data,indent=2)+'\n');print(json.dumps({'quotes':len(data['quotes']),'errors':errors}))
