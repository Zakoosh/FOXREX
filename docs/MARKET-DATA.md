# FOXREX Market Data Layer

**Status:** architecture complete and tested. **`PROVIDER_CONNECTION=BLOCKED_MISSING_CREDENTIALS`**: no provider account or key exists, and none was created. The public ticker keeps its honest "Market feed not connected" state until an operator activates a provider and a public Market API host.

## Pipeline

```
MARKET DATA PROVIDER  (OANDA · Twelve Data · Coinbase Exchange · operator MT5/broker bridge)
        ↓  adapter (worker/src/market/providers) — credentials only here, errors never echo them
PROVIDER ADAPTER      getQuotes(symbols) → provider payload
        ↓
NORMALIZATION         canonical quote: bid/ask/mid/spread or LAST-only; provider + provider symbol + times
        ↓
FRESHNESS / QUALITY   quality gate (reject) + freshness classification at read time
        ↓
FOXREX MARKET SERVICE single-flight polling, backoff, failover, latest-quote cache
        ↓
PUBLIC MARKET API     GET /api/market/quotes · GET /api/market/quote/:symbol (read-only, cached)
        ↓
foxrex.co             scripts/public/market.js — knows only the FOXREX API, never a provider
```

## Files

| Concern | File |
|---|---|
| Symbol registry: canonical ↔ provider symbols, calendars, freshness and quality limits | `worker/src/market/symbols.js` |
| Trading sessions in New York time, DST-aware | `worker/src/market/sessions.js` |
| Normalization, quality gate, freshness | `worker/src/market/quality.js` |
| Provider interface | `worker/src/market/providers/base.js` |
| Adapters: `oanda`, `twelvedata`, `coinbase`, `bridge` | `worker/src/market/providers/adapters.js` |
| Service, cache and resilience | `worker/src/market/service.js` |
| Public API and the optional market-only listener | `worker/src/market/routes.js` |
| Configuration (credentials from the environment only) | `worker/src/config.js` → `marketConfig()`, `worker/.env.example` |
| Public ticker | `scripts/public/market.js` (+ `MARKET_API` in `tools/site/content.mjs`) |
| Studio monitoring | Studio → Overview → System Status → *Market data* |
| Tests | `worker/test/market.test.mjs` |

## Provider interface

The interface is `connect()`, `disconnect()`, `getQuote(symbol)`, `getQuotes(symbols)` and `getStatus()`. There is also `subscribe(symbols, cb)`, which throws `NOT_SUPPORTED` until a streaming adapter exists; the service polls instead. The website only knows the FOXREX Market API.

## Normalized quote (public API)

```json
{ "symbol": "XAUUSD", "status": "LIVE", "marketOpen": true,
  "priceType": "BID_ASK", "price": 3301.35, "bid": 3301.10, "ask": 3301.60, "mid": 3301.35, "last": null, "spread": 0.5,
  "change": null, "changePct": null, "changeBasis": null,
  "providerTime": "2026-09-30T14:59:58.123Z", "receivedAt": "2026-09-30T15:00:00.020Z", "ageMs": 1897,
  "liveWithinMs": 60000, "staleAfterMs": 1200000, "decimals": 2,
  "source": { "provider": "OANDA", "providerSymbol": "XAU_USD", "realtime": true, "attribution": "Data: OANDA" } }
```

- **`priceType: "LAST"`** means the provider gives only a last or close price. In that case `bid`, `ask`, `mid` and `spread` are `null`; they are never invented.
- **`change` / `changePct`** are present only when the provider supplies them against its own reference, as in `changeBasis: "provider previous close"`. The site never derives a daily change from the latest quote.
- **Status values:**
  - `LIVE`: age within `liveWithinMs`, on a real-time plan.
  - `DELAYED`: older than that, or the plan is delayed.
  - `STALE`: older than `staleAfterMs`, or the provider is disconnected.
  - `MARKET_CLOSED`: outside the calendar, or the provider reports the instrument not tradeable.
  - `UNAVAILABLE`: no valid quote. `reason` is `NO_PROVIDER_CONFIGURED`, `NOT_COVERED_BY_PROVIDER` or `NO_VALID_QUOTE_YET`.

## Quality gate

Quotes are **rejected**, and counted per reason in Studio, when:

- a price is NaN, non-finite, zero or negative;
- the book is crossed (`ask < bid`);
- the spread is wider than the class limit (FX 0.5 %, metals 1 %, crypto 2 %);
- the timestamp is unparseable, or more than `MARKET_FUTURE_TOLERANCE_MS` (10 s) in the future, or older than 7 days;
- the quote is older than the last accepted quote from the same provider (out of order);
- it jumps beyond the class limit in a single update. Such a move is accepted only once a second quote confirms it.

**Anti-poisoning.** A rejected quote never becomes the reference. If the host clock moves backwards and a cached quote ends up "in the future", that quote is discarded instead of blocking every newer update. Age is always measured from the **provider** timestamp, so a frozen feed that keeps repeating an old quote ages into `STALE` instead of looking live. This addresses the historical future-clock / frozen-price failure.

## Freshness defaults

Each value can be overridden with `MARKET_LIVE_MS_<CLASS>` and `MARKET_DELAYED_MS_<CLASS>`.

| Class | Symbols | LIVE ≤ | STALE after | Calendar |
|---|---|---|---|---|
| fx | EURUSD, GBPUSD, USDJPY | 60 s | 20 min | Sun 17:00 → Fri 17:00 New York |
| metal | XAUUSD, XAGUSD | 60 s | 20 min | Sun 18:00 → Fri 17:00 NY, daily 17:00–18:00 break |
| crypto | BTCUSD, ETHUSD | 60 s | 10 min | 24/7 |
| index / energy | DXY, US30, NAS100, SPX500, WTI | 120 s | 20 min | Sun 18:00 → Fri 17:00 NY, daily break |

Exchange holidays are not modelled. On a holiday, quotes age into `STALE`, which is never shown as live.

## Cache, rate limits and resilience

- **Visitors never reach a provider.** Each provider is polled on its own interval (`MARKET_POLL_SECONDS_<PROVIDER>`), and every public request is answered from the latest-quote cache. Responses carry `Cache-Control: public, max-age=5`, so Cloudflare can absorb traffic spikes.
- **Polling is single-flight per provider.** Each request has a timeout (`MARKET_TIMEOUT_MS`).
- **Failures back off exponentially with jitter**, capped at `MARKET_MAX_BACKOFF_SECONDS`.
- **HTTP 429** is answered by honouring `Retry-After`.
- **Authentication failures** back off to the maximum interval. The provider shows `AUTH_FAILED` in Studio.
- **Missing credentials** show as `BLOCKED_MISSING_CREDENTIALS`, and no network call is made.
- **Failover:** each symbol is taken from the highest-priority healthy provider that maps it (the order of `MARKET_PROVIDERS`).
- **Recovery:** an unhealthy provider is probed with a single symbol until it recovers, then every symbol resumes.
- **Disconnect:** the last quote is kept internally but served as `STALE`, never `LIVE`. FOXREX itself keeps running.
- **Public API rate limit:** 240 requests/min per client IP. It uses `CF-Connecting-IP` only when `MARKET_TRUST_PROXY=cloudflare`.

## Gold (XAUUSD)

- The live XAUUSD quote is available at `/api/market/quote/XAUUSD` and appears in the ticker.
- In Studio's Gold Focus editor, **"take a snapshot of the current verified XAUUSD price"** copies price, source (provider, provider symbol, mid or last) and provider time into the draft as a **fixed snapshot**, and the operator saves it. Only a `LIVE` or `DELAYED` quote can be snapshotted; stale, closed and unavailable quotes are refused.
- A published analysis keeps its own `price` / `priceSource` / `priceTime` forever. Live quotes never rewrite it. The public Gold Focus labels that price *"Price at time of analysis"*.
- Publishing never depends on market data. The CMS gate requires only that any price included carries its source and time.

## Provenance and secrets

- Every public value carries its provider, provider symbol, provider timestamp and FOXREX received timestamp.
- **Never exposed:** API keys, tokens, account ids and provider or bridge URLs. This holds for the public API, `/api/system/status`, `/api/system/market`, Studio, logs and generated files, and is covered by tests.
- The startup log reports each provider's credentials only as `SET` or `NOT SET`.

## Public API hosting

The public site runs on GitHub Pages and cannot call the operator's `127.0.0.1`. The Market API needs a public HTTPS origin:

1. On the always-on host (docs/ALWAYS-ON.md), set `MARKET_PORT=8788`. That listener serves **only** `/health` and `/api/market/*`, never the CMS or publishing API.
2. Point Cloudflare Tunnel at it, for example `market.foxrex.co` → `http://127.0.0.1:8788` (see `deploy/cloudflared/config.example.yml`). Unlike the Studio API, this hostname stays public: it serves prices only.
3. Set `MARKET_PUBLIC_ORIGINS=https://foxrex.co` and `MARKET_TRUST_PROXY=cloudflare`.
4. Set `MARKET_API = 'https://market.foxrex.co'` in `tools/site/content.mjs`, run `node tools/site/build.mjs`, then commit and deploy. Until then the ticker stays "not connected".

## Provider selection

No usable feed exists on this machine or in the FOXREX repository:

- no MT5 terminal, broker bridge, Fionera service, provider SDK, provider environment variable or listening feed;
- every provider host tried (OANDA, Twelve Data, Coinbase, Kraken, Finnhub, Frankfurter) is also blocked by this build environment's network policy.

Plan terms change: confirm current limits, real-time status and **public display / redistribution rights** with each provider before activating one.

| Provider | Coverage (FOXREX 6) | Bid/ask | Auth | Notes |
|---|---|---|---|---|
| **Twelve Data** (recommended for public display) | XAU/USD, FX majors, BTC/USD; DXY on some plans (verify) | Last price + provider change | API key | The free Basic plan is for personal use and has low daily credits, too few for continuous polling of six symbols. Public display on a commercial site needs a paid plan with display rights. Real-time vs delayed depends on the plan (`TWELVEDATA_REALTIME`). |
| **OANDA v20** | XAU, EUR, GBP, JPY pairs (+ index/energy CFDs) | ✅ real bid/ask, streaming available | Account token + account id | Practice accounts are free, but API data is licensed for the account holder's own use. **Public redistribution needs OANDA's written permission.** Best suited to editorial and internal reference. No DXY or BTC (division-dependent). |
| **Coinbase Exchange** | BTCUSD, ETHUSD | ✅ | None | Crypto only. Review the Coinbase market-data terms before public display. |
| **Operator MT5 / broker bridge** | Whatever the broker quotes | ✅ | Optional token | Reuses a broker feed the operator already has, via `GET /quotes`. Broker data usually **may not be redistributed publicly**; check the broker agreement. Never enabled implicitly and not coupled to any other project. |

**DXY** is an ICE index. It is not derived from FX pairs here; it appears only when a licensed provider supplies it, and is `UNAVAILABLE` until then.
