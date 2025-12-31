// Unified types for price data sources

export type SourceType = 'CEX' | 'DEX';

export type TimeFrame = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

export interface PriceSource {
  id: string;
  name: string;
  type: SourceType;
  icon?: string;
}

export interface KlineData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceDataPoint {
  time: number; // Unix timestamp in seconds
  value: number; // Price
}

export interface SpreadData {
  time: number;
  source1Price: number;
  source2Price: number;
  spreadPercent: number;
  spreadAbsolute: number;
}

export interface ChartConfig {
  source1: PriceSource;
  source2: PriceSource;
  symbol1: string; // Symbol or contract for source 1
  symbol2: string; // Symbol or contract for source 2
  timeframe: TimeFrame;
  limit?: number; // Number of data points
}
