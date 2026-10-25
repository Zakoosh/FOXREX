"""Fetch and render independently sourced H1 candles for published market scenarios.
No invented candles, trades, entries or stop-losses. Source forecast levels are overlays.
Run python tools/charts/signals.py; --render-only reuses the checked snapshot.
"""
import concurrent.futures
import datetime as dt
import io
import json
import math
import sys
import urllib.request
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from PIL import Image
ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = ROOT / 'data/market/2026-10-26-signal-charts.json'
SYMBOLS = {'EURUSD': 'EURUSD=X', 'USDJPY': 'JPY=X', 'AUDUSD': 'AUDUSD=X', 'USDCHF': 'CHF=X', 'NZDUSD': 'NZDUSD=X', 'NZDJPY': 'NZDJPY=X'}
def iso(value):
    return dt.datetime.fromtimestamp(value, dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
def valid_bar(bar):
    return all(type(bar.get(k)) in (int, float) and math.isfinite(bar[k]) for k in ('open','high','low','close')) and 0 < bar['low'] <= min(bar['open'],bar['close']) <= max(bar['open'],bar['close']) <= bar['high']
def fetch_chart(item):
    key = SYMBOLS[item['symbol']]
    url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + key.replace('=', '%3D') + '?interval=60m&range=5d'
    request = urllib.request.Request(url, headers={'User-Agent':'FOXREX/1.0 (educational candlestick charts)'})
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.load(response)['chart']['result'][0]
    assert result['meta']['symbol'] == key
    expected = 'JPY' if item['symbol'].endswith('JPY') else 'CHF' if item['symbol']=='USDCHF' else 'USD'
    assert result['meta']['currency'] == expected
    fetched = dt.datetime.now(dt.timezone.utc).timestamp()
    quote = result['indicators']['quote'][0]
    bars, excluded = [], []
    for i, timestamp in enumerate(result.get('timestamp', [])):
        bar = {'at':iso(timestamp), 'open':quote['open'][i], 'high':quote['high'][i], 'low':quote['low'][i], 'close':quote['close'][i]}
        if timestamp + 3600 > fetched:
            excluded.append({'at':bar['at'], 'reason':'incomplete or future hourly candle'})
        elif not valid_bar(bar):
            excluded.append({'at':bar['at'], 'reason':'missing or inconsistent provider OHLC'})
        else:
            bars.append(bar)
    assert len(bars) >= 14, 'Insufficient verified H1 candles: ' + item['symbol']
    assert [b['at'] for b in bars] == sorted(set(b['at'] for b in bars))
    bounds = [float(level.rsplit(':',1)[1].strip()) for level in item['keyLevels']]
    return {'event':item['slug'],'symbol':item['symbol'],'timeframe':'H1','provider':'Yahoo Finance','quoteCurrency':expected,'sourceUrl':url,'retrievedAt':iso(fetched),'bars':bars,'excludedBars':excluded,'levels':{'lower':bounds[0],'upper':bounds[1]},'signalDataAsOf':item['freshness']['dataAsOf'],'validUntil':item['freshness']['validUntil'],'assetStem':'signal-' + item['slug']}
def render(chart, light=False):
    bars=chart['bars'][-48:]
    assert all(valid_bar(b) for b in bars)
    text, muted = ('#142437','#536779') if light else ('#e5ecf4','#b1c1d0')
    green, red, gold = ('#007c64','#b82549','#936000') if light else ('#52d6b0','#f18c9b','#efc76b')
    plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'text.color':text,'axes.labelcolor':muted,'xtick.color':muted,'ytick.color':muted})
    fig,ax=plt.subplots(figsize=(14,8),dpi=140,facecolor='#f5f7fa' if light else '#0d1420')
    ax.set_facecolor('#ffffff' if light else '#101d2b')
    n=len(bars)
    for i,b in enumerate(bars):
        color=green if b['close']>=b['open'] else red
        ax.vlines(i,b['low'],b['high'],color=color,lw=1.4)
        height=abs(b['close']-b['open'])
        if height:ax.add_patch(Rectangle((i-.3,min(b['open'],b['close'])),.6,height,facecolor=color,edgecolor=color))
        else:ax.hlines(b['close'],i-.3,i+.3,color=color,lw=1.4)
    decimals=3 if chart['quoteCurrency']=='JPY' else 5
    for key,color,label in [('lower',gold,'Source lower boundary'),('upper',green,'Source upside objective')]:
        value=chart['levels'][key]
        ax.axhline(value,color=color,ls='--',lw=1.3)
        ax.text(n+1,value,f'{label}\n{value:.{decimals}f}',va='center',color=color,fontsize=10)
    ax.set_xlim(-1,n+16)
    ticks=list(range(0,n,max(1,n//5)))
    ax.set_xticks(ticks);ax.set_xticklabels([bars[i]['at'][5:16].replace('T',' ') for i in ticks],fontsize=9)
    ax.set_ylabel(chart['quoteCurrency']);ax.grid(axis='y',alpha=.13)
    for spine in ax.spines.values():spine.set_visible(False)
    fig.text(.075,.94,f"FOXREX  /  {chart['symbol']}  /  H1",fontsize=24,weight='bold',color=green)
    fig.text(.075,.89,f"Actual completed candles | Last bar: {bars[-1]['at']} | Yahoo Finance",fontsize=11)
    fig.text(.075,.055,'Dashed lines: source scenario levels. They are not entry or stop-loss orders.',fontsize=10,color=gold)
    fig.text(.075,.025,'Historical price context; gaps and unavailable bars are not filled. All chart times are UTC.',fontsize=9,color=muted)
    fig.subplots_adjust(left=.075,right=.98,top=.84,bottom=.14)
    buf=io.BytesIO();fig.savefig(buf,format='png')
    asset=ROOT/'assets/media'/(chart['assetStem']+('-light' if light else '')+'.webp')
    Image.open(buf).convert('RGB').save(asset,'WEBP',quality=91)
    plt.close(fig)
if __name__=='__main__':
    if '--render-only' in sys.argv:
        charts=json.loads(SNAPSHOT.read_text())['charts']
    else:
        feed=json.loads((ROOT/'data/content.json').read_text())
        items=[e for e in feed['items'] if e['language']=='en' and 'autochartist' in e.get('tags',[])]
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:charts=list(pool.map(fetch_chart,items))
        SNAPSHOT.write_text(json.dumps({'schemaVersion':1,'charts':charts},indent=2)+'\n')
    for chart in charts:
        for light in (False,True):render(chart,light)
        print(chart['symbol'],len(chart['bars']),'verified candles; last',chart['bars'][-1]['at'])
