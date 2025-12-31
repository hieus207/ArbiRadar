import { PriceDataPoint } from '@/types';

export interface LighterDexRealtimeOptions {
  marketIndex: number;
  onPrice: (price: number, data: any) => void;
  onError?: (err: any) => void;
}

export class LighterDexRealtime {
  private ws: WebSocket | null = null;
  private options: LighterDexRealtimeOptions;

  constructor(options: LighterDexRealtimeOptions) {
    this.options = options;
  }

  connect() {
    this.ws = new WebSocket('wss://mainnet.zklighter.elliot.ai/stream');
    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({
        type: 'subscribe',
        channel: `market_stats/${this.options.marketIndex}`,
      }));
    };
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'update/market_stats' && msg.market_stats && msg.market_stats.last_trade_price) {
          const price = parseFloat(msg.market_stats.last_trade_price);
          this.options.onPrice(price, msg);
        }
      } catch (err) {
        this.options.onError?.(err);
      }
    };
    this.ws.onerror = (err) => {
      this.options.onError?.(err);
    };
    this.ws.onclose = () => {
      // Optionally: auto-reconnect logic here
    };
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}
