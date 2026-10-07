import { PriceDataPoint, TimeFrame } from '@/types';
import { DEX_CHAINS } from '@/config/sources';
import { HttpError, httpGet, httpPost } from './http';

export const TIMEFRAME_SECONDS: Record<TimeFrame, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

// Base class for all price sources
export abstract class PriceSourceAdapter {
  abstract fetchKlineData(
    symbol: string,
    timeframe: TimeFrame,
    limit?: number
  ): Promise<PriceDataPoint[]>;
}

// ---------- helpers ----------

// Sort ascending, drop invalid and duplicate timestamps (required by lightweight-charts)
function clean(points: PriceDataPoint[]): PriceDataPoint[] {
  const map = new Map<number, number>();
  for (const p of points) {
    if (Number.isFinite(p.time) && Number.isFinite(p.value) && p.value > 0) map.set(p.time, p.value);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
}

// Build a coarser timeframe from finer candles: close of a bucket = close of its last candle
function resample(points: PriceDataPoint[], tfSec: number): PriceDataPoint[] {
  const map = new Map<number, number>();
  for (const p of clean(points)) map.set(Math.floor(p.time / tfSec) * tfSec, p.value);
  return [...map.entries()].map(([time, value]) => ({ time, value }));
}

const tail = (points: PriceDataPoint[], limit: number) => clean(points).slice(-limit);

// Pick a native interval; if the exchange lacks it, fetch a finer one and resample.
function planInterval(
  timeframe: TimeFrame,
  supported: Partial<Record<TimeFrame, string>>
): { interval: string; factor: number; base: TimeFrame } {
  if (supported[timeframe]) return { interval: supported[timeframe]!, factor: 1, base: timeframe };
  const target = TIMEFRAME_SECONDS[timeframe];
  const candidates = (Object.keys(supported) as TimeFrame[])
    .filter((tf) => TIMEFRAME_SECONDS[tf] < target && target % TIMEFRAME_SECONDS[tf] === 0)
    .sort((a, b) => TIMEFRAME_SECONDS[b] - TIMEFRAME_SECONDS[a]);
  const base = candidates[0] || '1m';
  return { interval: supported[base]!, factor: target / TIMEFRAME_SECONDS[base], base };
}

// Normalize user input like "btc/usdt", "BTC-USDT", "btcusdt" into parts
function splitPair(symbol: string, quotes = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'USD', 'BTC', 'ETH']): [string, string] {
  const s = symbol.toUpperCase().trim();
  const parts = s.split(/[-_/]/).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts[1]];
  for (const q of quotes) {
    if (s.endsWith(q) && s.length > q.length) return [s.slice(0, -q.length), q];
  }
  return [s, 'USDT'];
}

const ensureOk = <T>(cond: unknown, msg: string, value: T): T => {
  if (!cond) throw new Error(msg);
  return value;
};

// ---------- Binance ----------

export class BinanceSpotAdapter extends PriceSourceAdapter {
  protected url = 'https://api.binance.com/api/v3/klines';

  async fetchKlineData(symbol: string, timeframe: TimeFrame, limit = 100) {
    const data = await httpGet(this.url, {
      symbol: splitPair(symbol).join(''),
      interval: timeframe,
      limit: Math.min(limit, 1000),
    });
    return tail(data.map((k: any) => ({ time: Math.floor(k[0] / 1000), value: parseFloat(k[4]) })), limit);
  }
}

export class BinanceFuturesAdapter extends BinanceSpotAdapter {
  protected url = 'https://fapi.binance.com/fapi/v1/klines';
}

// ---------- OKX ----------

const OKX_BARS: Partial<Record<TimeFrame, string>> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H', '1d': '1Dutc',
};

export class OKXAdapter extends PriceSourceAdapter {
  constructor(private swap = false) {
    super();
  }

  private instId(symbol: string): string {
    const s = symbol.toUpperCase().trim();
    if (this.swap) {
      if (s.endsWith('-SWAP')) return s;
      return splitPair(s).join('-') + '-SWAP';
    }
    return splitPair(s).join('-');
  }

  async fetchKlineData(symbol: string, timeframe: TimeFrame, limit = 100) {
    const instId = this.instId(symbol);
    const out: PriceDataPoint[] = [];
    let after: string | undefined;
    // OKX returns max 300 candles per call (newest first) -> paginate backwards
    while (out.length < limit) {
      const res = await httpGet('https://www.okx.com/api/v5/market/candles', {
        instId,
        bar: OKX_BARS[timeframe],
        limit: Math.min(300, limit - out.length),
        after,
      });
      ensureOk(res.code === '0', `OKX: ${res.msg}`, null);
      if (!res.data?.length) break;
      out.push(...res.data.map((k: any) => ({ time: Math.floor(+k[0] / 1000), value: parseFloat(k[4]) })));
      after = res.data[res.data.length - 1][0];
      if (res.data.length < 300) break;
    }
    return tail(out, limit);
  }
}

// ---------- Bybit ----------

const BYBIT_INTERVALS: Record<TimeFrame, string> = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D',
};

export class BybitAdapter extends PriceSourceAdapter {
  constructor(private category: 'spot' | 'linear') {
    super();
  }

  async fetchKlineData(symbol: string, timeframe: TimeFrame, limit = 100) {
    const res = await httpGet('https://api.bybit.com/v5/market/kline', {
      category: this.category,
      symbol: splitPair(symbol).join(''),
      interval: BYBIT_INTERVALS[timeframe],
      limit: Math.min(limit, 1000),
    });
    ensureOk(res.retCode === 0, `Bybit: ${res.retMsg}`, null);
    return tail(res.result.list.map((k: any) => ({ time: Math.floor(+k[0] / 1000), value: parseFloat(k[4]) })), limit);
  }
}

// ---------- KuCoin ----------

const KUCOIN_SPOT_TYPES: Partial<Record<TimeFrame, string>> = {
  '1m': '1min', '3m': '3min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1hour', '4h': '4hour', '1d': '1day',
};

export class KuCoinSpotAdapter extends PriceSourceAdapter {
  async fetchKlineData(symbol: string, timeframe: TimeFrame, limit = 100) {
    const endAt = Math.floor(Date.now() / 1000);
    const startAt = endAt - (limit + 1) * TIMEFRAME_SECONDS[timeframe];
    const res = await httpGet('https://api.kucoin.com/api/v1/market/candles', {
      type: KUCOIN_SPOT_TYPES[timeframe],
      symbol: splitPair(symbol).join('-'),
      startAt,
      endAt,
    });
    ensureOk(res.code === '200000', `KuCoin: ${res.msg}`, null);
    // [time(s), open, close, high, low, volume, turnover]
    return tail(res.data.map((k: any) => ({ time: +k[0], value: parseFloat(k[2]) })), limit);
  }
}

const KUCOIN_FUT_GRAN: Partial<Record<TimeFrame, string>> = {
  '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': '1440',
};

export class KuCoinFuturesAdapter extends PriceSourceAdapter {
  private contract(symbol: string): string {
    const s = symbol.toUpperCase().trim();
    if (/USDTM$|USDCM$|USDM$/.test(s)) return s;
    const [base, quote] = splitPair(s);
    return (base === 'BTC' ? 'XBT' : base) + quote + 'M';
  }

  async fetchKlineData(symbol: string, timeframe: TimeFrame, limit = 100) {
    const plan = planInterval(timeframe, KUCOIN_FUT_GRAN);
    const stepMs = TIMEFRAME_SECONDS[plan.base] * 1000;
    const need = limit * plan.factor;
    const contract = this.contract(symbol);
    const out: PriceDataPoint[] = [];
    let to = Date.now();
    // Max 500 candles per call -> walk backwards in windows
    for (let fetched = 0; fetched < need; fetched += 500) {
      const count = Math.min(500, need - fetched);
      const from = to - count * stepMs;
      const res = await httpGet('https://api-futures.kucoin.com/api/v1/kline/query', {
        symbol: contract,
        granularity: plan.interval,
        from,
        to,
      });
      ensureOk(res.code === '200000', `KuCoin Futures: ${res.msg}`, null);
      if (!res.data?.length) break;
      out.push(...res.data.map((k: any) => ({ time: Math.floor(k[0] / 1000), value: +k[4] })));
      to = from;
    }
    const points = plan.factor > 1 ? resample(out, TIMEFRAME_SECONDS[timeframe]) : out;
    return tail(points, limit);
  }
}

// ---------- Gate ----------

const GATE_INTERVALS: Partial<Record<TimeFrame, string>> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d',
};

export class GateAdapter extends PriceSourceAdapter {
  constructor(private futures: boolean) {
    super();
  }

  async fetchKlineData(symbol: string, timeframe: TimeFrame, limit = 100) {
    const plan = planInterval(timeframe, GATE_INTERVALS);
    const pair = splitPair(symbol).join('_');
    const count = Math.min(limit * plan.factor, 1000);
    let points: PriceDataPoint[];
    if (this.futures) {
      const data = await httpGet('https://api.gateio.ws/api/v4/futures/usdt/candlesticks', {
        contract: pair,
        interval: plan.interval,
        limit: count,
      });
      points = data.map((k: any) => ({ time: +k.t, value: parseFloat(k.c) }));
    } else {
      const data = await httpGet('https://api.gateio.ws/api/v4/spot/candlesticks', {
        currency_pair: pair,
        interval: plan.interval,
        limit: count,
      });
      // [time(s), quote vol, close, high, low, open, base vol, finished]
      points = data.map((k: any) => ({ time: +k[0], value: parseFloat(k[2]) }));
    }
    if (plan.factor > 1) points = resample(points, TIMEFRAME_SECONDS[timeframe]);
    return tail(points, limit);
  }
}

// ---------- Bitget ----------

const BITGET_SPOT_GRAN: Record<TimeFrame, string> = {
  '1m': '1min', '3m': '3min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1h', '4h': '4h', '1d': '1Dutc',
};
const BITGET_MIX_GRAN: Record<TimeFrame, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H', '1d': '1Dutc',
};

export class BitgetAdapter extends PriceSourceAdapter {
  constructor(private futures: boolean) {
    super();
  }

  async fetchKlineData(symbol: string, timeframe: TimeFrame, limit = 100) {
    const sym = splitPair(symbol).join('');
    const res = this.futures
      ? await httpGet('https://api.bitget.com/api/v2/mix/market/candles', {
          symbol: sym,
          productType: 'USDT-FUTURES',
          granularity: BITGET_MIX_GRAN[timeframe],
          limit: Math.min(limit, 1000),
        })
      : await httpGet('https://api.bitget.com/api/v2/spot/market/candles', {
          symbol: sym,
          granularity: BITGET_SPOT_GRAN[timeframe],
          limit: Math.min(limit, 1000),
        });
    ensureOk(res.code === '00000', `Bitget: ${res.msg}`, null);
    return tail(res.data.map((k: any) => ({ time: Math.floor(+k[0] / 1000), value: parseFloat(k[4]) })), limit);
  }
}

// ---------- Hyperliquid ----------

const HL_INFO = 'https://api.hyperliquid.xyz/info';
let hlSpotNames: Promise<Map<string, string>> | null = null;

// "HYPE/USDC" -> "@107" (the coin id candleSnapshot expects for non-canonical spot pairs)
function hyperliquidSpotNames(): Promise<Map<string, string>> {
  if (!hlSpotNames) {
    hlSpotNames = httpPost(HL_INFO, { type: 'spotMeta' }).then((meta) => {
      const tokenName = new Map<number, string>(meta.tokens.map((t: any) => [t.index, t.name]));
      const map = new Map<string, string>();
      for (const u of meta.universe) {
        const pretty = `${tokenName.get(u.tokens[0])}/${tokenName.get(u.tokens[1])}`.toUpperCase();
        if (!map.has(pretty)) map.set(pretty, u.name);
      }
      return map;
    });
    hlSpotNames.catch(() => (hlSpotNames = null));
  }
  return hlSpotNames;
}

export class HyperliquidAdapter extends PriceSourceAdapter {
  constructor(private spot = false) {
    super();
  }

  private async coin(symbol: string): Promise<string> {
    const s = symbol.trim();
    if (!this.spot) {
      // Perp: "BTC", HIP-3: "xyz:TSLA" (dex prefix is lowercase)
      if (s.includes(':')) {
        const [dex, name] = s.split(':');
        return `${dex.toLowerCase()}:${name.toUpperCase()}`;
      }
      return splitPair(s, ['USDT', 'USDC', 'USD'])[0];
    }
    if (s.startsWith('@')) return s;
    const names = await hyperliquidSpotNames();
    const key = s.includes('/') ? s.toUpperCase() : `${s.toUpperCase()}/USDC`;
    const coin = names.get(key);
    if (!coin) throw new Error(`Hyperliquid spot: unknown pair ${symbol}`);
    return coin;
  }

  async fetchKlineData(symbol: string, timeframe: TimeFrame, limit = 100) {
    const endTime = Date.now();
    const startTime = endTime - (limit + 1) * TIMEFRAME_SECONDS[timeframe] * 1000;
    const data = await httpPost(HL_INFO, {
      type: 'candleSnapshot',
      req: { coin: await this.coin(symbol), interval: timeframe, startTime, endTime },
    });
    if (!Array.isArray(data)) return [];
    return tail(data.map((k: any) => ({ time: Math.floor(k.t / 1000), value: parseFloat(k.c) })), limit);
  }
}

// ---------- Lighter ----------

const LIGHTER_API = 'https://mainnet.zklighter.elliot.ai/api/v1';
let lighterBooks: Promise<any[]> | null = null;

function lighterOrderBooks(): Promise<any[]> {
  if (!lighterBooks) {
    lighterBooks = httpGet(`${LIGHTER_API}/orderBooks`).then((r) => r.order_books || []);
    lighterBooks.catch(() => (lighterBooks = null));
  }
  return lighterBooks;
}

const LIGHTER_RES: Partial<Record<TimeFrame, string>> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d',
};

export class LighterAdapter extends PriceSourceAdapter {
  constructor(private spot = false) {
    super();
  }

  private async marketId(symbol: string): Promise<number> {
    const books = await lighterOrderBooks();
    const type = this.spot ? 'spot' : 'perp';
    let s = symbol.trim().toUpperCase();
    if (this.spot && !s.includes('/')) s += '/USDC';
    if (!this.spot) s = splitPair(s, ['USDT', 'USDC', 'USD'])[0];
    const book = books.find((b) => b.market_type === type && String(b.symbol).toUpperCase() === s);
    if (!book) throw new Error(`Lighter: market not found ${symbol}`);
    return book.market_id;
  }

  async fetchKlineData(symbol: string, timeframe: TimeFrame, limit = 100) {
    const plan = planInterval(timeframe, LIGHTER_RES);
    const count = limit * plan.factor;
    const end = Date.now();
    const start = end - (count + 1) * TIMEFRAME_SECONDS[plan.base] * 1000;
    const res = await httpGet(`${LIGHTER_API}/candles`, {
      market_id: await this.marketId(symbol),
      resolution: plan.interval,
      start_timestamp: start,
      end_timestamp: end,
      count_back: count,
    });
    ensureOk(res.code === 200, `Lighter: ${res.message}`, null);
    let points: PriceDataPoint[] = (res.c || []).map((k: any) => ({ time: Math.floor(k.t / 1000), value: +k.c }));
    if (plan.factor > 1) points = resample(points, TIMEFRAME_SECONDS[timeframe]);
    return tail(points, limit);
  }
}

// ---------- Aster ----------

export class AsterAdapter extends PriceSourceAdapter {
  constructor(private spot = false) {
    super();
  }

  async fetchKlineData(symbol: string, timeframe: TimeFrame, limit = 100) {
    const url = this.spot ? 'https://sapi.asterdex.com/api/v1/klines' : 'https://fapi.asterdex.com/fapi/v1/klines';
    const data = await httpGet(url, {
      symbol: splitPair(symbol).join(''),
      interval: timeframe,
      limit: Math.min(limit, 1000),
    });
    return tail(data.map((k: any) => ({ time: Math.floor(k[0] / 1000), value: parseFloat(k[4]) })), limit);
  }
}

// ---------- On-chain DEX (GeckoTerminal) ----------

const GECKO = 'https://api.geckoterminal.com/api/v2';
const GECKO_TF: Partial<Record<TimeFrame, [string, number]>> = {
  '1m': ['minute', 1], '5m': ['minute', 5], '15m': ['minute', 15],
  '1h': ['hour', 1], '4h': ['hour', 4], '1d': ['day', 1],
};
// token address -> top pool address (cached; GeckoTerminal is rate limited to ~30 req/min)
type PoolRef = { pool: string; token?: string; fromDexScreener?: boolean };
const geckoPoolCache = new Map<string, Promise<PoolRef>>();

export class GeckoTerminalAdapter extends PriceSourceAdapter {
  constructor(private network: string, private dexscreenerChain?: string) {
    super();
  }

  private resolvePool(address: string, skipDexScreener = false): Promise<PoolRef> {
    const key = `${this.network}:${address.toLowerCase()}`;
    let p = skipDexScreener ? undefined : geckoPoolCache.get(key);
    if (!p) {
      p = (async (): Promise<PoolRef> => {
        // 1) DexScreener (generous rate limit): most liquid pair of the token
        if (this.dexscreenerChain && !skipDexScreener) {
          try {
            const pairs = await httpGet(
              `https://api.dexscreener.com/token-pairs/v1/${this.dexscreenerChain}/${encodeURIComponent(address)}`
            );
            const best = (Array.isArray(pairs) ? pairs : [])
              .filter((x: any) => x.chainId === this.dexscreenerChain)
              .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
            if (best?.pairAddress) {
              const isBase = String(best.baseToken?.address).toLowerCase() === address.toLowerCase();
              const isQuote = String(best.quoteToken?.address).toLowerCase() === address.toLowerCase();
              if (isBase || isQuote) return { pool: best.pairAddress, token: address, fromDexScreener: true };
            }
          } catch {
            // fall through to GeckoTerminal
          }
        }
        // 2) GeckoTerminal token -> pools
        try {
          const res = await httpGet(`${GECKO}/networks/${this.network}/tokens/${encodeURIComponent(address)}/pools`, { page: 1 });
          const pool = res.data?.[0]?.attributes?.address;
          if (pool) return { pool, token: address };
        } catch (err) {
          if (err instanceof HttpError && err.status === 429) throw err;
          // not a token address -> try as pool address
        }
        // 3) The input itself is a pool address
        try {
          await httpGet(`${GECKO}/networks/${this.network}/pools/${encodeURIComponent(address)}`);
        } catch (err) {
          if (err instanceof HttpError && err.status === 404) {
            throw new Error('GeckoTerminal chưa có dữ liệu nến cho token/pool này');
          }
          throw err;
        }
        return { pool: address };
      })();
      geckoPoolCache.set(key, p);
      p.catch(() => geckoPoolCache.delete(key));
    }
    return p;
  }

  async fetchKlineData(address: string, timeframe: TimeFrame, limit = 100) {
    const addr = address.trim();
    if (!addr) throw new Error('Missing token address');
    let ref = await this.resolvePool(addr);

    let factor = 1;
    let tf = GECKO_TF[timeframe];
    if (!tf) {
      // 3m -> 1m, 30m -> 15m, then resample
      const plan = planInterval(timeframe, { '1m': '1m', '15m': '15m' });
      tf = GECKO_TF[plan.base]!;
      factor = plan.factor;
    }
    const ohlcv = (r: PoolRef) =>
      httpGet(`${GECKO}/networks/${this.network}/pools/${encodeURIComponent(r.pool)}/ohlcv/${tf![0]}`, {
        aggregate: tf![1],
        limit: Math.min(limit * factor, 1000),
        currency: 'usd',
        token: r.token, // price of the selected token, even if it is the quote side of the pool
      });
    let res;
    try {
      res = await ohlcv(ref);
    } catch (err) {
      // Pool picked by DexScreener unknown to GeckoTerminal -> use GeckoTerminal's own pool
      if (!(err instanceof HttpError && err.status === 404 && ref.fromDexScreener)) throw err;
      ref = await this.resolvePool(addr, true);
      res = await ohlcv(ref);
    }
    let points: PriceDataPoint[] = (res.data?.attributes?.ohlcv_list || []).map((k: any) => ({
      time: k[0],
      value: parseFloat(k[4]),
    }));
    if (factor > 1) points = resample(points, TIMEFRAME_SECONDS[timeframe]);
    return tail(points, limit);
  }
}

// ---------- Factory ----------

export class PriceSourceFactory {
  static getAdapter(sourceId: string): PriceSourceAdapter {
    const chain = DEX_CHAINS[sourceId];
    if (chain) return new GeckoTerminalAdapter(chain.gecko, chain.dexscreener);

    switch (sourceId) {
      case 'binance':
      case 'binance-spot':
        return new BinanceSpotAdapter();
      case 'binance-futures':
        return new BinanceFuturesAdapter();
      case 'okx':
      case 'okx-spot':
        return new OKXAdapter(false);
      case 'okx-futures':
        return new OKXAdapter(true);
      case 'bybit-spot':
        return new BybitAdapter('spot');
      case 'bybit-futures':
        return new BybitAdapter('linear');
      case 'kucoin-spot':
        return new KuCoinSpotAdapter();
      case 'kucoin-futures':
        return new KuCoinFuturesAdapter();
      case 'gate-spot':
        return new GateAdapter(false);
      case 'gate-futures':
        return new GateAdapter(true);
      case 'bitget-spot':
        return new BitgetAdapter(false);
      case 'bitget-futures':
        return new BitgetAdapter(true);
      case 'hyperliquid':
      case 'hyperliquid-futures':
        return new HyperliquidAdapter(false);
      case 'hyperliquid-spot':
        return new HyperliquidAdapter(true);
      case 'lighter':
      case 'lighter-dex':
      case 'lighter-futures':
        return new LighterAdapter(false);
      case 'lighter-spot':
        return new LighterAdapter(true);
      case 'aster':
        return new AsterAdapter(false);
      case 'aster-spot':
        return new AsterAdapter(true);
      default:
        throw new Error(`Unsupported source: ${sourceId}`);
    }
  }
}
