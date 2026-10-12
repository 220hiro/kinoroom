import { NextRequest, NextResponse } from 'next/server';
import { playbackRegistry } from '@/lib/playback/registry';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const mediaId = searchParams.get('mediaId');
    const mediaType = (searchParams.get('mediaType') || 'movie') as 'movie' | 'tv';
    const season = searchParams.get('season') ? parseInt(searchParams.get('season')!, 10) : undefined;
    const episode = searchParams.get('episode') ? parseInt(searchParams.get('episode')!, 10) : undefined;

    if (!mediaId) {
      return NextResponse.json({ error: 'Параметр mediaId обязателен' }, { status: 400 });
    }

    const resolved = await playbackRegistry.resolve({
      mediaId,
      mediaType,
      season,
      episode
    });

    return NextResponse.json({
      success: true,
      translations: resolved.availableTranslations || [],
      currentTranslation: resolved.currentTranslation
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Ошибка сервера' }, { status: 500 });
  }
}
