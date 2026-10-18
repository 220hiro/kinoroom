import { requireSession } from '@/lib/serverAuth';
import { NextRequest, NextResponse } from 'next/server';
import { torrentStatus } from '@/lib/services/remoteTorrents';
import { mediaEnabled } from '@/lib/services/torrentMedia';
import { isFfmpegAvailable, isFfprobeAvailable } from '@/lib/services/ffmpeg';
export const dynamic = 'force-dynamic';
export async function GET() {
  const configured = Boolean(process.env.TORRSERVER_URL?.trim());
  return NextResponse.json({ configured, playbackAvailable: configured && mediaEnabled() && isFfmpegAvailable() && isFfprobeAvailable(), publicUrl: null }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: NextRequest) {
  const denied = requireSession(request); if (denied) return denied;
  try {
    const { magnet, hash, title } = await request.json();
    if (typeof magnet !== 'string' || magnet.length > 12000) return NextResponse.json({ error: 'Некорректная раздача.' }, { status: 400 });
    return NextResponse.json(await torrentStatus(magnet, typeof hash === 'string' ? hash : undefined, typeof title === 'string' ? title : undefined));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'TorrServer недоступен.' }, { status: 503 }); }
}
