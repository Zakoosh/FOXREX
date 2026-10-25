"""Refresh indicative source snapshots without keys or paid endpoints.
Gold API /price observations are provider fetch times, not executed-trade timestamps.
Yahoo FX timestamps retain their original market observation time. Failed sources keep
last verified values and never refresh their observation timestamp.
"""
import json,datetime,urllib.request,concurrent.futures,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'FOXREX/1.0 (educational market snapshots)'})
 with urllib.request.urlopen(req,timeout=20) as r:return json.load(r)
def iso(t):return datetime.datetime.fromtimestamp(t,datetime.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
def checked(q,now):
 assert type(q['price']) in (int,float) and math.isfinite(q['price']) and q['price']>0
 at=datetime.datetime.fromisoformat(q['asOf'].replace('Z','+00:00'))
 assert at<=now+datetime.timedelta(minutes=1)
 return q

def quote(pair,now):
 symbol,key=pair
 if key in ('XAU','XAG','BTC'):
  url='https://api.gold-api.com/price/'+key;j=fetch(url)
  assert j['symbol']==key and j['currency']=='USD'
  return checked(dict(symbol=symbol,price=j['price'],asOf=j['updatedAt'],source='Gold API',sourceUrl=url,timeBasis='provider-fetch',currency='USD'),now)
 url='https://query1.finance.yahoo.com/v8/finance/chart/'+key.replace('=','%3D')+'?interval=1d&range=5d';j=fetch(url)['chart']['result'][0]['meta']
 assert j['symbol']==key and j['currency']==('JPY' if key=='JPY=X' else 'USD')
 return checked(dict(symbol=symbol,price=j['regularMarketPrice'],asOf=iso(j['regularMarketTime']),source='Yahoo Finance',sourceUrl=url,timeBasis='market-observation',currency=j['currency']),now)
if __name__=='__main__':
 now=datetime.datetime.now(datetime.timezone.utc);p=ROOT/'data/quotes.json';old=json.loads(p.read_text()) if p.exists() else {'quotes':[]};qs={q['symbol']:q for q in old['quotes']};errors=[]
 pairs=[('XAUUSD','XAU'),('XAGUSD','XAG'),('EURUSD','EURUSD=X'),('GBPUSD','GBPUSD=X'),('USDJPY','JPY=X'),('BTCUSD','BTC')]
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  future={pool.submit(quote,pair,now):pair[0] for pair in pairs}
  for f in concurrent.futures.as_completed(future):
   try:
    q=f.result();previous=qs.get(q['symbol'])
    if previous and datetime.datetime.fromisoformat(q['asOf'].replace('Z','+00:00'))<datetime.datetime.fromisoformat(previous['asOf'].replace('Z','+00:00')):raise ValueError('Provider observation regressed')
    qs[q['symbol']]=q
   except Exception as e:errors.append({'symbol':future[f],'message':type(e).__name__})
 data=dict(schemaVersion=1,updatedAt=now.isoformat(timespec='seconds').replace('+00:00','Z'),quotes=[qs[s] for s,_ in pairs if s in qs],errors=errors)
 assert data['quotes'],'No verified quotes available'
 p.write_text(json.dumps(data,indent=2)+'\n');print(json.dumps({'quotes':len(data['quotes']),'errors':errors}))
