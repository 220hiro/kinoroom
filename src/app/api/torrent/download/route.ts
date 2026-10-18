import { requireSession } from '@/lib/serverAuth';
import { NextRequest, NextResponse } from 'next/server';
import { resolveTorrentDownloadRef, fetchTorrentBufferByToken, scrubPasskeysFromTorrentBuffer } from '@/lib/services/jackett';

export const dynamic = 'force-dynamic';

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\sа-яА-ЯёЁ.-]/gi, '_').slice(0, 100);
}

export async function GET(request: NextRequest) {
  const denied = requireSession(request); if (denied) return denied;
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const ref = resolveTorrentDownloadRef(token);
    if (!ref) {
      return NextResponse.json({ error: 'Invalid or expired download token' }, { status: 404 });
    }

    const fetched = await fetchTorrentBufferByToken(token);
    if (!fetched) {
      return NextResponse.json({ error: 'Failed to retrieve .torrent file from source' }, { status: 502 });
    }

    const scrubbedBuffer = await scrubPasskeysFromTorrentBuffer(fetched.buffer);
    const cleanFilename = `${sanitizeFilename(ref.title || 'release')}.torrent`;

    return new Response(scrubbedBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-bittorrent',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(cleanFilename)}"`,
        'Cache-Control': 'private, max-age=3600'
      }
    });
  } catch (err: any) {
    console.error('Download proxy error:', err.message || 'Unknown error');
    return NextResponse.json({ error: 'Failed to download torrent' }, { status: 500 });
  }
}
