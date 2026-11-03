//+------------------------------------------------------------------+
//| FOXREX Break EA v1.0 — break of structure + retracement limit    |
//|                                                                  |
//| Same rules as the Python simulator (tools/mt5/sim/break_sim.py): |
//| 1. Swing high / low = pivot with PIV bars on each side.          |
//| 2. A candle CLOSES beyond the latest swing = the break.          |
//| 3. Wave: 0 % = the opposite extreme since the swing,             |
//|    100 % = the extreme after the break (moves with new extremes).|
//| 4. Each stall bar (no new extreme) arms / moves a limit at the   |
//|    entry fib; stop beyond the stop fib + buffer × ATR; target in |
//|    R. Only when the close is already on the right side of entry. |
//| 5. One trade at a time; the setup dies when filled, when a close |
//|    goes beyond the stop, or after MAX WAIT bars.                 |
//| 6. Optional partial close at x R, then stop to break-even.       |
//| 7. Time exit after MAX HOLD bars.                                |
//+------------------------------------------------------------------+
#property copyright "FOXREX · foxrex.co"
#property link      "https://foxrex.co"
#property version   "1.03"
#property description "FOXREX Break EA v1.03: break of structure, retracement limit, R targets. Presets from the 5m / 1m simulations."

#include <Trade/Trade.mqh>

enum ENUM_FXB_PRESET
  {
   FXB_V4_5M = 4,   // v4-5m · best overall, held up on unseen weeks (5m)
   FXB_V3_5M = 0,   // v3-5m · previous 5m preset
   FXB_V3_HW = 1,   // v3-5m · high win rate (5m chart)
   FXB_V2_1M = 2,   // v2 · 1m chart
   FXB_CUSTOM = 3   // Custom (section 3)
  };

//--- inputs: most important first
input group "⭐ 1 · Quick setup"
input ENUM_FXB_PRESET InpPreset = FXB_V4_5M; // Preset
input double InpRiskPct   = 1.0;   // Size · risk per trade, % of equity
input double InpFixedLot  = 0;     // Size · fixed lot instead (0 = use risk %)
input double InpMaxLot    = 0;     // Size · max lot per trade (0 = broker max)
input bool   InpBuy       = true;  // Trade buys
input bool   InpSell      = true;  // Trade sells
input int    InpMaxSpread = 0;     // Max spread in points to place an order (0 = off)

input group "2 · Account protection"
input double InpDayLossPct = 0;    // Stop trading for the day after a loss of (% of balance at day start, 0 = off)
input double InpMinEquity  = 0;    // Stop trading below this equity (0 = off)

input group "3 · Custom settings (Preset = Custom)"
input int    InpPiv     = 5;       // Swing: bars on each side
input double InpMinW    = 1.0;     // Minimum wave size (× ATR 14)
input double InpEntry   = 0.5785;  // Entry fib (0 = wave start, 1 = extreme)
input double InpStop    = -0.15;   // Stop fib (negative = beyond the wave start)
input double InpBuf     = 0.05;    // Stop buffer (× ATR)
input double InpTpR     = 3.0;     // Target (R)
input double InpP1      = 0;       // Partial close: fraction of the size (0 = off)
input double InpP1R     = 1.0;     // …at (R)
input double InpP1Be    = 0;       // …then stop to (R, 0 = break-even)
input int    InpMaxWait = 144;     // Setup life (bars after the break)
input int    InpMaxHold = 144;     // Time exit (bars in the trade)
input string InpBlockH  = "";      // No new fills in these server hours (e.g. 20,21,22,23)

input group "4 · Display & start-up"
input bool   InpDraw    = true;    // Draw the active setup
input bool   InpPush    = false;   // Push notification on entry / exit
input int    InpWarmup  = 3000;    // History bars used to build the state at start
input long   InpMagic   = 270501;  // Magic number

//--- effective parameters
int    P_piv, P_maxw, P_hold;
double P_minw, P_entry, P_stop, P_buf, P_tp, P_p1, P_p1r, P_p1be;
bool   P_block[24];
ENUM_TIMEFRAMES P_tf;
ENUM_TIMEFRAMES TF = PERIOD_CURRENT;   // timeframe the strategy runs on (the preset's, whatever chart it is attached to)

struct Swing { bool ok; double px; datetime t; };
struct Setup
  {
   bool     ok;
   int      d;          // -1 sell, +1 buy
   double   st, ex;     // wave start (0 %) and extreme (100 %)
   datetime t0;         // break bar
   bool     armed;
   double   lim, sl, tp;
  };

Swing   swH, swL;
Setup   S;
double  atr = 0;
bool    atrOk = false;
datetime lastBar = 0;
bool    ready = false;
// virtual trade used only while replaying history
struct VPos { bool on; int d; double e, sl, sl0, tp; datetime t0; bool part; };
VPos    V;
CTrade  trade;
ENUM_ORDER_TYPE_FILLING fillMkt = ORDER_FILLING_FOK;
double  dayBal = 0;
int     dayKey = -1;

//+------------------------------------------------------------------+
void SetPreset()
  {
   ArrayInitialize(P_block, false);
   P_buf = 0.05;
   switch(InpPreset)
     {
      case FXB_V4_5M:
         P_piv = 4;  P_minw = 1; P_entry = 0.5;    P_stop = -0.30; P_tp = 2; P_p1 = 0;   P_p1r = 1;   P_p1be = 0;
         P_maxw = 144; P_hold = 144; P_tf = PERIOD_M5; break;
      case FXB_V3_5M:
         P_piv = 5;  P_minw = 1; P_entry = 0.5785; P_stop = -0.15; P_tp = 3; P_p1 = 0;   P_p1r = 1;   P_p1be = 0;
         P_maxw = 144; P_hold = 144; P_tf = PERIOD_M5; break;
      case FXB_V3_HW:
         P_piv = 3;  P_minw = 3; P_entry = 0.657;  P_stop = -0.15; P_tp = 2; P_p1 = 0.5; P_p1r = 0.7; P_p1be = 0;
         P_maxw = 144; P_hold = 144; P_tf = PERIOD_M5;
         for(int h = 20; h <= 23; h++) P_block[h] = true;
         break;
      case FXB_V2_1M:
         P_piv = 15; P_minw = 1; P_entry = 0.5;    P_stop = -0.15; P_tp = 2; P_p1 = 0.5; P_p1r = 0.7; P_p1be = 0;
         P_maxw = 240; P_hold = 240; P_tf = PERIOD_M1; break;
      default:
        {
         P_piv = (int)MathMax(1, InpPiv); P_minw = InpMinW; P_entry = InpEntry; P_stop = InpStop; P_buf = InpBuf;
         P_tp = InpTpR; P_p1 = InpP1; P_p1r = InpP1R; P_p1be = InpP1Be;
         P_maxw = InpMaxWait; P_hold = InpMaxHold; P_tf = PERIOD_CURRENT;
         string parts[];
         int n = StringSplit(InpBlockH, ',', parts);
         for(int i = 0; i < n; i++)
           {
            StringTrimLeft(parts[i]); StringTrimRight(parts[i]);
            if(parts[i] == "") continue;
            int h = (int)StringToInteger(parts[i]);
            if(h >= 0 && h < 24) P_block[h] = true;
           }
        }
     }
  }

//+------------------------------------------------------------------+
bool HasPosition()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == InpMagic) return true;
     }
   return false;
  }

ulong PendingTicket()
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong tk = OrderGetTicket(i);
      if(tk == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) == _Symbol && OrderGetInteger(ORDER_MAGIC) == InpMagic) return tk;
     }
   return 0;
  }

void DeletePending()
  {
   ulong tk = PendingTicket();
   while(tk != 0)
     {
      if(!trade.OrderDelete(tk)) break;
      tk = PendingTicket();
     }
  }

double NormPx(double p)
  {
   double ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(ts <= 0) return NormalizeDouble(p, _Digits);
   return NormalizeDouble(MathRound(p / ts) * ts, _Digits);
  }

// start of the next blocked hour (0 = none within 24 h)
datetime NextBlock()
  {
   datetime t = TimeCurrent();
   MqlDateTime m; TimeToStruct(t, m);
   datetime h0 = t - m.min * 60 - m.sec;
   for(int k = 1; k <= 24; k++)
     {
      MqlDateTime x; TimeToStruct(h0 + k * 3600, x);
      if(P_block[x.hour]) return h0 + k * 3600;
     }
   return 0;
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

double LotFor(int d, double entry, double sl)
  {
   if(InpFixedLot > 0) return NormLot(InpFixedLot);
   double loss = 0;
   if(!OrderCalcProfit(d > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, _Symbol, 1.0, entry, sl, loss) || loss >= 0) return 0;
   double risk = AccountInfoDouble(ACCOUNT_EQUITY) * InpRiskPct / 100.0;
   double v = NormLot(risk / -loss);
   if(v == 0) Print("FXB: risk too small for the minimum lot (stop ", DoubleToString(MathAbs(entry - sl), _Digits), ")");
   return v;
  }

//+------------------------------------------------------------------+
//| account protection                                               |
//+------------------------------------------------------------------+
bool Protected()
  {
   MqlDateTime t; TimeToStruct(TimeCurrent(), t);
   int k = t.year * 400 + t.day_of_year;
   if(k != dayKey) { dayKey = k; dayBal = AccountInfoDouble(ACCOUNT_BALANCE); }
   if(InpMinEquity > 0 && AccountInfoDouble(ACCOUNT_EQUITY) < InpMinEquity) return true;
   if(InpDayLossPct > 0 && dayBal > 0 && AccountInfoDouble(ACCOUNT_EQUITY) <= dayBal * (1 - InpDayLossPct / 100.0)) return true;
   return false;
  }

//+------------------------------------------------------------------+
//| one closed bar (shift s) through the strategy state              |
//+------------------------------------------------------------------+
void Step(int s, bool pos)
  {
   double h = iHigh(_Symbol, TF, s), l = iLow(_Symbol, TF, s), c = iClose(_Symbol, TF, s);
   datetime t = iTime(_Symbol, TF, s);
   double pc = iClose(_Symbol, TF, s + 1);
   double tr = MathMax(h - l, MathMax(MathAbs(h - pc), MathAbs(l - pc)));
   atr = atrOk ? (atr * 13 + tr) / 14 : tr; atrOk = true;

   //--- confirmed swing points (pivot at s + piv)
   int p = s + P_piv;
   if(p + P_piv < Bars(_Symbol, TF))
     {
      double ph = iHigh(_Symbol, TF, p), pl = iLow(_Symbol, TF, p);
      bool isH = true, isL = true;
      for(int k = 1; k <= P_piv; k++)
        {
         if(!(ph > iHigh(_Symbol, TF, p + k)) || !(ph >= iHigh(_Symbol, TF, p - k))) isH = false;
         if(!(pl < iLow(_Symbol, TF, p + k))  || !(pl <= iLow(_Symbol, TF, p - k)))  isL = false;
        }
      datetime pt = iTime(_Symbol, TF, p);
      if(isH) { swH.ok = true; swH.px = ph; swH.t = pt; }
      if(isL) { swL.ok = true; swL.px = pl; swL.t = pt; }
     }

   //--- break of the latest swing (close beyond it): sell side first, then buy side
   for(int side = 0; side < 2; side++)
     {
      int d = side == 0 ? -1 : 1;
      Swing sw;
      if(side == 0) sw = swL; else sw = swH;
      if(!sw.ok) continue;
      if((d < 0 && c < sw.px) || (d > 0 && c > sw.px))
        {
         int b = iBarShift(_Symbol, TF, sw.t);
         int cnt = b - s + 1;
         if(b < 0 || cnt < 1) { if(side == 0) swL.ok = false; else swH.ok = false; continue; }
         double hi = iHigh(_Symbol, TF, iHighest(_Symbol, TF, MODE_HIGH, cnt, s));
         double lo = iLow(_Symbol, TF, iLowest(_Symbol, TF, MODE_LOW, cnt, s));
         if(!pos)
           {
            S.ok = true; S.d = d; S.t0 = t; S.armed = false;
            S.st = d < 0 ? hi : lo;
            S.ex = d < 0 ? lo : hi;
            if(InpDraw) DrawBreak(d, sw.px, t);
           }
         if(side == 0) swL.ok = false; else swH.ok = false;
        }
     }

   //--- setup at the close: new extreme or a stall
   if(S.ok && !pos)
     {
      int d = S.d;
      bool newx = false;
      if(t > S.t0)
        {
         newx = d < 0 ? (l < S.ex) : (h > S.ex);
         if(newx) { S.ex = d < 0 ? l : h; S.armed = false; }
        }
      double size = MathAbs(S.st - S.ex);
      if(size >= P_minw * atr)
        {
         bool stall = (t > S.t0) && !newx;
         if(stall || S.armed)
           {
            double e  = S.st + (S.ex - S.st) * P_entry;
            double sl = S.st + (S.ex - S.st) * P_stop - d * P_buf * atr;
            double tp = e + d * P_tp * MathAbs(e - sl);
            if((d < 0 && c < e) || (d > 0 && c > e))
              { S.armed = true; S.lim = e; S.sl = sl; S.tp = tp; }
           }
        }
      if(S.armed && ((d < 0 && c > S.sl) || (d > 0 && c < S.sl))) S.ok = false;
      else if(iBarShift(_Symbol, TF, S.t0) - s > P_maxw) S.ok = false;
     }
  }

//+------------------------------------------------------------------+
//| history replay: the simulator's fill / exit rules on a closed bar |
//+------------------------------------------------------------------+
void ReplayBar(int s)
  {
   double o = iOpen(_Symbol, TF, s), h = iHigh(_Symbol, TF, s), l = iLow(_Symbol, TF, s), c = iClose(_Symbol, TF, s);
   double sp = iSpread(_Symbol, TF, s) * _Point;
   datetime t = iTime(_Symbol, TF, s);
   if(V.on && t > V.t0)
     {
      int d = V.d;
      bool exitNow = false;
      if((d < 0 && h + sp >= V.sl) || (d > 0 && l <= V.sl)) exitNow = true;
      else if((d < 0 && l + sp <= V.tp) || (d > 0 && h >= V.tp)) exitNow = true;
      else if(P_p1 > 0 && !V.part)
        {
         double l1 = V.e + d * P_p1r * MathAbs(V.e - V.sl0);
         if((d < 0 && l + sp <= l1) || (d > 0 && h >= l1)) { V.part = true; V.sl = V.e + d * P_p1be * MathAbs(V.e - V.sl0); }
        }
      if(!exitNow && iBarShift(_Symbol, TF, V.t0) - s >= P_hold) exitNow = true;
      if(exitNow) V.on = false;
     }
   MqlDateTime m; TimeToStruct(t, m);
   if(S.ok && S.armed && !V.on && !P_block[m.hour])
     {
      int d = S.d;
      if((d < 0 && h >= S.lim) || (d > 0 && l + sp <= S.lim))
        {
         V.on = true; V.d = d; V.e = d < 0 ? MathMax(S.lim, o) : MathMin(S.lim, o + sp);
         V.sl = S.sl; V.sl0 = S.sl; V.tp = S.tp; V.t0 = t; V.part = false;
         S.ok = false;
         if((d < 0 && h + sp >= V.sl) || (d > 0 && l <= V.sl)) V.on = false;
        }
     }
  }

bool Warmup()
  {
   if(!SeriesInfoInteger(_Symbol, TF, SERIES_SYNCHRONIZED)) return false;
   int n = MathMin(InpWarmup, Bars(_Symbol, TF) - 2 * P_piv - 3);
   if(n < 2 * P_piv + 20) return false;
   swH.ok = swL.ok = false; S.ok = false; atrOk = false; V.on = false;
   for(int s = n; s >= 1; s--) { ReplayBar(s); Step(s, V.on); }
   if(HasPosition() || V.on) S.ok = false;    // a trade from this setup already happened
   V.on = false;
   lastBar = iTime(_Symbol, TF, 0);
   PrintFormat("FOXREX Break v1.03 ready · %d bars · piv %d · minW %.1f ATR · entry %.4f · stop %.3f · TP %.1fR · partial %.0f%% at %.1fR · wait %d · hold %d",
               n, P_piv, P_minw, P_entry, P_stop, P_tp, P_p1 * 100, P_p1r, P_maxw, P_hold);
   return true;
  }

//+------------------------------------------------------------------+
//| pending order = the armed setup (when allowed)                   |
//+------------------------------------------------------------------+
bool guard = false;

void Sync()
  {
   bool pos = HasPosition();
   if(pos && S.ok) S.ok = false;                 // filled → setup done
   MqlDateTime now; TimeToStruct(iTime(_Symbol, TF, 0), now);
   bool want = S.ok && S.armed && !pos && !P_block[now.hour] && !guard
               && ((S.d > 0 && InpBuy) || (S.d < 0 && InpSell));
   ulong tk = PendingTicket();
   if(!want) { if(tk) DeletePending(); DrawSetup(); return; }

   int dg = _Digits;
   double lim = NormPx(S.lim), sl = NormPx(S.sl), tp = NormPx(S.tp);
   if(tk)
     {
      if(OrderSelect(tk) && MathAbs(OrderGetDouble(ORDER_PRICE_OPEN) - lim) < _Point / 2
         && MathAbs(OrderGetDouble(ORDER_SL) - sl) < _Point / 2 && MathAbs(OrderGetDouble(ORDER_TP) - tp) < _Point / 2)
        { DrawSetup(); return; }
      DeletePending();
     }
   if(InpMaxSpread > 0 && SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) > InpMaxSpread) { DrawSetup(); return; }   // wait for a normal spread
   static datetime failBar = 0;
   if(failBar == iTime(_Symbol, TF, 0)) { DrawSetup(); return; }   // one try per bar after a failure
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double lots;
   bool ok;
   datetime nb = NextBlock();          // a pending order expires when a blocked hour starts
   if(S.d < 0)
     {
      if(bid >= lim)                             // price already at / through the entry → fill now (as the simulator)
        {
         lots = LotFor(-1, bid, sl); if(lots == 0) { failBar = iTime(_Symbol, TF, 0); return; }
         trade.SetTypeFilling(fillMkt);
         ok = trade.Sell(lots, _Symbol, 0, sl, tp, "FXB sell");
        }
      else
        {
         lots = LotFor(-1, lim, sl); if(lots == 0) { failBar = iTime(_Symbol, TF, 0); return; }
         trade.SetTypeFilling(ORDER_FILLING_RETURN);
         ok = trade.SellLimit(lots, lim, _Symbol, sl, tp, nb > 0 ? ORDER_TIME_SPECIFIED : ORDER_TIME_GTC, nb, "FXB sell");
        }
     }
   else
     {
      if(ask <= lim)
        {
         lots = LotFor(1, ask, sl); if(lots == 0) { failBar = iTime(_Symbol, TF, 0); return; }
         trade.SetTypeFilling(fillMkt);
         ok = trade.Buy(lots, _Symbol, 0, sl, tp, "FXB buy");
        }
      else
        {
         lots = LotFor(1, lim, sl); if(lots == 0) { failBar = iTime(_Symbol, TF, 0); return; }
         trade.SetTypeFilling(ORDER_FILLING_RETURN);
         ok = trade.BuyLimit(lots, lim, _Symbol, sl, tp, nb > 0 ? ORDER_TIME_SPECIFIED : ORDER_TIME_GTC, nb, "FXB buy");
        }
     }
   trade.SetTypeFilling(fillMkt);
   if(!ok) { failBar = iTime(_Symbol, TF, 0); Print("FXB order failed: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription()); }
   DrawSetup();
  }

//+------------------------------------------------------------------+
//| open position: partial at x R, time exit                         |
//+------------------------------------------------------------------+
string GvName(ulong pid, string k) { return "FXB_" + IntegerToString(InpMagic) + "_" + IntegerToString((long)pid) + "_" + k; }

void Manage(bool newBar)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      ulong pid = (ulong)PositionGetInteger(POSITION_IDENTIFIER);
      int d = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 1 : -1;
      double op = PositionGetDouble(POSITION_PRICE_OPEN), sl = PositionGetDouble(POSITION_SL), tp = PositionGetDouble(POSITION_TP);
      double vol = PositionGetDouble(POSITION_VOLUME);
      if(!GlobalVariableCheck(GvName(pid, "sl0"))) GlobalVariableSet(GvName(pid, "sl0"), sl);
      double sl0 = GlobalVariableGet(GvName(pid, "sl0"));
      double r = MathAbs(op - sl0);

      //--- time exit
      if(newBar && P_hold > 0)
        {
         int held = iBarShift(_Symbol, TF, (datetime)PositionGetInteger(POSITION_TIME)) - 1;
         if(held >= P_hold)
           {
            if(trade.PositionClose(tk)) { Notify("FXB time exit " + (d > 0 ? "buy" : "sell")); continue; }
           }
        }

      //--- partial close at x R, then stop to entry + p1be × R
      bool afterFill = iBarShift(_Symbol, TF, (datetime)PositionGetInteger(POSITION_TIME)) >= 1;   // from the bar after the fill
      if(P_p1 > 0 && r > 0 && afterFill && !GlobalVariableCheck(GvName(pid, "pd")))
        {
         double lvl = op + d * P_p1r * r;
         double px = d > 0 ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         if((d > 0 && px >= lvl) || (d < 0 && px <= lvl))
           {
            double part = NormLot(vol * P_p1);
            double mn = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
            if(part <= 0 || vol - part < mn - 1e-9)
              {
               GlobalVariableSet(GvName(pid, "pd"), 1);   // too small to split: keep the full trade as it is
               Print("FXB: size too small for a partial close, trade left unchanged");
               continue;
              }
            if(!GlobalVariableCheck(GvName(pid, "pc")))
              {
               if(!trade.PositionClosePartial(tk, part)) continue;          // retry next tick
               GlobalVariableSet(GvName(pid, "pc"), 1);
              }
            double nsl = NormPx(op + d * P_p1be * r);
            if(!PositionSelectByTicket(tk) || !trade.PositionModify(tk, nsl, tp)) continue;   // retry next tick
            GlobalVariableSet(GvName(pid, "pd"), 1);
            Notify("FXB partial " + DoubleToString(part, 2) + " at " + DoubleToString(P_p1r, 1) + "R, stop to " + DoubleToString(nsl, _Digits));
           }
        }
     }
  }

void Notify(string m) { Print(m); if(InpPush) SendNotification(_Symbol + " " + m); }

//+------------------------------------------------------------------+
//| drawing                                                          |
//+------------------------------------------------------------------+
void HLine(string n, datetime t1, double p, color c, int style, string tip)
  {
   datetime t2 = iTime(_Symbol, TF, 0) + PeriodSeconds() * 10;
   if(ObjectFind(0, n) < 0) ObjectCreate(0, n, OBJ_TREND, 0, t1, p, t2, p);
   ObjectSetInteger(0, n, OBJPROP_TIME, 0, t1); ObjectSetDouble(0, n, OBJPROP_PRICE, 0, p);
   ObjectSetInteger(0, n, OBJPROP_TIME, 1, t2); ObjectSetDouble(0, n, OBJPROP_PRICE, 1, p);
   ObjectSetInteger(0, n, OBJPROP_COLOR, c); ObjectSetInteger(0, n, OBJPROP_STYLE, style);
   ObjectSetInteger(0, n, OBJPROP_RAY_RIGHT, false); ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetString(0, n, OBJPROP_TOOLTIP, tip);
  }

void DrawSetup()
  {
   if(!InpDraw) return;
   if(!S.ok)
     {
      ObjectsDeleteAll(0, "FXB_S_");
      return;
     }
   HLine("FXB_S_0", S.t0, S.st, clrGray, STYLE_DOT, "Wave start 0 %");
   HLine("FXB_S_1", S.t0, S.ex, clrGray, STYLE_DOT, "Wave extreme 100 %");
   double b1 = S.st + (S.ex - S.st) * 0.5, b2 = S.st + (S.ex - S.st) * 0.657;
   HLine("FXB_S_B1", S.t0, b1, clrGoldenrod, STYLE_SOLID, "Box 50 %");
   HLine("FXB_S_B2", S.t0, b2, clrGoldenrod, STYLE_SOLID, "Box 65.7 %");
   if(S.armed)
     {
      HLine("FXB_S_E", S.t0, S.lim, S.d > 0 ? clrDodgerBlue : clrOrangeRed, STYLE_SOLID, "Entry");
      HLine("FXB_S_SL", S.t0, S.sl, clrRed, STYLE_DASH, "Stop");
      HLine("FXB_S_TP", S.t0, S.tp, clrLimeGreen, STYLE_DASH, "Target");
     }
   else
     {
      ObjectDelete(0, "FXB_S_E"); ObjectDelete(0, "FXB_S_SL"); ObjectDelete(0, "FXB_S_TP");
     }
  }

void DrawBreak(int d, double px, datetime t)
  {
   string n = "FXB_B_" + IntegerToString((long)t);
   if(ObjectFind(0, n) >= 0) return;
   ObjectCreate(0, n, OBJ_ARROW, 0, t, px);
   ObjectSetInteger(0, n, OBJPROP_ARROWCODE, d < 0 ? 234 : 233);
   ObjectSetInteger(0, n, OBJPROP_COLOR, d < 0 ? clrOrangeRed : clrDodgerBlue);
   ObjectSetInteger(0, n, OBJPROP_ANCHOR, d < 0 ? ANCHOR_BOTTOM : ANCHOR_TOP);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetString(0, n, OBJPROP_TOOLTIP, d < 0 ? "Break down" : "Break up");
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   SetPreset();
   TF = P_tf == PERIOD_CURRENT ? (ENUM_TIMEFRAMES)_Period : P_tf;   // e.g. the 5m preset runs on 5m bars even on a 1m chart
   iTime(_Symbol, TF, 0);                                            // ask the terminal to load that timeframe
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(30);
   long fm = SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   fillMkt = (fm & SYMBOL_FILLING_FOK) ? ORDER_FILLING_FOK : (fm & SYMBOL_FILLING_IOC) ? ORDER_FILLING_IOC : ORDER_FILLING_RETURN;
   trade.SetTypeFilling(fillMkt);

   ready = false;                         // history is replayed on the first tick, once the series is synchronized
   return INIT_SUCCEEDED;
  }

void Status()
  {
   string st;
   bool algo = TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) && MQLInfoInteger(MQL_TRADE_ALLOWED);
   if(!ready) st = "loading history of " + EnumToString(TF) + " …";
   else if(!algo) st = "Algo Trading is OFF — turn it on (toolbar button / EA settings › Allow Algo Trading)";
   else if(guard) st = "stopped by account protection for today";
   else if(HasPosition()) st = "in a trade";
   else if(S.ok && S.armed) st = (S.d > 0 ? "BUY limit " : "SELL limit ") + DoubleToString(S.lim, _Digits) + "  SL " + DoubleToString(S.sl, _Digits) + "  TP " + DoubleToString(S.tp, _Digits);
   else if(S.ok) st = (S.d > 0 ? "break up" : "break down") + " · waiting for a stall";
   else st = "waiting for a break";
   Comment("FOXREX Break v1.03 · ", EnumToString(InpPreset), " · runs on ", EnumToString(TF), "\n", st);
  }

void OnDeinit(const int reason)
  {
   Comment("");
   if(reason == REASON_REMOVE || reason == REASON_PARAMETERS) DeletePending();
   ObjectsDeleteAll(0, "FXB_S_");
  }

void OnTick()
  {
   if(!ready) { ready = Warmup(); if(!ready) { Status(); return; } }
   guard = Protected();                   // every tick, so the day-start balance is taken at the day start
   datetime b = iTime(_Symbol, TF, 0);
   bool nb = b != lastBar;
   Manage(nb);
   if(nb)
     {
      int from = lastBar > 0 ? iBarShift(_Symbol, TF, lastBar) - 1 : 1;   // every closed bar since the last one (gaps, reconnects)
      if(from < 1) from = 1;
      if(from > 500) from = 500;
      for(int s = from; s >= 1; s--) Step(s, HasPosition());
      lastBar = b;
     }
   Sync();
   Status();
  }

void OnTradeTransaction(const MqlTradeTransaction &tx, const MqlTradeRequest &rq, const MqlTradeResult &rs)
  {
   if(tx.type != TRADE_TRANSACTION_DEAL_ADD) return;
   if(!HistoryDealSelect(tx.deal)) return;
   if(HistoryDealGetInteger(tx.deal, DEAL_MAGIC) != InpMagic || HistoryDealGetString(tx.deal, DEAL_SYMBOL) != _Symbol) return;
   long en = HistoryDealGetInteger(tx.deal, DEAL_ENTRY);
   double pr = HistoryDealGetDouble(tx.deal, DEAL_PRICE);
   if(en == DEAL_ENTRY_IN)
     {
      S.ok = false;                              // one trade per break
      Notify(StringFormat("FXB entry %s %.2f @ %s", HistoryDealGetInteger(tx.deal, DEAL_TYPE) == DEAL_TYPE_BUY ? "buy" : "sell",
                          HistoryDealGetDouble(tx.deal, DEAL_VOLUME), DoubleToString(pr, _Digits)));
     }
   else if(en == DEAL_ENTRY_OUT)
     {
      double pl = HistoryDealGetDouble(tx.deal, DEAL_PROFIT) + HistoryDealGetDouble(tx.deal, DEAL_COMMISSION) + HistoryDealGetDouble(tx.deal, DEAL_SWAP);
      Notify(StringFormat("FXB exit @ %s  P/L %.2f", DoubleToString(pr, _Digits), pl));
     }
  }
//+------------------------------------------------------------------+
