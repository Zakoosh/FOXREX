//+------------------------------------------------------------------+
//| FOXREX Master EA v1.0                                            |
//| One EA, five engines: M1 · M5 · M15 · H1 · H4 (each on/off).     |
//| Attach it to ONE XAUUSD chart (any timeframe): every engine reads |
//| its own timeframe's bars and trades with its own magic number.    |
//|                                                                  |
//| Strategy (same as tools/mt5/sim/break_sim.py):                   |
//| swing high / low (pivot) → a close beyond it = break →           |
//| wave from the opposite extreme (0 %) to the extreme after the    |
//| break (100 %) → each stall bar arms a limit at the entry fib →   |
//| stop beyond the stop fib, target in R, optional partial →        |
//| time exit. Re-entry: after a trade the same break can arm again. |
//|                                                                  |
//| Settings per timeframe come from the simulations (Nov 2026):     |
//|  M1  swing 15 · entry 50 % · stop 15 % beyond start · 2R ·       |
//|      50 % closed at 0.7R then stop to entry · 240 bars · re-entry|
//|  M5  swing 4 · entry 50 % · stop 30 % beyond · 2R · 144 · re-entry|
//|  M15 swing 3 · entry 65.7 % · stop 30 % beyond · 2R · 48 · re-entry|
//|  H1  swing 4 · entry 50 % · stop 30 % beyond · 2R · 12 bars      |
//|  H4  swing 3 · entry 57.85 % · stop at start · 2R · 24 bars      |
//+------------------------------------------------------------------+
#property copyright "FOXREX · foxrex.co"
#property link      "https://foxrex.co"
#property version   "1.02"
#property description "FOXREX Master EA v1.02: break-of-structure engines on M1, M5, M15, H1 and H4 in one EA, settings per timeframe from the simulations."

#include <Trade/Trade.mqh>

enum ENUM_FXM_LOT
  {
   FXL_FIXED = 0,  // Fixed lots per timeframe (section 2)
   FXL_RISK  = 1   // Risk % of equity per trade
  };

//--- inputs: most important first
input group "⭐ 1 · Quick setup"
input ENUM_FXM_LOT InpLotMode = FXL_FIXED; // Size · mode
input double InpRiskPct   = 0.5;   // Size · risk per trade, % of equity (risk mode)
input double InpMaxLot    = 0;     // Size · max lot per trade (0 = broker max)
input bool   InpBuy       = true;  // Trade buys
input bool   InpSell      = true;  // Trade sells
input int    InpMaxOpen   = 0;     // Max open trades of all engines together (0 = no limit)
input int    InpMaxSpread = 0;     // Max spread in points to place an order (0 = off)

input group "2 · Timeframes (engine on/off · fixed lots)"
input bool   InpOnM1   = true;  // M1 engine  (≈ 10 trades / day)
input double InpLotM1  = 3.0;   // …M1 lots
input bool   InpOnM5   = true;  // M5 engine  (≈ 3 trades / day)
input double InpLotM5  = 3.0;   // …M5 lots
input bool   InpOnM15  = true;  // M15 engine (≈ 1.5 trades / day)
input double InpLotM15 = 2.0;   // …M15 lots
input bool   InpOnH1   = true;  // H1 engine  (≈ 1 trade / 2 days)
input double InpLotH1  = 1.0;   // …H1 lots
input bool   InpOnH4   = true;  // H4 engine  (≈ 1 trade / 2 weeks)
input double InpLotH4  = 0.5;   // …H4 lots

input group "3 · Account protection"
input double InpDayLossPct = 0;    // Stop all engines for the day after a loss of (% of balance at day start, 0 = off)
input double InpMinEquity  = 0;    // Stop all engines below this equity (0 = off)

input group "4 · Display & start-up"
input bool   InpDraw    = true;    // Draw the setup of the chart's timeframe engine
input bool   InpPush    = false;   // Push notification on entry / exit
input int    InpWarmup  = 3000;    // History bars replayed per engine at start
input long   InpMagic   = 271000;  // Magic base (engine magic = base + minutes: M1 271001, M5 271005 …)

//--- types
struct Swing { bool ok; double px; datetime t; };
struct Setup { bool ok; int d; double st, ex; datetime t0; bool armed; double lim, sl, tp; };
struct VPos  { bool on; int d; double e, sl, sl0, tp; datetime t0; bool part; };
struct Eng
  {
   bool     on;
   ENUM_TIMEFRAMES tf;
   string   tag;
   long     magic;
   double   lot;
   int      piv, maxw, hold;
   double   minw, entry, stop, buf, tp, p1, p1r, p1be;
   bool     reuse;
   bool     block[24];
   Swing    swH, swL;
   Setup    S;
   VPos     V;
   double   atr;
   bool     atrOk;
   datetime lastBar, failBar, placeBar;
   bool     ready;
  };

Eng    E[5];
CTrade trade;
ENUM_ORDER_TYPE_FILLING fillMkt = ORDER_FILLING_FOK;
bool   guard = false;
double dayBal = 0;
int    dayKey = -1;
int    drawEng = -1;

//+------------------------------------------------------------------+
void SetEng(int i, bool on, ENUM_TIMEFRAMES tf, string tag, double lot, int piv, double entry, double stop, double tp,
            double p1, double p1r, int bars, bool reuse)
  {
   E[i].on = on; E[i].tf = tf; E[i].tag = tag; E[i].lot = lot;
   E[i].magic = InpMagic + PeriodSeconds(tf) / 60;
   E[i].piv = piv; E[i].minw = 1.0; E[i].entry = entry; E[i].stop = stop; E[i].buf = 0.05; E[i].tp = tp;
   E[i].p1 = p1; E[i].p1r = p1r; E[i].p1be = 0; E[i].maxw = bars; E[i].hold = bars; E[i].reuse = reuse;
   ArrayInitialize(E[i].block, false);
   E[i].swH.ok = false; E[i].swL.ok = false; E[i].S.ok = false; E[i].V.on = false;
   E[i].atr = 0; E[i].atrOk = false; E[i].lastBar = 0; E[i].failBar = 0; E[i].placeBar = 0; E[i].ready = false;
  }

//+------------------------------------------------------------------+
//| helpers                                                          |
//+------------------------------------------------------------------+
int EngByMagic(long m) { for(int i = 0; i < 5; i++) if(E[i].on && E[i].magic == m) return i; return -1; }
int EngAny(long m)     { for(int i = 0; i < 5; i++) if(E[i].magic == m) return i; return -1; }   // also engines switched off (their open trades are still managed)

// open positions of all engines + pending orders of the other engines
int Busy(long self)
  {
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol && EngAny(PositionGetInteger(POSITION_MAGIC)) >= 0) n++;
     }
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong tk = OrderGetTicket(i);
      if(tk == 0) continue;
      long m = OrderGetInteger(ORDER_MAGIC);
      if(OrderGetString(ORDER_SYMBOL) == _Symbol && m != self && EngByMagic(m) >= 0) n++;
     }
   return n;
  }

bool HasPosition(long magic)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == magic) return true;
     }
   return false;
  }

ulong PendingTicket(long magic)
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong tk = OrderGetTicket(i);
      if(tk == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol || OrderGetInteger(ORDER_MAGIC) != magic) continue;
      long ty = OrderGetInteger(ORDER_TYPE);
      if(ty == ORDER_TYPE_BUY_LIMIT || ty == ORDER_TYPE_SELL_LIMIT) return tk;
     }
   return 0;
  }

// any order of this engine still in the terminal (also a market order being executed)
bool AnyOrder(long magic)
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong tk = OrderGetTicket(i);
      if(tk == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) == _Symbol && OrderGetInteger(ORDER_MAGIC) == magic) return true;
     }
   return false;
  }

void DeletePending(long magic)
  {
   ulong tk = PendingTicket(magic);
   while(tk != 0)
     {
      if(!trade.OrderDelete(tk)) break;
      tk = PendingTicket(magic);
     }
  }

double NormPx(double p)
  {
   double ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(ts <= 0) return NormalizeDouble(p, _Digits);
   return NormalizeDouble(MathRound(p / ts) * ts, _Digits);
  }

double NormLot(double v)
  {
   double st = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP), mn = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN),
          mx = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(InpMaxLot > 0) mx = MathMin(mx, InpMaxLot);
   v = MathFloor(v / st + 1e-9) * st;
   if(v < mn) return 0;
   return MathMin(v, mx);
  }

double LotFor(Eng &e, int d, double entry, double sl)
  {
   if(InpLotMode == FXL_FIXED) return NormLot(e.lot);
   double loss = 0;
   if(!OrderCalcProfit(d > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, _Symbol, 1.0, entry, sl, loss) || loss >= 0) return 0;
   double v = NormLot(AccountInfoDouble(ACCOUNT_EQUITY) * InpRiskPct / 100.0 / -loss);
   if(v == 0) Print("FXM ", e.tag, ": risk too small for the minimum lot");
   return v;
  }

datetime NextBlock(Eng &e)
  {
   datetime t = TimeCurrent();
   MqlDateTime m; TimeToStruct(t, m);
   datetime h0 = t - m.min * 60 - m.sec;
   for(int k = 1; k <= 24; k++)
     {
      MqlDateTime x; TimeToStruct(h0 + k * 3600, x);
      if(e.block[x.hour]) return h0 + k * 3600;
     }
   return 0;
  }

bool Protected()
  {
   MqlDateTime t; TimeToStruct(TimeCurrent(), t);
   int k = t.year * 400 + t.day_of_year;
   if(k != dayKey) { dayKey = k; dayBal = AccountInfoDouble(ACCOUNT_BALANCE); }
   if(InpMinEquity > 0 && AccountInfoDouble(ACCOUNT_EQUITY) < InpMinEquity) return true;
   if(InpDayLossPct > 0 && dayBal > 0 && AccountInfoDouble(ACCOUNT_EQUITY) <= dayBal * (1 - InpDayLossPct / 100.0)) return true;
   return false;
  }

void Notify(string m) { Print(m); if(InpPush) SendNotification(_Symbol + " " + m); }

//--- one running copy per symbol + magic: a second chart with the same EA would place every order twice
string LockName() { return "FXM_LOCK_" + _Symbol + "_" + IntegerToString(InpMagic); }
bool   lockOwner = false;

bool TakeLock()
  {
   string n = LockName();
   double me = (double)(ChartID() % 1000000000);
   if(GlobalVariableCheck(n))
     {
      double v = GlobalVariableGet(n);
      bool fresh = TimeLocal() - GlobalVariableTime(n) < 30;      // the other copy refreshes it every tick / second
      if(v != me && fresh) return false;
     }
   GlobalVariableSet(n, me);
   return true;
  }

bool KeepLock()
  {
   string n = LockName();
   double me = (double)(ChartID() % 1000000000);
   if(GlobalVariableCheck(n) && GlobalVariableGet(n) != me && TimeLocal() - GlobalVariableTime(n) < 30) return false;
   GlobalVariableSet(n, me);
   return true;
  }

// more than one limit order of an engine (e.g. left by a second copy) → keep the oldest, delete the rest
void Dedupe(long magic)
  {
   ulong keep = 0;
   for(int i = 0; i < OrdersTotal(); i++)
     {
      ulong tk = OrderGetTicket(i);
      if(tk == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol || OrderGetInteger(ORDER_MAGIC) != magic) continue;
      long ty = OrderGetInteger(ORDER_TYPE);
      if(ty != ORDER_TYPE_BUY_LIMIT && ty != ORDER_TYPE_SELL_LIMIT) continue;
      if(keep == 0 || tk < keep) keep = tk;
     }
   if(keep == 0) return;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong tk = OrderGetTicket(i);
      if(tk == 0 || tk == keep) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol || OrderGetInteger(ORDER_MAGIC) != magic) continue;
      long ty = OrderGetInteger(ORDER_TYPE);
      if(ty != ORDER_TYPE_BUY_LIMIT && ty != ORDER_TYPE_SELL_LIMIT) continue;
      if(trade.OrderDelete(tk)) Print("FXM: duplicate order #", tk, " deleted");
     }
  }

//+------------------------------------------------------------------+
//| one closed bar (shift s) of the engine's timeframe               |
//+------------------------------------------------------------------+
void Step(Eng &e, int s, bool pos)
  {
   ENUM_TIMEFRAMES tf = e.tf;
   double h = iHigh(_Symbol, tf, s), l = iLow(_Symbol, tf, s), c = iClose(_Symbol, tf, s);
   datetime t = iTime(_Symbol, tf, s);
   double pc = iClose(_Symbol, tf, s + 1);
   double tr = MathMax(h - l, MathMax(MathAbs(h - pc), MathAbs(l - pc)));
   e.atr = e.atrOk ? (e.atr * 13 + tr) / 14 : tr; e.atrOk = true;

   //--- confirmed swing points (pivot at s + piv)
   int p = s + e.piv;
   if(p + e.piv < Bars(_Symbol, tf))
     {
      double ph = iHigh(_Symbol, tf, p), pl = iLow(_Symbol, tf, p);
      bool isH = true, isL = true;
      for(int k = 1; k <= e.piv; k++)
        {
         if(!(ph > iHigh(_Symbol, tf, p + k)) || !(ph >= iHigh(_Symbol, tf, p - k))) isH = false;
         if(!(pl < iLow(_Symbol, tf, p + k))  || !(pl <= iLow(_Symbol, tf, p - k)))  isL = false;
        }
      datetime pt = iTime(_Symbol, tf, p);
      if(isH) { e.swH.ok = true; e.swH.px = ph; e.swH.t = pt; }
      if(isL) { e.swL.ok = true; e.swL.px = pl; e.swL.t = pt; }
     }

   //--- break of the latest swing (close beyond it): sell side first, then buy side
   for(int side = 0; side < 2; side++)
     {
      int d = side == 0 ? -1 : 1;
      bool   swOk = side == 0 ? e.swL.ok : e.swH.ok;
      double swPx = side == 0 ? e.swL.px : e.swH.px;
      datetime swT = side == 0 ? e.swL.t : e.swH.t;
      if(!swOk) continue;
      if((d < 0 && c < swPx) || (d > 0 && c > swPx))
        {
         if(side == 0) e.swL.ok = false; else e.swH.ok = false;
         int b = iBarShift(_Symbol, tf, swT);
         int cnt = b - s + 1;
         if(b < 0 || cnt < 1) continue;
         double hi = iHigh(_Symbol, tf, iHighest(_Symbol, tf, MODE_HIGH, cnt, s));
         double lo = iLow(_Symbol, tf, iLowest(_Symbol, tf, MODE_LOW, cnt, s));
         if(!pos)
           {
            e.S.ok = true; e.S.d = d; e.S.t0 = t; e.S.armed = false;
            e.S.st = d < 0 ? hi : lo;
            e.S.ex = d < 0 ? lo : hi;
           }
        }
     }

   //--- setup at the close: new extreme or a stall
   if(e.S.ok && !pos)
     {
      int d = e.S.d;
      bool newx = false;
      if(t > e.S.t0)
        {
         newx = d < 0 ? (l < e.S.ex) : (h > e.S.ex);
         if(newx) { e.S.ex = d < 0 ? l : h; e.S.armed = false; }
        }
      if(MathAbs(e.S.st - e.S.ex) >= e.minw * e.atr)
        {
         bool stall = (t > e.S.t0) && !newx;
         if(stall || e.S.armed)
           {
            double en = e.S.st + (e.S.ex - e.S.st) * e.entry;
            double sl = e.S.st + (e.S.ex - e.S.st) * e.stop - d * e.buf * e.atr;
            double tp = en + d * e.tp * MathAbs(en - sl);
            if((d < 0 && c < en) || (d > 0 && c > en))
              { e.S.armed = true; e.S.lim = en; e.S.sl = sl; e.S.tp = tp; }
           }
        }
      if(e.S.armed && ((d < 0 && c > e.S.sl) || (d > 0 && c < e.S.sl))) e.S.ok = false;
      else if(iBarShift(_Symbol, tf, e.S.t0) - s > e.maxw) e.S.ok = false;
     }
  }

void Filled(Eng &e)  // a trade came from the setup
  {
   if(e.reuse) e.S.armed = false;   // the same break may arm again on the next stall
   else        e.S.ok = false;      // one trade per break
  }

//+------------------------------------------------------------------+
//| history replay with the simulator's fill / exit rules            |
//+------------------------------------------------------------------+
void ReplayBar(Eng &e, int s)
  {
   ENUM_TIMEFRAMES tf = e.tf;
   double o = iOpen(_Symbol, tf, s), h = iHigh(_Symbol, tf, s), l = iLow(_Symbol, tf, s);
   double sp = MathMax(iSpread(_Symbol, tf, s) * _Point, 0.15);   // same spread floor as the simulations
   datetime t = iTime(_Symbol, tf, s);
   if(e.V.on && t > e.V.t0)
     {
      int d = e.V.d;
      bool out = false;
      if((d < 0 && h + sp >= e.V.sl) || (d > 0 && l <= e.V.sl)) out = true;
      else if((d < 0 && l + sp <= e.V.tp) || (d > 0 && h >= e.V.tp)) out = true;
      else if(e.p1 > 0 && !e.V.part)
        {
         double l1 = e.V.e + d * e.p1r * MathAbs(e.V.e - e.V.sl0);
         if((d < 0 && l + sp <= l1) || (d > 0 && h >= l1)) { e.V.part = true; e.V.sl = e.V.e + d * e.p1be * MathAbs(e.V.e - e.V.sl0); }
        }
      if(!out && iBarShift(_Symbol, tf, e.V.t0) - s >= e.hold) out = true;
      if(out) e.V.on = false;
     }
   MqlDateTime m; TimeToStruct(t, m);
   if(e.S.ok && e.S.armed && !e.V.on && !e.block[m.hour])
     {
      int d = e.S.d;
      if((d < 0 && h >= e.S.lim) || (d > 0 && l + sp <= e.S.lim))
        {
         e.V.on = true; e.V.d = d; e.V.e = d < 0 ? MathMax(e.S.lim, o) : MathMin(e.S.lim, o + sp);
         e.V.sl = e.S.sl; e.V.sl0 = e.S.sl; e.V.tp = e.S.tp; e.V.t0 = t; e.V.part = false;
         Filled(e);
         if((d < 0 && h + sp >= e.V.sl) || (d > 0 && l <= e.V.sl)) e.V.on = false;
        }
     }
  }

bool Warmup(Eng &e)
  {
   if(!SeriesInfoInteger(_Symbol, e.tf, SERIES_SYNCHRONIZED)) { iTime(_Symbol, e.tf, 0); return false; }
   int n = MathMin(InpWarmup, Bars(_Symbol, e.tf) - 2 * e.piv - 3);
   if(n < 2 * e.piv + 20) return false;
   e.swH.ok = false; e.swL.ok = false; e.S.ok = false; e.atrOk = false; e.V.on = false;
   for(int s = n; s >= 1; s--) { ReplayBar(e, s); Step(e, s, e.V.on); }
   if(e.V.on || HasPosition(e.magic)) Filled(e);
   e.V.on = false;
   e.lastBar = iTime(_Symbol, e.tf, 0);
   PrintFormat("FXM %s ready · %d bars · swing %d · entry %.4f · stop %.2f · %.1fR · partial %.0f%% at %.1fR · %d bars · re-entry %s · magic %I64d",
               e.tag, n, e.piv, e.entry, e.stop, e.tp, e.p1 * 100, e.p1r, e.hold, e.reuse ? "on" : "off", e.magic);
   return true;
  }

//+------------------------------------------------------------------+
//| pending order = the armed setup (when allowed)                   |
//+------------------------------------------------------------------+
void Sync(Eng &e)
  {
   bool pos = HasPosition(e.magic);
   if(pos && e.S.ok && e.S.armed) Filled(e);
   MqlDateTime now; TimeToStruct(iTime(_Symbol, e.tf, 0), now);
   bool want = e.S.ok && e.S.armed && !pos && !e.block[now.hour] && !guard
               && ((e.S.d > 0 && InpBuy) || (e.S.d < 0 && InpSell));
   if(want && InpMaxOpen > 0 && Busy(e.magic) >= InpMaxOpen) want = false;   // limit counts open trades and the other engines' orders
   Dedupe(e.magic);
   ulong tk = PendingTicket(e.magic);
   datetime bar0 = iTime(_Symbol, e.tf, 0);
   if(e.failBar == bar0) return;                                          // after a refused request: nothing more on this bar
   trade.SetExpertMagicNumber(e.magic);

   //--- no order wanted → remove ours (once; a refusal waits for the next bar)
   if(!want)
     {
      if(tk && !trade.OrderDelete(tk))
        {
         e.failBar = bar0;
         Print("FXM ", e.tag, " delete #", tk, " refused: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
        }
      return;
     }

   double lim = NormPx(e.S.lim), sl = NormPx(e.S.sl), tp = NormPx(e.S.tp);
   double ts = MathMax(SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE), _Point);
   datetime nb = NextBlock(e);
   ENUM_ORDER_TYPE_TIME tt = nb > 0 ? ORDER_TIME_SPECIFIED : ORDER_TIME_GTC;

   //--- our limit is there: move it only when the setup's levels changed (at most once per bar)
   if(tk)
     {
      if(!OrderSelect(tk)) return;
      bool same = MathAbs(OrderGetDouble(ORDER_PRICE_OPEN) - lim) <= 2 * ts && MathAbs(OrderGetDouble(ORDER_SL) - sl) <= 2 * ts
                  && MathAbs(OrderGetDouble(ORDER_TP) - tp) <= 2 * ts;
      long ty = OrderGetInteger(ORDER_TYPE);
      bool sideOk = (e.S.d < 0 && ty == ORDER_TYPE_SELL_LIMIT) || (e.S.d > 0 && ty == ORDER_TYPE_BUY_LIMIT);
      if(same && sideOk) return;
      if(e.placeBar == bar0) return;
      e.placeBar = bar0;
      bool ok = sideOk ? trade.OrderModify(tk, lim, sl, tp, tt, nb) : trade.OrderDelete(tk);
      if(!ok)
        {
         e.failBar = bar0;
         Print("FXM ", e.tag, (sideOk ? " move #" : " delete #"), tk, " refused: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription(),
               " · limit ", DoubleToString(lim, _Digits), " SL ", DoubleToString(sl, _Digits), " TP ", DoubleToString(tp, _Digits));
        }
      return;
     }

   //--- new order: one per engine per bar, never while another order of this engine is still in the terminal
   if(AnyOrder(e.magic) || e.placeBar == bar0) return;
   if(InpMaxSpread > 0 && SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) > InpMaxSpread) return;   // wait for a normal spread
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   string cm = "FXM " + e.tag;
   bool ok = false;
   double lots;
   e.placeBar = bar0;
   if(e.S.d < 0)
     {
      bool mkt = bid >= lim;                                   // already at / through the entry → fill now (as the simulator)
      lots = LotFor(e, -1, mkt ? bid : lim, sl);
      if(lots == 0) { e.failBar = bar0; return; }
      if(mkt) { trade.SetTypeFilling(fillMkt); ok = trade.Sell(lots, _Symbol, 0, sl, tp, cm); }
      else    { trade.SetTypeFilling(ORDER_FILLING_RETURN); ok = trade.SellLimit(lots, lim, _Symbol, sl, tp, tt, nb, cm); }
     }
   else
     {
      bool mkt = ask <= lim;
      lots = LotFor(e, 1, mkt ? ask : lim, sl);
      if(lots == 0) { e.failBar = bar0; return; }
      if(mkt) { trade.SetTypeFilling(fillMkt); ok = trade.Buy(lots, _Symbol, 0, sl, tp, cm); }
      else    { trade.SetTypeFilling(ORDER_FILLING_RETURN); ok = trade.BuyLimit(lots, lim, _Symbol, sl, tp, tt, nb, cm); }
     }
   trade.SetTypeFilling(fillMkt);
   if(!ok) { e.failBar = bar0; Print("FXM ", e.tag, " order refused: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription()); }
  }

//+------------------------------------------------------------------+
//| open positions: partial at x R, time exit                        |
//+------------------------------------------------------------------+
string GvName(long magic, ulong pid, string k) { return "FXM_" + IntegerToString(magic) + "_" + IntegerToString((long)pid) + "_" + k; }

void Manage(bool &newBar[])
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      long mg = PositionGetInteger(POSITION_MAGIC);
      int ei = EngAny(mg);
      if(ei < 0) continue;
      trade.SetExpertMagicNumber(mg);
      ulong pid = (ulong)PositionGetInteger(POSITION_IDENTIFIER);
      int d = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 1 : -1;
      double op = PositionGetDouble(POSITION_PRICE_OPEN), sl = PositionGetDouble(POSITION_SL), tp = PositionGetDouble(POSITION_TP);
      double vol = PositionGetDouble(POSITION_VOLUME);
      datetime ot = (datetime)PositionGetInteger(POSITION_TIME);
      if(!GlobalVariableCheck(GvName(mg, pid, "sl0"))) GlobalVariableSet(GvName(mg, pid, "sl0"), sl);
      double r = MathAbs(op - GlobalVariableGet(GvName(mg, pid, "sl0")));
      int since = iBarShift(_Symbol, E[ei].tf, ot);

      //--- time exit
      if(newBar[ei] && E[ei].hold > 0 && since - 1 >= E[ei].hold)
        {
         if(trade.PositionClose(tk)) { Notify("FXM " + E[ei].tag + " time exit"); continue; }
        }

      //--- partial close at x R (from the bar after the fill), then stop to entry + p1be × R
      if(E[ei].p1 > 0 && r > 0 && since >= 1 && !GlobalVariableCheck(GvName(mg, pid, "pd")))
        {
         double lvl = op + d * E[ei].p1r * r;
         double px = d > 0 ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         if((d > 0 && px >= lvl) || (d < 0 && px <= lvl))
           {
            double part = NormLot(vol * E[ei].p1);
            double mn = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
            if(part <= 0 || vol - part < mn - 1e-9)
              {
               GlobalVariableSet(GvName(mg, pid, "pd"), 1);
               Print("FXM ", E[ei].tag, ": size too small for a partial close, trade left unchanged");
               continue;
              }
            if(!GlobalVariableCheck(GvName(mg, pid, "pc")))
              {
               if(!trade.PositionClosePartial(tk, part)) continue;          // retry next tick
               GlobalVariableSet(GvName(mg, pid, "pc"), 1);
              }
            double nsl = NormPx(op + d * E[ei].p1be * r);
            if(!PositionSelectByTicket(tk) || !trade.PositionModify(tk, nsl, tp)) continue;   // retry next tick
            GlobalVariableSet(GvName(mg, pid, "pd"), 1);
            Notify("FXM " + E[ei].tag + " partial " + DoubleToString(part, 2) + " lots, stop to " + DoubleToString(nsl, _Digits));
           }
        }
     }
  }

//+------------------------------------------------------------------+
//| drawing (the engine of the chart's timeframe)                    |
//+------------------------------------------------------------------+
void HLine(string n, datetime t1, double p, color c, int style, string tip)
  {
   datetime t2 = TimeCurrent() + PeriodSeconds() * 10;
   if(ObjectFind(0, n) < 0) ObjectCreate(0, n, OBJ_TREND, 0, t1, p, t2, p);
   ObjectSetInteger(0, n, OBJPROP_TIME, 0, t1); ObjectSetDouble(0, n, OBJPROP_PRICE, 0, p);
   ObjectSetInteger(0, n, OBJPROP_TIME, 1, t2); ObjectSetDouble(0, n, OBJPROP_PRICE, 1, p);
   ObjectSetInteger(0, n, OBJPROP_COLOR, c); ObjectSetInteger(0, n, OBJPROP_STYLE, style);
   ObjectSetInteger(0, n, OBJPROP_RAY_RIGHT, false); ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetString(0, n, OBJPROP_TOOLTIP, tip);
  }

void DrawSetup()
  {
   if(!InpDraw || drawEng < 0) return;
   Setup S = E[drawEng].S;
   if(!S.ok) { ObjectsDeleteAll(0, "FXM_S_"); return; }
   HLine("FXM_S_0", S.t0, S.st, clrGray, STYLE_DOT, E[drawEng].tag + " wave start 0 %");
   HLine("FXM_S_1", S.t0, S.ex, clrGray, STYLE_DOT, E[drawEng].tag + " wave extreme 100 %");
   if(S.armed)
     {
      HLine("FXM_S_E", S.t0, S.lim, S.d > 0 ? clrDodgerBlue : clrOrangeRed, STYLE_SOLID, E[drawEng].tag + " entry");
      HLine("FXM_S_SL", S.t0, S.sl, clrRed, STYLE_DASH, E[drawEng].tag + " stop");
      HLine("FXM_S_TP", S.t0, S.tp, clrLimeGreen, STYLE_DASH, E[drawEng].tag + " target");
     }
   else { ObjectDelete(0, "FXM_S_E"); ObjectDelete(0, "FXM_S_SL"); ObjectDelete(0, "FXM_S_TP"); }
  }

void Status()
  {
   bool algo = TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) && MQLInfoInteger(MQL_TRADE_ALLOWED);
   string txt = "FOXREX Master v1.02 · " + _Symbol + (algo ? "" : "   ⚠ Algo Trading is OFF") + (guard ? "   ⚠ stopped by account protection" : "");
   for(int i = 0; i < 5; i++)
     {
      if(!E[i].on) continue;
      string st;
      if(!E[i].ready) st = "loading history …";
      else if(HasPosition(E[i].magic)) st = "in a trade";
      else if(E[i].S.ok && E[i].S.armed) st = (E[i].S.d > 0 ? "BUY limit " : "SELL limit ") + DoubleToString(E[i].S.lim, _Digits)
                                              + "  SL " + DoubleToString(E[i].S.sl, _Digits) + "  TP " + DoubleToString(E[i].S.tp, _Digits);
      else if(E[i].S.ok) st = (E[i].S.d > 0 ? "break up" : "break down") + " · waiting for a stall";
      else st = "waiting for a break";
      string sz = InpLotMode == FXL_FIXED ? DoubleToString(E[i].lot, 2) + " lot" : DoubleToString(InpRiskPct, 2) + "% risk";
      txt += "\n" + E[i].tag + " (" + sz + "): " + st;
     }
   Comment(txt);
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   //                 on        tf          tag   lot        swing entry   stop   R   partial    bars reuse
   SetEng(0, InpOnM1,  PERIOD_M1,  "M1",  InpLotM1,  15, 0.5,    -0.15, 2, 0.5, 0.7, 240, true);
   SetEng(1, InpOnM5,  PERIOD_M5,  "M5",  InpLotM5,  4,  0.5,    -0.30, 2, 0,   1,   144, true);
   SetEng(2, InpOnM15, PERIOD_M15, "M15", InpLotM15, 3,  0.657,  -0.30, 2, 0,   1,   48,  true);
   SetEng(3, InpOnH1,  PERIOD_H1,  "H1",  InpLotH1,  4,  0.5,    -0.30, 2, 0,   1,   12,  false);
   SetEng(4, InpOnH4,  PERIOD_H4,  "H4",  InpLotH4,  3,  0.5785,  0.00, 2, 0,   1,   24,  false);

   //--- only one copy may run per symbol (all five timeframes run inside it)
   if(!MQLInfoInteger(MQL_TESTER) && !TakeLock())
     {
      Alert("FOXREX Master is already running on another ", _Symbol, " chart. Use ONE chart only — it trades M1, M5, M15, H1 and H4 by itself.");
      return INIT_FAILED;
     }
   lockOwner = true;

   //--- several engines need a hedging account (each engine holds its own position)
   int onCount = 0;
   for(int i = 0; i < 5; i++) if(E[i].on) onCount++;
   if(onCount == 0) { Alert("FOXREX Master: all engines are off."); return INIT_PARAMETERS_INCORRECT; }
   if(AccountInfoInteger(ACCOUNT_MARGIN_MODE) != ACCOUNT_MARGIN_MODE_RETAIL_HEDGING && onCount > 1)
     {
      Alert("FOXREX Master: this is a NETTING account — only the first enabled engine will trade. Use a hedging account to run several timeframes.");
      bool first = true;
      for(int i = 0; i < 5; i++) if(E[i].on) { if(!first) E[i].on = false; first = false; }
     }

   drawEng = -1;
   for(int i = 0; i < 5; i++) if(E[i].on && E[i].tf == (ENUM_TIMEFRAMES)_Period) drawEng = i;
   for(int i = 0; i < 5; i++) if(E[i].on) iTime(_Symbol, E[i].tf, 0);   // ask the terminal to load each timeframe

   trade.SetDeviationInPoints(30);
   long fm = SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   fillMkt = (fm & SYMBOL_FILLING_FOK) ? ORDER_FILLING_FOK : (fm & SYMBOL_FILLING_IOC) ? ORDER_FILLING_IOC : ORDER_FILLING_RETURN;
   trade.SetTypeFilling(fillMkt);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   Comment("");
   if(lockOwner && GlobalVariableCheck(LockName()) && GlobalVariableGet(LockName()) == (double)(ChartID() % 1000000000)) GlobalVariableDel(LockName());
   if(reason == REASON_REMOVE || reason == REASON_PARAMETERS)
      for(int i = 0; i < 5; i++) if(E[i].on) DeletePending(E[i].magic);
   ObjectsDeleteAll(0, "FXM_S_");
  }

void OnTick()
  {
   if(!MQLInfoInteger(MQL_TESTER) && !KeepLock())
     {
      Comment("FOXREX Master: another chart runs this EA — this copy is idle. Remove it.");
      return;
     }
   guard = Protected();                   // every tick, so the day-start balance is taken at the day start
   bool nb[5];
   ArrayInitialize(nb, false);
   for(int i = 0; i < 5; i++)
     {
      if(!E[i].on) continue;
      if(!E[i].ready) { E[i].ready = Warmup(E[i]); continue; }
      datetime b = iTime(_Symbol, E[i].tf, 0);
      nb[i] = b != E[i].lastBar;
     }
   Manage(nb);
   for(int i = 0; i < 5; i++)
     {
      if(!E[i].on || !E[i].ready) continue;
      if(nb[i])
        {
         int from = E[i].lastBar > 0 ? iBarShift(_Symbol, E[i].tf, E[i].lastBar) - 1 : 1;   // every closed bar since the last one
         if(from < 1) from = 1;
         if(from > 500) from = 500;
         bool pos = HasPosition(E[i].magic);
         for(int s = from; s >= 1; s--) Step(E[i], s, pos);
         E[i].lastBar = iTime(_Symbol, E[i].tf, 0);
        }
      Sync(E[i]);
     }
   DrawSetup();
   Status();
  }

void OnTradeTransaction(const MqlTradeTransaction &tx, const MqlTradeRequest &rq, const MqlTradeResult &rs)
  {
   if(tx.type != TRADE_TRANSACTION_DEAL_ADD) return;
   if(!HistoryDealSelect(tx.deal)) return;
   if(HistoryDealGetString(tx.deal, DEAL_SYMBOL) != _Symbol) return;
   int ei = EngByMagic(HistoryDealGetInteger(tx.deal, DEAL_MAGIC));
   if(ei < 0) return;
   long en = HistoryDealGetInteger(tx.deal, DEAL_ENTRY);
   double pr = HistoryDealGetDouble(tx.deal, DEAL_PRICE);
   if(en == DEAL_ENTRY_IN)
     {
      Filled(E[ei]);
      Notify(StringFormat("FXM %s entry %s %.2f @ %s", E[ei].tag, HistoryDealGetInteger(tx.deal, DEAL_TYPE) == DEAL_TYPE_BUY ? "buy" : "sell",
                          HistoryDealGetDouble(tx.deal, DEAL_VOLUME), DoubleToString(pr, _Digits)));
     }
   else if(en == DEAL_ENTRY_OUT)
     {
      double pl = HistoryDealGetDouble(tx.deal, DEAL_PROFIT) + HistoryDealGetDouble(tx.deal, DEAL_COMMISSION) + HistoryDealGetDouble(tx.deal, DEAL_SWAP);
      Notify(StringFormat("FXM %s exit @ %s  P/L %.2f", E[ei].tag, DoubleToString(pr, _Digits), pl));
     }
  }
//+------------------------------------------------------------------+
