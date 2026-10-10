import { NextRequest, NextResponse } from 'next/server';
import { getOnlineEmbedSources, TitleInfo } from '@/lib/services/onlineSources';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const tmdbId = parseInt(searchParams.get('tmdbId') || '0', 10);
    const imdbId = searchParams.get('imdbId') || undefined;
    const kinopoiskId = searchParams.get('kinopoiskId') ? parseInt(searchParams.get('kinopoiskId')!, 10) : undefined;
    const title = searchParams.get('title') || '';
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : undefined;
    const type = (searchParams.get('type') || 'movie') as 'movie' | 'tv';
    const season = searchParams.get('season') ? parseInt(searchParams.get('season')!, 10) : undefined;
    const episode = searchParams.get('episode') ? parseInt(searchParams.get('episode')!, 10) : undefined;

    const info: TitleInfo = {
      tmdbId,
      imdbId,
      kinopoiskId,
      title,
      year,
      type,
      season,
      episode
    };

    const sources = getOnlineEmbedSources(info);
    return NextResponse.json(sources);
  } catch (err: any) {
    console.error('Sources API error:', err);
    return NextResponse.json({ error: err.message || 'Failed to get sources' }, { status: 500 });
  }
}
