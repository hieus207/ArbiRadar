import { PROXY_ALLOWED_HOSTS } from '@/config/sources';

export const dynamic = 'force-dynamic';

// Minimal pass-through proxy for exchange APIs that don't send CORS headers.
// Only allow-listed hosts over https are reachable.
function resolveTarget(request: Request): URL | Response {
  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) return Response.json({ error: 'Missing url' }, { status: 400 });
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return Response.json({ error: 'Invalid url' }, { status: 400 });
  }
  if (target.protocol !== 'https:' || !PROXY_ALLOWED_HOSTS.includes(target.host)) {
    return Response.json({ error: 'Host not allowed' }, { status: 403 });
  }
  return target;
}

async function forward(target: URL, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(target, { ...init, cache: 'no-store' });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream error';
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const target = resolveTarget(request);
  if (target instanceof Response) return target;
  return forward(target);
}

export async function POST(request: Request) {
  const target = resolveTarget(request);
  if (target instanceof Response) return target;
  return forward(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: await request.text(),
  });
}
