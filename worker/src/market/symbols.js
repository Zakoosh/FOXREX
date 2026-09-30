/* FOXREX market symbol registry — the ONLY place canonical symbols are mapped to provider symbols,
   trading calendars, freshness thresholds and quality limits. Nothing else in the codebase may hard-code
   a provider symbol.

   Canonical symbol  → { providers: { <adapter>: <providerSymbol> } }
   A symbol a provider does not list is simply not covered by that provider (never guessed).
   Operators can add/override mappings without code changes:
     MARKET_SYMBOL_MAP="bridge:XAUUSD=XAUUSD.m;bridge:EURUSD=EURUSD.m"                           */

/* Freshness per asset class (ms). LIVE ≤ liveMs, DELAYED ≤ delayedMs, older → STALE.
   Env overrides: MARKET_LIVE_MS_<CLASS>, MARKET_DELAYED_MS_<CLASS> (CLASS = FX, METAL, CRYPTO, INDEX, ENERGY). */
export const FRESHNESS = {
  fx: { liveMs: 60e3, delayedMs: 20 * 60e3 },
  metal: { liveMs: 60e3, delayedMs: 20 * 60e3 },
  crypto: { liveMs: 60e3, delayedMs: 10 * 60e3 },
  index: { liveMs: 120e3, delayedMs: 20 * 60e3 },
  energy: { liveMs: 120e3, delayedMs: 20 * 60e3 }
};

/* Quality limits per asset class: widest acceptable spread (fraction of mid) and the largest
   single-update move accepted without a confirming second quote. */
export const QUALITY = {
  fx: { maxSpreadPct: 0.005, maxJumpPct: 0.04 },
  metal: { maxSpreadPct: 0.01, maxJumpPct: 0.06 },
  crypto: { maxSpreadPct: 0.02, maxJumpPct: 0.15 },
  index: { maxSpreadPct: 0.01, maxJumpPct: 0.08 },
  energy: { maxSpreadPct: 0.02, maxJumpPct: 0.12 }
};

/* calendar: see sessions.js — 'fx' (Sun 17:00 → Fri 17:00 New York), 'metal' (same + daily 17:00–18:00 NY break),
   'cme' (index/energy futures & CFDs: Sun 18:00 → Fri 17:00 NY, daily 17:00–18:00 break), 'always' (crypto). */
const S = (symbol, name, assetClass, calendar, decimals, providers, pub = false) => ({ symbol, name, assetClass, calendar, decimals, providers, public: pub });

export const SYMBOLS = [
  // Initial public symbols (the public ticker order)
  S('XAUUSD', ['Gold / US Dollar', 'الذهب / الدولار الأمريكي'], 'metal', 'metal', 2, { oanda: 'XAU_USD', twelvedata: 'XAU/USD', bridge: 'XAUUSD' }, true),
  S('EURUSD', ['Euro / US Dollar', 'اليورو / الدولار الأمريكي'], 'fx', 'fx', 5, { oanda: 'EUR_USD', twelvedata: 'EUR/USD', bridge: 'EURUSD' }, true),
  S('GBPUSD', ['British Pound / US Dollar', 'الجنيه الإسترليني / الدولار الأمريكي'], 'fx', 'fx', 5, { oanda: 'GBP_USD', twelvedata: 'GBP/USD', bridge: 'GBPUSD' }, true),
  S('USDJPY', ['US Dollar / Japanese Yen', 'الدولار الأمريكي / الين الياباني'], 'fx', 'fx', 3, { oanda: 'USD_JPY', twelvedata: 'USD/JPY', bridge: 'USDJPY' }, true),
  S('BTCUSD', ['Bitcoin / US Dollar', 'البيتكوين / الدولار الأمريكي'], 'crypto', 'always', 2, { coinbase: 'BTC-USD', twelvedata: 'BTC/USD', bridge: 'BTCUSD' }, true),
  // DXY is an ICE index. It is NOT derived from FX pairs here — only a provider that licenses the index may supply it.
  S('DXY', ['US Dollar Index', 'مؤشر الدولار الأمريكي'], 'index', 'cme', 2, { twelvedata: 'DXY', bridge: 'DXY' }, true),
  // Prepared (not shown publicly until enabled in MARKET_SYMBOLS)
  S('XAGUSD', ['Silver / US Dollar', 'الفضة / الدولار الأمريكي'], 'metal', 'metal', 3, { oanda: 'XAG_USD', twelvedata: 'XAG/USD', bridge: 'XAGUSD' }),
  S('US30', ['Dow Jones 30', 'داو جونز 30'], 'index', 'cme', 1, { oanda: 'US30_USD', bridge: 'US30' }),
  S('NAS100', ['Nasdaq 100', 'ناسداك 100'], 'index', 'cme', 1, { oanda: 'NAS100_USD', bridge: 'NAS100' }),
  S('SPX500', ['S&P 500', 'إس آند بي 500'], 'index', 'cme', 1, { oanda: 'SPX500_USD', bridge: 'SPX500' }),
  S('WTI', ['WTI Crude Oil', 'خام غرب تكساس'], 'energy', 'cme', 2, { oanda: 'WTICO_USD', twelvedata: 'WTI/USD', bridge: 'WTI' }),
  S('ETHUSD', ['Ethereum / US Dollar', 'الإيثريوم / الدولار الأمريكي'], 'crypto', 'always', 2, { coinbase: 'ETH-USD', twelvedata: 'ETH/USD', bridge: 'ETHUSD' })
];

export const PUBLIC_DEFAULT = SYMBOLS.filter(s => s.public).map(s => s.symbol);
const BY = new Map(SYMBOLS.map(s => [s.symbol, s]));

/** Canonicalise user/provider input: "xau/usd", "XAU_USD", "BTC-USD" → "XAUUSD" / "BTCUSD" (registry symbols only). */
export function canonical(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return BY.has(s) ? s : null;
}
export const get = symbol => BY.get(symbol) || null;

/** Build the effective registry: default mappings + MARKET_SYMBOL_MAP overrides. */
export function buildRegistry({ overrides = '', env = {} } = {}) {
  const map = new Map(SYMBOLS.map(s => [s.symbol, { ...s, providers: { ...s.providers } }]));
  for (const part of String(overrides || '').split(';').map(x => x.trim()).filter(Boolean)) {
    const m = /^([a-z0-9]+):([A-Z0-9]+)=(.+)$/.exec(part);
    if (!m || !map.has(m[2])) continue; // unknown canonical symbols are ignored, never invented
    map.get(m[2]).providers[m[1]] = m[3].trim();
  }
  const freshness = {}, quality = {};
  for (const [cls, v] of Object.entries(FRESHNESS)) {
    const K = cls.toUpperCase();
    freshness[cls] = { liveMs: +(env[`MARKET_LIVE_MS_${K}`] || v.liveMs), delayedMs: +(env[`MARKET_DELAYED_MS_${K}`] || v.delayedMs) };
    quality[cls] = { ...QUALITY[cls] };
  }
  return {
    symbols: map,
    get: sym => map.get(sym) || null,
    providerSymbol: (sym, provider) => (map.get(sym) || { providers: {} }).providers[provider] || null,
    /** Reverse lookup: provider symbol → canonical symbol (only for mapped symbols). */
    fromProvider: (provider, psym) => { for (const s of map.values()) if (s.providers[provider] === psym) return s.symbol; return null; },
    freshness: sym => freshness[(map.get(sym) || {}).assetClass] || freshness.fx,
    quality: sym => quality[(map.get(sym) || {}).assetClass] || quality.fx
  };
}
