import { hasMarketLoader, loadMarkets } from '@/services/markets';
import { MarketInfo } from '@/types';

export const dynamic = 'force-dynamic';

const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; markets: MarketInfo[] }>();
const inflight = new Map<string, Promise<MarketInfo[]>>();

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get('source') || '';
  if (!hasMarketLoader(source)) {
    return Response.json({ error: `Unknown source: ${source}` }, { status: 400 });
  }

  const hit = cache.get(source);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return Response.json({ source, markets: hit.markets, cached: true });
  }

  try {
    let p = inflight.get(source);
    if (!p) {
      p = loadMarkets(source);
      inflight.set(source, p);
    }
    const markets = await p;
    cache.set(source, { at: Date.now(), markets });
    return Response.json({ source, markets });
  } catch (err) {
    // Serve stale data if we have it
    if (hit) return Response.json({ source, markets: hit.markets, stale: true });
    const message = err instanceof Error ? err.message : 'Failed to load markets';
    return Response.json({ error: message }, { status: 502 });
  } finally {
    inflight.delete(source);
  }
}
