"""Round 2 search for the break strategy, 1m and 5m.

Selection uses only the TRAIN periods (three per timeframe); the last three weeks (13 Oct – 3 Nov) are a HOLDOUT
that is never used to choose settings and is reported as the out-of-sample check.
Stage 1: core rule grid.  Stage 2: the 40 most robust cores × filters (time exit, blocked hours, HTF bias, structure trend).
Usage: python3 break_search.py 5|1 OUTDIR
"""
import itertools, json, sys, datetime as dt, multiprocessing as mp
import break_sim as B

D = dt.datetime
CFG = {
    '5': dict(data='/mnt/user-data/uploads/Desktop/XAUUSD_M5_202601012305_202611031330.csv',
              train=[('A', D(2026, 1, 2), D(2026, 5, 1)), ('B', D(2026, 5, 1), D(2026, 8, 1)), ('C', D(2026, 8, 1), D(2026, 10, 13))],
              piv=[3, 4, 5, 6, 8], hold=[72, 144, 288], bias=[None, 60, 240]),
    '1': dict(data='/mnt/user-data/uploads/Desktop/XAUUSD_M1_202607231802_202611031222.csv',
              train=[('A', D(2026, 7, 24), D(2026, 8, 25)), ('B', D(2026, 8, 25), D(2026, 9, 22)), ('C', D(2026, 9, 22), D(2026, 10, 13))],
              piv=[8, 10, 15, 20, 25], hold=[120, 240, 480], bias=[None, 15, 60]),
}
HOLD = ('H', D(2026, 10, 13), D(2026, 11, 4))
TF = sys.argv[1]; OUT = sys.argv[2]; C = CFG[TF]
ROWS = None


def init():
    global ROWS
    ROWS = B.load(C['data'])


def ev(P):
    tr = B.run(ROWS, P)
    r = dict(P=P, **{k: B.summary(tr, a, b) for k, a, b in C['train'] + [HOLD]})
    # max drawdown on daily closes over train + holdout
    d = B.daily(tr, C['train'][0][1], HOLD[2]); eq = pk = dd = 0
    for v in d.values():
        eq += v[3]; pk = max(pk, eq); dd = max(dd, pk - eq)
    r['dd'] = round(dd)
    return r


def score(r):
    ks = [k for k, _, _ in C['train']]
    if any(r[k]['n'] < 15 or r[k]['pf'] < 1.05 for k in ks):
        return -1e9
    return min(r[k]['avg_day'] for k in ks)


def base(**kw):
    P = dict(buf=0.05, tp_mode='R', be=0, newer=True, p1=0, p1r=1, p1be=0, hb=(), stallfix=True, trend=0)
    P.update(kw); return P


if __name__ == '__main__':
    h0 = C['hold'][1]
    g1 = [base(piv=pv, minw=mw, entry=e, stop=st, tp=tp, p1=p[0], p1r=p[1], maxw=h0, maxhold=h0)
          for pv, mw, e, st, tp, p in itertools.product(C['piv'], [1, 2, 3], [0.5, 0.5785, 0.618, 0.657], [0.0, -0.15, -0.3],
                                                        [2, 2.5, 3, 4], [(0, 1), (0.5, 0.7), (0.5, 1.0)])]
    with mp.Pool(2, initializer=init) as pool:
        r1 = list(pool.imap_unordered(ev, g1, chunksize=8))
        json.dump(r1, open(f'{OUT}/s1_{TF}.json', 'w'))
        r1.sort(key=score, reverse=True)
        # keep the 30 best by profit and the 10 best with win rate >= 55 %
        tops = r1[:30] + [r for r in r1 if min(r[k]['win'] for k, _, _ in C['train']) >= 55 and score(r) > 0][:10]
        g2 = []
        for r in tops:
            for hold, hb, bias, trend in itertools.product(C['hold'], [(), (20, 21, 22, 23), (0, 1, 2, 3, 4, 5)], C['bias'], [0, 1]):
                P = dict(r['P'], maxw=hold, maxhold=hold, hb=hb, trend=trend)
                if bias: P.update(bias=bias, bpiv=3)
                g2.append(P)
        r2 = list(pool.imap_unordered(ev, g2, chunksize=8))
    json.dump(r2, open(f'{OUT}/s2_{TF}.json', 'w'))
    print('done', TF, len(g1), len(g2))
