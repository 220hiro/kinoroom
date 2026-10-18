import { requireSession } from '@/lib/serverAuth';
import { NextRequest, NextResponse } from 'next/server';
import { searchTorrentsUnified } from '@/lib/services/torrentSearch';

export async function GET(request: NextRequest) {
  const denied = requireSession(request); if (denied) return denied;
  try {
    const q = request.nextUrl.searchParams.get('q') || request.nextUrl.searchParams.get('title') || '';
    const originalTitle = request.nextUrl.searchParams.get('originalTitle') || undefined;
    const yearStr = request.nextUrl.searchParams.get('year');
    const year = yearStr ? parseInt(yearStr, 10) : undefined;
    const type = (request.nextUrl.searchParams.get('type') as 'movie' | 'tv') || 'movie';
    const seasonStr = request.nextUrl.searchParams.get('season');
    const season = seasonStr ? parseInt(seasonStr, 10) : undefined;
    const episodeStr = request.nextUrl.searchParams.get('episode');
    const episode = episodeStr ? parseInt(episodeStr, 10) : undefined;
    const imdbId = request.nextUrl.searchParams.get('imdbId') || undefined;
    const includeCam = request.nextUrl.searchParams.get('includeCam') === 'true';

    if (!q.trim() && !originalTitle?.trim()) {
      return NextResponse.json([]);
    }

    const results = await searchTorrentsUnified({
      query: q,
      originalTitle,
      year: isNaN(year!) ? undefined : year,
      type,
      season: isNaN(season!) ? undefined : season,
      episode: isNaN(episode!) ? undefined : episode,
      imdbId,
      includeCam
    });

    return NextResponse.json(results);
  } catch (err: any) {
    console.error('Torrent search API error:', err.message || 'Search error');
    return NextResponse.json({ error: 'Torrent search failed' }, { status: 500 });
  }
}
