import { NextRequest, NextResponse } from 'next/server';
import { searchTorrents } from '@/lib/services/torrents';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q') || '';
    if (!q.trim()) {
      return NextResponse.json([]);
    }

    const results = await searchTorrents(q);
    return NextResponse.json(results);
  } catch (err: any) {
    console.error('Torrent search API error:', err);
    return NextResponse.json({ error: err.message || 'Torrent search failed' }, { status: 500 });
  }
}
