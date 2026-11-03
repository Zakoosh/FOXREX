import sys, datetime as dt
import fxw_sim as F
F.S.update(dir='BOTH', use_rsi=False, entry='LIM', elvl='START', profile='CUSTOM', tps=(2.5, 5.0, 7.0, 10.0),
           protect='TP1', stop='POINTS', part='OFF')
M1 = '/mnt/user-data/uploads/Desktop/XAUUSD_M1_202610010000_202611031218.csv'
m1 = F.load_mt5(M1)
agg = {}
for t, o, h, l, c, _ in m1:
    d = t.date()
    if d not in agg: agg[d] = [d, o, h, l, c]
    else: a = agg[d]; a[2] = max(a[2], h); a[3] = min(a[3], l); a[4] = c
d1 = [tuple(v) for v in sorted(agg.values())]
F.S['min_days'] = 15
start = dt.datetime(2026, 10, 27, 12, 18)
out = '/tmp/claude-0/-home-claude/e4123d46-e8e9-5f95-a862-bfae4c9b0110/scratchpad/out/'
for room in ('STRONG_BLOCK', 'ALL_BLOCK'):
    F.S['room'] = room
    trades, op = F.run(m1, d1, start, 0.001)
    rows = F.report(trades, 'EA · room ' + room, start)
    import csv
    with open(out + f'sim_{room}.csv', 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['open', 'close', 'side', 'source', 'stars', 'lots', 'entry', 'exit', 'result', 'points', 'usd'])
        for p, pts, usd in rows:
            w.writerow([p.t0, p.t1, 'BUY' if p.d > 0 else 'SELL', p.src, p.stars, p.lots, round(p.entry, 3), round(p.exit, 3), p.res, round(pts, 2), round(usd, 2)])
    from collections import Counter
    print('  by source', Counter(p.src for p, _, _ in rows))
    print('  by result', Counter(p.res for p, _, _ in rows))
    print('  by side', Counter('BUY' if p.d > 0 else 'SELL' for p, _, _ in rows), 'open at end', len(op))
