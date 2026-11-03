"""Random + local search of EA settings on 1m gold. Train = Aug 15 – Sep 30, test = Oct 1 – Nov 3 (not used to choose)."""
import sys, json, random, datetime as dt, multiprocessing as mp
import fxw_sim as F

DATA = '/mnt/user-data/uploads/Desktop/XAUUSD_M1_202607231802_202611031222.csv'
OUT = '/tmp/claude-0/-home-claude/e4123d46-e8e9-5f95-a862-bfae4c9b0110/scratchpad/opt/'
TRAIN = (dt.datetime(2026, 8, 15), dt.datetime(2026, 10, 1))
TEST = (dt.datetime(2026, 10, 1), dt.datetime(2026, 11, 4))
BASE = dict(F.S)
SPACE = dict(
    dir=['TREND', 'BOTH'], entry=['LIM', 'LIM_REJ', 'REJ'], elvl=['START', 'MID', 'END'],
    tps=[(1, 2, 3, 5), (1.5, 3, 4.5, 7), (2, 4, 6, 8), (2.5, 5, 7, 10)],
    sl=[(2, 5), (3, 8), (3, 10), ('ATR', 1.5, 2.0)],
    protect=['TP1', 'STEP', 'NEAR', 'OFF'],
    part=[(), (25, 25, 25, 25), (50,), (50, 25, 25)],
    room=['STRONG_BLOCK', 'ALL_BLOCK', 'OFF'], use_rsi=[True, False], ms=[1, 2, 3], no_prog=[15, 30],
    tr_swing=[True, False], use_rev=[True, False], trade_dl=[True, False])
M1 = D1 = None


def load():
    global M1, D1
    M1 = F.load_mt5(DATA)
    agg = {}
    for t, o, h, l, c, _ in M1:
        d = t.date()
        if d not in agg: agg[d] = [d, o, h, l, c]
        else: a = agg[d]; a[2] = max(a[2], h); a[3] = min(a[3], l); a[4] = c
    D1 = [tuple(v) for v in sorted(agg.values())]


def apply(cfg):
    F.S.clear(); F.S.update(BASE); F.S['min_days'] = 15
    F.S.update(dir=cfg['dir'], entry=cfg['entry'], elvl=cfg['elvl'], profile='CUSTOM', tps=tuple(cfg['tps']),
               protect=cfg['protect'], room=cfg['room'], use_rsi=cfg['use_rsi'], ms=(cfg['ms'],) * 4,
               no_prog=cfg['no_prog'], tr_swing=cfg['tr_swing'], use_rev=cfg['use_rev'], trade_dl=cfg['trade_dl'])
    if cfg['sl'][0] == 'ATR':
        F.S.update(stop='ATR', sl_atr=(cfg['sl'][1], cfg['sl'][2]))
    else:
        F.S.update(stop='POINTS', sl_min_c=cfg['sl'][0], sl_max_c=cfg['sl'][1])
    F.S.update(part='ALL' if cfg['part'] else 'OFF', part_pct=tuple(cfg['part']) or (25,))


def stats(tr, a, b):
    xs = []
    for p in tr:
        if a <= p.t1 < b:
            xs.append(p.pts * F.S['lot_value'] * p.lots - F.S['commission'] * p.lots)
    n = len(xs); w = sum(1 for x in xs if x > 0)
    gp = sum(x for x in xs if x > 0); gl = -sum(x for x in xs if x < 0)
    eq = pk = dd = 0.0
    for x in xs:
        eq += x; pk = max(pk, eq); dd = max(dd, pk - eq)
    return dict(n=n, win=round(100 * w / n, 1) if n else 0, net=round(gp - gl), pf=round(gp / gl, 2) if gl else 99, dd=round(dd))


def evaluate(cfg):
    try:
        apply(cfg)
        tr, _ = F.run(M1, D1, TRAIN[0], 0.001)
        tr.sort(key=lambda p: p.t1)
        return dict(cfg=cfg, train=stats(tr, *TRAIN), test=stats(tr, *TEST))
    except Exception as e:
        return dict(cfg=cfg, err=repr(e))


def rnd(r):
    return {k: r.choice(v) for k, v in SPACE.items()}


def score(res):
    t = res.get('train')
    if not t or t['n'] < 150:
        return -1e18
    # high win rate, but only when the money is positive
    return t['net'] * (1 if t['net'] < 0 else (0.5 + t['win'] / 100)) + (t['win'] - 50) * 200


if __name__ == '__main__':
    stage, n = sys.argv[1], int(sys.argv[2])
    r = random.Random(7 if stage == 'A' else 11)
    if stage == 'A':
        cfgs = [rnd(r) for _ in range(n)]
    else:
        prev = [json.loads(l) for l in open(OUT + 'A.jsonl')]
        prev = sorted([p for p in prev if 'train' in p], key=score, reverse=True)[:4]
        cfgs, seen = [], set()
        for p in prev:
            for k, vals in SPACE.items():
                for v in vals:
                    c = dict(p['cfg']); c[k] = v
                    key = json.dumps(c, sort_keys=True)
                    if key not in seen:
                        seen.add(key); cfgs.append(c)
    with mp.Pool(2, initializer=load) as pool, open(OUT + stage + '.jsonl', 'w') as f:
        for i, res in enumerate(pool.imap_unordered(evaluate, cfgs)):
            f.write(json.dumps(res) + '\n'); f.flush()
    print('done', stage, len(cfgs))
