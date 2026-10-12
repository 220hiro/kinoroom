import { NextRequest, NextResponse } from 'next/server';
import { getExternalSources } from '@/lib/services/externalSources';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const tmdbIdParam = searchParams.get('tmdbId');

    if (!tmdbIdParam) {
      return NextResponse.json(
        { success: false, error: 'MISSING_PARAM', message: 'Parameter tmdbId is required' },
        { status: 400 }
      );
    }

    const tmdbId = parseInt(tmdbIdParam, 10);
    if (isNaN(tmdbId) || tmdbId <= 0) {
      return NextResponse.json(
        { success: false, error: 'INVALID_PARAM', message: 'Parameter tmdbId must be a positive integer' },
        { status: 400 }
      );
    }

    const imdbId = searchParams.get('imdbId') || undefined;
    const type = (searchParams.get('type') || 'movie') as 'movie' | 'tv';
    const season = searchParams.get('season') ? parseInt(searchParams.get('season')!, 10) : undefined;
    const episode = searchParams.get('episode') ? parseInt(searchParams.get('episode')!, 10) : undefined;
    const title = searchParams.get('title') || undefined;
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : undefined;

    const sources = await getExternalSources({
      tmdbId,
      imdbId,
      type,
      season,
      episode,
      title,
      year
    });

    return NextResponse.json({
      success: true,
      tmdbId,
      type,
      season,
      episode,
      sources
    });
  } catch (err: any) {
    console.error('[ExternalSources API] Error:', err);
    return NextResponse.json(
      { success: false, error: 'SERVER_ERROR', message: err?.message || 'Failed to fetch external sources' },
      { status: 500 }
    );
  }
}
