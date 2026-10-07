import { PriceSource } from '@/types';

// All available price sources.
// - inputKind 'symbol': pick from the exchange's market list (autocomplete)
// - inputKind 'contract': search token on chain (GeckoTerminal + DexScreener), value = token address
export const PRICE_SOURCES: PriceSource[] = [
  // CEX Spot
  { id: 'binance-spot', name: 'Binance Spot', type: 'CEX', group: 'CEX Spot', inputKind: 'symbol' },
  { id: 'okx', name: 'OKX Spot', type: 'CEX', group: 'CEX Spot', inputKind: 'symbol' },
  { id: 'bybit-spot', name: 'Bybit Spot', type: 'CEX', group: 'CEX Spot', inputKind: 'symbol' },
  { id: 'kucoin-spot', name: 'KuCoin Spot', type: 'CEX', group: 'CEX Spot', inputKind: 'symbol' },
  { id: 'gate-spot', name: 'Gate Spot', type: 'CEX', group: 'CEX Spot', inputKind: 'symbol' },
  { id: 'bitget-spot', name: 'Bitget Spot', type: 'CEX', group: 'CEX Spot', inputKind: 'symbol' },

  // CEX Futures (USDT perpetual)
  { id: 'binance-futures', name: 'Binance Futures', type: 'CEX', group: 'CEX Futures', inputKind: 'symbol' },
  { id: 'okx-futures', name: 'OKX Futures', type: 'CEX', group: 'CEX Futures', inputKind: 'symbol' },
  { id: 'bybit-futures', name: 'Bybit Futures', type: 'CEX', group: 'CEX Futures', inputKind: 'symbol' },
  { id: 'kucoin-futures', name: 'KuCoin Futures', type: 'CEX', group: 'CEX Futures', inputKind: 'symbol' },
  { id: 'gate-futures', name: 'Gate Futures', type: 'CEX', group: 'CEX Futures', inputKind: 'symbol' },
  { id: 'bitget-futures', name: 'Bitget Futures', type: 'CEX', group: 'CEX Futures', inputKind: 'symbol' },

  // Perp DEX (perp + spot)
  { id: 'hyperliquid', name: 'Hyperliquid Perp', type: 'DEX', group: 'Perp DEX', inputKind: 'symbol' },
  { id: 'hyperliquid-spot', name: 'Hyperliquid Spot', type: 'DEX', group: 'Perp DEX', inputKind: 'symbol' },
  { id: 'lighter', name: 'Lighter Perp', type: 'DEX', group: 'Perp DEX', inputKind: 'symbol' },
  { id: 'lighter-spot', name: 'Lighter Spot', type: 'DEX', group: 'Perp DEX', inputKind: 'symbol' },
  { id: 'aster', name: 'Aster Perp', type: 'DEX', group: 'Perp DEX', inputKind: 'symbol' },
  { id: 'aster-spot', name: 'Aster Spot', type: 'DEX', group: 'Perp DEX', inputKind: 'symbol' },

  // On-chain DEX
  { id: 'dex-ethereum', name: 'DEX Ethereum', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-bsc', name: 'DEX BSC', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-base', name: 'DEX Base', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-arbitrum', name: 'DEX Arbitrum', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-polygon', name: 'DEX Polygon', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-solana', name: 'DEX Solana', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-sui', name: 'DEX Sui', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-robinhood', name: 'DEX Robinhood', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-optimism', name: 'DEX Optimism', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-avalanche', name: 'DEX Avalanche', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-hyperevm', name: 'DEX HyperEVM', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-monad', name: 'DEX Monad', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-sonic', name: 'DEX Sonic', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-linea', name: 'DEX Linea', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-unichain', name: 'DEX Unichain', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-tron', name: 'DEX Tron', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
  { id: 'dex-ton', name: 'DEX TON', type: 'DEX', group: 'DEX Chain', inputKind: 'contract' },
];

export const SOURCE_GROUPS = ['CEX Spot', 'CEX Futures', 'Perp DEX', 'DEX Chain'] as const;

// Old ids that may still appear in shared links
export const LEGACY_SOURCE_IDS: Record<string, string> = {
  binance: 'binance-spot',
  'okx-spot': 'okx',
  'lighter-dex': 'lighter',
  'lighter-futures': 'lighter',
  'hyperliquid-futures': 'hyperliquid',
};

export function findSource(id: string | null | undefined): PriceSource | undefined {
  if (!id) return undefined;
  const resolved = LEGACY_SOURCE_IDS[id] || id;
  return PRICE_SOURCES.find((s) => s.id === resolved);
}

// On-chain DEX: network ids for GeckoTerminal (OHLCV + search) and DexScreener (search)
export const DEX_CHAINS: Record<string, { gecko: string; dexscreener: string }> = {
  'dex-ethereum': { gecko: 'eth', dexscreener: 'ethereum' },
  'dex-bsc': { gecko: 'bsc', dexscreener: 'bsc' },
  'dex-base': { gecko: 'base', dexscreener: 'base' },
  'dex-arbitrum': { gecko: 'arbitrum', dexscreener: 'arbitrum' },
  'dex-polygon': { gecko: 'polygon_pos', dexscreener: 'polygon' },
  'dex-solana': { gecko: 'solana', dexscreener: 'solana' },
  'dex-sui': { gecko: 'sui-network', dexscreener: 'sui' },
  'dex-robinhood': { gecko: 'robinhood', dexscreener: 'robinhood' },
  'dex-optimism': { gecko: 'optimism', dexscreener: 'optimism' },
  'dex-avalanche': { gecko: 'avax', dexscreener: 'avalanche' },
  'dex-hyperevm': { gecko: 'hyperevm', dexscreener: 'hyperevm' },
  'dex-monad': { gecko: 'monad', dexscreener: 'monad' },
  'dex-sonic': { gecko: 'sonic', dexscreener: 'sonic' },
  'dex-linea': { gecko: 'linea', dexscreener: 'linea' },
  'dex-unichain': { gecko: 'unichain', dexscreener: 'unichain' },
  'dex-tron': { gecko: 'tron', dexscreener: 'tron' },
  'dex-ton': { gecko: 'ton', dexscreener: 'ton' },
};

// Hosts the server-side proxy is allowed to reach (used for APIs without CORS)
export const PROXY_ALLOWED_HOSTS = [
  'api.binance.com',
  'fapi.binance.com',
  'www.okx.com',
  'api.bybit.com',
  'api.kucoin.com',
  'api-futures.kucoin.com',
  'api.gateio.ws',
  'api.bitget.com',
  'api.hyperliquid.xyz',
  'mainnet.zklighter.elliot.ai',
  'fapi.asterdex.com',
  'sapi.asterdex.com',
  'api.geckoterminal.com',
  'api.dexscreener.com',
];
