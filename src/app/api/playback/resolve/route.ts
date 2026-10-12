import { NextRequest, NextResponse } from 'next/server';
import { PlaybackRequestSchema } from '@/lib/playback/types';
import { playbackRegistry } from '@/lib/playback/registry';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { success: false, error: 'Некорректный JSON в запросе' },
        { status: 400 }
      );
    }

    const parseResult = PlaybackRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Неверные параметры запроса',
          details: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
        },
        { status: 422 }
      );
    }

    const validatedRequest = parseResult.data;
    const response = await playbackRegistry.resolve(validatedRequest);

    return NextResponse.json(response, {
      status: response.success ? 200 : 404,
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error: any) {
    console.error('Playback resolve error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Внутренняя ошибка сервера при разрешении потока'
      },
      { status: 500 }
    );
  }
}
