import { requireSession } from '@/lib/serverAuth';
import { NextRequest, NextResponse } from 'next/server';
import { enrichMagnet } from '@/lib/services/torrentUtils';
export async function POST(request: NextRequest) {
  const denied = requireSession(request); if (denied) return denied;
  try {
    const { fileData } = await request.json();
    if (typeof fileData !== 'string' || fileData.length > 3 * 1024 * 1024) return NextResponse.json({ error: 'Файл раздачи слишком большой.' }, { status: 400 });
    const { default: parseTorrent } = await import('parse-torrent');
    const parsed = await parseTorrent(Buffer.from(fileData, 'base64'));
    if (!parsed.infoHash) throw new Error('Invalid torrent');
    return NextResponse.json({ magnet: enrichMagnet(`magnet:?xt=urn:btih:${parsed.infoHash}`, parsed.announce || []) });
  } catch { return NextResponse.json({ error: 'Не удалось прочитать .torrent файл.' }, { status: 400 }); }
}
