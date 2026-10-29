//+------------------------------------------------------------------+
//| FOXREX Waves EA                                                  |
//| Expert Advisor for MetaTrader 5, same rules and settings as the  |
//| TradingView indicator "FOXREX · Wave Retracement Zones" v3.12.   |
//| © FOXREX — foxrex.co · Mozilla Public License 2.0                |
//|                                                                  |
//| Strategy (fixed):                                                |
//|  • A wave runs from its start to the first price stall. A buy    |
//|    wave must make a higher high than the previous stall high, a  |
//|    sell wave a lower low.                                        |
//|  • Zone = 38.2–61.8% of the wave (height capped by timeframe).   |
//|    Entry at 50% (pending limit) or on a rejection candle in the  |
//|    zone; stop beyond 78.6%, clamped per timeframe.               |
//|  • Trend from swings (last break); range = no break for a while. |
//|  • Daily support / resistance zones: rejection trades (twice per |
//|    zone per day) and reversal trades (sweep + strong close).     |
//|  • Major zones from a higher timeframe: trades at their middle.  |
//|  • Stars 1–4 = confidence, size 1 / 1.5 / 2 / 2.5 × base lot.    |
//|  • Seven targets; stop to entry after TP2, then one target       |
//|    behind. Time exits: no TP1 in 15 bars, no TP2 in 60 bars.     |
//|                                                                  |
//| Prices and "points" in the inputs are price units (gold: 1.0 =   |
//| a $1 move of the price), the same as on TradingView.             |
//| Educational tool. Test on a demo account and in the Strategy     |
//| Tester before using real money.                                  |
//+------------------------------------------------------------------+
#property copyright "FOXREX · foxrex.co"
#property link      "https://foxrex.co"
#property version   "3.12"
#property description "FOXREX Waves EA v3.12: wave retracement zones, daily S/R and reversal trades."

#include <Trade/Trade.mqh>

//--- enums
enum ENUM_FXW_PROFILE { PROFILE_AUTO_TF = 0,   // Auto by timeframe
                        PROFILE_AUTO_ATR = 1,  // Auto by ATR (1m ratios)
                        PROFILE_CUSTOM = 2 };  // Custom
enum ENUM_FXW_PROTECT { PROT_NEAR = 0,         // After TP2: stop to entry, then one target behind
                        PROT_LATE = 1,         // After TP2: stop to entry, after TP3: to TP1
                        PROT_STEP = 2,         // Step: entry after TP1, then previous target
                        PROT_TP1 = 3,          // Entry after TP1 only
                        PROT_OFF = 4 };        // Off (keep the original stop)
enum ENUM_FXW_ENTRY   { ENTRY_LIM_REJ = 0,     // Limit or rejection
                        ENTRY_LIM = 1,         // Limit only
                        ENTRY_REJ = 2 };       // Rejection candle only
enum ENUM_FXW_ELVL    { ELVL_MID = 0,          // Zone middle (50%)
                        ELVL_START = 1,        // Zone start (first touch)
                        ELVL_END = 2,          // Zone end (deep)
                        ELVL_CUSTOM = 3 };     // Custom retracement
enum ENUM_FXW_DIR     { DIR_TREND = 0,         // With the trend (buy up, sell down, none in a range)
                        DIR_BOTH = 1,          // Both directions
                        DIR_BUY = 2,           // Buy only
                        DIR_SELL = 3 };        // Sell only
enum ENUM_FXW_LOT     { LOT_FIXED = 0,         // Fixed lot (base lot × stars)
                        LOT_RISK = 1 };        // Risk % of equity per trade (× stars)
enum ENUM_FXW_MAJFLT  { MAJ_STRUCT_ZONE = 0,   // Major structure + active zone
                        MAJ_ZONE = 1,          // Active major zone only
                        MAJ_OFF = 2 };         // Off

//--- inputs
input group "Trading"
input ENUM_FXW_LOT InpLotMode = LOT_FIXED; // Position size
input double InpBaseLot     = 0.01;   // Base lot (1 star, fixed mode)
input double InpRiskPct     = 0.25;   // Risk per trade, % of equity (1 star, risk mode)
input bool   InpLotByStars  = true;   // Size by confidence (1 / 1.5 / 2 / 2.5 ×)
input double InpMaxLot      = 0;      // Max lot per trade (0 = broker max)
input int    InpMaxOpen     = 0;      // Max open trades in the same direction (0 = no limit)
input long   InpMagic       = 260929; // Magic number
input int    InpMaxSpread   = 0;      // Max spread in points (0 = off)
input bool   InpPush        = false;  // Push notification on entry / exit

input group "Targets & stops"
input ENUM_FXW_PROFILE InpProfile = PROFILE_AUTO_TF; // Profile
input double InpTp1 = 2.5;   // Custom TP1
input double InpTp2 = 5.0;   // Custom TP2
input double InpTp3 = 10.0;  // Custom TP3
input double InpTp4 = 20.0;  // Custom TP4
input double InpSlMinC = 3.0;  // Custom stop min
input double InpSlMaxC = 10.0; // Custom stop max
input double InpSlBuf  = 0.1;  // Stop buffer beyond the zone (× ATR)
input int    InpNoProg = 15;   // No-progress exit (bars without TP1, 0 = off)
input int    InpMaxBars = 60;  // Maximum life before TP2 (bars)
input ENUM_FXW_PROTECT InpProtect = PROT_NEAR; // Profit protection

input group "Stop per timeframe (price units, auto profile)"
input double InpSl1Mn  = 1.5;  // 1m · min
input double InpSl1Mx  = 5.0;  // 1m · max
input double InpSl5Mn  = 3.0;  // 2–5m · min
input double InpSl5Mx  = 10.0; // 2–5m · max
input double InpSl15Mn = 4.0;  // 6–59m · min
input double InpSl15Mx = 10.0; // 6–59m · max
input double InpSlHMn  = 5.0;  // 1H–4H · min
input double InpSlHMx  = 15.0; // 1H–4H · max
input double InpSlDMn  = 10.0; // D / W / M · min
input double InpSlDMx  = 25.0; // D / W / M · max

input group "Structure & zones"
input int    InpStL     = 3;      // Stall: bars before the turn
input int    InpMs1     = 1;      // Minimum stars to trade · 1m
input int    InpMs5     = 1;      // Minimum stars to trade · 2–5m
input int    InpMs15    = 1;      // Minimum stars to trade · 6–30m
input int    InpMsH     = 1;      // Minimum stars to trade · above
input double InpFEntry  = 0.382;  // Zone start (retracement)
input double InpFZone   = 0.618;  // Zone end (retracement)
input double InpFInv    = 0.786;  // Invalidation (retracement)
input double InpMinLeg  = 1.5;    // Minimum leg size (× ATR)
input int    InpMaxWait = 300;    // Zone life (bars after the leg end)
input ENUM_FXW_ENTRY InpEntry = ENTRY_LIM_REJ; // Entry type
input ENUM_FXW_ELVL InpELvl = ELVL_MID;        // Entry level (where the limit fills)
input double InpECust   = 0.5;    // Custom retracement
input int    InpMaxEnt  = 2;      // Max entries per zone
input int    InpReCool  = 3;      // Bars between entries in the same zone
input ENUM_FXW_DIR InpDir = DIR_TREND; // Trade direction
input bool   InpUseRsi  = true;   // RSI filter
input int    InpRsiLen  = 14;     // RSI length
input double InpRsiOS   = 30;     // No sell below
input double InpRsiOB   = 70;     // No buy above
input bool   InpUseRoom = true;   // Room filter
input int    InpSwLen   = 5;      // Structure swing length (bars each side)
input int    InpRngBars = 0;      // Range: no break for (bars, 0 = auto)

input group "Major timeframe"
input bool   InpUseMaj  = true;   // Use a major timeframe
input bool   InpMajAuto = true;   // Auto (1m→15m, 5m→1H, 15m→4H, 1H→D)
input ENUM_TIMEFRAMES InpMajTf = PERIOD_M15; // Major timeframe when not auto
input ENUM_FXW_MAJFLT InpMajFlt = MAJ_OFF;   // Direction filter
input bool   InpTradeMj = true;   // Take trades at major zones

input group "Daily zones"
input bool   InpTradeDL = true;   // Take trades at daily zones (rejection)
input bool   InpUseRev  = true;   // Reversal trades at strong zones
input double InpDlRange = 3.0;    // Search range (× daily ATR)
input double InpDlMerge = 0.8;    // Merge distance / zone height (× chart ATR)
input double InpDlMinW  = 2.0;    // Minimum strength to trade a daily zone
input bool   InpDlSwing = true;   // Include daily swing highs / lows
input double InpDlStep  = 0.0;    // Round-number step (0 = auto)
input string InpDlAn    = "";     // Analyst levels (comma separated)

input group "Abnormal candle filter"
input bool   InpUseSpk  = true;   // Skip signals after an abnormal candle
input double InpSpkK    = 2.5;    // Abnormal = range above (× ATR)
input int    InpSpkLook = 3;      // Look back (bars)

input group "Display"
input bool   InpDraw    = true;   // Draw zones and daily levels
input bool   InpLogSkip = true;   // Journal: why a touched zone gave no trade
input int    InpWarmup  = 1500;   // History bars used to build the state at start

//--- constants
#define FXW_VER   "3.12"
#define FXW_PFX   "FXW_"

//+------------------------------------------------------------------+
//| Zone                                                             |
//+------------------------------------------------------------------+
struct SZone
  {
   int      id;
   int      dir;
   double   p0, p1;
   int      b0, b1, bB;
   int      state;      // 0 forming, 1 touched, >=10 finished
   bool     touched;
   int      entries;
   int      lastE;
   bool     armed;
   int      stars;
   bool     hold;
   bool     brk;
   bool     tchChart;   // major zone touched on the chart timeframe
   int      skK;        // last bar a touch without a trade was logged
  };

//+------------------------------------------------------------------+
//| Wave engine for one timeframe                                    |
//+------------------------------------------------------------------+
class CWaveEngine
  {
public:
   ENUM_TIMEFRAMES   tf;
   int               secs;
   int               n;            // processed bars
   int               maxLive;      // live zones per side
   double            O[], H[], L[], C[], ATR[], RSI[];
   datetime          T[];
   //--- indicator state
   double            trSum, atrV, gainAvg, lossAvg;
   //--- legs (stalls)
   double            lH, lL;
   int               lHB, lLB;
   //--- structure trend
   double            sH1, sL1;
   bool              sHB, sLB;
   int               sTr, sBk, trend;
   //--- zones
   SZone             zones[];
   int               nextId;

   void              Init(ENUM_TIMEFRAMES t, int live)
     {
      tf = t; secs = PeriodSeconds(t); n = 0; maxLive = live;
      ArrayResize(O, 0); ArrayResize(H, 0); ArrayResize(L, 0); ArrayResize(C, 0);
      ArrayResize(ATR, 0); ArrayResize(RSI, 0); ArrayResize(T, 0);
      trSum = 0; atrV = 0; gainAvg = 0; lossAvg = 0;
      lH = 0; lL = 0; lHB = -1; lLB = -1;
      sH1 = 0; sL1 = 0; sHB = false; sLB = false; sTr = 0; sBk = -1; trend = 0;
      ArrayResize(zones, 0); nextId = 1;
     }

   double            Atr(void)  { return n > 0 ? ATR[n - 1] : 0; }
   double            AtrAt(int k) { return (k >= 0 && k < n) ? ATR[k] : Atr(); }

   bool              PivotHigh(int p, int left, int right)
     {
      if(p - left < 0 || p + right >= n) return false;
      for(int i = 1; i <= left; i++)  if(H[p - i] >= H[p]) return false;
      for(int j = 1; j <= right; j++) if(H[p + j] >  H[p]) return false;
      return true;
     }
   bool              PivotLow(int p, int left, int right)
     {
      if(p - left < 0 || p + right >= n) return false;
      for(int i = 1; i <= left; i++)  if(L[p - i] <= L[p]) return false;
      for(int j = 1; j <= right; j++) if(L[p + j] <  L[p]) return false;
      return true;
     }

   int               RangeBars(void)
     {
      if(InpRngBars > 0) return InpRngBars;
      if(secs <= 60)  return 30;
      if(secs <= 300) return (int)MathMax(MathRound(1800.0 / secs), 2);
      if(secs <= 900) return (int)MathMax(MathRound(3600.0 / secs), 2);
      return 6;
     }

   //--- append one closed bar and update everything
   void              AddBar(const MqlRates &r)
     {
      int k = n;
      ArrayResize(O, k + 1, 4096); ArrayResize(H, k + 1, 4096); ArrayResize(L, k + 1, 4096);
      ArrayResize(C, k + 1, 4096); ArrayResize(T, k + 1, 4096);
      ArrayResize(ATR, k + 1, 4096); ArrayResize(RSI, k + 1, 4096);
      O[k] = r.open; H[k] = r.high; L[k] = r.low; C[k] = r.close; T[k] = r.time;
      n = k + 1;
      //--- ATR (Wilder, 14)
      double tr = (k == 0) ? H[k] - L[k] : MathMax(H[k] - L[k], MathMax(MathAbs(H[k] - C[k - 1]), MathAbs(L[k] - C[k - 1])));
      if(k < 14) { trSum += tr; atrV = trSum / (k + 1); }
      else atrV = (atrV * 13.0 + tr) / 14.0;
      ATR[k] = atrV;
      //--- RSI (Wilder)
      int rl = (int)MathMax(InpRsiLen, 2);
      double ch = (k == 0) ? 0 : C[k] - C[k - 1];
      double g = ch > 0 ? ch : 0, ls = ch < 0 ? -ch : 0;
      if(k <= rl) { gainAvg = (gainAvg * k + g) / (k + 1); lossAvg = (lossAvg * k + ls) / (k + 1); }
      else { gainAvg = (gainAvg * (rl - 1) + g) / rl; lossAvg = (lossAvg * (rl - 1) + ls) / rl; }
      RSI[k] = lossAvg == 0 ? 100.0 : 100.0 - 100.0 / (1.0 + gainAvg / lossAvg);
      //--- structure trend (swing pivots, last break, range timeout)
      int p = k - InpSwLen;
      if(PivotHigh(p, InpSwLen, InpSwLen)) { sH1 = H[p]; sHB = false; }
      if(PivotLow(p, InpSwLen, InpSwLen))  { sL1 = L[p]; sLB = false; }
      if(sH1 > 0 && !sHB && C[k] > sH1) { sHB = true; sTr = 1;  sBk = k; }
      if(sL1 > 0 && !sLB && C[k] < sL1) { sLB = true; sTr = -1; sBk = k; }
      trend = (sBk < 0 || k - sBk > RangeBars()) ? 0 : sTr;
      //--- legs: stall after one candle
      int q = k - 1;
      double a = Atr();
      if(PivotHigh(q, InpStL, 1))
        {
         int span = lHB < 0 ? 60 : (int)MathMin(MathMax(q - lHB, 1), 300);
         double lo = L[q]; int lob = q;
         for(int i = q; i >= MathMax(q - span, 0); i--) if(L[i] < lo) { lo = L[i]; lob = i; }
         if(lHB < 0 || H[q] > lH)
            if(MathAbs(H[q] - lo) >= InpMinLeg * a) AddZone(1, lo, lob, H[q], q);
         lH = H[q]; lHB = q;
        }
      if(PivotLow(q, InpStL, 1))
        {
         int span = lLB < 0 ? 60 : (int)MathMin(MathMax(q - lLB, 1), 300);
         double hi = H[q]; int hib = q;
         for(int i = q; i >= MathMax(q - span, 0); i--) if(H[i] > hi) { hi = H[i]; hib = i; }
         if(lLB < 0 || L[q] < lL)
            if(MathAbs(hi - L[q]) >= InpMinLeg * a) AddZone(-1, hi, hib, L[q], q);
         lL = L[q]; lLB = q;
        }
      //--- zones: stars, touch, invalidation, arming, life
      for(int z = 0; z < ArraySize(zones); z++) Update(z, k);
      //--- drop finished zones
      int keep = 0;
      for(int z = 0; z < ArraySize(zones); z++)
         if(zones[z].state < 10) { if(keep != z) zones[keep] = zones[z]; keep++; }
      ArrayResize(zones, keep);
     }

   void              AddZone(int dir, double p0, int b0, double p1, int b1)
     {
      int live = 0;
      for(int z = 0; z < ArraySize(zones); z++) if(zones[z].dir == dir && zones[z].state <= 1) live++;
      for(int z = 0; z < ArraySize(zones) && live >= maxLive; z++)
         if(zones[z].dir == dir && zones[z].state <= 1) { zones[z].state = 15; live--; }
      SZone nz;
      nz.id = nextId++; nz.dir = dir; nz.p0 = p0; nz.p1 = p1; nz.b0 = b0; nz.b1 = b1; nz.bB = n - 1;
      nz.state = 0; nz.touched = false; nz.entries = 0; nz.lastE = -1000; nz.armed = true;
      nz.stars = 1; nz.hold = true; nz.brk = (trend == dir); nz.tchChart = false; nz.skK = -10;
      int s = ArraySize(zones); ArrayResize(zones, s + 1); zones[s] = nz;
     }

   double            Lvl(const SZone &z, double r) { return z.p1 + r * (z.p0 - z.p1); }

   void              Update(int zi, int k)
     {
      if(zones[zi].state > 1) return;
      double a = Atr();
      //--- stars: candles holding near the top after the stall
      if(zones[zi].state == 0 && zones[zi].hold && k > zones[zi].bB)
        {
         double lg = MathAbs(zones[zi].p1 - zones[zi].p0);
         bool hold = zones[zi].dir > 0 ? (H[k] <= zones[zi].p1 && L[k] >= zones[zi].p1 - 0.236 * lg)
                                       : (L[k] >= zones[zi].p1 && H[k] <= zones[zi].p1 + 0.236 * lg);
         if(hold && zones[zi].stars < 3) zones[zi].stars++;
         if(!hold || zones[zi].stars >= 3) zones[zi].hold = false;
        }
      double zA, zB; CapZ(Lvl(zones[zi], InpFEntry), Lvl(zones[zi], InpFZone), secs, zA, zB);
      double zI = Lvl(zones[zi], InpFInv), zM = (zA + zB) / 2;
      bool valid = MathAbs(zones[zi].p0 - zones[zi].p1) >= InpMinLeg * a;
      if(valid && k > zones[zi].b1)
        {
         int d = zones[zi].dir;
         if(!zones[zi].armed && (d < 0 ? L[k] <= zM - PTp(secs, 0, a) : H[k] >= zM + PTp(secs, 0, a))) zones[zi].armed = true;
         bool inZone = d < 0 ? H[k] >= zA : L[k] <= zA;
         if(inZone && !zones[zi].touched) { zones[zi].touched = true; zones[zi].state = 1; }
         bool invalid = d < 0 ? C[k] > zI : C[k] < zI;
         if(invalid) zones[zi].state = 13;
        }
      if(zones[zi].state <= 1 && k - zones[zi].b1 > InpMaxWait) zones[zi].state = 14;
     }
  };

//+------------------------------------------------------------------+
//| Globals                                                          |
//+------------------------------------------------------------------+
CTrade      trade;
CWaveEngine eng;          // chart timeframe
CWaveEngine maj;          // major timeframe
bool        majOn = false;
ENUM_TIMEFRAMES majTf = PERIOD_CURRENT;
datetime    lastBar = 0, lastMajBar = 0;
int         tfSecs = 60;

//--- daily zones of today
double      dZLo[], dZHi[], dZW[];
int         dZB[], dZS[], dZT[];
string      dZN[];
int         dayKeyNow = -1;

//--- open trade records
struct SPos
  {
   ulong    ticket;
   int      dir;
   double   entry;
   double   tps[7];
   int      hits;
   int      stars;
   double   lots;
   string   kind;   // L local, M major, D daily, R reversal
   int      zid;
   bool     alive;
  };
SPos        pos[];

//+------------------------------------------------------------------+
//| Profile helpers                                                  |
//+------------------------------------------------------------------+
double PTp(int s, int i, double a)
  {
   if(InpProfile == PROFILE_AUTO_ATR) { double m[4] = {0.7, 1.4, 2.1, 3.5}; return m[i] * a; }
   if(InpProfile == PROFILE_CUSTOM)   { double c[4]; c[0] = InpTp1; c[1] = InpTp2; c[2] = InpTp3; c[3] = InpTp4; return c[i]; }
   double t1[4]  = {1.0, 2.0, 3.0, 5.0};
   double t5[4]  = {2.5, 5.0, 10.0, 15.0};
   double t15[4] = {2.5, 5.0, 10.0, 20.0};
   double tH[4]  = {5.0, 10.0, 20.0, 40.0};
   double tD[4]  = {10.0, 20.0, 40.0, 80.0};
   if(s <= 60)    return t1[i];
   if(s <= 300)   return t5[i];
   if(s <= 1800)  return t15[i];
   if(s < 86400)  return tH[i];
   return tD[i];
  }

double PSlMin(int s, double a)
  {
   if(InpProfile == PROFILE_AUTO_ATR) return 1.0 * a;
   if(InpProfile == PROFILE_CUSTOM)   return InpSlMinC;
   if(s <= 60) return InpSl1Mn; if(s <= 300) return InpSl5Mn; if(s < 3600) return InpSl15Mn; if(s < 86400) return InpSlHMn;
   return InpSlDMn;
  }

double PSlMax(int s, double a)
  {
   if(InpProfile == PROFILE_AUTO_ATR) return 3.5 * a;
   if(InpProfile == PROFILE_CUSTOM)   return InpSlMaxC;
   if(s <= 60) return InpSl1Mx; if(s <= 300) return InpSl5Mx; if(s < 3600) return InpSl15Mx; if(s < 86400) return InpSlHMx;
   return InpSlDMx;
  }

double ClampSl(double d, int s, bool imp, double a)
  {
   double lo = PSlMin(imp ? (int)MathMax(s, 300) : s, a), hi = PSlMax(s, a);
   return MathMin(MathMax(d, lo), hi);
  }

void TpArr(double ep, int dir, int s, bool imp, double a, double &tps[])
  {
   int ps = imp ? (int)MathMax(s, 300) : s;
   double t1 = PTp(ps, 0, a), t2 = PTp(ps, 1, a), t3 = PTp(ps, 2, a), t4 = PTp(ps, 3, a), st = t4 - t3;
   tps[0] = ep + dir * t1; tps[1] = ep + dir * t2; tps[2] = ep + dir * t3; tps[3] = ep + dir * t4;
   tps[4] = ep + dir * (t4 + st); tps[5] = ep + dir * (t4 + 2 * st); tps[6] = ep + dir * (t4 + 3 * st);
  }

double PZoneMax(int s)
  {
   if(s <= 60) return 2.0; if(s <= 300) return 4.0; if(s <= 900) return 6.0; if(s <= 3600) return 8.0; if(s < 86400) return 10.0;
   return 15.0;
  }

void CapZ(double a, double b, int s, double &oa, double &ob)
  {
   double m = (a + b) / 2, h = MathAbs(a - b), c = PZoneMax(s);
   double k = (h > c && h > 0) ? c / h : 1.0;
   oa = m + (a - m) * k; ob = m + (b - m) * k;
  }

int MinStars(int s)
  {
   if(s <= 60) return InpMs1; if(s <= 300) return InpMs5; if(s <= 1800) return InpMs15;
   return InpMsH;
  }

double ProtSl(int dir, double en, double sl, int hits, const double &tps[])
  {
   if(InpProtect == PROT_OFF || hits < 1) return sl;
   double ns = EMPTY_VALUE;
   if(InpProtect == PROT_NEAR)      ns = hits >= 3 ? tps[hits - 2] : (hits >= 2 ? en : EMPTY_VALUE);
   else if(InpProtect == PROT_LATE) ns = hits >= 3 ? tps[hits - 3] : (hits >= 2 ? en : EMPTY_VALUE);
   else if(InpProtect == PROT_STEP) ns = hits >= 2 ? tps[hits - 2] : en;
   else                             ns = en;
   if(ns != EMPTY_VALUE && dir * (ns - sl) > 0) return ns;
   return sl;
  }

string TfLabel(int s)
  {
   if(s < 3600)  return "M" + IntegerToString(s / 60);
   if(s < 86400) return "H" + IntegerToString(s / 3600);
   return s < 604800 ? "D" + IntegerToString(s / 86400) : "W";
  }

string Stars(int n) { return n >= 4 ? "****" : n == 3 ? "***" : n == 2 ? "**" : "*"; }

//+------------------------------------------------------------------+
//| Daily zones                                                      |
//+------------------------------------------------------------------+
void AddLv(double &lp[], double &lw[], string &ln[], double p, double w, string nm, double px, double lim)
  {
   if(p <= 0 || MathAbs(p - px) > lim) return;
   int s = ArraySize(lp); ArrayResize(lp, s + 1); ArrayResize(lw, s + 1); ArrayResize(ln, s + 1);
   lp[s] = p; lw[s] = w; ln[s] = nm;
  }

void BuildDaily(double px, double ca)
  {
   ArrayResize(dZLo, 0); ArrayResize(dZHi, 0); ArrayResize(dZW, 0); ArrayResize(dZN, 0);
   MqlRates d[]; ArraySetAsSeries(d, false);
   int got = CopyRates(_Symbol, PERIOD_D1, 1, 80, d);     // completed days, oldest first
   if(got < 25 || px <= 0) return;
   int last = got - 1;
   double dH = d[last].high, dL = d[last].low, dC = d[last].close;
   //--- daily ATR(14), EMA 20/50, 20-day range
   double atrD = 0; for(int i = last - 13; i <= last; i++) atrD += MathMax(d[i].high - d[i].low, MathMax(MathAbs(d[i].high - d[i - 1].close), MathAbs(d[i].low - d[i - 1].close)));
   atrD /= 14.0;
   double e20 = d[0].close, e50 = d[0].close;
   for(int i = 1; i <= last; i++) { e20 += (d[i].close - e20) * 2.0 / 21.0; e50 += (d[i].close - e50) * 2.0 / 51.0; }
   double h20 = 0, l20 = DBL_MAX;
   for(int i = last - 19; i <= last; i++) { h20 = MathMax(h20, d[i].high); l20 = MathMin(l20, d[i].low); }
   MqlRates w[]; ArraySetAsSeries(w, false);
   double wH = 0, wL = 0;
   if(CopyRates(_Symbol, PERIOD_W1, 1, 1, w) == 1) { wH = w[0].high; wL = w[0].low; }
   double lim = InpDlRange * atrD, pv = (dH + dL + dC) / 3;
   double lp[], lw[]; string ln[];
   AddLv(lp, lw, ln, dH, 3.0, "Prior-day high", px, lim);
   AddLv(lp, lw, ln, dL, 3.0, "Prior-day low", px, lim);
   AddLv(lp, lw, ln, dC, 1.0, "Prior-day close", px, lim);
   AddLv(lp, lw, ln, pv, 1.5, "Daily pivot", px, lim);
   AddLv(lp, lw, ln, 2 * pv - dL, 1.5, "Pivot R1", px, lim);
   AddLv(lp, lw, ln, 2 * pv - dH, 1.5, "Pivot S1", px, lim);
   AddLv(lp, lw, ln, pv + (dH - dL), 1.0, "Pivot R2", px, lim);
   AddLv(lp, lw, ln, pv - (dH - dL), 1.0, "Pivot S2", px, lim);
   AddLv(lp, lw, ln, wH, 2.5, "Prior-week high", px, lim);
   AddLv(lp, lw, ln, wL, 2.5, "Prior-week low", px, lim);
   AddLv(lp, lw, ln, h20, 2.0, "20-day high", px, lim);
   AddLv(lp, lw, ln, l20, 2.0, "20-day low", px, lim);
   AddLv(lp, lw, ln, e20, 1.0, "20-day EMA", px, lim);
   AddLv(lp, lw, ln, e50, 1.0, "50-day EMA", px, lim);
   if(InpDlSwing)
     {
      int fh = 0, fl = 0;
      for(int i = last - 2; i >= 2 && (fh < 4 || fl < 4); i--)
        {
         if(fh < 4 && d[i].high > d[i - 1].high && d[i].high > d[i - 2].high && d[i].high >= d[i + 1].high && d[i].high >= d[i + 2].high) { AddLv(lp, lw, ln, d[i].high, 1.5, "Daily swing high", px, lim); fh++; }
         if(fl < 4 && d[i].low < d[i - 1].low && d[i].low < d[i - 2].low && d[i].low <= d[i + 1].low && d[i].low <= d[i + 2].low) { AddLv(lp, lw, ln, d[i].low, 1.5, "Daily swing low", px, lim); fl++; }
        }
     }
   double step = InpDlStep > 0 ? InpDlStep : MathPow(10, MathFloor(MathLog10(px))) / 20.0;
   double lo1 = MathFloor(px / step) * step, step2 = step * 2, lo2 = MathFloor(px / step2) * step2;
   AddLv(lp, lw, ln, lo1, 0.5, "Round number", px, lim);
   AddLv(lp, lw, ln, lo1 + step, 0.5, "Round number", px, lim);
   AddLv(lp, lw, ln, lo2, 1.0, "Round number", px, lim);
   AddLv(lp, lw, ln, lo2 + step2, 1.0, "Round number", px, lim);
   if(StringLen(InpDlAn) > 0)
     {
      string parts[]; int np = StringSplit(InpDlAn, ',', parts);
      for(int i = 0; i < np; i++) { string sx = parts[i]; StringTrimLeft(sx); StringTrimRight(sx); double v = StringToDouble(sx); if(v > 0) AddLv(lp, lw, ln, v, 2.5, "Analyst level", px, lim); }
     }
   //--- sort by price and merge
   int m = ArraySize(lp);
   int ord[]; ArrayResize(ord, m);
   for(int i = 0; i < m; i++) ord[i] = i;
   for(int i = 1; i < m; i++) { int v = ord[i]; int j = i - 1; while(j >= 0 && lp[ord[j]] > lp[v]) { ord[j + 1] = ord[j]; j--; } ord[j + 1] = v; }
   double tol = MathMax(ca * InpDlMerge, _Point * 5), zcap = PZoneMax(tfSecs) * 0.6;
   for(int ii = 0; ii < m; ii++)
     {
      int i = ord[ii]; int k = ArraySize(dZLo);
      if(k > 0 && lp[i] - dZHi[k - 1] <= tol && lp[i] - dZLo[k - 1] <= zcap)
        { dZHi[k - 1] = lp[i]; dZW[k - 1] += lw[i]; if(StringFind(dZN[k - 1], ln[i]) < 0) dZN[k - 1] += ", " + ln[i]; }
      else
        { ArrayResize(dZLo, k + 1); ArrayResize(dZHi, k + 1); ArrayResize(dZW, k + 1); ArrayResize(dZN, k + 1); dZLo[k] = lp[i]; dZHi[k] = lp[i]; dZW[k] = lw[i]; dZN[k] = ln[i]; }
     }
   int zc = ArraySize(dZLo);
   double pad = tol * 0.25;
   for(int i = 0; i < zc; i++) { dZLo[i] -= pad; dZHi[i] += pad; }
   ArrayResize(dZB, zc); ArrayResize(dZS, zc); ArrayResize(dZT, zc);
   for(int i = 0; i < zc; i++) { dZB[i] = 0; dZS[i] = 0; dZT[i] = -1000; }
  }

//+------------------------------------------------------------------+
//| Positions                                                        |
//+------------------------------------------------------------------+
int FindPos(ulong t) { for(int i = 0; i < ArraySize(pos); i++) if(pos[i].ticket == t) return i; return -1; }

//--- comment format: "FXW <kind><zid> s<stars> i<imp> a<atr>"
bool ParseComment(string c, string &kind, int &zid, int &stars, bool &imp, double &a)
  {
   if(StringFind(c, "FXW ") != 0) return false;
   string p[]; int np = StringSplit(c, ' ', p);
   if(np < 5) return false;
   kind = StringSubstr(p[1], 0, 1); zid = (int)StringToInteger(StringSubstr(p[1], 1));
   stars = (int)StringToInteger(StringSubstr(p[2], 1)); imp = StringSubstr(p[3], 1) == "1"; a = StringToDouble(StringSubstr(p[4], 1));
   return true;
  }

void ZoneOnFill(string kind, int zid)
  {
   if(kind == "L") { for(int z = 0; z < ArraySize(eng.zones); z++) if(eng.zones[z].id == zid) { eng.zones[z].entries++; eng.zones[z].lastE = eng.n - 1; } }
   if(kind == "M") { for(int z = 0; z < ArraySize(maj.zones); z++) if(maj.zones[z].id == zid) { maj.zones[z].entries++; maj.zones[z].lastE = eng.n - 1; } }
  }

void ZoneOnClose(string kind, int zid, bool stoppedBeforeTp1)
  {
   if(kind == "L") { for(int z = 0; z < ArraySize(eng.zones); z++) if(eng.zones[z].id == zid) { eng.zones[z].armed = false; if(stoppedBeforeTp1) eng.zones[z].entries = InpMaxEnt; } }
   if(kind == "M") { for(int z = 0; z < ArraySize(maj.zones); z++) if(maj.zones[z].id == zid) { maj.zones[z].armed = false; if(stoppedBeforeTp1) maj.zones[z].entries = InpMaxEnt; } }
  }

//--- sync records with the terminal and manage stops (every tick)
void ManagePositions(void)
  {
   for(int i = 0; i < ArraySize(pos); i++) pos[i].alive = false;
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || !PositionSelectByTicket(t)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      int pi = FindPos(t);
      if(pi < 0)
        {
         string kind; int zid, st; bool imp; double a;
         if(!ParseComment(PositionGetString(POSITION_COMMENT), kind, zid, st, imp, a)) { kind = "L"; zid = 0; st = 1; imp = false; a = eng.Atr(); }
         SPos np; np.ticket = t; np.dir = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 1 : -1;
         np.entry = PositionGetDouble(POSITION_PRICE_OPEN); np.hits = 0; np.stars = st; np.lots = PositionGetDouble(POSITION_VOLUME);
         np.kind = kind; np.zid = zid; np.alive = true;
         TpArr(np.entry, np.dir, tfSecs, imp, a, np.tps);
         pi = ArraySize(pos); ArrayResize(pos, pi + 1); pos[pi] = np;
         ZoneOnFill(kind, zid);
         if(InpPush) SendNotification("FOXREX " + _Symbol + " " + TfLabel(tfSecs) + (np.dir > 0 ? " BUY " : " SELL ") + DoubleToString(np.entry, _Digits) + " " + Stars(st));
        }
      pos[pi].alive = true;
      //--- targets touched (recorded on touch)
      double px = pos[pi].dir > 0 ? bid : ask;
      int before = pos[pi].hits;
      while(pos[pi].hits < 7 && (pos[pi].dir > 0 ? px >= pos[pi].tps[pos[pi].hits] : px <= pos[pi].tps[pos[pi].hits])) pos[pi].hits++;
      if(pos[pi].hits >= 1)   // re-applied every tick until the broker accepts it
        {
         double sl = PositionGetDouble(POSITION_SL), tp = PositionGetDouble(POSITION_TP);
         double ns = ProtSl(pos[pi].dir, pos[pi].entry, sl, pos[pi].hits, pos[pi].tps);
         if(MathAbs(ns - sl) > _Point) trade.PositionModify(t, NormalizeDouble(ns, _Digits), tp);
        }
     }
   //--- closed positions: update zones, drop records
   int keep = 0;
   for(int i = 0; i < ArraySize(pos); i++)
     {
      if(!pos[i].alive)
        {
         ZoneOnClose(pos[i].kind, pos[i].zid, pos[i].hits == 0);
         if(InpPush) SendNotification("FOXREX " + _Symbol + " closed" + (pos[i].hits > 0 ? " TP" + IntegerToString(pos[i].hits) : ""));
         continue;
        }
      if(keep != i) pos[keep] = pos[i];
      keep++;
     }
   ArrayResize(pos, keep);
  }

//--- time exits (new bar)
void TimeExits(void)
  {
   for(int i = 0; i < ArraySize(pos); i++)
     {
      if(!PositionSelectByTicket(pos[i].ticket)) continue;
      int bars = iBarShift(_Symbol, _Period, (datetime)PositionGetInteger(POSITION_TIME), false);
      bool stale = InpNoProg > 0 && pos[i].hits == 0 && bars >= InpNoProg;
      bool old   = pos[i].hits < 2 && bars >= InpMaxBars;
      if(stale || old) trade.PositionClose(pos[i].ticket);
     }
  }

void Busy(bool &busyB, bool &busyS)
  {
   bool unprot = false; int openN = 0, openDir = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || !PositionSelectByTicket(t)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      int d = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 1 : -1;
      double en = PositionGetDouble(POSITION_PRICE_OPEN), sl = PositionGetDouble(POSITION_SL);
      openN++; openDir = d;
      if(sl == 0 || d * (sl - en) < 0) unprot = true;
     }
   busyB = unprot || (InpMaxOpen > 0 && openN >= InpMaxOpen) || (openN > 0 && openDir < 0);
   busyS = unprot || (InpMaxOpen > 0 && openN >= InpMaxOpen) || (openN > 0 && openDir > 0);
  }

void DeletePendings(int dir)   // dir 0 = all
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t == 0 || OrderGetString(ORDER_SYMBOL) != _Symbol || OrderGetInteger(ORDER_MAGIC) != InpMagic) continue;
      long ot = OrderGetInteger(ORDER_TYPE);
      int d = (ot == ORDER_TYPE_BUY_LIMIT || ot == ORDER_TYPE_BUY_STOP) ? 1 : -1;
      if(dir == 0 || d == dir) trade.OrderDelete(t);
     }
  }

ulong FindPending(string cmt)
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t == 0 || OrderGetString(ORDER_SYMBOL) != _Symbol || OrderGetInteger(ORDER_MAGIC) != InpMagic) continue;
      if(StringFind(OrderGetString(ORDER_COMMENT), cmt) == 0) return t;
     }
   return 0;
  }

double LotsFor(int stars, double dist)
  {
   int sc = stars < 1 ? 1 : (stars > 4 ? 4 : stars);
   double f = InpLotByStars ? 1.0 + 0.5 * (sc - 1) : 1.0;
   double v = InpBaseLot * f;
   if(InpLotMode == LOT_RISK)
     {
      double tv = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE_LOSS), ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
      if(tv <= 0) tv = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
      double lossPerLot = (ts > 0 && tv > 0) ? dist / ts * tv : 0;
      if(lossPerLot > 0) v = AccountInfoDouble(ACCOUNT_EQUITY) * InpRiskPct / 100.0 * f / lossPerLot;
     }
   double st = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP), mn = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), mx = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(st > 0) v = NormalizeDouble(MathFloor(v / st + 1e-9) * st, (int)MathMax(0, MathCeil(-MathLog10(st))));
   if(InpMaxLot > 0) mx = MathMin(mx, InpMaxLot);
   return MathMin(MathMax(v, mn), mx);
  }

bool SpreadOk(void)
  {
   if(InpMaxSpread <= 0) return true;
   return SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) <= InpMaxSpread;
  }

string Cmt(string kind, int zid, int stars, bool imp, double a)
  {
   return "FXW " + kind + IntegerToString(zid) + " s" + IntegerToString(stars) + " i" + (imp ? "1" : "0") + " a" + DoubleToString(a, _Digits);
  }

//--- market entry
bool MarketEntry(int dir, double dist, int stars, string kind, int zid, bool imp)
  {
   if(!SpreadOk()) return false;
   double a = eng.Atr();
   double px = dir > 0 ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double stopsLvl = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   dist = MathMax(dist, stopsLvl + _Point);
   double tps[7]; TpArr(px, dir, tfSecs, imp, a, tps);
   double sl = NormalizeDouble(px - dir * dist, _Digits), tp = NormalizeDouble(tps[6], _Digits);
   double lots = LotsFor(stars, dist);
   string c = Cmt(kind, zid, stars, imp, a);
   bool ok = dir > 0 ? trade.Buy(lots, _Symbol, 0, sl, tp, c) : trade.Sell(lots, _Symbol, 0, sl, tp, c);
   return ok;
  }

//--- keep one pending limit per tradable zone (or enter at market if price is already beyond the level)
bool SyncPending(bool want, int dir, double level, double zSlBase, int stars, string kind, int zid, bool imp)
  {
   string c = Cmt(kind, zid, stars, imp, eng.Atr());
   string key = "FXW " + kind + IntegerToString(zid) + " ";
   ulong t = FindPending(key);
   if(!want) { if(t > 0) trade.OrderDelete(t); return false; }
   double a = eng.Atr();
   double dist = ClampSl(MathAbs(level - zSlBase), tfSecs, imp, a);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double stopsLvl = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   bool beyond = dir > 0 ? ask <= level : bid >= level;
   if(beyond)
     {
      if(t > 0) trade.OrderDelete(t);
      return MarketEntry(dir, dist, stars, kind, zid, imp);
     }
   if(dir > 0 ? ask - level < stopsLvl : level - bid < stopsLvl) return false;
   double tps[7]; TpArr(level, dir, tfSecs, imp, a, tps);
   double price = NormalizeDouble(level, _Digits), sl = NormalizeDouble(level - dir * dist, _Digits), tp = NormalizeDouble(tps[6], _Digits);
   double lots = LotsFor(stars, dist);
   if(t > 0)
     {
      if(OrderSelect(t) && MathAbs(OrderGetDouble(ORDER_PRICE_OPEN) - price) < _Point && MathAbs(OrderGetDouble(ORDER_SL) - sl) < _Point) return false;
      trade.OrderDelete(t);
     }
   if(!SpreadOk()) return false;
   if(dir > 0) trade.BuyLimit(lots, price, _Symbol, sl, tp, ORDER_TIME_GTC, 0, c);
   else        trade.SellLimit(lots, price, _Symbol, sl, tp, ORDER_TIME_GTC, 0, c);
   return false;   // a pending order is not an open trade yet
  }

//+------------------------------------------------------------------+
//| Drawing                                                          |
//+------------------------------------------------------------------+
void DrawRect(string nm, datetime t1, double p1, datetime t2, double p2, color c)
  {
   if(ObjectFind(0, nm) < 0) ObjectCreate(0, nm, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
   ObjectSetInteger(0, nm, OBJPROP_TIME, 0, t1); ObjectSetDouble(0, nm, OBJPROP_PRICE, 0, p1);
   ObjectSetInteger(0, nm, OBJPROP_TIME, 1, t2); ObjectSetDouble(0, nm, OBJPROP_PRICE, 1, p2);
   ObjectSetInteger(0, nm, OBJPROP_COLOR, c); ObjectSetInteger(0, nm, OBJPROP_FILL, true);
   ObjectSetInteger(0, nm, OBJPROP_BACK, true); ObjectSetInteger(0, nm, OBJPROP_SELECTABLE, false);
  }

void DrawLine(string nm, datetime t1, double p, datetime t2, color c, int w, ENUM_LINE_STYLE st)
  {
   if(ObjectFind(0, nm) < 0) ObjectCreate(0, nm, OBJ_TREND, 0, t1, p, t2, p);
   ObjectSetInteger(0, nm, OBJPROP_TIME, 0, t1); ObjectSetDouble(0, nm, OBJPROP_PRICE, 0, p);
   ObjectSetInteger(0, nm, OBJPROP_TIME, 1, t2); ObjectSetDouble(0, nm, OBJPROP_PRICE, 1, p);
   ObjectSetInteger(0, nm, OBJPROP_COLOR, c); ObjectSetInteger(0, nm, OBJPROP_WIDTH, w); ObjectSetInteger(0, nm, OBJPROP_STYLE, st);
   ObjectSetInteger(0, nm, OBJPROP_RAY_RIGHT, false); ObjectSetInteger(0, nm, OBJPROP_SELECTABLE, false); ObjectSetInteger(0, nm, OBJPROP_BACK, true);
  }

void DrawText(string nm, datetime t, double p, string txt, color c)
  {
   if(ObjectFind(0, nm) < 0) ObjectCreate(0, nm, OBJ_TEXT, 0, t, p);
   ObjectSetInteger(0, nm, OBJPROP_TIME, 0, t); ObjectSetDouble(0, nm, OBJPROP_PRICE, 0, p);
   ObjectSetString(0, nm, OBJPROP_TEXT, txt); ObjectSetInteger(0, nm, OBJPROP_COLOR, c);
   ObjectSetInteger(0, nm, OBJPROP_FONTSIZE, 7); ObjectSetInteger(0, nm, OBJPROP_ANCHOR, ANCHOR_LEFT); ObjectSetInteger(0, nm, OBJPROP_SELECTABLE, false);
  }

void Redraw(void)
  {
   if(!InpDraw) return;
   ObjectsDeleteAll(0, FXW_PFX + "Z");
   ObjectsDeleteAll(0, FXW_PFX + "D");
   datetime tR = TimeCurrent() + 6 * tfSecs;
   color grey = C'38,42,50', cBuy = C'0,212,167', cSell = C'255,92,122';
   for(int z = 0; z < ArraySize(eng.zones); z++)
     {
      if(eng.zones[z].state > 1 || MathAbs(eng.zones[z].p0 - eng.zones[z].p1) < InpMinLeg * eng.Atr()) continue;
      double zA, zB; CapZ(eng.Lvl(eng.zones[z], InpFEntry), eng.Lvl(eng.zones[z], InpFZone), tfSecs, zA, zB);
      string nm = FXW_PFX + "Z" + IntegerToString(eng.zones[z].id);
      DrawRect(nm, eng.T[eng.zones[z].b1], MathMax(zA, zB), tR, MathMin(zA, zB), grey);
      DrawLine(nm + "m", eng.T[eng.zones[z].b1], (zA + zB) / 2, tR, eng.zones[z].dir > 0 ? cBuy : cSell, 2, STYLE_SOLID);
      DrawText(nm + "t", tR, MathMax(zA, zB), TfLabel(tfSecs) + (eng.zones[z].dir > 0 ? " BUY ZONE " : " SELL ZONE ") + Stars(eng.zones[z].stars), eng.zones[z].dir > 0 ? cBuy : cSell);
     }
   if(majOn)
      for(int z = 0; z < ArraySize(maj.zones); z++)
        {
         if(maj.zones[z].state > 1) continue;
         double zA, zB; CapZ(maj.Lvl(maj.zones[z], InpFEntry), maj.Lvl(maj.zones[z], InpFZone), maj.secs, zA, zB);
         string nm = FXW_PFX + "ZM" + IntegerToString(maj.zones[z].id);
         DrawRect(nm, maj.T[maj.zones[z].b1], MathMax(zA, zB), tR, MathMin(zA, zB), C'50,55,64');
         DrawLine(nm + "m", maj.T[maj.zones[z].b1], (zA + zB) / 2, tR, maj.zones[z].dir > 0 ? cBuy : cSell, 3, STYLE_SOLID);
         DrawText(nm + "t", tR, MathMax(zA, zB), TfLabel(maj.secs) + (maj.zones[z].dir > 0 ? " BUY ZONE · MAJOR" : " SELL ZONE · MAJOR"), maj.zones[z].dir > 0 ? cBuy : cSell);
        }
   datetime t0 = iTime(_Symbol, PERIOD_D1, 0);
   double px = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   for(int i = 0; i < ArraySize(dZLo); i++)
     {
      bool res = dZLo[i] > px;
      color c = res ? cSell : cBuy;
      int w = dZW[i] >= 6 ? 4 : dZW[i] >= 4 ? 3 : dZW[i] >= 2 ? 2 : 1;
      string nm = FXW_PFX + "D" + IntegerToString(i);
      DrawLine(nm, t0, (dZLo[i] + dZHi[i]) / 2, tR, c, w, STYLE_SOLID);
      DrawText(nm + "t", tR, (dZLo[i] + dZHi[i]) / 2, (res ? "D1 SELL " : "D1 BUY ") + DoubleToString((dZLo[i] + dZHi[i]) / 2, _Digits), c);
     }
  }

//+------------------------------------------------------------------+
//| Daily results for the dashboard                                  |
//+------------------------------------------------------------------+
void TodayStats(int &trades, int &wins, double &profit)
  {
   trades = 0; wins = 0; profit = 0;
   datetime from = iTime(_Symbol, PERIOD_D1, 0);
   if(!HistorySelect(from, TimeCurrent() + 60)) return;
   for(int i = 0; i < HistoryDealsTotal(); i++)
     {
      ulong d = HistoryDealGetTicket(i);
      if(HistoryDealGetString(d, DEAL_SYMBOL) != _Symbol || HistoryDealGetInteger(d, DEAL_MAGIC) != InpMagic) continue;
      if(HistoryDealGetInteger(d, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      double pr = HistoryDealGetDouble(d, DEAL_PROFIT) + HistoryDealGetDouble(d, DEAL_COMMISSION) + HistoryDealGetDouble(d, DEAL_SWAP);
      trades++; if(pr > 0) wins++; profit += pr;
     }
  }

void Dashboard(bool okB, bool okS)
  {
   int tr, wn; double pr; TodayStats(tr, wn, pr);
   double fl = 0; int op = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || !PositionSelectByTicket(t)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      fl += PositionGetDouble(POSITION_PROFIT); op++;
     }
   string tt = eng.trend > 0 ? "UP" : eng.trend < 0 ? "DOWN" : "RANGE";
   string mt = majOn ? (maj.trend > 0 ? "UP" : maj.trend < 0 ? "DOWN" : "RANGE") : "off";
   string al = okB && !okS ? "BUY only" : okS && !okB ? "SELL only" : okB && okS ? "both" : "S/R zones only";
   Comment("FOXREX Waves EA v" + FXW_VER + "  ·  " + _Symbol + " " + TfLabel(tfSecs) +
           "\nDirection: " + TfLabel(tfSecs) + " " + tt + "   major " + (majOn ? TfLabel(maj.secs) : "") + " " + mt +
           "\nTrades allowed: " + al +
           "\nOpen: " + IntegerToString(op) + "   floating " + DoubleToString(fl, 2) +
           "\nToday: " + IntegerToString(tr) + " closed · " + IntegerToString(wn) + " won · " + DoubleToString(pr, 2));
  }

//+------------------------------------------------------------------+
//| Entries (run on each new bar of the chart timeframe)             |
//+------------------------------------------------------------------+
void OnNewBar(bool live)
  {
   int k = eng.n - 1;
   if(k < 30) return;
   double a = eng.Atr();
   double O0 = eng.O[k], H0 = eng.H[k], L0 = eng.L[k], C0 = eng.C[k];
   //--- abnormal candle filter
   bool spk = false;
   for(int i = 0; i < InpSpkLook && k - i >= 1; i++) if(eng.H[k - i] - eng.L[k - i] > InpSpkK * eng.ATR[k - i - 1]) spk = true;
   bool spkBlock = InpUseSpk && spk;
   //--- RSI and room
   double rsiV = eng.RSI[k];
   double rLo = 100, rHi = 0; for(int i = 0; i < 10 && k - i >= 0; i++) { rLo = MathMin(rLo, eng.RSI[k - i]); rHi = MathMax(rHi, eng.RSI[k - i]); }
   bool osRecent = rLo <= InpRsiOS, obRecent = rHi >= InpRsiOB;
   double supHi = 0, resLo = 0;
   for(int j = 0; j < ArraySize(dZLo); j++)
     {
      if(dZHi[j] < C0 && (supHi == 0 || dZHi[j] > supHi)) supHi = dZHi[j];
      if(dZLo[j] > C0 && (resLo == 0 || dZLo[j] < resLo)) resLo = dZLo[j];
     }
   //--- major zones: live, touched on the chart, active
   bool majBuyAct = false, majSellAct = false;
   if(majOn)
      for(int z = 0; z < ArraySize(maj.zones); z++)
        {
         if(maj.zones[z].state > 1) continue;
         double zA, zB; CapZ(maj.Lvl(maj.zones[z], InpFEntry), maj.Lvl(maj.zones[z], InpFZone), maj.secs, zA, zB);
         if(maj.zones[z].dir > 0 ? L0 <= zA : H0 >= zA) maj.zones[z].tchChart = true;
         double zI = maj.Lvl(maj.zones[z], InpFInv);
         bool act = (maj.zones[z].state == 1 || maj.zones[z].tchChart) && (maj.zones[z].dir > 0 ? (C0 > zI && C0 < maj.zones[z].p1) : (C0 < zI && C0 > maj.zones[z].p1));
         if(act) { if(maj.zones[z].dir > 0) majBuyAct = true; else majSellAct = true; }
        }
   double roomNeed = PTp(tfSecs, tfSecs <= 60 ? 1 : 0, a);
   bool roomBuy  = !InpUseRoom || ((resLo == 0 || resLo - C0 >= roomNeed) && !majSellAct);
   bool roomSell = !InpUseRoom || ((supHi == 0 || C0 - supHi >= roomNeed) && !majBuyAct);
   bool rsiBuy = !InpUseRsi || rsiV <= InpRsiOB, rsiSell = !InpUseRsi || rsiV >= InpRsiOS;
   bool strF = InpMajFlt == MAJ_STRUCT_ZONE && majOn && maj.trend != 0;
   bool okBuy  = !(InpMajFlt != MAJ_OFF && majSellAct) && !(strF && maj.trend < 0) && rsiBuy && roomBuy;
   bool okSell = !(InpMajFlt != MAJ_OFF && majBuyAct) && !(strF && maj.trend > 0) && rsiSell && roomSell;
   int trend = eng.trend;
   bool trOn = InpDir == DIR_TREND, alB = InpDir != DIR_SELL, alS = InpDir != DIR_BUY;
   bool okBuyZ = okBuy && (trOn ? trend >= 0 : alB), okSellZ = okSell && (trOn ? trend <= 0 : alS);
   if(live) Dashboard(okBuy && (trOn ? trend > 0 : alB), okSell && (trOn ? trend < 0 : alS));
   bool busyB = true, busyS = true;
   if(live) Busy(busyB, busyS);
   int rb = eng.RangeBars();

   //--- 1 · reversal at strong zones
   if(live && InpUseRev && !spkBlock)
     {
      double lo10 = DBL_MAX, hi10 = 0; for(int i = 1; i <= 10 && k - i >= 0; i++) { lo10 = MathMin(lo10, eng.L[k - i]); hi10 = MathMax(hi10, eng.H[k - i]); }
      bool rvBull = L0 < lo10 && C0 > O0 && (C0 > eng.H[k - 1] || MathMin(O0, C0) - L0 >= 0.5 * (H0 - L0));
      bool rvBear = H0 > hi10 && C0 < O0 && (C0 < eng.L[k - 1] || H0 - MathMax(O0, C0) >= 0.5 * (H0 - L0));
      if(rvBull || rvBear)
        {
         int d = rvBull ? 1 : -1;
         bool okR = d > 0 ? (alB && !busyB && rsiBuy && roomBuy && !(InpMajFlt != MAJ_OFF && majSellAct)) : (alS && !busyS && rsiSell && roomSell && !(InpMajFlt != MAJ_OFF && majBuyAct));
         int hitIx = -1, hitMz = -1;
         if(okR)
            for(int j = 0; j < ArraySize(dZLo) && hitIx < 0; j++)
              {
               if(dZW[j] < InpDlMinW || (d > 0 ? dZB[j] >= 2 : dZS[j] >= 2)) continue;
               double lo = dZLo[j], hi = dZHi[j];
               if(d > 0 ? (L0 <= hi && L0 >= lo - a && C0 > (lo + hi) / 2) : (H0 >= lo && H0 <= hi + a && C0 < (lo + hi) / 2)) hitIx = j;
              }
         if(okR && hitIx < 0 && majOn)
            for(int z = 0; z < ArraySize(maj.zones) && hitMz < 0; z++)
              {
               if(maj.zones[z].state > 1 || maj.zones[z].dir != d || maj.zones[z].entries >= InpMaxEnt) continue;
               double zA, zB; CapZ(maj.Lvl(maj.zones[z], InpFEntry), maj.Lvl(maj.zones[z], InpFZone), maj.secs, zA, zB);
               double lo = MathMin(zA, zB), hi = MathMax(zA, zB);
               if(d > 0 ? (L0 <= hi && L0 >= lo - a && C0 > (lo + hi) / 2) : (H0 >= lo && H0 <= hi + a && C0 < (lo + hi) / 2)) hitMz = z;
              }
         if(hitIx >= 0 || hitMz >= 0)
           {
            double dist = ClampSl(d > 0 ? C0 - (L0 - InpSlBuf * a) : (H0 + InpSlBuf * a) - C0, tfSecs, true, a);
            int st = (int)MathMin(3 + (d > 0 ? (osRecent ? 1 : 0) : (obRecent ? 1 : 0)), 4);
            if(hitIx >= 0) { dZT[hitIx] = k; if(d > 0) dZB[hitIx]++; else dZS[hitIx]++; }
            else           { maj.zones[hitMz].entries++; maj.zones[hitMz].lastE = k; }
            if(MarketEntry(d, dist, st, "R", hitMz >= 0 ? maj.zones[hitMz].id : 0, true)) { busyB = true; busyS = true; }
           }
        }
     }

   //--- 2 · daily zone rejection
   if(live && InpTradeDL && !spkBlock && !(busyB && busyS))
     {
      double hc12 = 0, lc12 = DBL_MAX; for(int i = 1; i <= 12 && k - i >= 0; i++) { hc12 = MathMax(hc12, eng.C[k - i]); lc12 = MathMin(lc12, eng.C[k - i]); }
      double lw3 = MathMin(L0, MathMin(eng.L[k - 1], eng.L[k - 2])), hg3 = MathMax(H0, MathMax(eng.H[k - 1], eng.H[k - 2]));
      for(int j = 0; j < ArraySize(dZLo); j++)
        {
         if(dZW[j] < InpDlMinW || k - dZT[j] < 10) continue;
         double lo = dZLo[j], hi = dZHi[j];
         bool bR = !busyB && okBuyZ && dZB[j] < 2 && lo < C0 && hc12 > hi && lw3 <= hi && C0 > hi && C0 > O0;
         bool sR = !busyS && okSellZ && dZS[j] < 2 && hi > C0 && lc12 < lo && hg3 >= lo && C0 < lo && C0 < O0;
         if(bR || sR)
           {
            int d = bR ? 1 : -1;
            double dist = ClampSl(d > 0 ? C0 - (MathMin(lo, L0) - InpSlBuf * a) : (MathMax(hi, H0) + InpSlBuf * a) - C0, tfSecs, true, a);
            int st = (int)MathMin((dZW[j] >= 4 ? 3 : 2) + (d > 0 ? (osRecent ? 1 : 0) : (obRecent ? 1 : 0)), 4);
            dZT[j] = k; if(d > 0) dZB[j]++; else dZS[j]++;
            if(MarketEntry(d, dist, st, "D", j, true)) { busyB = true; busyS = true; }
            break;
           }
        }
     }

   //--- 3 · wave zones (local + major): rejection at bar close, pending limits for the next bars
   for(int pass = 0; pass < 2; pass++)
     {
      if(pass == 1 && (!majOn || !InpTradeMj)) break;
      int cnt = pass == 0 ? ArraySize(eng.zones) : ArraySize(maj.zones);
      for(int z = 0; z < cnt; z++)
        {
         SZone zz;
         if(pass == 0) zz = eng.zones[z];
         else          zz = maj.zones[z];
         int capS = pass == 0 ? tfSecs : maj.secs;
         bool imp = pass == 1;
         string kind = pass == 0 ? "L" : "M";
         double zA, zB, zI;
         if(pass == 0) { CapZ(eng.Lvl(zz, InpFEntry), eng.Lvl(zz, InpFZone), capS, zA, zB); zI = eng.Lvl(zz, InpFInv); }
         else          { CapZ(maj.Lvl(zz, InpFEntry), maj.Lvl(zz, InpFZone), capS, zA, zB); zI = maj.Lvl(zz, InpFInv); }
         double zCu = pass == 0 ? eng.Lvl(zz, InpECust) : maj.Lvl(zz, InpECust);
         double level = InpELvl == ELVL_START ? zA : InpELvl == ELVL_END ? zB : InpELvl == ELVL_CUSTOM ? zCu : (zA + zB) / 2;
         int d = zz.dir;
         bool valid = MathAbs(zz.p0 - zz.p1) >= InpMinLeg * (pass == 0 ? a : maj.Atr());
         bool trendOk;
         if(!trOn)          trendOk = d > 0 ? alB : alS;
         else if(pass == 1) trendOk = d > 0 ? trend >= 0 : trend <= 0;
         else               trendOk = d == trend || (trend == 0 && (zz.brk || k - zz.bB <= rb));
         bool filt = d > 0 ? (pass == 0 ? okBuy : okBuyZ) : (pass == 0 ? okSell : okSellZ);
         int st = pass == 0 ? zz.stars : 2;
         st = (int)MathMin(st + (d > 0 ? (osRecent ? 1 : 0) : (obRecent ? 1 : 0)), 4);
         bool can = zz.state <= 1 && valid && (pass == 1 || k > zz.b1) && zz.armed && (pass == 1 || zz.stars >= MinStars(tfSecs))
                    && zz.entries < InpMaxEnt && k - zz.lastE >= InpReCool && trendOk && filt && !spkBlock && !(d > 0 ? busyB : busyS);
         //--- warm-up: simulate fills so old zones are not traded again
         if(!live)
           {
            bool lvlHit = d < 0 ? H0 >= level : L0 <= level;
            if(zz.state <= 1 && valid && zz.armed && lvlHit && InpEntry != ENTRY_REJ && (pass == 0 || eng.T[k] >= maj.T[zz.b1] + maj.secs))
              {
               if(pass == 0) { eng.zones[z].entries++; eng.zones[z].lastE = k; eng.zones[z].armed = false; }
               else          { maj.zones[z].entries++; maj.zones[z].lastE = k; maj.zones[z].armed = false; }
              }
            continue;
           }
         //--- rejection entry at the close (not far from the zone)
         bool inZone = d < 0 ? H0 >= zA : L0 <= zA;
         bool rej = (d < 0 ? C0 < zB : C0 > zB) && (d > 0 ? (C0 > O0 || MathMin(O0, C0) - L0 >= 0.4 * (H0 - L0)) : (C0 < O0 || H0 - MathMax(O0, C0) >= 0.4 * (H0 - L0)));
         bool near = d < 0 ? C0 >= zA - MathAbs(zA - zB) : C0 <= zA + MathAbs(zA - zB);
         bool invalid = d < 0 ? C0 > zI : C0 < zI;
         bool hitLvl = d < 0 ? H0 >= level : L0 <= level;
         //--- journal: the entry level (or a rejection) was reached but the rules gave no trade
         if(InpLogSkip && !can && zz.state <= 1 && valid && !invalid && (pass == 1 || k > zz.b1) && ((InpEntry != ENTRY_REJ && hitLvl) || (InpEntry != ENTRY_LIM && inZone && rej && near)) && k - zz.skK > 1)
           {
            string w = "";
            if(!trendOk) w += trOn ? (trend == 0 ? " range;" : " against trend;") : " direction setting;";
            if(!filt) w += (d > 0 ? !rsiBuy : !rsiSell) ? " RSI " + DoubleToString(rsiV, 1) + ";" : (d > 0 ? !roomBuy : !roomSell) ? " room;" : " major filter;";
            if(d > 0 ? busyB : busyS) w += " other trade open;";
            if(spkBlock) w += " abnormal candle;";
            if(pass == 0 && zz.stars < MinStars(tfSecs)) w += " stars " + IntegerToString(zz.stars) + ";";
            if(!zz.armed) w += " not armed;";
            if(zz.entries >= InpMaxEnt) w += " zone used;";
            if(k - zz.lastE < InpReCool) w += " cooldown;";
            PrintFormat("FOXREX %s %s zone %d: level %s reached, no trade:%s", pass == 0 ? "local" : "major", d > 0 ? "BUY" : "SELL", zz.id, DoubleToString(level, _Digits), w);
            if(pass == 0) eng.zones[z].skK = k; else maj.zones[z].skK = k;
           }
         if(can && InpEntry != ENTRY_LIM && inZone && rej && near && !invalid && !(InpEntry == ENTRY_LIM_REJ && hitLvl))
           {
            double dist = ClampSl(MathAbs(C0 - ((d < 0 ? MathMax(zI, H0) : MathMin(zI, L0)) - d * InpSlBuf * a)), tfSecs, imp, a);
            if(MarketEntry(d, dist, st, kind, zz.id, imp)) { busyB = true; busyS = true; can = false; }
           }
         //--- pending limit at 50% (or the zone start)
         bool wantPend = can && InpEntry != ENTRY_REJ;
         if(SyncPending(wantPend, d, level, zI - d * InpSlBuf * a, st, kind, zz.id, imp)) { busyB = true; busyS = true; }
        }
     }
   //--- remove pendings of zones that no longer exist
   if(!live) return;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t == 0 || OrderGetString(ORDER_SYMBOL) != _Symbol || OrderGetInteger(ORDER_MAGIC) != InpMagic) continue;
      string kind; int zid, st; bool imp; double aa;
      if(!ParseComment(OrderGetString(ORDER_COMMENT), kind, zid, st, imp, aa)) continue;
      bool found = false;
      if(kind == "L") for(int z = 0; z < ArraySize(eng.zones); z++) if(eng.zones[z].id == zid && eng.zones[z].state <= 1) found = true;
      if(kind == "M") for(int z = 0; z < ArraySize(maj.zones); z++) if(maj.zones[z].id == zid && maj.zones[z].state <= 1) found = true;
      if(!found) trade.OrderDelete(t);
     }
  }

//+------------------------------------------------------------------+
//| Feeding bars                                                     |
//+------------------------------------------------------------------+
void FeedMajor(void)
  {
   if(!majOn) return;
   datetime t = iTime(_Symbol, majTf, 1);
   if(t == 0 || t <= lastMajBar) return;
   MqlRates r[]; ArraySetAsSeries(r, false);
   int need = lastMajBar == 0 ? 600 : 50;
   int got = CopyRates(_Symbol, majTf, 1, need, r);
   for(int i = 0; i < got; i++) if(r[i].time > lastMajBar) { maj.AddBar(r[i]); lastMajBar = r[i].time; }
  }

int DayKey(datetime t) { MqlDateTime s; TimeToStruct(t, s); return s.year * 10000 + s.mon * 100 + s.day; }

void CheckDay(void)
  {
   datetime d0 = iTime(_Symbol, PERIOD_D1, 0);
   if(d0 == 0) return;
   int dk = DayKey(d0);
   if(dk != dayKeyNow)
     {
      BuildDaily(iOpen(_Symbol, PERIOD_D1, 0), eng.Atr());
      if(ArraySize(dZLo) > 0) dayKeyNow = dk;   // retried on the next bar if D1 data was not ready
     }
  }

//+------------------------------------------------------------------+
//| Events                                                           |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpSwLen < 2 || InpStL < 1) return INIT_PARAMETERS_INCORRECT;
   trade.SetExpertMagicNumber((ulong)InpMagic);
   trade.SetTypeFillingBySymbol(_Symbol);
   tfSecs = PeriodSeconds(_Period);
   eng.Init(_Period, 2);
   //--- major timeframe
   ENUM_TIMEFRAMES autoTf = tfSecs <= 60 ? PERIOD_M15 : tfSecs <= 300 ? PERIOD_H1 : tfSecs <= 900 ? PERIOD_H4 : tfSecs <= 3600 ? PERIOD_D1 : PERIOD_W1;
   majTf = InpMajAuto ? autoTf : InpMajTf;
   majOn = InpUseMaj && PeriodSeconds(majTf) > tfSecs;
   maj.Init(majOn ? majTf : _Period, 1);
   FeedMajor();
   //--- warm-up on history (no trading)
   MqlRates r[]; ArraySetAsSeries(r, false);
   int got = CopyRates(_Symbol, _Period, 1, (int)MathMax(InpWarmup, 200), r);
   if(got <= 0) { Print("FOXREX Waves: no history yet"); return INIT_SUCCEEDED; }
   for(int i = 0; i < got; i++)
     {
      eng.AddBar(r[i]);
      lastBar = r[i].time;
      OnNewBar(false);
     }
   CheckDay();
   Redraw();
   EventSetTimer(5);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   ObjectsDeleteAll(0, FXW_PFX);
   Comment("");
  }

void OnTick()
  {
   ManagePositions();
   //--- protect the rule "new trades only when the open ones are protected"
   bool bB, bS; Busy(bB, bS);
   if(bB) DeletePendings(1);
   if(bS) DeletePendings(-1);
   //--- new closed bar of the chart timeframe
   datetime t = iTime(_Symbol, _Period, 1);
   if(t != 0 && t > lastBar)
     {
      MqlRates r[]; ArraySetAsSeries(r, false);
      int got = CopyRates(_Symbol, _Period, 1, 20, r);
      for(int i = 0; i < got; i++) if(r[i].time > lastBar) { eng.AddBar(r[i]); lastBar = r[i].time; }
      FeedMajor();
      CheckDay();
      TimeExits();
      OnNewBar(true);
      Redraw();
     }
  }

void OnTimer()
  {
   ManagePositions();
  }
//+------------------------------------------------------------------+
