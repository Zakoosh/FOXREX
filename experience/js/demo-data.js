/* ============================================================================================
   DEMO_DATA — deterministic, cinematic demonstration data for the FOXREX experience prototype.
   NOT market data. NOT a signal. NOT a performance record. Never imported by production code,
   the CMS, the publishing feed or the market-data service. Every screen that shows these values
   carries the "DEMO / CINEMATIC DATA" label.
   ============================================================================================ */
import { ema, bollinger, rsi, macd, atr, adx, structure } from './indicators.js';

export const DEMO_DATA = true;

/* Seeded PRNG so every visit renders the same film */
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* XAUUSD, 1-minute, 05:17 → 09:38 (262 bars, enough history for EMA 200). The path is authored so the story is
   true to the indicators computed from it: downtrend → base → rally → higher low → BOS 09:33 → retest 09:35 → 4328.50. */
export const OFFSET = 100; // bars before the visible story window
const ANCHORS = [[0, 4349.0], [40, 4343.5], [70, 4339.0], [100, 4335.2], [122, 4318.0], [145, 4304.5], [162, 4296.4], [180, 4301.8], [195, 4297.6], [212, 4306.2], [226, 4316.9], [240, 4322.9], [249, 4314.4], [254, 4320.6], [256, 4325.2], [257, 4326.3], [258, 4324.6], [259, 4326.1], [260, 4327.4], [261, 4328.5]];
function path(i) { for (let k = 1; k < ANCHORS.length; k++) { const [i0, p0] = ANCHORS[k - 1], [i1, p1] = ANCHORS[k]; if (i <= i1) { const u = (i - i0) / (i1 - i0), e = u * u * (3 - 2 * u); return p0 + (p1 - p0) * e; } } return ANCHORS.at(-1)[1]; }

export function makeCandles() {
  const rnd = mulberry32(20260930), N = 262, out = [];
  let prev = path(0);
  for (let i = 0; i < N; i++) {
    const target = path(i), late = i > 250, vol = 0.55 + (i > 250 ? 0.2 : 0) + (i > 160 && i < 210 ? -0.2 : 0);
    const close = i === N - 1 ? 4328.5 : target + (rnd() - 0.5) * vol * (late ? 0.5 : 1.6);
    const open = prev, hi = Math.max(open, close) + rnd() * vol, lo = Math.min(open, close) - rnd() * vol;
    const m = 5 * 60 + 17 + i, time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const volume = Math.round(400 + rnd() * 500 + (Math.abs(close - open) > 1 ? 700 : 0) + (i >= 255 ? 900 : 0));
    out.push({ i, time, o: round(open), h: round(hi), l: round(lo), c: round(close), v: volume }); prev = close;
  }
  return out;
}
const round = x => Math.round(x * 100) / 100;

export function analyse(candles) {
  const c = candles.map(x => x.c), h = candles.map(x => x.h), l = candles.map(x => x.l);
  const a = atr(h, l, c, 14);
  return { ema20: ema(c, 20), ema50: ema(c, 50), ema200: ema(c, 200), bb: bollinger(c, 20, 2), rsi: rsi(c, 14), macd: macd(c, 12, 26, 9), atr: a, adx: adx(h, l, c, 14), st: structure(h, l, c, a, 4) };
}

/* Evidence the reasoning chamber weighs — ILLUSTRATIVE prototype values. */
export const EVIDENCE = [
  { id: 'trend', label: 'TREND', state: 'Bullish', strength: 0.78, agree: true },
  { id: 'structure', label: 'STRUCTURE', state: 'BOS confirmed', strength: 0.84, agree: true },
  { id: 'momentum', label: 'MOMENTUM', state: 'Positive', strength: 0.70, agree: true },
  { id: 'volatility', label: 'VOLATILITY', state: 'Elevated', strength: 0.56, agree: false },
  { id: 'history', label: 'HISTORICAL BEHAVIOR', state: 'Similar states', strength: 0.61, agree: true },
  { id: 'ml', label: 'ML PROBABILITY', state: '0.72', strength: 0.72, agree: true },
  { id: 'session', label: 'SESSION', state: 'London · NY overlap', strength: 0.52, agree: true },
  { id: 'news', label: 'NEWS CONTEXT', state: 'CPI in 2h', strength: 0.60, agree: false },
  { id: 'risk', label: 'RISK', state: 'Acceptable', strength: 0.70, agree: true }
];

/* Decision replay — what FOXREX knew at each moment (index = candle index). */
export const REPLAY = [
  { i: 250, time: '09:27', event: 'Observing — pullback after the rally', decision: 'WAIT', conf: 0.41, risk: 'n/a', ev: { trend: 'Bullish', structure: 'Pullback', momentum: 'Fading', volatility: 'Normal', ml: '0.49', risk: '—' } },
  { i: 254, time: '09:31', event: 'Trend confirmed', decision: 'WAIT', conf: 0.52, risk: 'R/R 0.8 — rejected', ev: { trend: 'Bullish ✓', structure: 'Testing high', momentum: 'Neutral', volatility: 'Elevated', ml: '0.55', risk: 'Fail' } },
  { i: 256, time: '09:33', event: 'Structure break (BOS)', decision: 'WAIT', conf: 0.58, risk: 'Pending retest', ev: { trend: 'Bullish ✓', structure: 'BOS ✓', momentum: 'Neutral', volatility: 'Elevated', ml: '0.58', risk: 'Pending' } },
  { i: 257, time: '09:34', event: 'Momentum confirmation', decision: 'WAIT', conf: 0.63, risk: 'Pending retest', ev: { trend: 'Bullish ✓', structure: 'BOS ✓', momentum: 'Positive ✓', volatility: 'Elevated', ml: '0.61', risk: 'Pending' } },
  { i: 258, time: '09:35', event: 'Pullback toward 4,323 · volatility acceptable', decision: 'WAIT', conf: 0.63, risk: 'Waiting for retest', ev: { trend: 'Bullish ✓', structure: 'BOS ✓ · retesting', momentum: 'Positive ✓', volatility: 'Acceptable ✓', ml: '0.63', risk: 'Pending' } },
  { i: 259, time: '09:36', event: 'Retest holds · ML probability improves', decision: 'WAIT', conf: 0.70, risk: 'Improving', ev: { trend: 'Bullish ✓', structure: 'Retest ✓', momentum: 'Positive ✓', volatility: 'Acceptable ✓', ml: '0.72 ✓', risk: 'Checking' } },
  { i: 260, time: '09:37', event: 'Risk conditions pass', decision: 'WAIT', conf: 0.72, risk: 'Pass · R/R 1.5', ev: { trend: 'Bullish ✓', structure: 'Retest ✓', momentum: 'Positive ✓', volatility: 'Acceptable ✓', ml: '0.72 ✓', risk: 'Pass ✓' } },
  { i: 261, time: '09:38', event: 'DECISION', decision: 'BUY', conf: 0.72, risk: 'Pass · R/R 1.5', ev: { trend: 'Bullish ✓', structure: 'Retest ✓', momentum: 'Positive ✓', volatility: 'Acceptable ✓', ml: '0.72 ✓', risk: 'Pass ✓' } }
];

export const DECISION = { market: 'XAUUSD', action: 'BUY', entry: 4328.50, confidence: 0.72, risk: '0.5% per position', invalidation: 4313.80, target: 4351.00, rr: 1.53,
  summary: 'Trend, structure and momentum agree after the break above 4,323 held on retest.' };

export const RISK_CASES = [
  { name: 'Early long · 09:31', verdict: 'REJECTED', checks: [['ENTRY QUALITY', 'Chasing into resistance', false], ['INVALIDATION', '4,313.80', true], ['VOLATILITY', 'Elevated', false], ['SPREAD', 'Normal', true], ['POSITION RISK', '0.5%', true], ['RISK / REWARD', '0.8', false], ['MARKET CONDITIONS', 'Pre-CPI', true]] },
  { name: 'Retest long · 09:37', verdict: 'PASSED', checks: [['ENTRY QUALITY', 'Retest of broken level', true], ['INVALIDATION', '4,313.80', true], ['VOLATILITY', 'Acceptable', true], ['SPREAD', 'Normal', true], ['POSITION RISK', '0.5%', true], ['RISK / REWARD', '1.5', true], ['MARKET CONDITIONS', 'Overlap liquidity', true]] }
];

export const ASK = [
  { q: 'WHY BUY?', a: 'Trend, structure and momentum agreed once the break above 4,323 held on retest. ML probability reached 0.72. Risk passed with a defined invalidation.', focus: ['trend', 'structure', 'momentum', 'ml', 'risk'] },
  { q: 'WHY NOT EARLIER?', a: 'At 09:31 price pressed into resistance with reward/risk 0.8 and volatility elevated. The risk gate rejected it. FOXREX waited for the break and the retest.', focus: ['volatility', 'risk', 'structure'] },
  { q: 'WHAT WOULD INVALIDATE THIS?', a: 'A close below the higher low at 4,313.80. The bullish structure would fail and the idea is void — no averaging down.', focus: ['structure'] },
  { q: 'WHAT WAS THE BIGGEST RISK?', a: 'CPI in two hours. Volatility could expand through both target and stop, so position risk stays capped.', focus: ['news', 'volatility'] },
  { q: 'WHAT CHANGED?', a: 'The retest. Once 4,323 held as support, structure moved from “testing” to “confirmed” and ML probability rose from 0.58 to 0.72.', focus: ['structure', 'ml'] }
];

/* Live-intelligence constellation — DEMO values unless a real FOXREX Market API is configured. */
export const MARKETS = [
  { sym: 'XAUUSD', price: 4328.50, dp: 2, trend: 'Up', regime: 'Trending', vol: 'Elevated', signal: 'BUY', ai: 'Decided', conf: 0.72 },
  { sym: 'EURUSD', price: 1.08421, dp: 5, trend: 'Flat', regime: 'Range', vol: 'Normal', signal: 'WAIT', ai: 'Observing', conf: 0.51 },
  { sym: 'GBPUSD', price: 1.27104, dp: 5, trend: 'Down', regime: 'Weak trend', vol: 'Normal', signal: 'WAIT', ai: 'Conflicted', conf: 0.47 },
  { sym: 'USDJPY', price: 149.623, dp: 3, trend: 'Up', regime: 'Trending', vol: 'Low', signal: 'WAIT', ai: 'Risk gate', conf: 0.58 },
  { sym: 'BTCUSD', price: 64120.0, dp: 1, trend: 'Flat', regime: 'Expansion', vol: 'High', signal: 'NO SIGNAL', ai: 'Volatility filter', conf: 0.33 },
  { sym: 'ETHUSD', price: 3145.2, dp: 1, trend: 'Flat', regime: 'Range', vol: 'High', signal: 'WAIT', ai: 'Observing', conf: 0.44 }
];
/* Illustrative relationships drawn when a market is focused (sign only — no statistics claimed). */
export const LINKS = [['XAUUSD', 'USDJPY', -1], ['XAUUSD', 'EURUSD', 1], ['EURUSD', 'GBPUSD', 1], ['BTCUSD', 'ETHUSD', 1], ['XAUUSD', 'BTCUSD', 1], ['EURUSD', 'USDJPY', -1]];

/* Opening / noise fragments: genuine market-information shapes, cinematic values. */
export const FRAGMENTS = ['4328.50', 'XAUUSD', 'CPI', 'EURUSD', 'US10Y +4bp', 'BTCUSD', 'MACD', 'VOL ▲ 2.4×', 'GBPUSD 1.2710', '09:31:07', 'FOMC', 'RSI 61', 'USDJPY', 'DXY', 'ATR 3.9', 'NFP', 'BOS', 'EMA 200', 'BID 4328.30', 'ASK 4328.70', 'SPREAD 0.40', 'ECB', 'PMI 51.2', 'ADX 27', 'ETHUSD', 'HH', 'HL', 'LIQUIDITY', 'YIELD', 'GOLD', '−0.18', '+0.42', 'SESSION: LONDON', 'Fed speaker', 'OI ▲', 'VWAP'];
