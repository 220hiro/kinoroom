import { NextRequest, NextResponse } from 'next/server';
import { openSubtitlesProvider } from '@/lib/services/openSubtitles';

/**
 * GET /api/playback/subtitles/opensubtitles
 *
 * Server-side endpoint for searching Russian subtitles via OpenSubtitles REST API v1.
 * Keeps `OPENSUBTITLES_API_KEY` strictly on the server.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tmdbIdRaw = searchParams.get('tmdbId');
  const imdbId = searchParams.get('imdbId') || undefined;
  const typeParam = searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  const seasonParam = Number(searchParams.get('season') || '1') || 1;
  const episodeParam = Number(searchParams.get('episode') || '1') || 1;
  const durationParam = Number(searchParams.get('duration') || '0') || undefined;

  if (!tmdbIdRaw) {
    return NextResponse.json(
      {
        success: false,
        error: 'MISSING_PARAM',
        message: 'Параметр tmdbId обязателен.'
      },
      { status: 400 }
    );
  }

  const tmdbId = parseInt(tmdbIdRaw, 10);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'INVALID_PARAM',
        message: 'Некорректный параметр tmdbId.'
      },
      { status: 400 }
    );
  }

  const result = await openSubtitlesProvider.searchRussianSubtitles({
    tmdbId,
    imdbId,
    type: typeParam,
    season: typeParam === 'tv' ? seasonParam : undefined,
    episode: typeParam === 'tv' ? episodeParam : undefined,
    expectedDurationSeconds: durationParam
  });

  return NextResponse.json(result, { status: 200 });
}

/**
 * POST /api/playback/subtitles/opensubtitles
 *
 * Downloads a verified subtitle file by `fileId` when `OPENSUBTITLES_API_KEY` and
 * `OPENSUBTITLES_ALLOW_DOWNLOAD=true` are configured on the server.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const fileId = Number(body?.fileId);
    const expectedDurationSeconds =
      typeof body?.expectedDurationSeconds === 'number' && body.expectedDurationSeconds > 0
        ? body.expectedDurationSeconds
        : undefined;

    if (!Number.isInteger(fileId) || fileId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_FILE_ID',
          message: 'Некорректный параметр fileId.'
        },
        { status: 400 }
      );
    }

    const result = await openSubtitlesProvider.downloadSubtitle({
      fileId,
      expectedDurationSeconds
    });

    const status =
      result.status === 'REQUIRES_KEY' || result.status === 'DOWNLOAD_DISABLED'
        ? 403
        : result.status === 'RATE_LIMITED'
        ? 429
        : result.success
        ? 200
        : 502;

    return NextResponse.json(result, { status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'INVALID_JSON',
        message: 'Некорректное тело JSON-запроса.'
      },
      { status: 400 }
    );
  }
}
