import { hlsPilotEnabled, hlsPilotResource, hlsPilotOrigin, sanitizePilotEvent } from '@/lib/playback/hlsPilot';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!hlsPilotEnabled()) return new Response(null, { status: 404 });
  const resource = hlsPilotResource((await context.params).path);
  if (!resource) return new Response(null, { status: 404 });
  try {
    // Fixed loopback origin and resource allowlist: no user-supplied target URL/query.
    const upstream = await fetch(`${hlsPilotOrigin()}/${resource}`, {
      cache: 'no-store', redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(25_000)])
    });
    if (!upstream.ok) return new Response('Локальный тестовый поток пока недоступен.', { status: 503 });
    return new Response(upstream.body, { headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'no-store'
    } });
  } catch {
    return new Response('Локальный тестовый поток пока недоступен.', { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!hlsPilotEnabled() || (await context.params).path.join('/') !== 'events') return new Response(null, { status: 404 });
  const body = await request.text();
  if (body.length > 4096) return new Response(null, { status: 413 });
  try {
    const event = sanitizePilotEvent(JSON.parse(body));
    if (!event) return new Response(null, { status: 400 });
    const upstream = await fetch(`${hlsPilotOrigin()}/events`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event),
      redirect: 'error', signal: AbortSignal.any([request.signal, AbortSignal.timeout(2000)]) });
    return new Response(null, { status: upstream.ok ? 204 : 503 });
  } catch { return new Response(null, { status: 400 }); }
}
