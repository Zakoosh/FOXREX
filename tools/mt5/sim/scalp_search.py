"""Scalp search: break strategy with fixed targets / stops in points, per timeframe.
Goal (user): many trades, small targets (3-5 pts), win rate above 60 %.
Train = three equal periods before the holdout; HOLDOUT = 13 Oct - 3 Nov 2026 (not used for selection).
Spread floor 0.15 (files often hold 0), commission $6 per lot.
Usage: python3 scalp_search.py TF OUTDIR      TF in M1 M5 M15 H1 H4
"""
import itertools, json, sys, datetime as dt, multiprocessing as mp
import break_sim as B

D = dt.datetime
DD = '/mnt/user-data/uploads/Desktop/'
TFS = {
    'M1':  dict(f='XAUUSD_M1_202607232217_202611031636.csv', tp=[2, 3, 4, 5], sl=[None, 3, 5, 8], piv=[3, 5, 8, 12], hold=[30, 60, 240]),
    'M5':  dict(f='XAUUSD_M5_202506051635_202611031635.csv', tp=[3, 4, 5, 8], sl=[None, 5, 8, 12], piv=[3, 4, 5, 8], hold=[24, 72, 144]),
    'M15': dict(f='XAUUSD_M15_202401012300_202611031630.csv', tp=[3, 5, 8, 12], sl=[None, 8, 12, 20], piv=[3, 4, 5, 8], hold=[16, 48, 96]),
    'H1':  dict(f='XAUUSD_H1_202401012300_202611031600.csv', tp=[3, 5, 10, 15], sl=[None, 10, 20, 30], piv=[2, 3, 4, 5], hold=[12, 24, 48]),
    'H4':  dict(f='XAUUSD_H4_202401012000_202611031600.csv', tp=[3, 5, 10, 20], sl=[None, 15, 30, 45], piv=[2, 3, 4, 5], hold=[6, 12, 24]),
}
HOLD = ('H', D(2026, 10, 13), D(2026, 11, 4))
TF = sys.argv[1]; OUT = sys.argv[2]; C = TFS[TF]
ROWS = None; TRAIN = None


def periods(rows):
    a = rows[0][0].replace(hour=0, minute=0) + dt.timedelta(days=1); b = HOLD[1]
    step = (b - a) / 3
    return [('A', a, a + step), ('B', a + step, a + 2 * step), ('C', a + 2 * step, b)]


def init():
    global ROWS, TRAIN
    ROWS = B.load(DD + C['f']); TRAIN = periods(ROWS)


def ev(P):
    tr = B.run(ROWS, P)
    r = dict(P=P, per={k: [str(a), str(b)] for k, a, b in TRAIN}, **{k: B.summary(tr, a, b) for k, a, b in TRAIN + [HOLD]})
    d = B.daily(tr, TRAIN[0][1], HOLD[2]); eq = pk = dd = 0
    for v in d.values():
        eq += v[3]; pk = max(pk, eq); dd = max(dd, pk - eq)
    r['dd'] = round(dd)
    return r


if __name__ == '__main__':
    g = []
    for pv, mw, e, tp, sl, ru, hd in itertools.product(C['piv'], [0.5, 1, 2], [0.5, 0.5785, 0.657], C['tp'], C['sl'], [False, True], C['hold']):
        g.append(dict(piv=pv, minw=mw, entry=e, stop=-0.15, buf=0.05, tp_mode='P', tp=tp, slp=sl, be=0, newer=True,
                      maxw=hd, maxhold=hd, p1=0, p1r=1, p1be=0, hb=(), stallfix=True, spmin=0.15, reuse=ru))
    with mp.Pool(2, initializer=init) as pool:
        res = list(pool.imap_unordered(ev, g, chunksize=16))
    json.dump(res, open(f'{OUT}/scalp_{TF}.json', 'w'))
    print('done', TF, len(g))
