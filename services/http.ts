// Small fetch wrapper used by adapters and market loaders.
// - On the server: plain fetch.
// - In the browser: call the exchange directly (works for APIs with CORS and avoids
//   server geo-blocks), and fall back to /api/proxy when the browser blocks it (CORS).

const isBrowser = typeof window !== 'undefined';

// Hosts known to not send CORS headers -> always go through the proxy in the browser
const proxyHosts = new Set<string>(['api.kucoin.com', 'api-futures.kucoin.com']);

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function doFetch(url: string, init?: RequestInit): Promise<any> {
  let res = await fetch(url, { ...init, cache: 'no-store' });
  // Rate limited (GeckoTerminal allows ~30 req/min) -> back off and retry a couple of times
  for (let attempt = 1; res.status === 429 && attempt <= 2; attempt++) {
    await sleep(1500 * attempt);
    res = await fetch(url, { ...init, cache: 'no-store' });
  }
  const text = await res.text();
  if (!res.ok) {
    throw new HttpError(res.status, `HTTP ${res.status} ${url}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(res.status, `Invalid JSON from ${url}`);
  }
}

function viaProxy(url: string, body?: unknown): Promise<any> {
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
  if (body === undefined) return doFetch(proxyUrl);
  return doFetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function request(url: string, body?: unknown): Promise<any> {
  const init: RequestInit | undefined =
    body === undefined
      ? undefined
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };

  if (!isBrowser) return doFetch(url, init);

  const host = new URL(url).host;
  if (proxyHosts.has(host)) return viaProxy(url, body);

  try {
    return await doFetch(url, init);
  } catch (err) {
    // TypeError = network/CORS failure -> remember host and retry via proxy
    if (err instanceof TypeError) {
      proxyHosts.add(host);
      return viaProxy(url, body);
    }
    throw err;
  }
}

export function httpGet(url: string, params?: Record<string, string | number | undefined>): Promise<any> {
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.set(k, String(v));
    }
    url += (url.includes('?') ? '&' : '?') + qs.toString();
  }
  return request(url);
}

export function httpPost(url: string, body: unknown): Promise<any> {
  return request(url, body);
}
