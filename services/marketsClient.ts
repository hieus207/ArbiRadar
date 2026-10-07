import { MarketInfo, DexTokenSuggestion } from '@/types';
import { DEX_CHAINS } from '@/config/sources';
import { loadMarkets } from './markets';
import { httpGet } from './http';

// Browser-side access to market lists, cached per source for the session.
const cache = new Map<string, Promise<MarketInfo[]>>();

async function fetchMarkets(sourceId: string): Promise<MarketInfo[]> {
  try {
    // Server route: compact list, cached server-side
    const res = await fetch(`/api/markets?source=${encodeURIComponent(sourceId)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.markets) && data.markets.length > 0) return data.markets;
    }
  } catch {
    // ignore, fall back below
  }
  // Fallback: load straight from the exchange in the browser
  // (e.g. server region geo-blocked by Binance/Bybit)
  return loadMarkets(sourceId);
}

export function getMarkets(sourceId: string): Promise<MarketInfo[]> {
  let p = cache.get(sourceId);
  if (!p) {
    p = fetchMarkets(sourceId);
    cache.set(sourceId, p);
    p.catch(() => cache.delete(sourceId));
  }
  return p;
}

// ---------- On-chain DEX token search ----------

const looksLikeAddress = (q: string) => /^0x[0-9a-fA-F]{6,}/.test(q) || /^[1-9A-HJ-NP-Za-km-z]{32,48}$/.test(q) || q.includes('::');

async function searchGecko(network: string, query: string): Promise<DexTokenSuggestion[]> {
  const res = await httpGet('https://api.geckoterminal.com/api/v2/search/pools', {
    query,
    network,
    include: 'base_token,quote_token,dex',
  });
  const included = new Map<string, any>((res.included || []).map((i: any) => [i.id, i]));
  return (res.data || []).flatMap((pool: any) => {
    const a = pool.attributes;
    const baseTok = included.get(pool.relationships?.base_token?.data?.id);
    const quoteTok = included.get(pool.relationships?.quote_token?.data?.id);
    const dex = included.get(pool.relationships?.dex?.data?.id);
    if (!baseTok) return [];
    return [{
      address: baseTok.attributes.address,
      symbol: baseTok.attributes.symbol,
      name: baseTok.attributes.name,
      quoteSymbol: quoteTok?.attributes.symbol || '',
      liquidityUsd: parseFloat(a.reserve_in_usd) || 0,
      priceUsd: parseFloat(a.base_token_price_usd) || 0,
      dex: dex?.attributes?.name || '',
    }];
  });
}

async function searchDexScreener(chain: string, query: string): Promise<DexTokenSuggestion[]> {
  const res = await httpGet('https://api.dexscreener.com/latest/dex/search', { q: query });
  return (res.pairs || [])
    .filter((p: any) => p.chainId === chain)
    .map((p: any) => ({
      address: p.baseToken.address,
      symbol: p.baseToken.symbol,
      name: p.baseToken.name,
      quoteSymbol: p.quoteToken?.symbol || '',
      liquidityUsd: p.liquidity?.usd || 0,
      priceUsd: parseFloat(p.priceUsd) || 0,
      dex: p.dexId,
    }));
}

export async function searchDexTokens(sourceId: string, query: string): Promise<DexTokenSuggestion[]> {
  const chain = DEX_CHAINS[sourceId];
  const q = query.trim();
  if (!chain || q.length < 2) return [];

  const settled = (rs: PromiseSettledResult<DexTokenSuggestion[]>[]) =>
    rs.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

  // DexScreener search is global; adding the chain name to the query surfaces that chain's pairs
  const isAddrQuery = looksLikeAddress(q);
  let all = settled(
    await Promise.allSettled([
      searchDexScreener(chain.dexscreener, q),
      ...(isAddrQuery ? [] : [searchDexScreener(chain.dexscreener, `${q} ${chain.dexscreener}`)]),
    ])
  );
  // GeckoTerminal is strictly rate limited -> only ask it when DexScreener finds little
  if (new Set(all.map((s) => s.address.toLowerCase())).size < 5) {
    all = all.concat(settled(await Promise.allSettled([searchGecko(chain.gecko, q)])));
  }

  // Merge by token address, keep the most liquid pool
  const byAddr = new Map<string, DexTokenSuggestion>();
  for (const s of all) {
    const key = s.address.toLowerCase();
    const prev = byAddr.get(key);
    if (!prev || s.liquidityUsd > prev.liquidityUsd) byAddr.set(key, s);
  }

  const Q = q.toUpperCase();
  const isAddr = looksLikeAddress(q);
  const rank = (s: DexTokenSuggestion) => {
    if (isAddr) return s.address.toLowerCase() === q.toLowerCase() ? 0 : 1;
    const sym = s.symbol.toUpperCase();
    if (sym === Q) return 0;
    if (sym.startsWith(Q)) return 1;
    if (sym.includes(Q) || s.name.toUpperCase().includes(Q)) return 2;
    return 3;
  };
  return [...byAddr.values()]
    .sort((a, b) => rank(a) - rank(b) || b.liquidityUsd - a.liquidityUsd)
    .slice(0, 30);
}

export { looksLikeAddress };
