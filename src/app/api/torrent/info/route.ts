import { NextRequest, NextResponse } from 'next/server';
import { getTorrentStatus } from '@/lib/services/torrents';

export async function GET(request: NextRequest) {
  try {
    const torrentId = request.nextUrl.searchParams.get('torrent');
    if (!torrentId) {
      return NextResponse.json({ error: 'Missing torrent parameter' }, { status: 400 });
    }

    const status = await getTorrentStatus(torrentId);
    return NextResponse.json(status);
  } catch (err: any) {
    console.error('Torrent info error:', err);
    return NextResponse.json({ error: err.message || 'Failed to get torrent info' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const torrentId = body.torrent;
    if (!torrentId) {
      return NextResponse.json({ error: 'Missing torrent in body' }, { status: 400 });
    }

    const status = await getTorrentStatus(torrentId);
    return NextResponse.json(status);
  } catch (err: any) {
    console.error('Torrent info POST error:', err);
    return NextResponse.json({ error: err.message || 'Failed to get torrent info' }, { status: 500 });
  }
}
