import { PriceDataPoint, SpreadData, ChartConfig } from '@/types';
import { PriceSourceFactory } from './priceAdapters';

export class SpreadAnalyzer {
  async fetchDualSourceData(config: ChartConfig): Promise<{
    source1Data: PriceDataPoint[];
    source2Data: PriceDataPoint[];
    spreadData: SpreadData[];
  }> {
    const adapter1 = PriceSourceFactory.getAdapter(config.source1.id);
    const adapter2 = PriceSourceFactory.getAdapter(config.source2.id);

    const limit = config.limit || 200;

    // Fetch data from both sources in parallel using their respective symbols
    const [data1, data2] = await Promise.all([
      adapter1.fetchKlineData(config.symbol1, config.timeframe, limit),
      adapter2.fetchKlineData(config.symbol2, config.timeframe, limit),
    ]);

    console.log('Source 1 (' + config.source1.id + '):', data1.length, 'points', data1.slice(0, 2));
    console.log('Source 2 (' + config.source2.id + '):', data2.length, 'points', data2.slice(0, 2));

    // Calculate spread data
    const spreadData = this.calculateSpread(data1, data2);

    return {
      source1Data: data1,
      source2Data: data2,
      spreadData,
    };
  }

  private calculateSpread(
    data1: PriceDataPoint[],
    data2: PriceDataPoint[]
  ): SpreadData[] {
    const spreadData: SpreadData[] = [];
    
    // Create a map for faster lookup
    const data2Map = new Map(data2.map(d => [d.time, d.value]));

    for (const point1 of data1) {
      const point2Value = data2Map.get(point1.time);
      
      if (point2Value !== undefined) {
        const spreadAbsolute = point1.value - point2Value;
        const spreadPercent = ((spreadAbsolute / point2Value) * 100);
        
        spreadData.push({
          time: point1.time,
          source1Price: point1.value,
          source2Price: point2Value,
          spreadPercent,
          spreadAbsolute,
        });
      }
    }

    return spreadData;
  }

  // Helper to find arbitrage opportunities
  findArbitrageOpportunities(
    spreadData: SpreadData[],
    threshold: number = 0.5
  ): SpreadData[] {
    return spreadData.filter(
      data => Math.abs(data.spreadPercent) >= threshold
    );
  }
}
