import { MarketInfo } from '@/types';
import { httpGet, httpPost } from './http';

// Loaders return every tradable market of a source.
// `symbol` must be accepted by the matching kline adapter in priceAdapters.ts.

const HL_INFO = 'https://api.hyperliquid.xyz/info';
const LIGHTER_API = 'https://mainnet.zklighter.elliot.ai/api/v1';

// Some exchanges use different tickers for the same asset
const BASE_ALIASES: Record<string, string> = { XBT: 'BTC' };
const normBase = (b: string) => BASE_ALIASES[b.toUpperCase()] || b.toUpperCase();

function m(symbol: string, base: string, quote: string, preMarket = false): MarketInfo {
  const info: MarketInfo = { symbol, base: normBase(base), quote: quote.toUpperCase() };
  if (preMarket) info.preMarket = true;
  return info;
}

// Bybit returns only Trading symbols unless `status` is given
async function bybitAll(category: 'spot' | 'linear', status?: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await httpGet('https://api.bybit.com/v5/market/instruments-info', {
      category,
      status,
      limit: 1000,
      cursor,
    });
    if (res.retCode !== 0) throw new Error(`Bybit: ${res.retMsg}`);
    out.push(...res.result.list);
    cursor = res.result.nextPageCursor;
    if (!cursor) break;
  }
  return out;
}

const loaders: Record<string, () => Promise<MarketInfo[]>> = {
  'binance-spot': async () => {
    const res = await httpGet('https://api.binance.com/api/v3/exchangeInfo', { symbolStatus: 'TRADING' });
    return res.symbols
      .filter((s: any) => s.status === 'TRADING')
      .map((s: any) => m(s.symbol, s.baseAsset, s.quoteAsset));
  },
  'binance-futures': async () => {
    const res = await httpGet('https://fapi.binance.com/fapi/v1/exchangeInfo');
    return res.symbols
      .filter((s: any) => s.status === 'TRADING' && String(s.contractType).includes('PERPETUAL'))
      .map((s: any) => m(s.symbol, s.baseAsset, s.quoteAsset));
  },
  okx: async () => {
    const res = await httpGet('https://www.okx.com/api/v5/public/instruments', { instType: 'SPOT' });
    return res.data
      .filter((s: any) => s.state === 'live')
      .map((s: any) => m(s.instId, s.baseCcy, s.quoteCcy));
  },
  'okx-futures': async () => {
    const res = await httpGet('https://www.okx.com/api/v5/public/instruments', { instType: 'SWAP' });
    return res.data
      .filter((s: any) => s.state === 'live')
      .map((s: any) => {
        const [base, quote] = String(s.uly).split('-');
        return m(s.instId, base, quote, s.ruleType === 'pre_market');
      });
  },
  'bybit-spot': async () =>
    (await bybitAll('spot'))
      .filter((s) => s.status === 'Trading')
      .map((s) => m(s.symbol, s.baseCoin, s.quoteCoin)),
  'bybit-futures': async () => {
    const [trading, preLaunch] = await Promise.all([
      bybitAll('linear'),
      bybitAll('linear', 'PreLaunch').catch(() => []),
    ]);
    return [
      ...trading.filter((s) => s.status === 'Trading' && s.contractType === 'LinearPerpetual'),
      ...preLaunch.filter((s) => s.status === 'PreLaunch'),
    ].map((s) => m(s.symbol, s.baseCoin, s.quoteCoin, s.status === 'PreLaunch' || !!s.isPreListing));
  },
  'kucoin-spot': async () => {
    const res = await httpGet('https://api.kucoin.com/api/v2/symbols');
    return res.data
      .filter((s: any) => s.enableTrading)
      .map((s: any) => m(s.symbol, s.baseCurrency, s.quoteCurrency));
  },
  'kucoin-futures': async () => {
    const res = await httpGet('https://api-futures.kucoin.com/api/v1/contracts/active');
    return res.data
      .filter((s: any) => s.status === 'Open')
      .map((s: any) => m(s.symbol, s.baseCurrency, s.quoteCurrency, s.marketStage === 'PRE_MARKET'));
  },
  'gate-spot': async () => {
    const res = await httpGet('https://api.gateio.ws/api/v4/spot/currency_pairs');
    return res
      .filter((s: any) => s.trade_status === 'tradable')
      .map((s: any) => m(s.id, s.base, s.quote));
  },
  'gate-futures': async () => {
    const res = await httpGet('https://api.gateio.ws/api/v4/futures/usdt/contracts');
    return res
      .filter((s: any) => !s.in_delisting)
      .map((s: any) => {
        const [base, quote] = String(s.name).split('_');
        return m(s.name, base, quote, !!s.is_pre_market);
      });
  },
  'bitget-spot': async () => {
    const res = await httpGet('https://api.bitget.com/api/v2/spot/public/symbols');
    return res.data
      .filter((s: any) => s.status === 'online')
      .map((s: any) => m(s.symbol, s.baseCoin, s.quoteCoin));
  },
  'bitget-futures': async () => {
    const res = await httpGet('https://api.bitget.com/api/v2/mix/market/contracts', { productType: 'USDT-FUTURES' });
    return res.data
      .filter((s: any) => ['normal', 'limit_open', 'restrictedAPI'].includes(s.symbolStatus))
      .map((s: any) => m(s.symbol, s.baseCoin, s.quoteCoin));
  },
  hyperliquid: async () => {
    // Main perp dex + HIP-3 builder dexes (names like "xyz:TSLA")
    const dexs: any[] = await httpPost(HL_INFO, { type: 'perpDexs' }).catch(() => [null]);
    const metas = await Promise.all(
      dexs.map((d) =>
        httpPost(HL_INFO, d ? { type: 'meta', dex: d.name } : { type: 'meta' }).catch(() => ({ universe: [] }))
      )
    );
    return metas.flatMap((meta) =>
      meta.universe
        .filter((u: any) => !u.isDelisted)
        .map((u: any) => m(u.name, String(u.name).split(':').pop()!, 'USD'))
    );
  },
  'hyperliquid-spot': async () => {
    const meta = await httpPost(HL_INFO, { type: 'spotMeta' });
    const tokenName = new Map<number, string>(meta.tokens.map((t: any) => [t.index, t.name]));
    const seen = new Set<string>();
    const out: MarketInfo[] = [];
    for (const u of meta.universe) {
      const base = tokenName.get(u.tokens[0]);
      const quote = tokenName.get(u.tokens[1]);
      if (!base || !quote) continue;
      const pretty = `${base}/${quote}`;
      if (seen.has(pretty)) continue;
      seen.add(pretty);
      out.push(m(pretty, base, quote));
    }
    return out;
  },
  lighter: async () => lighterMarkets('perp'),
  'lighter-spot': async () => lighterMarkets('spot'),
  aster: async () => {
    const res = await httpGet('https://fapi.asterdex.com/fapi/v1/exchangeInfo');
    return res.symbols
      .filter((s: any) => s.status === 'TRADING')
      .map((s: any) => m(s.symbol, s.baseAsset, s.quoteAsset));
  },
  'aster-spot': async () => {
    const res = await httpGet('https://sapi.asterdex.com/api/v1/exchangeInfo');
    return res.symbols
      .filter((s: any) => s.status === 'TRADING')
      .map((s: any) => m(s.symbol, s.baseAsset, s.quoteAsset));
  },
};

async function lighterMarkets(type: 'perp' | 'spot'): Promise<MarketInfo[]> {
  const res = await httpGet(`${LIGHTER_API}/orderBooks`);
  return res.order_books
    .filter((s: any) => s.market_type === type && s.status === 'active')
    .map((s: any) => {
      const [base, quote] = String(s.symbol).split('/');
      return m(s.symbol, base, quote || 'USD');
    });
}

export function hasMarketLoader(sourceId: string): boolean {
  return sourceId in loaders;
}

// Only USDT pairs on CEX + Aster. Hyperliquid/Lighter have no USDT markets (USD/USDC quoted).
const USDT_ONLY = new Set([
  'binance-spot', 'binance-futures', 'okx', 'okx-futures', 'bybit-spot', 'bybit-futures',
  'kucoin-spot', 'kucoin-futures', 'gate-spot', 'gate-futures', 'bitget-spot', 'bitget-futures',
  'aster', 'aster-spot',
]);

export async function loadMarkets(sourceId: string): Promise<MarketInfo[]> {
  const loader = loaders[sourceId];
  if (!loader) throw new Error(`No market list for source: ${sourceId}`);
  let list = await loader();
  if (USDT_ONLY.has(sourceId)) list = list.filter((mk) => mk.quote === 'USDT');
  return list.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

// ---------- Search / ranking used by the autocomplete ----------

const QUOTE_PRIORITY = ['USDT', 'USDC', 'USD', 'FDUSD', 'USDE', 'USDH', 'USD1', 'BTC', 'ETH'];
const quoteRank = (q: string) => {
  const i = QUOTE_PRIORITY.indexOf(q);
  return i === -1 ? QUOTE_PRIORITY.length : i;
};
const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function searchMarkets(markets: MarketInfo[], query: string, limit = 50): MarketInfo[] {
  const q = compact(query);
  if (!q) {
    return [...markets].sort((a, b) => quoteRank(a.quote) - quoteRank(b.quote) || a.base.localeCompare(b.base)).slice(0, limit);
  }
  const scored: { m: MarketInfo; score: number }[] = [];
  for (const mk of markets) {
    const base = compact(mk.base);
    const pair = base + compact(mk.quote);
    const sym = compact(mk.symbol);
    let score: number;
    if (base === q) score = 0;
    else if (pair === q || sym === q) score = 0;
    else if (base.startsWith(q)) score = 1;
    else if (pair.startsWith(q) || sym.startsWith(q)) score = 2;
    else if (base.includes(q)) score = 3;
    else continue;
    scored.push({ m: mk, score });
  }
  // Show many different coins first (bt -> BTC, BTR, BTTC, ...): the main pair of each
  // coin comes before its secondary quotes, except for an exact coin match
  const mainQuote = new Map<string, number>();
  for (const { m: mk } of scored) {
    mainQuote.set(mk.base, Math.min(mainQuote.get(mk.base) ?? Infinity, quoteRank(mk.quote)));
  }
  const tier = (s: { m: MarketInfo; score: number }) =>
    s.score === 0 || quoteRank(s.m.quote) === mainQuote.get(s.m.base) ? 0 : 1;
  scored.sort(
    (a, b) =>
      tier(a) - tier(b) ||
      a.score - b.score ||
      a.m.base.length - b.m.base.length ||
      a.m.base.localeCompare(b.m.base) ||
      quoteRank(a.m.quote) - quoteRank(b.m.quote) ||
      a.m.symbol.localeCompare(b.m.symbol)
  );
  return scored.slice(0, limit).map((s) => s.m);
}

// Best market for an asset (used to auto-pick the same coin when switching source)
export function bestMarketForBase(markets: MarketInfo[], base: string): MarketInfo | undefined {
  const b = normBase(base);
  // Wrapped/bridged tickers from DEX: WETH -> ETH, WBTC/BTCB -> BTC, ...
  const candidates = [b, WRAPPED[b], b.startsWith('W') ? b.slice(1) : undefined].filter(Boolean) as string[];
  for (const c of candidates) {
    const best = markets
      .filter((mk) => mk.base === c)
      .sort((a, d) => quoteRank(a.quote) - quoteRank(d.quote))[0];
    if (best) return best;
  }
  return undefined;
}

const WRAPPED: Record<string, string> = { BTCB: 'BTC', CBBTC: 'BTC', WBNB: 'BNB', WSOL: 'SOL', UBTC: 'BTC', UETH: 'ETH' };
