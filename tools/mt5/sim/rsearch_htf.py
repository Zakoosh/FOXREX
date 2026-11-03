"""R-target break search for M15 / H1 / H4 (same periods + holdout as scalp_search, spread floor 0.15)."""
import itertools, json, sys, multiprocessing as mp
import scalp_search as S
import break_sim as B
TF = sys.argv[1]; OUT = sys.argv[2]
HOLDS = {'M15': [16, 48, 96], 'H1': [12, 24, 48], 'H4': [6, 12, 24]}[TF]
S.TF = TF; S.C = S.TFS[TF]
def init():
    S.ROWS = B.load(S.DD + S.C['f']); S.TRAIN = S.periods(S.ROWS)
if __name__ == '__main__':
    g = [dict(piv=pv, minw=1, entry=e, stop=st, buf=0.05, tp_mode='R', tp=tp, be=0, newer=True, maxw=hd, maxhold=hd,
              p1=p[0], p1r=p[1], p1be=0, hb=(), stallfix=True, spmin=0.15, reuse=ru)
         for pv, e, st, tp, p, ru, hd in itertools.product([2, 3, 4, 5, 8], [0.5, 0.5785, 0.657], [0.0, -0.15, -0.3], [1, 1.5, 2, 3],
                                                           [(0, 1), (0.5, 0.7)], [False, True], HOLDS)]
    with mp.Pool(2, initializer=init) as pool:
        res = list(pool.imap_unordered(S.ev, g, chunksize=16))
    json.dump(res, open(f'{OUT}/r_{TF}.json', 'w')); print('done', TF, len(g))
