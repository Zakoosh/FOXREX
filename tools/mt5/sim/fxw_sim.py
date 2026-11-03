"""FOXREX Waves EA 3.28 — bar-by-bar simulation on MT5 M1 exports.

A Python port of the EA's rules (CWaveEngine, daily zones, OnNewBar entries, pending limits,
profit protection, time exits). Prices are bid prices from the MT5 export; buys fill at ask
(bid + spread), sells at bid. Inside one M1 bar the order of prices is unknown, so the
simulation is conservative: the stop is checked before the targets, a limit filled in a bar
can be stopped in the same bar, and targets count only from the bar after the fill.

Usage: python3 fxw_sim.py M1.csv D1.csv [--room strong|all] [--from YYYY-MM-DD]
"""
import csv, math, sys, argparse, calendar, datetime as dt

# ---------------------------------------------------------------- settings (user test)
S = dict(
    dir='BOTH',            # FIRST / TREND / BOTH / BUY / SELL
    use_rsi=False, rsi_len=14, rsi_os=30, rsi_ob=70, rsi_ex=False,
    room='STRONG_BLOCK',   # STRONG_HALF / STRONG_BLOCK / ALL_BLOCK / OFF
    room1m=True, room_maj=False,
    entry='LIM',           # LIM_REJ / LIM / REJ
    elvl='START',          # FIB / MID / START / END
    ecust=0.559,
    profile='CUSTOM', tps=(2.5, 5.0, 7.0, 10.0),
    stop='POINTS', sl_min_c=3.0, sl_max_c=10.0, sl_atr=(1.5, 2.0), sl_buf=0.1, sl_skip=False,
    sl_tf={60: (1.5, 5), 300: (3, 10), 3599: (4, 10), 86399: (5, 15), 10**9: (10, 25)},
    protect='TP1',         # NEAR / LATE / STEP / TP1 / OFF
    part='OFF', part_pct=(25,),
    no_prog=15, max_bars=60,
    st_l=3, sw_len=5, rng_bars=0, f_entry=0.382, f_zone=0.618, f_inv=0.786, min_leg=1.5, max_wait=300,
    brk_close=False, overlap=True, tr_swing=True,
    ms=(1, 1, 1, 1), max_ent=2, re_cool=3, reinf=True, max_open=0,
    use_spk=True, spk_k=2.5, spk_look=3, exh=False, sm=False, macd_half=False, tl=False,
    trade_dl=True, dl_once=2, dl_min_w=2.0, dl_range=3.0, dl_merge=0.8, dl_swing=True, dl_step=0.0,
    use_rev=True, rev_light=False, trade_maj=True, maj_secs=900,
    base_lot=1.0, lot_stars=True, lot1m=False, lot1=(3.0, 5.0),
    lot_value=100.0, commission=6.0, spread_default=0.30, warmup=1500,
)
TF = 60


def p_tp(s, i, a):
    if S['profile'] == 'ATR':
        return (0.7, 1.4, 2.1, 3.5)[i] * a
    if S['profile'] == 'CUSTOM':
        return S['tps'][i]
    t = (1, 2, 3, 5) if s <= 60 else (2.5, 5, 10, 15) if s <= 300 else (2.5, 5, 10, 20) if s <= 1800 else (5, 10, 20, 40) if s < 86400 else (10, 20, 40, 80)
    return t[i]


def p_sl(s, a, mx):
    if S['stop'] == 'ATR':
        return S['sl_atr'][1 if mx else 0] * a
    if S['profile'] == 'ATR':
        return (3.5 if mx else 1.0) * a
    if S['profile'] == 'CUSTOM':
        return S['sl_max_c'] if mx else S['sl_min_c']
    for lim, v in S['sl_tf'].items():
        if s <= lim:
            return v[1 if mx else 0]


def clamp_sl(d, s, imp, a):
    return min(max(d, p_sl(max(s, 300) if imp else s, a, False)), p_sl(s, a, True))


def tp_arr(ep, d, s, imp, a):
    ps = max(s, 300) if imp else s
    t = [p_tp(ps, i, a) for i in range(4)]
    st = t[3] - t[2]
    return [ep + d * x for x in (t[0], t[1], t[2], t[3], t[3] + st, t[3] + 2 * st, t[3] + 3 * st)]


def zone_max(s):
    return 2.0 if s <= 60 else 4.0 if s <= 300 else 6.0 if s <= 900 else 8.0 if s <= 3600 else 10.0 if s < 86400 else 15.0


def cap_z(a, b, s):
    m, h, c = (a + b) / 2, abs(a - b), zone_max(s)
    k = c / h if h > c and h > 0 else 1.0
    return m + (a - m) * k, m + (b - m) * k


def prot_sl(d, en, sl, hits, tps):
    p = S['protect']
    if p == 'OFF' or hits < 1:
        return sl
    ns = None
    if p == 'NEAR':
        ns = tps[hits - 2] if hits >= 3 else (en if hits >= 2 else None)
    elif p == 'LATE':
        ns = tps[hits - 3] if hits >= 3 else (en if hits >= 2 else None)
    elif p == 'STEP':
        ns = tps[hits - 2] if hits >= 2 else en
    else:
        ns = en
    return ns if ns is not None and d * (ns - sl) > 0 else sl


class Zone:
    __slots__ = ('id', 'dir', 'p0', 'p1', 'b0', 'b1', 'bB', 'state', 'touched', 'entries', 'lastE', 'armed', 'stars', 'hold', 'brk', 'tch')

    def lvl(self, r):
        return self.p1 + r * (self.p0 - self.p1)


class Engine:
    def __init__(self, secs, live):
        self.secs, self.max_live = secs, live
        self.O, self.H, self.L, self.C, self.T, self.ATR, self.RSI, self.MH = [], [], [], [], [], [], [], []
        self.tr_sum = self.atr_v = self.gain = self.loss = 0.0
        self.lH = self.lL = 0.0
        self.lHB = self.lLB = -1
        self.sH1 = self.sL1 = 0.0
        self.sHB = self.sLB = False
        self.sTr, self.sBk, self.trend = 0, -1, 0
        self.e12 = self.e26 = self.eSg = 0.0
        self.wT, self.wHL, self.wLH, self.wTop, self.wBot = 0, 0.0, 0.0, 0.0, 0.0
        self.zones, self.next_id = [], 1

    @property
    def n(self):
        return len(self.C)

    def atr(self):
        return self.ATR[-1] if self.ATR else 0.0

    def piv_h(self, p, l, r):
        n = self.n
        if p - l < 0 or p + r >= n:
            return False
        H = self.H
        return all(H[p - i] < H[p] for i in range(1, l + 1)) and all(H[p + j] <= H[p] for j in range(1, r + 1))

    def piv_l(self, p, l, r):
        n = self.n
        if p - l < 0 or p + r >= n:
            return False
        L = self.L
        return all(L[p - i] > L[p] for i in range(1, l + 1)) and all(L[p + j] >= L[p] for j in range(1, r + 1))

    def range_bars(self):
        if S['rng_bars'] > 0:
            return S['rng_bars']
        s = self.secs
        return 30 if s <= 60 else max(round(1800 / s), 2) if s <= 300 else max(round(3600 / s), 2) if s <= 900 else 6

    def add_bar(self, t, o, h, l, c):
        k = self.n
        self.T.append(t); self.O.append(o); self.H.append(h); self.L.append(l); self.C.append(c)
        H, L, C = self.H, self.L, self.C
        tr = h - l if k == 0 else max(h - l, abs(h - C[k - 1]), abs(l - C[k - 1]))
        if k < 14:
            self.tr_sum += tr; self.atr_v = self.tr_sum / (k + 1)
        else:
            self.atr_v = (self.atr_v * 13 + tr) / 14
        self.ATR.append(self.atr_v)
        rl = max(S['rsi_len'], 2)
        ch = 0 if k == 0 else c - C[k - 1]
        g, ls = max(ch, 0), max(-ch, 0)
        if k <= rl:
            self.gain = (self.gain * k + g) / (k + 1); self.loss = (self.loss * k + ls) / (k + 1)
        else:
            self.gain = (self.gain * (rl - 1) + g) / rl; self.loss = (self.loss * (rl - 1) + ls) / rl
        self.RSI.append(100.0 if self.loss == 0 else 100 - 100 / (1 + self.gain / self.loss))
        if k == 0:
            self.e12 = self.e26 = c; self.eSg = 0
        else:
            self.e12 += 2 / 13 * (c - self.e12); self.e26 += 2 / 27 * (c - self.e26)
        mc = self.e12 - self.e26
        self.eSg = mc if k == 0 else self.eSg + 0.2 * (mc - self.eSg)
        self.MH.append(mc - self.eSg)
        sw = S['sw_len']; p = k - sw
        if self.piv_h(p, sw, sw):
            self.sH1, self.sHB = H[p], False
        if self.piv_l(p, sw, sw):
            self.sL1, self.sLB = L[p], False
        if self.sH1 > 0 and not self.sHB and c > self.sH1:
            self.sHB, self.sTr, self.sBk = True, 1, k
        if self.sL1 > 0 and not self.sLB and c < self.sL1:
            self.sLB, self.sTr, self.sBk = True, -1, k
        sw_tr = 0 if (self.sBk < 0 or k - self.sBk > self.range_bars()) else self.sTr
        q = k - 1; a = self.atr()
        uN = dN = False
        stl = S['st_l']
        if self.piv_h(q, stl, 1):
            span = 60 if self.lHB < 0 else min(max(q - self.lHB, 1), 300)
            lo, lob, hc = L[q], q, C[q]
            for i in range(q, max(q - span, 0) - 1, -1):
                if L[i] < lo:
                    lo, lob = L[i], i
                hc = max(hc, C[i])
            if self.lHB < 0 or (H[q] > self.lH and (not S['brk_close'] or hc > self.lH)):
                uN, uP0, uB0, uP1, uB1 = True, lo, lob, H[q], q
            self.lH, self.lHB = H[q], q
        if self.piv_l(q, stl, 1):
            span = 60 if self.lLB < 0 else min(max(q - self.lLB, 1), 300)
            hi, hib, lc = H[q], q, C[q]
            for i in range(q, max(q - span, 0) - 1, -1):
                if H[i] > hi:
                    hi, hib = H[i], i
                lc = min(lc, C[i])
            if self.lLB < 0 or (L[q] < self.lL and (not S['brk_close'] or lc < self.lL)):
                dN, dP0, dB0, dP1, dB1 = True, hi, hib, L[q], q
            self.lL, self.lLB = L[q], q
        if uN:
            self.wTop = uP1
            if self.wT >= 0:
                self.wT, self.wHL = 1, uP0
        if dN:
            self.wBot = dP1
            if self.wT <= 0:
                self.wT, self.wLH = -1, dP0
        if self.wT == 1 and self.wHL > 0 and c < self.wHL:
            self.wT, self.wLH = -1, (self.wTop if self.wTop > 0 else h)
        elif self.wT == -1 and self.wLH > 0 and c > self.wLH:
            self.wT, self.wHL = 1, (self.wBot if self.wBot > 0 else l)
        self.trend = sw_tr if S['tr_swing'] else self.wT
        if dN and abs(dP0 - dP1) >= S['min_leg'] * a:
            self.add_zone(-1, dP0, dB0, dP1, dB1)
        if uN and abs(uP0 - uP1) >= S['min_leg'] * a:
            self.add_zone(1, uP0, uB0, uP1, uB1)
        for z in self.zones:
            self.update(z, k)
        self.zones = [z for z in self.zones if z.state < 10]

    def add_zone(self, d, p0, b0, p1, b1):
        if S['overlap']:
            na_, nb_ = cap_z(p1 + S['f_entry'] * (p0 - p1), p1 + S['f_zone'] * (p0 - p1), self.secs)
            for z in self.zones:
                if z.dir == d or z.state > 1:
                    continue
                oa, ob = cap_z(z.lvl(S['f_entry']), z.lvl(S['f_zone']), self.secs)
                if min(max(na_, nb_), max(oa, ob)) < max(min(na_, nb_), min(oa, ob)):
                    continue
                nW, oW = d == self.trend, z.dir == self.trend
                if (nW if nW != oW else abs(p0 - p1) >= abs(z.p0 - z.p1)):
                    z.state = 16
                else:
                    return
        live = sum(1 for z in self.zones if z.dir == d and z.state <= 1)
        for z in self.zones:
            if live < self.max_live:
                break
            if z.dir == d and z.state <= 1:
                z.state = 15; live -= 1
        z = Zone()
        z.id = self.next_id; self.next_id += 1
        z.dir, z.p0, z.p1, z.b0, z.b1, z.bB = d, p0, p1, b0, b1, self.n - 1
        z.state, z.touched, z.entries, z.lastE, z.armed = 0, False, 0, -1000, True
        z.stars, z.hold, z.brk, z.tch = 1, True, self.trend == d, False
        self.zones.append(z)

    def update(self, z, k):
        if z.state > 1:
            return
        a = self.atr()
        H, L, C = self.H, self.L, self.C
        if z.state == 0 and z.hold and k > z.bB:
            lg = abs(z.p1 - z.p0)
            hold = (H[k] <= z.p1 and L[k] >= z.p1 - 0.236 * lg) if z.dir > 0 else (L[k] >= z.p1 and H[k] <= z.p1 + 0.236 * lg)
            if hold and z.stars < 3:
                z.stars += 1
            if not hold or z.stars >= 3:
                z.hold = False
        zA, zB = cap_z(z.lvl(S['f_entry']), z.lvl(S['f_zone']), self.secs)
        zI, zM = z.lvl(S['f_inv']), (zA + zB) / 2
        if abs(z.p0 - z.p1) >= S['min_leg'] * a and k > z.b1:
            d = z.dir
            if not z.armed and (L[k] <= zM - p_tp(self.secs, 0, a) if d < 0 else H[k] >= zM + p_tp(self.secs, 0, a)):
                z.armed = True
            if (H[k] >= zA if d < 0 else L[k] <= zA) and not z.touched:
                z.touched, z.state = True, 1
            if (C[k] > zI if d < 0 else C[k] < zI):
                z.state = 13
        if z.state <= 1 and k - z.b1 > S['max_wait']:
            z.state = 14


# ---------------------------------------------------------------- daily zones
def build_daily(days, px, ca, tf):
    """days: completed D1 bars (oldest first) before today. Returns list of [lo, hi, w, B, S, T]."""
    if len(days) < S.get('min_days', 25) or px <= 0:
        return [], 0
    last = len(days) - 1
    dH, dL, dC = days[last][2], days[last][3], days[last][4]
    atrD = sum(max(days[i][2] - days[i][3], abs(days[i][2] - days[i - 1][4]), abs(days[i][3] - days[i - 1][4])) for i in range(last - 13, last + 1)) / 14
    e20 = e50 = days[0][4]
    for i in range(1, last + 1):
        e20 += (days[i][4] - e20) * 2 / 21; e50 += (days[i][4] - e50) * 2 / 51
    h20 = max(d[2] for d in days[max(0, last - 19):last + 1]); l20 = min(d[3] for d in days[max(0, last - 19):last + 1])
    # previous week (Mon–Sun before the current week)
    today = days[last][0] + dt.timedelta(days=1)
    wk0 = today - dt.timedelta(days=today.weekday())
    pw = [d for d in days if wk0 - dt.timedelta(days=7) <= d[0] < wk0]
    wH = max((d[2] for d in pw), default=0); wL = min((d[3] for d in pw), default=0)
    lim, pv = S['dl_range'] * atrD, (dH + dL + dC) / 3
    lv = []

    def add(p, w):
        if p > 0 and abs(p - px) <= lim:
            lv.append((p, w))
    add(dH, 3); add(dL, 3); add(dC, 1); add(pv, 1.5); add(2 * pv - dL, 1.5); add(2 * pv - dH, 1.5)
    add(pv + (dH - dL), 1); add(pv - (dH - dL), 1); add(wH, 2.5); add(wL, 2.5); add(h20, 2); add(l20, 2); add(e20, 1); add(e50, 1)
    if S['dl_swing']:
        fh = fl = 0
        for i in range(last - 2, 1, -1):
            if fh >= 4 and fl >= 4:
                break
            h, l_ = days[i][2], days[i][3]
            if fh < 4 and h > days[i - 1][2] and h > days[i - 2][2] and h >= days[i + 1][2] and h >= days[i + 2][2]:
                add(h, 1.5); fh += 1
            if fl < 4 and l_ < days[i - 1][3] and l_ < days[i - 2][3] and l_ <= days[i + 1][3] and l_ <= days[i + 2][3]:
                add(l_, 1.5); fl += 1
    step = S['dl_step'] if S['dl_step'] > 0 else 10 ** math.floor(math.log10(px)) / 20
    lo1 = math.floor(px / step) * step; st2 = step * 2; lo2 = math.floor(px / st2) * st2
    add(lo1, 0.5); add(lo1 + step, 0.5); add(lo2, 1); add(lo2 + st2, 1)
    lv.sort(key=lambda x: x[0])
    tol = max(ca * S['dl_merge'], 0.01 * 5); zcap = zone_max(tf) * 0.6
    zs = []
    for p, w in lv:
        if zs and p - zs[-1][1] <= tol and p - zs[-1][0] <= zcap:
            zs[-1][1] = p; zs[-1][2] += w
        else:
            zs.append([p, p, w])
    pad = tol * 0.25
    return [[z[0] - pad, z[1] + pad, z[2], 0, 0, -1000] for z in zs], atrD


# ---------------------------------------------------------------- simulation
class Pos:
    __slots__ = ('d', 'entry', 'sl', 'tps', 'hits', 'lots', 'kind', 'zid', 'k0', 't0', 'exit', 't1', 'res', 'src', 'stars', 'rem', 'real', 'pts')


def lots_for(stars, kf):
    sc = min(max(stars, 1), 4)
    f = (1 + 0.5 * (sc - 1) if S['lot_stars'] else 1.0) * kf
    v = S['base_lot'] * f
    if S['lot1m'] and TF <= 60:
        a, b = S['lot1']
        v = (a + (b - a) * (sc - 1) / 3 if S['lot_stars'] else a) * kf
    return max(round(math.floor(v / 0.01 + 1e-9) * 0.01, 2), 0.01)


def load_mt5(path):
    rows = []
    with open(path, newline='', encoding='utf-8-sig') as f:
        rd = csv.reader(f, delimiter='\t' if '\t' in f.readline() else ',')
        f.seek(0); next(rd)
        for r in rd:
            if len(r) < 6:
                continue
            d = r[0].strip().replace('.', '-'); tm = r[1].strip() if ':' in r[1] else '00:00:00'
            t = dt.datetime.fromisoformat(d + ' ' + (tm if len(tm) > 5 else tm + ':00'))
            sp = float(r[8]) if len(r) > 8 and r[8] not in ('', None) else None
            rows.append((t, float(r[2]), float(r[3]), float(r[4]), float(r[5]), sp))
    return rows


def run(m1, d1, start=None, point=0.01):
    eng, maj = Engine(TF, 2), Engine(S['maj_secs'], 1)
    days = sorted(d1, key=lambda r: r[0])
    trades, positions, pendings = [], [], {}   # pendings: key -> dict
    dz, day_key = [], None
    mblk = None
    mstate = dict(sDnK=-1, sUpK=-1)
    res_log = []

    def zone_by(kind, zid):
        src = eng if kind == 'L' else maj
        for z in src.zones:
            if z.id == zid:
                return z
        return None

    def on_fill(kind, zid, k):
        z = zone_by(kind, zid)
        if z:
            z.entries += 1; z.lastE = k

    def on_close(kind, zid, before_tp1):
        z = zone_by(kind, zid)
        if z:
            z.armed = False
            if before_tp1:
                z.entries = S['max_ent']

    def close(p, px, t, res):
        p.exit, p.t1, p.res = px, t, res
        p.pts = p.real + p.rem * p.d * (px - p.entry)
        positions.remove(p)
        trades.append(p)
        on_close(p.kind, p.zid, p.hits == 0)

    def open_pos(d, ep, dist, stars, kind, zid, imp, kf, k, t, src):
        a = eng.atr()
        p = Pos()
        p.d, p.entry, p.sl = d, ep, ep - d * dist
        p.tps = tp_arr(ep, d, TF, imp, a)
        p.hits, p.lots, p.kind, p.zid, p.k0, p.t0, p.src, p.stars = 0, lots_for(stars, kf), kind, zid, k, t, src, stars
        p.rem, p.real = 1.0, 0.0
        positions.append(p)
        on_fill(kind, zid, k)
        return p

    for idx, (t, o, h, l, c, spr) in enumerate(m1):
        sp = (spr * point) if spr is not None else S['spread_default']
        live = idx >= S['warmup'] and (start is None or t >= start)
        k_next = eng.n  # index this bar will get
        # ---- 1 · during the bar: pending fills, stops, targets (orders from the previous bar close)
        if live:
            for key, po in list(pendings.items()):
                d, lev = po['d'], po['level']
                filled = (l + sp <= lev) if d > 0 else (h >= lev)
                if filled:
                    ep = min(lev, o + sp) if d > 0 else max(lev, o)   # a gap through the limit fills at the open
                    p = open_pos(d, ep, po['dist'], po['stars'], po['kind'], po['zid'], po['imp'], po['kf'], k_next, t, po['src'])
                    p.sl = lev - d * po['dist'] if abs(ep - lev) < 1e-9 else ep - d * po['dist']
                    del pendings[key]
                    # stopped inside the fill bar
                    if (d > 0 and l <= p.sl) or (d < 0 and h + sp >= p.sl):
                        close(p, p.sl, t, 'SL')
            for p in list(positions):
                if p.k0 == k_next:
                    continue
                d = p.d
                bid_lo, bid_hi, ask_lo, ask_hi = l, h, l + sp, h + sp
                stop_hit = bid_lo <= p.sl if d > 0 else ask_hi >= p.sl
                if stop_hit:
                    px = min(p.sl, o) if d > 0 else max(p.sl, o + sp)
                    close(p, px, t, 'SL' if p.hits == 0 else 'TP%d' % p.hits)
                    continue
                before = p.hits
                while p.hits < 7 and (bid_hi >= p.tps[p.hits] if d > 0 else ask_lo <= p.tps[p.hits]):
                    if S['part'] == 'ALL' and p.hits < len(S['part_pct']):
                        f = min(S['part_pct'][p.hits] / 100.0, p.rem)
                        p.real += f * d * (p.tps[p.hits] - p.entry); p.rem -= f
                    p.hits += 1
                if p.rem <= 1e-9:
                    close(p, p.tps[p.hits - 1], t, 'TP%d (all parts)' % p.hits); continue
                if p.hits == 7:
                    close(p, p.tps[6], t, 'TP7'); continue
                if p.hits > before:
                    p.sl = prot_sl(d, p.entry, p.sl, p.hits, p.tps)
                    if (c <= p.sl) if d > 0 else (c + sp >= p.sl):
                        close(p, p.sl, t, 'TP%d' % p.hits)
        # ---- 2 · bar close: engines, day, time exits, entries
        eng.add_bar(t, o, h, l, c)
        ts = calendar.timegm(t.timetuple())
        blk = ts // S['maj_secs']
        if mblk is not None and blk != mblk[0]:
            maj.add_bar(*mblk[1:]); mblk = None          # a block cut short by a gap
        if mblk is None:
            mblk = [blk, t - dt.timedelta(seconds=ts % S['maj_secs']), o, h, l, c]
        else:
            mblk[3] = max(mblk[3], h); mblk[4] = min(mblk[4], l); mblk[5] = c
        if (ts + TF) % S['maj_secs'] == 0:
            maj.add_bar(*mblk[1:]); mblk = None
        dk = t.date()
        if dk != day_key:
            day_key = dk
            past = [r for r in days if r[0] < dk]
            dz, _ = build_daily(past[-80:], o, eng.atr() or 1.0, TF)
        k = eng.n - 1
        if live:
            for p in list(positions):
                bars = k - p.k0
                if (S['no_prog'] > 0 and p.hits == 0 and bars >= S['no_prog']) or (p.hits < 2 and bars >= S['max_bars']):
                    close(p, c if p.d > 0 else c + sp, t, '⌛' if p.hits == 0 else 'TP%d' % p.hits)
        on_new_bar(eng, maj, dz, k, t, live, positions, pendings, open_pos, sp, mstate)
    return trades, positions


def busy(positions):
    unprot = any(p.d * (p.sl - p.entry) < 0 for p in positions)
    n = len(positions); d = positions[-1].d if positions else 0
    mo = S['max_open']
    bB = unprot or (mo > 0 and n >= mo) or (n > 0 and (d < 0 or not S['reinf']))
    bS = unprot or (mo > 0 and n >= mo) or (n > 0 and (d > 0 or not S['reinf']))
    return bB, bS


def on_new_bar(eng, maj, dz, k, t, live, positions, pendings, open_pos, sp, ms):
    if k < 30:
        return
    a = eng.atr(); O0, H0, L0, C0 = eng.O[k], eng.H[k], eng.L[k], eng.C[k]
    spk = any(eng.H[k - i] - eng.L[k - i] > S['spk_k'] * eng.ATR[k - i - 1] for i in range(S['spk_look']) if k - i >= 1)
    spk_block = S['use_spk'] and spk
    rsiV = eng.RSI[k]
    rec = eng.RSI[max(0, k - 9):k + 1]
    osR, obR = min(rec) <= S['rsi_os'], max(rec) >= S['rsi_ob']
    room = S['room']
    rm_strong, rm_half = room in ('STRONG_HALF', 'STRONG_BLOCK'), room == 'STRONG_HALF'
    supHi = resLo = 0
    for z in dz:
        if rm_strong and z[2] < S['dl_min_w']:
            continue
        if z[1] < C0 and (supHi == 0 or z[1] > supHi):
            supHi = z[1]
        if z[0] > C0 and (resLo == 0 or z[0] < resLo):
            resLo = z[0]
    majB = majS = False
    for z in maj.zones:
        if z.state > 1:
            continue
        zA, zB = cap_z(z.lvl(S['f_entry']), z.lvl(S['f_zone']), maj.secs)
        if (L0 <= zA) if z.dir > 0 else (H0 >= zA):
            z.tch = True
        zI = z.lvl(S['f_inv'])
        act = (z.state == 1 or z.tch) and ((zI < C0 < z.p1) if z.dir > 0 else (z.p1 < C0 < zI))
        if act:
            if z.dir > 0: majB = True
            else: majS = True
    need = p_tp(TF, 1 if (S['room1m'] and TF <= 60) else 0, a)
    nearRes = (resLo != 0 and resLo - C0 < need) or majS
    nearSup = (supHi != 0 and C0 - supHi < need) or majB
    roomB = room == 'OFF' or rm_half or not nearRes
    roomS = room == 'OFF' or rm_half or not nearSup
    kRB, kRS = (0.5 if rm_half and nearRes else 1.0), (0.5 if rm_half and nearSup else 1.0)
    rsiB = not S['use_rsi'] or rsiV <= S['rsi_ob']
    rsiS = not S['use_rsi'] or rsiV >= S['rsi_os']
    trend = eng.trend
    okB, okS = roomB, roomS
    dmode = S['dir']
    trFirst = dmode == 'FIRST'; trOn = dmode == 'TREND' or trFirst
    alB, alS = dmode != 'SELL', dmode != 'BUY'
    okBZ = okB and (trend >= 0 if trOn else alB); okSZ = okS and (trend <= 0 if trOn else alS)
    bB, bS = busy(positions) if live else (True, True)
    rb = eng.range_bars()

    def mkt(d, dist, st, kind, zid, imp, kf, src):
        ep = C0 + sp if d > 0 else C0
        open_pos(d, ep, dist, st, kind, zid, imp, kf, k + 1, t, src)

    # 1 · reversal at strong zones
    if live and S['use_rev'] and not spk_block:
        lo10 = min(eng.L[k - 10:k]); hi10 = max(eng.H[k - 10:k])
        rvB = L0 < lo10 and C0 > O0 and (C0 > eng.H[k - 1] or min(O0, C0) - L0 >= 0.5 * (H0 - L0))
        rvS = H0 > hi10 and C0 < O0 and (C0 < eng.L[k - 1] or H0 - max(O0, C0) >= 0.5 * (H0 - L0))
        if rvB or rvS:
            d = 1 if rvB else -1
            okR = (alB and not bB and rsiB and roomB) if d > 0 else (alS and not bS and rsiS and roomS)
            hit, hitM = -1, None
            if okR:
                for j, z in enumerate(dz):
                    if z[2] < S['dl_min_w'] or (z[3] if d > 0 else z[4]) >= S['dl_once']:
                        continue
                    lo, hi = z[0], z[1]
                    if (L0 <= hi and L0 >= lo - a and C0 > (lo + hi) / 2) if d > 0 else (H0 >= lo and H0 <= hi + a and C0 < (lo + hi) / 2):
                        hit = j; break
            if okR and hit < 0:
                for z in maj.zones:
                    if z.state > 1 or z.dir != d or z.entries >= S['max_ent']:
                        continue
                    zA, zB = cap_z(z.lvl(S['f_entry']), z.lvl(S['f_zone']), maj.secs)
                    lo, hi = min(zA, zB), max(zA, zB)
                    if (L0 <= hi and L0 >= lo - a and C0 > (lo + hi) / 2) if d > 0 else (H0 >= lo and H0 <= hi + a and C0 < (lo + hi) / 2):
                        hitM = z; break
            if hit >= 0 or hitM:
                dist = clamp_sl(C0 - (L0 - S['sl_buf'] * a) if d > 0 else (H0 + S['sl_buf'] * a) - C0, TF, True, a)
                st = min(3 + ((1 if osR else 0) if d > 0 else (1 if obR else 0)), 4)
                if hit >= 0:
                    dz[hit][5] = k; dz[hit][3 if d > 0 else 4] += 1
                else:
                    hitM.entries += 1; hitM.lastE = k
                mkt(d, dist, st, 'R', hitM.id if hitM else 0, True, kRB if d > 0 else kRS, 'reversal')
                bB = bS = True
    # 2 · daily zone rejection
    if live and S['trade_dl'] and not spk_block and not (bB and bS):
        hc12 = max(eng.C[k - 12:k]); lc12 = min(eng.C[k - 12:k])
        lw3 = min(eng.L[k - 2:k + 1]); hg3 = max(eng.H[k - 2:k + 1])
        for j, z in enumerate(dz):
            if z[2] < S['dl_min_w'] or k - z[5] < 10:
                continue
            lo, hi = z[0], z[1]
            bR = not bB and okBZ and rsiB and z[3] < S['dl_once'] and lo < C0 and hc12 > hi and lw3 <= hi and C0 > hi and C0 > O0
            sR = not bS and okSZ and rsiS and z[4] < S['dl_once'] and hi > C0 and lc12 < lo and hg3 >= lo and C0 < lo and C0 < O0
            if bR or sR:
                d = 1 if bR else -1
                dist = clamp_sl(C0 - (min(lo, L0) - S['sl_buf'] * a) if d > 0 else (max(hi, H0) + S['sl_buf'] * a) - C0, TF, True, a)
                st = min((3 if z[2] >= 4 else 2) + ((1 if osR else 0) if d > 0 else (1 if obR else 0)), 4)
                z[5] = k; z[3 if d > 0 else 4] += 1
                mkt(d, dist, st, 'D', j, True, kRB if d > 0 else kRS, 'daily zone')
                bB = bS = True
                break
    # 3 · wave zones (local + major): rejection at close, pending limits
    want = {}
    for pas in (0, 1):
        if pas == 1 and not S['trade_maj']:
            break
        src = eng if pas == 0 else maj
        for zz in src.zones:
            capS = TF if pas == 0 else maj.secs
            imp = pas == 1; kind = 'L' if pas == 0 else 'M'
            zA, zB = cap_z(zz.lvl(S['f_entry']), zz.lvl(S['f_zone']), capS); zI = zz.lvl(S['f_inv'])
            el = S['elvl']
            level = zA if el == 'START' else zB if el == 'END' else (zA + zB) / 2 if el == 'MID' else zz.lvl(S['ecust'])
            d = zz.dir
            valid = abs(zz.p0 - zz.p1) >= S['min_leg'] * (a if pas == 0 else maj.atr())
            if not trOn:
                tok = alB if d > 0 else alS
            elif pas == 1:
                tok = trend >= 0 if d > 0 else trend <= 0
            else:
                tok = d == trend or (trFirst and trend != 0) or (trend == 0 and (zz.brk or k - zz.bB <= rb))
            kf = (0.5 if (pas == 0 and trOn and trend == 0 and not (zz.brk or k - zz.bB <= rb)) else 1.0) * (kRB if d > 0 else kRS)
            st = zz.stars if pas == 0 else 2
            st = min(st + ((1 if osR else 0) if d > 0 else (1 if obR else 0)), 4)
            filt = (okB if d > 0 else okS) and (rsiB if d > 0 else rsiS)
            ms_ = S['ms'][0] if TF <= 60 else S['ms'][1]
            zone_open = any(p.kind == kind and p.zid == zz.id for p in positions)
            can = (zz.state <= 1 and valid and (pas == 1 or k > zz.bB) and zz.armed and (pas == 1 or zz.stars >= ms_)
                   and zz.entries < S['max_ent'] and k - zz.lastE >= S['re_cool'] and tok and filt and not spk_block
                   and not (bB if d > 0 else bS) and not (live and zone_open))
            if S['sl_skip'] and abs(level - (zI - d * S['sl_buf'] * a)) > p_sl(TF, a, True):
                can = False
            if not live:
                hitL = H0 >= level if d < 0 else L0 <= level
                if zz.state <= 1 and valid and zz.armed and hitL and S['entry'] != 'REJ' and (k > zz.bB if pas == 0 else True):
                    zz.entries += 1; zz.lastE = k; zz.armed = False
                continue
            inZone = H0 >= zA if d < 0 else L0 <= zA
            rej = (C0 < zB if d < 0 else C0 > zB) and ((C0 > O0 or min(O0, C0) - L0 >= 0.4 * (H0 - L0)) if d > 0 else (C0 < O0 or H0 - max(O0, C0) >= 0.4 * (H0 - L0)))
            near = C0 >= zA - abs(zA - zB) if d < 0 else C0 <= zA + abs(zA - zB)
            invalid = C0 > zI if d < 0 else C0 < zI
            hitLvl = H0 >= level if d < 0 else L0 <= level
            if can and S['entry'] != 'LIM' and inZone and rej and near and not invalid and not (S['entry'] == 'LIM_REJ' and hitLvl):
                dist = clamp_sl(abs(C0 - ((max(zI, H0) if d < 0 else min(zI, L0)) - d * S['sl_buf'] * a)), TF, imp, a)
                mkt(d, dist, st, kind, zz.id, imp, kf, kind + ' zone rejection')
                bB = bS = True; can = False
            if can and S['entry'] != 'REJ':
                dist = clamp_sl(abs(level - (zI - d * S['sl_buf'] * a)), TF, imp, a)
                beyond = (C0 + sp <= level) if d > 0 else (C0 >= level)
                if beyond:
                    mkt(d, dist, st, kind, zz.id, imp, kf, kind + ' zone (market)')
                    bB = bS = True
                else:
                    want[(kind, zz.id)] = dict(d=d, level=level, dist=dist, stars=st, kind=kind, zid=zz.id, imp=imp, kf=kf, src=kind + ' zone limit')
    if live:
        pendings.clear(); pendings.update(want)


def report(trades, label, start):
    tr = [p for p in trades if start is None or p.t1 >= start]
    rows = []
    won = lost = won_u = lost_u = 0.0; w = l_ = 0
    for p in tr:
        pts = p.pts
        usd = pts * S['lot_value'] * p.lots - S['commission'] * p.lots
        rows.append((p, pts, usd))
        if usd > 0: w += 1; won += pts; won_u += usd
        else: l_ += 1; lost += -pts; lost_u += -usd
    n = len(tr)
    print(f'\n=== {label}: {n} trades · win {w} · loss {l_} · win% {100 * w / n if n else 0:.0f}')
    print(f'    points  won +{won:.1f}  lost -{lost:.1f}  net {won - lost:+.1f}')
    print(f'    $       won +{won_u:,.0f}  lost -{lost_u:,.0f}  net {won_u - lost_u:+,.0f}')
    return rows


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('m1'); ap.add_argument('d1')
    ap.add_argument('--room', default='strong'); ap.add_argument('--from', dest='frm')
    ap.add_argument('--csv', default='trades.csv')
    ar = ap.parse_args()
    S['room'] = {'strong': 'STRONG_BLOCK', 'all': 'ALL_BLOCK', 'off': 'OFF'}[ar.room]
    m1 = load_mt5(ar.m1)
    if ar.d1 == 'from-m1':
        # daily bars built from the M1 file (server days); fewer days than a D1 export
        agg = {}
        for t, o, h, l, c, _ in m1:
            d = t.date()
            if d not in agg: agg[d] = [d, o, h, l, c]
            else: a_ = agg[d]; a_[2] = max(a_[2], h); a_[3] = min(a_[3], l); a_[4] = c
        d1 = [tuple(v) for v in sorted(agg.values())]
        S['min_days'] = 15
    else:
        d1 = [(r[0].date(),) + r[1:5] for r in load_mt5(ar.d1)]
    dec = max(len(str(r[4]).split('.')[-1]) for r in m1[:200])
    point = 10 ** -min(dec, 3)
    start = dt.datetime.fromisoformat(ar.frm) if ar.frm else None
    trades, openp = run(m1, d1, start, point)
    rows = report(trades, 'EA simulation (room=%s)' % ar.room, start)
    with open(ar.csv, 'w', newline='') as f:
        wr = csv.writer(f)
        wr.writerow(['open', 'close', 'side', 'source', 'stars', 'lots', 'entry', 'exit', 'result', 'points', 'usd'])
        for p, pts, usd in rows:
            wr.writerow([p.t0, p.t1, 'BUY' if p.d > 0 else 'SELL', p.src, p.stars, p.lots, round(p.entry, 2), round(p.exit, 2), p.res, round(pts, 2), round(usd, 2)])
    print('open at the end:', len(openp))
