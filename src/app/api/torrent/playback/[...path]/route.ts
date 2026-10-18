import { NextRequest } from 'next/server';
import { closeMediaSession, embeddedSubtitles, getMediaSession, hlsResource, requireMediaServer } from '@/lib/services/torrentMedia';
import { requireSession } from '@/lib/serverAuth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
const integer = (request: NextRequest, key: string, fallback = 0) => {
  const raw = request.nextUrl.searchParams.get(key);
  const result = raw === null ? fallback : Number(raw);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('Некорректные параметры потока.');
  return result;
};
export async function GET(request: NextRequest, context: Context) {
  const denied = requireSession(request); if (denied) return denied;
  try {
    requireMediaServer();
    const [id, filename, ...extra] = (await context.params).path;
    if (extra.length || !filename) return new Response('Not found', { status: 404 });
    const session = getMediaSession(id);
    if (filename === 'subtitles.vtt') return new Response(await embeddedSubtitles(session, integer(request, 'track'), integer(request, 'start'), integer(request, 'offset'), request.signal), { headers: { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'private, no-store' } });
    const resource = await hlsResource(session, integer(request, 'audio', session.info.audio[0]?.id ?? 0), integer(request, 'seek'), filename, request.signal, integer(request, 'revision'));
    return new Response(typeof resource === 'string' ? resource : new Uint8Array(resource), { headers: { 'Content-Type': filename.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4', 'Cache-Control': 'private, no-store' } });
  } catch (error) { return new Response(error instanceof Error ? error.message : 'Поток недоступен.', { status: 503 }); }
}
export async function DELETE(_request: NextRequest, context: Context) {
  const denied = requireSession(_request); if (denied) return denied;
  const [id, ...extra] = (await context.params).path;
  if (extra.length || !/^[a-f0-9]{32}$/.test(id)) return new Response(null, { status: 400 });
  await closeMediaSession(id);
  return new Response(null, { status: 204 });
}
