import { NextRequest, NextResponse } from 'next/server';
import { metadata } from '@/lib/providers/metadata';
import type { MediaType } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const type = (searchParams.get('type') || 'movie') as MediaType;
    const id = parseInt(searchParams.get('id') || '0', 10);
    const season = searchParams.get('season') ? parseInt(searchParams.get('season')!, 10) : undefined;

    if (!id) {
      return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });
    }

    const provider = metadata();
    const media = await provider.details(type, id);

    let episodes = undefined;
    if (type === 'tv') {
      const seasonNum = season !== undefined ? season : (media.seasons?.[0]?.number || 1);
      episodes = await provider.season(id, seasonNum);
    }

    return NextResponse.json({ media, episodes });
  } catch (err: any) {
    console.error('Details API error:', err);
    return NextResponse.json({ error: err.message || 'Details failed' }, { status: 500 });
  }
}
