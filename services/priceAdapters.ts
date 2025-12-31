import axios from 'axios';
import { KlineData, PriceDataPoint, TimeFrame } from '@/types';

// Base class for all price sources
export abstract class PriceSourceAdapter {
  abstract fetchKlineData(
    symbol: string,
    timeframe: TimeFrame,
    limit?: number
  ): Promise<PriceDataPoint[]>;
  
  protected convertKlineToDataPoint(kline: KlineData): PriceDataPoint {
    return {
      time: Math.floor(kline.timestamp / 1000), // Convert to seconds
      value: kline.close,
    };
  }
}

// Binance Spot Adapter
export class BinanceSpotAdapter extends PriceSourceAdapter {
  private baseUrl = 'https://api.binance.com/api/v3';

  async fetchKlineData(
    symbol: string,
    timeframe: TimeFrame,
    limit = 100
  ): Promise<PriceDataPoint[]> {
    try {
      // Binance format: BTCUSDT (no separator)
      const binanceSymbol = symbol.replace('/', '').replace('-', '').toUpperCase();
      const response = await axios.get(`${this.baseUrl}/klines`, {
        params: {
          symbol: binanceSymbol,
          interval: timeframe,
          limit,
        },
      });

      return response.data.map((item: any) => ({
        time: Math.floor(item[0] / 1000),
        value: parseFloat(item[4]), // Close price
      }));
    } catch (error) {
      console.error('Binance Spot API error:', error);
      throw error;
    }
  }
}

// Binance Futures Adapter
export class BinanceFuturesAdapter extends PriceSourceAdapter {
  private baseUrl = 'https://fapi.binance.com/fapi/v1';

  async fetchKlineData(
    symbol: string,
    timeframe: TimeFrame,
    limit = 100
  ): Promise<PriceDataPoint[]> {
    try {
      // Binance Futures format: BTCUSDT (no separator)
      const binanceSymbol = symbol.replace('/', '').replace('-', '').toUpperCase();
      const response = await axios.get(`${this.baseUrl}/klines`, {
        params: {
          symbol: binanceSymbol,
          interval: timeframe,
          limit,
        },
      });

      return response.data.map((item: any) => ({
        time: Math.floor(item[0] / 1000),
        value: parseFloat(item[4]), // Close price
      }));
    } catch (error) {
      console.error('Binance Futures API error:', error);
      throw error;
    }
  }
}

// Deprecated: Use BinanceSpotAdapter instead
export class BinanceAdapter extends BinanceSpotAdapter {
}

// OKX CEX Adapter
export class OKXAdapter extends PriceSourceAdapter {
  private baseUrl = 'https://www.okx.com/api/v5';

  async fetchKlineData(
    symbol: string,
    timeframe: TimeFrame,
    limit = 100
  ): Promise<PriceDataPoint[]> {
    try {
      // OKX format: BTC-USDT (dash separator)
      // Convert BTCUSDT -> BTC-USDT or keep BTC-USDT as is
      let okxSymbol = symbol;
      if (!symbol.includes('-')) {
        // BTCUSDT -> BTC-USDT, ETHUSDT -> ETH-USDT
        if (symbol.endsWith('USDT')) {
          okxSymbol = symbol.slice(0, -4) + '-USDT';
        } else if (symbol.endsWith('BUSD')) {
          okxSymbol = symbol.slice(0, -4) + '-BUSD';
        } else if (symbol.endsWith('USD')) {
          okxSymbol = symbol.slice(0, -3) + '-USD';
        }
      }
      
      console.log('OKX fetching:', okxSymbol, timeframe);
      
      // OKX bar format: 1m, 3m, 5m, 15m, 30m, 1H, 2H, 4H, 1D
      const okxBar = timeframe.toLowerCase();
      
      const response = await axios.get(`${this.baseUrl}/market/candles`, {
        params: {
          instId: okxSymbol,
          bar: okxBar,
          limit,
        },
      });

      console.log('OKX response:', response.data);
      
      if (!response.data.data || response.data.data.length === 0) {
        console.error('OKX returned no data');
        return [];
      }

      return response.data.data.map((item: any) => ({
        time: Math.floor(parseInt(item[0]) / 1000),
        value: parseFloat(item[4]), // Close price
      })).reverse();
    } catch (error) {
      console.error('OKX API error:', error);
      throw error;
    }
  }
}

// Bybit CEX Adapter
export class BybitAdapter extends PriceSourceAdapter {
  private baseUrl = 'https://api.bybit.com/v5';

  async fetchKlineData(
    symbol: string,
    timeframe: TimeFrame,
    limit = 100
  ): Promise<PriceDataPoint[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/market/kline`, {
        params: {
          category: 'spot',
          symbol: symbol.replace('/', ''),
          interval: timeframe,
          limit,
        },
      });

      return response.data.result.list.map((item: any) => ({
        time: Math.floor(parseInt(item[0]) / 1000),
        value: parseFloat(item[4]), // Close price
      })).reverse();
    } catch (error) {
      console.error('Bybit API error:', error);
      throw error;
    }
  }
}

// OKX DEX Adapter (supports multiple chains)
export class OKXDexAdapter extends PriceSourceAdapter {
  private baseUrl = 'https://www.okx.com/api/v5/dex/aggregator';

  constructor(private chainId: string) {
    super();
  }

  async fetchKlineData(
    contractAddress: string,
    timeframe: TimeFrame,
    limit = 100
  ): Promise<PriceDataPoint[]> {
    try {
      // OKX DEX timeframe: 1m, 5m, 15m, 30m, 1H, 4H, 1D
      const bar = timeframe.toLowerCase();
      
      console.log(`OKX DEX fetching: chain ${this.chainId}, token ${contractAddress}, bar ${bar}`);

      // Get candle/kline data
      const response = await axios.get(`${this.baseUrl}/candlesticks`, {
        params: {
          chainId: this.chainId,
          tokenContractAddress: contractAddress,
          bar,
          limit,
        },
      });

      console.log('OKX DEX response:', response.data);

      if (!response.data.data || response.data.data.length === 0) {
        console.error('OKX DEX returned no data');
        return [];
      }

      return response.data.data.map((item: any) => ({
        time: Math.floor(parseInt(item[0]) / 1000), // Convert ms to seconds
        value: parseFloat(item[4]), // Close price
      })).reverse();
    } catch (error) {
      console.error('OKX DEX API error:', error);
      return [];
    }
  }
}

// Lighter DEX Adapter
export class LighterDexAdapter extends PriceSourceAdapter {
  private baseUrl = 'https://mainnet.zklighter.elliot.ai/api/v1';
  private explorerUrl = 'https://explorer.elliot.ai/api';

  // Lookup market_id from symbol
  private async getMarketId(symbol: string): Promise<number | null> {
    try {
      console.log(`Lighter DEX looking up market_id for symbol: ${symbol}`);
      
      const response = await axios.get(`${this.explorerUrl}/markets`);
      
      if (!response.data || !Array.isArray(response.data)) {
        console.error('Lighter DEX markets API returned invalid data');
        return null;
      }

      console.log('Available markets sample:', response.data.slice(0, 5).map((m: any) => `${m.symbol} (${m.market_index})`).join(', '));

      // Find market by symbol
      const market = response.data.find((m: any) => 
        m.symbol.toUpperCase() === symbol.toUpperCase()
      );

      if (!market) {
        console.error(`Market not found for symbol: ${symbol}`);
        console.error(`Available symbols: ${response.data.slice(0, 10).map((m: any) => m.symbol).join(', ')}...`);
        return null;
      }

      console.log(`Found market_id ${market.market_index} for ${symbol}`);
      return market.market_index;
    } catch (error) {
      console.error('Lighter DEX market lookup error:', error);
      return null;
    }
  }

  async fetchKlineData(
    symbol: string,
    timeframe: TimeFrame,
    limit = 100
  ): Promise<PriceDataPoint[]> {
    try {
      // Lookup market_id from symbol
      const marketId = await this.getMarketId(symbol);
      if (marketId === null) {
        return [];
      }

      // Lighter resolution format: 1m, 5m, 15m, 30m, 1h, 4h, 1d
      const resolution = timeframe;
      
      // Calculate time range (current time - limit * timeframe)
      const endTimestamp = Date.now();
      const timeframeMs: Record<TimeFrame, number> = {
        '1m': 60 * 1000,
        '3m': 3 * 60 * 1000,
        '5m': 5 * 60 * 1000,
        '15m': 15 * 60 * 1000,
        '30m': 30 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '4h': 4 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
      };
      const startTimestamp = endTimestamp - (limit * timeframeMs[timeframe]);

      console.log(`Lighter DEX fetching: market_id ${marketId}, resolution ${resolution}`);

      const response = await axios.get(`${this.baseUrl}/candles`, {
        params: {
          market_id: marketId,
          resolution,
          start_timestamp: startTimestamp,
          end_timestamp: endTimestamp,
          count_back: limit,
        },
      });

      console.log('Lighter DEX response:', response.data);

      if (!response.data || !response.data.c) {
        console.error('Lighter DEX returned no data');
        return [];
      }

      // Data is in response.data.c array
      const candles = response.data.c;
      
      if (candles.length === 0) {
        console.error('Lighter DEX returned empty candles array');
        return [];
      }

      console.log('Lighter DEX candles count:', candles.length);

      const data = candles.map((item: any) => ({
        time: Math.floor(item.t / 1000), // Convert ms to seconds
        value: parseFloat(item.c), // Close price
      }));

      // Sort by time ascending
      return data.sort((a: any, b: any) => a.time - b.time);
    } catch (error) {
      console.error('Lighter DEX API error:', error);
      return [];
    }
  }
}

// GeckoTerminal DEX Adapter (fallback option)
export class GeckoTerminalAdapter extends PriceSourceAdapter {
  private baseUrl = 'https://api.geckoterminal.com/api/v2';

  constructor(private chain: string) {
    super();
  }

  async fetchKlineData(
    contractAddress: string,
    timeframe: TimeFrame,
    limit = 100
  ): Promise<PriceDataPoint[]> {
    try {
      // GeckoTerminal timeframe mapping: minute, hour, day
      const timeframeMap: Record<TimeFrame, string> = {
        '1m': 'minute',
        '3m': 'minute',
        '5m': 'minute',
        '15m': 'minute',
        '30m': 'minute',
        '1h': 'hour',
        '4h': 'hour',
        '1d': 'day',
      };

      const aggregate = timeframeMap[timeframe];
      
      // First, find the pool address for this token
      const poolsResponse = await axios.get(
        `${this.baseUrl}/networks/${this.chain}/tokens/${contractAddress}/pools`,
        { params: { page: 1 } }
      );

      if (!poolsResponse.data.data || poolsResponse.data.data.length === 0) {
        console.error('No pools found for token');
        return [];
      }

      // Get the most liquid pool
      const pool = poolsResponse.data.data[0];
      const poolAddress = pool.attributes.address;

      console.log(`GeckoTerminal fetching: ${this.chain}, pool: ${poolAddress}, timeframe: ${aggregate}`);

      // Fetch OHLCV data
      const ohlcvResponse = await axios.get(
        `${this.baseUrl}/networks/${this.chain}/pools/${poolAddress}/ohlcv/${aggregate}`,
        { params: { limit, currency: 'usd' } }
      );

      if (!ohlcvResponse.data.data.attributes.ohlcv_list) {
        return [];
      }

      const data = ohlcvResponse.data.data.attributes.ohlcv_list.map((item: any) => ({
        time: item[0], // Unix timestamp in seconds
        value: parseFloat(item[4]), // Close price
      }));

      // Sort by time ascending (required by lightweight-charts)
      return data.sort((a: any, b: any) => a.time - b.time);
    } catch (error) {
      console.error('GeckoTerminal API error:', error);
      return [];
    }
  }
}

// Factory to get the right adapter
export class PriceSourceFactory {
  static getAdapter(sourceId: string): PriceSourceAdapter {
    switch (sourceId) {
      case 'binance':
      case 'binance-spot':
        return new BinanceSpotAdapter();
      case 'binance-futures':
        return new BinanceFuturesAdapter();
      case 'okx':
        return new OKXAdapter();
      case 'bybit':
        return new BybitAdapter();
      case 'dex-ethereum':
        return new GeckoTerminalAdapter('eth');
      case 'dex-bsc':
        return new GeckoTerminalAdapter('bsc');
      case 'dex-arbitrum':
        return new GeckoTerminalAdapter('arbitrum');
      case 'dex-polygon':
        return new GeckoTerminalAdapter('polygon_pos');
      case 'dex-base':
        return new GeckoTerminalAdapter('base');
      case 'dex-solana':
        return new GeckoTerminalAdapter('solana');
      case 'lighter-dex':
        return new LighterDexAdapter();
      default:
        throw new Error(`Unsupported source: ${sourceId}`);
    }
  }
}
