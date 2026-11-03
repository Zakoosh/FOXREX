import itertools, json, datetime as dt, multiprocessing as mp
import break_sim as B
DATA = '/mnt/user-data/uploads/Desktop/XAUUSD_M1_202607231802_202611031222.csv'
OUT = '/tmp/claude-0/-home-claude/e4123d46-e8e9-5f95-a862-bfae4c9b0110/scratchpad/opt/break.jsonl'
TRAIN = (dt.datetime(2026, 8, 1), dt.datetime(2026, 10, 1)); TEST = (dt.datetime(2026, 10, 1), dt.datetime(2026, 11, 4))
ROWS = None
def init():
    global ROWS; ROWS = B.load(DATA)
def ev(P):
    tr = B.run(ROWS, P)
    return dict(P=P, train=B.summary(tr, *TRAIN), test=B.summary(tr, *TEST))
grid = []
for piv, minw, entry, stop, tp, be, maxw in itertools.product([5, 10, 20, 30], [1, 2, 3, 5], [0.5, 0.5785, 0.657], [0.45, 0.382, 0.236],
                                                                [('L', 1.0), ('L', 1.272), ('L', 1.618), ('R', 2), ('R', 3)], [0, 1], [60, 240]):
    grid.append(dict(piv=piv, minw=minw, entry=entry, stop=stop, buf=0.05, tp_mode=tp[0], tp=tp[1], be=be, newer=True, maxw=maxw, maxhold=240))
if __name__ == '__main__':
    with mp.Pool(2, initializer=init) as pool, open(OUT, 'w') as f:
        for r in pool.imap_unordered(ev, grid, chunksize=8):
            f.write(json.dumps(r) + '\n')
    print('done', len(grid))
