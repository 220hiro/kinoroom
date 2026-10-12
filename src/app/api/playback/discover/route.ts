import { NextRequest, NextResponse } from 'next/server';
import { openMediaDiscoveryService } from '@/lib/playback/providers/openMediaProvider';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const tmdbIdParam = searchParams.get('tmdbId');

    if (!tmdbIdParam) {
      return NextResponse.json(
        { success: false, error: 'Параметр tmdbId обязателен (например, ?tmdbId=10331)' },
        { status: 400 }
      );
    }

    const tmdbId = parseInt(tmdbIdParam, 10);
    if (isNaN(tmdbId) || tmdbId <= 0) {
      return NextResponse.json(
        { success: false, error: 'tmdbId должен быть положительным числом' },
        { status: 422 }
      );
    }

    const discovery = await openMediaDiscoveryService.discoverByTmdbId(tmdbId);

    return NextResponse.json(
      {
        success: true,
        discovery
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600'
        }
      }
    );
  } catch (error: any) {
    console.error('[OpenMedia Discovery API Error]:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Ошибка автоматического обнаружения медиа'
      },
      { status: 500 }
    );
  }
}
