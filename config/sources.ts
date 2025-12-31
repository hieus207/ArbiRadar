import { PriceSource } from '@/types';

// All available price sources
export const PRICE_SOURCES: PriceSource[] = [
  // CEX Sources
  {
    id: 'binance-spot',
    name: 'Binance Spot',
    type: 'CEX',
  },
  {
    id: 'binance-futures',
    name: 'Binance Futures',
    type: 'CEX',
  },
  {
    id: 'okx',
    name: 'OKX',
    type: 'CEX',
  },
  {
    id: 'bybit',
    name: 'Bybit',
    type: 'CEX',
  },
  {
    id: 'coinbase',
    name: 'Coinbase',
    type: 'CEX',
  },
  {
    id: 'kraken',
    name: 'Kraken',
    type: 'CEX',
  },
  
  // DEX Sources
  {
    id: 'dex-ethereum',
    name: 'DEX (Ethereum)',
    type: 'DEX',
  },
  {
    id: 'dex-bsc',
    name: 'DEX (BSC)',
    type: 'DEX',
  },
  {
    id: 'dex-arbitrum',
    name: 'DEX (Arbitrum)',
    type: 'DEX',
  },
  {
    id: 'dex-polygon',
    name: 'DEX (Polygon)',
    type: 'DEX',
  },
  {
    id: 'dex-base',
    name: 'DEX (Base)',
    type: 'DEX',
  },
  {
    id: 'dex-solana',
    name: 'DEX (Solana)',
    type: 'DEX',
  },
  {
    id: 'lighter-dex',
    name: 'Lighter DEX',
    type: 'DEX',
  },
];

// Supported trading pairs by source
export const SUPPORTED_PAIRS: Record<string, string[]> = {
  // CEX pairs
  'binance-spot': ['CUSTOM_SYMBOL'],
  'binance-futures': ['CUSTOM_SYMBOL'],
  okx: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ARBUSDT'],
  bybit: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ARBUSDT'],
  coinbase: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
  kraken: ['XBTUSD', 'ETHUSD', 'SOLUSD'],
  
  // DEX pairs - use contract address format
  'dex-ethereum': ['CONTRACT_ADDRESS'],
  'dex-bsc': ['CONTRACT_ADDRESS'],
  'dex-arbitrum': ['CONTRACT_ADDRESS'],
  'dex-polygon': ['CONTRACT_ADDRESS'],
  'dex-base': ['CONTRACT_ADDRESS'],
  'dex-solana': ['CONTRACT_ADDRESS'],
  'lighter-dex': ['BTCUSD', 'ETHUSD', 'EURUSD'], // Use symbol, will lookup market_id
};

// Chain mapping for DEX
export const CHAIN_MAPPING: Record<string, string> = {
  'dex-ethereum': 'eth',
  'dex-bsc': 'bsc',
  'dex-arbitrum': 'arbitrum',
  'dex-polygon': 'polygon_pos',
  'dex-base': 'base',
  'dex-solana': 'solana',
};

// Timeframe mapping for different APIs
export const TIMEFRAME_MAPPING: Record<string, Record<string, string>> = {
  binance: {
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
  },
  okx: {
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1H',
    '4h': '4H',
    '1d': '1D',
  },
  // Add more as needed
};
