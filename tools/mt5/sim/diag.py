import datetime as dt, statistics as st, break_sim as B
from collections import defaultdict
rows=B.load('/mnt/user-data/uploads/Desktop/XAUUSD_M1_202607231802_202611031222.csv')
P=dict(piv=20,minw=1,entry=0.5785,stop=0.236,buf=0.05,tp_mode='R',tp=2,be=0,newer=True,maxw=240,maxhold=240)
tr=B.run(rows,P)
T=[r[0] for r in rows]; C=[r[4] for r in rows]; H=[r[2] for r in rows]; L=[r[3] for r in rows]
A=B.atr14(rows); idx={t:i for i,t in enumerate(T)}
# hourly closes & EMA trend (60-bar and 240-bar EMA of 1m closes ~ 1H/4H)
def ema(xs,n):
    k=2/(n+1); o=[]; e=xs[0]
    for x in xs: e+=k*(x-e); o.append(e)
    return o
E60=ema(C,60*20); E240=ema(C,240*20)   # ~ EMA20 on 1H and 4H
def feat(t):
    i=idx[t['t0']]; d=t['d']
    f={}
    f['side']='BUY' if d>0 else 'SELL'
    f['hour']=t['t0'].hour
    f['sess']='Asia' if t['t0'].hour<10 else 'London' if t['t0'].hour<15 else 'NY' if t['t0'].hour<20 else 'late'
    f['h1']= 'with' if (C[i]-E60[i])*d>0 else 'against'
    f['h4']= 'with' if (C[i]-E240[i])*d>0 else 'against'
    f['atr']= 'low' if A[i]<1.0 else 'mid' if A[i]<1.8 else 'high'
    w=abs(t['wave'][0]-t['wave'][1]); f['waveATR']='<3' if w<3*A[i] else '3-6' if w<6*A[i] else '>6'
    # 1 day range trend: close vs close 1440 bars ago
    j=max(0,i-1440); f['d1']='with' if (C[i]-C[j])*d>0 else 'against'
    return f
periods={'Aug-Sep':(dt.datetime(2026,8,1),dt.datetime(2026,10,1)),'Oct 1-25':(dt.datetime(2026,10,1),dt.datetime(2026,10,26)),'Oct26-Nov3':(dt.datetime(2026,10,26),dt.datetime(2026,11,4))}
def tab(key):
    print('\n==',key)
    g=defaultdict(lambda:defaultdict(lambda:[0,0,0.0]))
    for t in tr:
        f=feat(t)
        for pn,(a,b) in periods.items():
            if a<=t['t1']<b:
                p,u=B.money(t); x=g[f[key]][pn]; x[0]+=1; x[1]+=u>0; x[2]+=u
    for k in sorted(g):
        print(f'{str(k):8s}', ' | '.join(f"{pn}: n{g[k][pn][0]:3d} w{(100*g[k][pn][1]/g[k][pn][0] if g[k][pn][0] else 0):3.0f}% {g[k][pn][2]:+7.0f}" for pn in periods))
for k in ['side','sess','h1','h4','d1','atr','waveATR']: tab(k)
# market regime per period
for pn,(a,b) in periods.items():
    ii=[i for i,t in enumerate(T) if a<=t<b]
    rng=[H[i]-L[i] for i in ii]; print(pn,'avg 1m range',round(st.mean(rng),2),'avg ATR',round(st.mean(A[i] for i in ii),2),'price',round(C[ii[0]]),'->',round(C[ii[-1]]))
