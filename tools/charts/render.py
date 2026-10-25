"""Render dated, reproducible D1 charts from checked provider OHLC observations.
Run: python tools/charts/render.py. No interpolated or simulated candles.
"""
import json, math
from datetime import date
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]

def validate(bars, minimum=14):
    assert len(bars)>=minimum
    assert [b['date'] for b in bars]==sorted(set(b['date'] for b in bars))
    for b in bars:
        assert date.fromisoformat(b['date'])<=date.today()
        assert all(math.isfinite(b[k]) for k in ('open','high','low','close'))
        assert 0<b['low']<=min(b['open'],b['close'])<=max(b['open'],b['close'])<=b['high'],b

def metrics(bars):
    validate(bars,1)
    b=bars[-1]; h,l,c=b['high'],b['low'],b['close'];p=(h+l+c)/3
    return dict(close=c,pivot=p,s1=2*p-h,r1=2*p-l,s2=p-(h-l),r2=p+(h-l),observedLow=min(x['low'] for x in bars[-20:]),observedHigh=max(x['high'] for x in bars[-20:]))

def render(d, theme="dark"):
    light=theme=="light"
    text="#142437" if light else "#e4eaf2"
    muted="#46596d" if light else "#b6c2d5"
    green="#007c64" if light else "#5bd1b0"
    red="#ba2948" if light else "#ed8b91"
    gold="#926000" if light else "#ebc36d"
    bars=d['bars'];validate(bars,4 if d.get('timeframe')=='W1' else 14);m=metrics(bars);d['metrics']=m
    plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'text.color':text,'axes.labelcolor':muted,'xtick.color':muted,'ytick.color':muted})
    fig,ax=plt.subplots(figsize=(14,8),dpi=140,facecolor='#f5f7fa' if light else '#0d1420');ax.set_facecolor('#ffffff' if light else '#101d2b')
    visible=bars[-55:];n=len(visible)
    for i,b in enumerate(visible):
        color=green if b['close']>=b['open'] else red
        ax.vlines(i,b['low'],b['high'],color=color,lw=1.3)
        ax.add_patch(Rectangle((i-.3,min(b['open'],b['close'])),.6,max(abs(b['close']-b['open']),b['close']*.000025),facecolor=color,edgecolor=color))
    for key,color in [('r2',red),('r1',red),('pivot',gold),('s1',green),('s2',green)]:
        v=m[key];ax.axhline(v,color=color,lw=1,ls='--',alpha=.85)
        ax.text(n+.2,v,f'{key.upper()}  {v:.4f}' if m['close']<10 else f'{key.upper()}  {v:.2f}',color=color,fontsize=10,va='center')
    ax.set_xlim(-1,n+10)
    ax.set_xticks(list(range(0,n,max(1,n//6))));ax.set_xticklabels([visible[i]['date'][5:] for i in range(0,n,max(1,n//6))])
    ax.grid(axis='y',alpha=.12,color='#94a3b8');ax.set_ylabel(d['quoteCurrency']);ax.tick_params(length=0)
    for s in ax.spines.values():s.set_visible(False)
    fig.text(.08,.94,f"FOXREX  /  {d['symbol']}  /  {d.get('timeframe','D1')}",fontsize=23,weight='bold',color=green)
    fig.text(.08,.89,f"Completed sessions through {bars[-1]['date']}  |  Close: {m['close']:.4f}  |  {d['provider']}",fontsize=12)
    fig.text(.08,.055,'P = (H + L + C) / 3   |   S1 / S2: calculated support   |   R1 / R2: calculated resistance',fontsize=10)
    fig.text(.08,.025,'Reference levels from the last completed chart bar. Not live quotes. No forecast candles.',fontsize=9,color=muted)
    fig.subplots_adjust(left=.08,right=.98,top=.84,bottom=.12)
    suffix="-light" if light else ""
    stem=d.get("assetStem") or f"{d['symbol'].lower()}-{d.get('timeframe','D1').lower()}-{bars[-1]['date']}"
    path=ROOT/f"assets/media/{stem}{suffix}.webp"
    import io
    buf=io.BytesIO();fig.savefig(buf,format='png');Image.open(buf).convert('RGB').save(path,'WEBP',quality=90);plt.close(fig)
    return m

if __name__=='__main__':
    p=ROOT/'data/market/2026-10-23-technical.json';data=json.loads(p.read_text())
    for d in data:
        for theme in ('dark','light'):print(d['symbol'],theme,render(d,theme))
    p.write_text(json.dumps(data,indent=2)+'\n')
