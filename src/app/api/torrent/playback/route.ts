import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createMediaSession, requireMediaServer } from '@/lib/services/torrentMedia';
import { torrentStatus } from '@/lib/services/remoteTorrents';
import { requireSession } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const input = z.object({ torrent: z.string().min(10).max(12000), file: z.number().int().min(0).optional(), season: z.number().int().min(1).optional(), episode: z.number().int().min(1).optional() });
export async function POST(request: NextRequest) {
  const denied = requireSession(request); if (denied) return denied;
  try {
    requireMediaServer();
    const body = input.parse(await request.json());
    const status = await torrentStatus(body.torrent);
    if (!status.ready) return NextResponse.json({ pending: true }, { status: 202 });
    const files = status.files.filter(f => f.isVideo);
    let file = body.file === undefined ? undefined : files.find(f => f.index === body.file);
    if (body.file !== undefined && !file) return NextResponse.json({ error: 'Видеофайл не найден.' }, { status: 404 });
    if (!file && body.season && body.episode) {
      const pattern = new RegExp(`(?:s0*${body.season}[ ._-]*e0*${body.episode}(?!\\d)|\\b0*${body.season}x0*${body.episode}(?!\\d))`, 'i');
      file = files.find(f => pattern.test(f.name));
      if (!file) return NextResponse.json({ files, chooseFile: true, error: 'Выберите файл нужной серии.' }, { status: 409 });
    }
    file ||= [...files].sort((a, b) => b.length - a.length)[0];
    if (!file) return NextResponse.json({ error: 'В раздаче нет видеофайлов.' }, { status: 404 });
    const session = await createMediaSession(status.infoHash, file.index, request.signal);
    return NextResponse.json({ session: session.id, info: session.info, files, fileIndex: file.index });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? 'Некорректная раздача или файл.' : error instanceof Error ? error.message : 'Медиасервер недоступен.' }, { status: error instanceof z.ZodError ? 400 : 503 });
  }
}
