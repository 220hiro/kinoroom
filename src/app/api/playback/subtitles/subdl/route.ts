import { NextRequest, NextResponse } from 'next/server';
import { subdlProvider } from '@/lib/services/subdl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/playback/subtitles/subdl
 *
 * Query params:
 *   - tmdbId (number, required)
 *   - type ('movie' | 'tv', default 'movie')
 *   - season (number, optional)
 *   - episode (number, optional)
 *   - imdbId (string, optional)
 *   - autoDownload ('true' | 'false', optional)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tmdbIdRaw = searchParams.get('tmdbId');
    const typeRaw = searchParams.get('type');
    const seasonRaw = searchParams.get('season');
    const episodeRaw = searchParams.get('episode');
    const imdbId = searchParams.get('imdbId') || undefined;
    const autoDownload = searchParams.get('autoDownload') === 'true';

    if (!tmdbIdRaw) {
      return NextResponse.json(
        { success: false, error: 'MISSING_PARAM', message: 'Параметр tmdbId обязателен.' },
        { status: 400 }
      );
    }

    const tmdbId = parseInt(tmdbIdRaw, 10);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
      return NextResponse.json(
        { success: false, error: 'INVALID_TMDB_ID', message: 'Некорректный идентификатор tmdbId.' },
        { status: 400 }
      );
    }

    const type: 'movie' | 'tv' = typeRaw === 'tv' ? 'tv' : 'movie';
    const season = seasonRaw ? parseInt(seasonRaw, 10) : undefined;
    const episode = episodeRaw ? parseInt(episodeRaw, 10) : undefined;

    const searchResult = await subdlProvider.searchSubtitles({
      tmdbId,
      imdbId,
      type,
      season,
      episode,
      languages: 'ru'
    });

    // If autoDownload requested and bestCandidate found, automatically download and decode
    if (autoDownload && searchResult.bestCandidate && searchResult.status === 'CONNECTED') {
      try {
        const downloadRes = await subdlProvider.downloadSubtitle({
          subtitleId: searchResult.bestCandidate.id,
          downloadUrl: searchResult.bestCandidate.downloadUrl,
          tmdbId,
          type,
          season,
          episode
        });

        if (downloadRes.success && downloadRes.content) {
          searchResult.autoLoadedSubtitle = {
            content: downloadRes.content,
            fileName: downloadRes.fileName || searchResult.bestCandidate.name,
            format: downloadRes.format || 'srt',
            cueCount: downloadRes.cueCount || 0,
            warnings: downloadRes.warnings || [],
            isProvisional: searchResult.bestCandidate.isProvisional
          };
        }
      } catch (dlErr) {
        console.warn('[SubDL Route] Auto-download error:', dlErr);
      }
    }

    return NextResponse.json(searchResult, { status: 200 });
  } catch (error: any) {
    console.error('[SubDL Route] GET Handler error:', error);
    return NextResponse.json(
      {
        success: false,
        status: 'UNAVAILABLE',
        configured: subdlProvider.isConfigured(),
        message: error?.message || 'Внутренняя ошибка сервера при поиске субтитров в SubDL.'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/playback/subtitles/subdl
 *
 * Body:
 *   - subtitleId (string, required)
 *   - downloadUrl (string, optional)
 *   - tmdbId (number, required)
 *   - type ('movie' | 'tv', required)
 *   - season (number, optional)
 *   - episode (number, optional)
 *   - expectedDurationSeconds (number, optional)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'INVALID_BODY', message: 'Некорректное тело запроса.' },
        { status: 400 }
      );
    }

    const { subtitleId, downloadUrl, tmdbId, type, season, episode, expectedDurationSeconds } = body;

    if (!subtitleId || typeof subtitleId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'MISSING_SUBTITLE_ID', message: 'Параметр subtitleId обязателен.' },
        { status: 400 }
      );
    }

    if (!tmdbId || !Number.isFinite(tmdbId)) {
      return NextResponse.json(
        { success: false, error: 'MISSING_TMDB_ID', message: 'Параметр tmdbId обязателен.' },
        { status: 400 }
      );
    }

    const downloadRes = await subdlProvider.downloadSubtitle({
      subtitleId,
      downloadUrl,
      tmdbId,
      type: type === 'tv' ? 'tv' : 'movie',
      season: season ? Number(season) : undefined,
      episode: episode ? Number(episode) : undefined,
      expectedDurationSeconds: expectedDurationSeconds ? Number(expectedDurationSeconds) : undefined
    });

    return NextResponse.json(downloadRes, {
      status: downloadRes.success ? 200 : 400
    });
  } catch (error: any) {
    console.error('[SubDL Route] POST Handler error:', error);
    return NextResponse.json(
      {
        success: false,
        status: 'UNAVAILABLE',
        message: error?.message || 'Внутренняя ошибка сервера при скачивании субтитров из SubDL.'
      },
      { status: 500 }
    );
  }
}
