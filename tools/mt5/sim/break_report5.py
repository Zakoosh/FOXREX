"""5m report: v1, v2 (1m settings) vs v3-5m (best robust on 5m) and v3-5m high-win."""
import csv, sys, datetime as dt
from collections import defaultdict
import break_sim as B
DATA = '/mnt/user-data/uploads/Desktop/XAUUSD_M5_202601012305_202611031330.csv'
OUT = sys.argv[1]
PER = [('Jan-Apr', dt.datetime(2026,1,2), dt.datetime(2026,5,1)), ('May-Jul', dt.datetime(2026,5,1), dt.datetime(2026,8,1)),
       ('Aug-Nov', dt.datetime(2026,8,1), dt.datetime(2026,11,4)), ('ALL', dt.datetime(2026,1,2), dt.datetime(2026,11,4)),
       ('last week', dt.datetime(2026,10,27), dt.datetime(2026,11,4))]
base = dict(buf=0.05, tp_mode='R', be=0, newer=True, p1=0, p1r=1, p1be=0, hb=(), stallfix=True)
CFG = {
 'v1':  dict(base, piv=20, minw=1, entry=0.5785, stop=0.236, tp=2, maxw=240, maxhold=240, stallfix=False),
 'v2':  dict(base, piv=15, minw=1, entry=0.5, stop=-0.15, tp=2, maxw=240, maxhold=240, p1=0.5, p1r=0.7),
 'v3-5m': dict(base, piv=5, minw=1, entry=0.5785, stop=-0.15, tp=3, maxw=144, maxhold=144),
 'v3-5m-hw': dict(base, piv=3, minw=3, entry=0.657, stop=-0.15, tp=2, maxw=144, maxhold=144, p1=0.5, p1r=0.7, hb=(20,21,22,23)),
}
rows = B.load(DATA)
res = {}
for name, P in CFG.items():
    tr = B.run(rows, P); res[name] = tr
    a, b = PER[3][1], PER[3][2]
    d = B.daily(tr, a, b)
    eq = pk = dd = 0
    for v in d.values():
        eq += v[3]; pk = max(pk, eq); dd = max(dd, pk - eq)
    print(f'== {name}  maxDD(daily) {dd:,.0f}')
    for lab, a, b in PER:
        s = B.summary(tr, a, b); print(f'  {lab:9s} n{s["n"]:4d} win{s["win"]:5.1f}% net{s["net"]:+9,d} pf{s["pf"]:5.2f} green{s["green"]:3d}% avg/day{s["avg_day"]:+6,d} worst{s["worst"]:+7,d}')
    mon = defaultdict(float)
    for k, v in d.items(): mon[k.strftime('%Y-%m')] += v[3]
    print('  monthly', {k: round(v) for k, v in mon.items()})
    with open(f'{OUT}/daily_{name}.csv', 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['date', 'trades', 'wins', 'points', 'usd_1lot', 'cum_usd']); c = 0
        for k, v in d.items(): c += v[3]; w.writerow([k, v[0], v[1], round(v[2], 2), round(v[3], 2), round(c, 2)])
    with open(f'{OUT}/trades_{name}.csv', 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['open', 'close', 'side', 'entry', 'stop', 'target', 'exit', 'result', 'partial', 'points', 'usd_1lot'])
        for t in tr:
            if PER[3][1] <= t['t1']:
                pts, usd = B.money(t)
                w.writerow([t['t0'], t['t1'], 'BUY' if t['d'] > 0 else 'SELL', round(t['entry'], 2), round(t['sl0'], 2), round(t['tp'], 2),
                            round(t['exit'], 2), t['res'], 'yes' if t.get('pd') else '', round(pts, 2), round(usd, 2)])
