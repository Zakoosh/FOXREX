import csv, datetime as dt
from collections import Counter, defaultdict
import fxw_sim as F
exec(open('run_user.py').read().split("start = dt.datetime")[0])
start = dt.datetime(2026, 10, 27, 12, 18)
out = '/tmp/claude-0/-home-claude/e4123d46-e8e9-5f95-a862-bfae4c9b0110/scratchpad/out/'
for room in ('STRONG_BLOCK', 'ALL_BLOCK'):
    for part in ('OFF', 'ALL'):
        F.S.update(room=room, part=part, part_pct=(25, 25, 25, 25))
        trades, op = F.run(m1, d1, start, 0.001)
        rows = F.report(trades, f'room {room} · partials {"25% at TP1–TP4" if part == "ALL" else "off"}', start)
        g = defaultdict(lambda: [0, 0.0])
        for p, pts, usd in rows:
            key = 'SL' if p.res == 'SL' else '⌛' if p.res == '⌛' else 'TP7' if p.res == 'TP7' else 'reached a TP'
            g[key][0] += 1; g[key][1] += usd
        print('   ', {k: (v[0], round(v[1])) for k, v in g.items()})
        if part == 'ALL':
            with open(out + f'sim_partials_{room}.csv', 'w', newline='') as f:
                w = csv.writer(f); w.writerow(['open', 'close', 'side', 'source', 'stars', 'lots', 'entry', 'exit', 'result', 'points', 'usd'])
                for p, pts, usd in rows:
                    w.writerow([p.t0, p.t1, 'BUY' if p.d > 0 else 'SELL', p.src, p.stars, p.lots, round(p.entry, 3), round(p.exit, 3), p.res, round(pts, 2), round(usd, 2)])
