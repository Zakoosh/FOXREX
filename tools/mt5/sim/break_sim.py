"""Break-of-structure retracement strategy (from the user's screenshots), 1m gold.

1. A bigger swing low (high) = pivot with PIV bars on each side.
2. A candle CLOSES below that swing low (above that swing high) = the break.
3. The wave runs from the highest high between the swing and the break (0 %) to the lowest low after the break (100 %).
   Each candle that makes no new extreme (a stall) arms / moves a sell (buy) limit in the 50 %–65.7 % box
   (= 34.3 %–50 % retracement from the low), entry in the middle of the box.
4. Stop: beyond a chosen level of the wave + buffer. Target: a level of the wave or an R multiple.
5. One trade per break; the setup ends when filled, when price closes beyond the stop level, or after MAXW bars.
Fills are conservative: a limit fills only when the bar trades through it with the spread, the stop is checked
before the target inside a bar, and the target counts from the bar after the fill.
"""
import csv, datetime as dt
from collections import defaultdict

LOT_VALUE, COMM = 100.0, 6.0   # gold: $100 per 1.00 move for 1 lot; commission per lot


def load(path):
    rows = []
    with open(path, newline='') as f:
        rd = csv.reader(f, delimiter='\t'); next(rd)
        for r in rd:
            t = dt.datetime.strptime(r[0] + ' ' + r[1], '%Y.%m.%d %H:%M:%S')
            rows.append((t, float(r[2]), float(r[3]), float(r[4]), float(r[5]), int(r[8]) * 0.001))
    return rows


def atr14(rows):
    out, a = [], 0.0
    for i, (t, o, h, l, c, s) in enumerate(rows):
        tr = h - l if i == 0 else max(h - l, abs(h - rows[i - 1][4]), abs(l - rows[i - 1][4]))
        a = tr if i == 0 else (a * 13 + tr) / 14
        out.append(a)
    return out


_BIAS = {}


def htf_bias(rows, mins, piv):
    """Direction of the last close beyond a swing high / low on a higher timeframe (closed bars only), per 1m bar."""
    key = (id(rows), mins, piv)
    if key in _BIAS:
        return _BIAS[key]
    bars, idx = [], []                     # HTF bars and, for each 1m bar, the index of the last CLOSED HTF bar
    cur = None
    for t, o, h, l, c, s in rows:
        k = (t - dt.datetime(2000, 1, 1)).total_seconds() // (mins * 60)
        if cur is None or k != cur[0]:
            if cur is not None:
                bars.append(cur)
            cur = [k, o, h, l, c]
        else:
            cur[2] = max(cur[2], h); cur[3] = min(cur[3], l); cur[4] = c
        idx.append(len(bars) - 1)          # bars[-1] is closed; cur is still forming
    bars.append(cur)
    H = [b[2] for b in bars]; L = [b[3] for b in bars]; C = [b[4] for b in bars]
    bias, sh, sl_, tr = [], None, None, 0
    for j in range(len(bars)):
        p = j - piv
        if p >= piv:
            if all(H[p] > H[p - q] for q in range(1, piv + 1)) and all(H[p] >= H[p + q] for q in range(1, piv + 1)): sh = H[p]
            if all(L[p] < L[p - q] for q in range(1, piv + 1)) and all(L[p] <= L[p + q] for q in range(1, piv + 1)): sl_ = L[p]
        if sh is not None and C[j] > sh: tr, sh = 1, None
        if sl_ is not None and C[j] < sl_: tr, sl_ = -1, None
        bias.append(tr)
    out = [bias[j] if j >= 0 else 0 for j in idx]
    _BIAS[key] = out
    return out


def run(rows, P):
    n = len(rows); A = atr14(rows)
    BI = htf_bias(rows, P['bias'], P.get('bpiv', 3)) if P.get('bias') else None
    hb = set(P.get('hb', ()))
    lossDay, lossN = None, 0
    H = [r[2] for r in rows]; L = [r[3] for r in rows]; C = [r[4] for r in rows]; O = [r[1] for r in rows]
    piv = P['piv']
    lastLow = lastHigh = None          # (price, bar) of the latest unbroken swing
    setup = None                       # active setup dict
    pos = None
    trades = []
    for i in range(n):
        t, o, h, l, c, sp = rows[i]
        # ---------- open position: stop first, then target (from the bar after the fill)
        if pos and i > pos['i0']:
            d = pos['d']
            if (d < 0 and h + sp >= pos['sl']) or (d > 0 and l <= pos['sl']):
                px = max(pos['sl'], o + sp) if d < 0 else min(pos['sl'], o)
                trades.append(dict(pos, t1=t, exit=px, res='SL')); pos = None
                if px * d < trades[-1]['entry'] * d:
                    if lossDay != t.date(): lossDay, lossN = t.date(), 0
                    lossN += 1
            elif (d < 0 and l + sp <= pos['tp']) or (d > 0 and h >= pos['tp']):
                trades.append(dict(pos, t1=t, exit=pos['tp'], res='TP')); pos = None
            elif P.get('p1') and not pos.get('pd'):
                r = abs(pos['entry'] - pos['sl0']); lvl1 = pos['entry'] + d * P.get('p1r', 1.0) * r
                if (d < 0 and l + sp <= lvl1) or (d > 0 and h >= lvl1):
                    pos['pd'] = True; pos['real'] = P['p1'] * d * (lvl1 - pos['entry']); pos['rem'] = 1 - P['p1']
                    pos['sl'] = pos['entry'] + d * P.get('p1be', 0.0) * r
            elif P['be'] and not pos['be']:
                r = abs(pos['entry'] - pos['sl0'])
                if (d < 0 and l + sp <= pos['entry'] - P['be'] * r) or (d > 0 and h >= pos['entry'] + P['be'] * r):
                    pos['sl'] = pos['entry']; pos['be'] = True
            if pos and i - pos['i0'] >= P['maxhold']:
                trades.append(dict(pos, t1=t, exit=c if pos['d'] > 0 else c + sp, res='time')); pos = None
        # ---------- pending limit of the active setup
        blocked = t.hour in hb or (P.get('dstop') and lossDay == t.date() and lossN >= P['dstop'])
        if setup and not pos and setup.get('lim') is not None and not blocked:
            d, lim = setup['d'], setup['lim']
            hit = (h >= lim) if d < 0 else (l + sp <= lim)
            if hit:
                ep = max(lim, o) if d < 0 else min(lim, o + sp)
                pos = dict(d=d, entry=ep, sl=setup['sl'], sl0=setup['sl'], tp=setup['tp'], i0=i, t0=t, be=False,
                           wave=setup['wave'])
                setup = None
                # stopped inside the fill bar
                if (d < 0 and h + sp >= pos['sl']) or (d > 0 and l <= pos['sl']):
                    trades.append(dict(pos, t1=t, exit=pos['sl'], res='SL')); pos = None
        # ---------- confirmed swing points (pivot at i - piv)
        p = i - piv
        if p >= piv:
            if all(H[p] > H[p - k] for k in range(1, piv + 1)) and all(H[p] >= H[p + k] for k in range(1, piv + 1)):
                lastHigh = (H[p], p)
            if all(L[p] < L[p - k] for k in range(1, piv + 1)) and all(L[p] <= L[p + k] for k in range(1, piv + 1)):
                lastLow = (L[p], p)
        # ---------- break of the bigger swing (close beyond it)
        for d, sw in ((-1, lastLow), (1, lastHigh)):
            if sw is None:
                continue
            lvl, b = sw
            if (d < 0 and c < lvl) or (d > 0 and c > lvl):
                start = max(H[b:i + 1]) if d < 0 else min(L[b:i + 1])
                ext = min(L[b:i + 1]) if d < 0 else max(H[b:i + 1])
                if not pos and (setup is None or setup['d'] != d or P['newer']) and (BI is None or BI[i] == d):
                    setup = dict(d=d, start=start, ext=ext, i0=i, lim=None, wave=(start, ext))
                if d < 0: lastLow = None
                else: lastHigh = None
        # ---------- update the setup at the close: new extreme or a stall
        if setup and not pos:
            d = setup['d']
            newx = False
            if i > setup['i0']:
                newx = (l < setup['ext']) if d < 0 else (h > setup['ext'])
                if newx:
                    setup['ext'] = l if d < 0 else h; setup['lim'] = None
            st, ex = setup['start'], setup['ext']
            size = abs(st - ex)
            lv = lambda lab: st + (ex - st) * lab   # fib label: 0 % = start (0), 100 % = the extreme (1)
            if size >= P['minw'] * A[i]:
                stall = (i > setup['i0']) and not newx if P.get('stallfix') else (i > setup['i0']) and not ((l < ex) if d < 0 else (h > ex))
                if stall or setup['lim'] is not None:
                    e = lv(P['entry'])
                    sl = lv(P['stop']) - d * P['buf'] * A[i]
                    if P['tp_mode'] == 'R':
                        tp = e + d * P['tp'] * abs(e - sl)
                    else:
                        tp = lv(P['tp'])
                    # price already through the entry at this close → no chase
                    if (d < 0 and c < e) or (d > 0 and c > e):
                        setup.update(lim=e, sl=sl, tp=tp, wave=(st, ex))
            # invalidation: close beyond the stop level, or too old
            if setup['lim'] is not None and ((d < 0 and c > setup['sl']) or (d > 0 and c < setup['sl'])):
                setup = None
            elif i - setup['i0'] > P['maxw']:
                setup = None
    return trades


def money(tr):
    pts = tr.get('real', 0.0) + tr.get('rem', 1.0) * tr['d'] * (tr['exit'] - tr['entry'])
    return pts, pts * LOT_VALUE - COMM


def daily(trades, a, b):
    days = defaultdict(lambda: [0, 0, 0.0, 0.0])
    for tr in trades:
        if a <= tr['t1'] < b:
            pts, usd = money(tr)
            dd = days[tr['t1'].date()]
            dd[0] += 1; dd[1] += usd > 0; dd[2] += pts; dd[3] += usd
    return dict(sorted(days.items()))


def summary(trades, a, b):
    xs = [money(t)[1] for t in trades if a <= t['t1'] < b]
    d = daily(trades, a, b)
    n = len(xs); w = sum(1 for x in xs if x > 0)
    gp = sum(x for x in xs if x > 0); gl = -sum(x for x in xs if x < 0)
    dv = [v[3] for v in d.values()]
    return dict(n=n, win=round(100 * w / n, 1) if n else 0, net=round(gp - gl), pf=round(gp / gl, 2) if gl else 99,
                days=len(dv), green=round(100 * sum(1 for x in dv if x > 0) / len(dv)) if dv else 0,
                avg_day=round(sum(dv) / len(dv)) if dv else 0, worst=round(min(dv)) if dv else 0)
