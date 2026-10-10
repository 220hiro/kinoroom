import { NextRequest, NextResponse } from 'next/server';
import { metadata } from '@/lib/providers/metadata';
import { MediaType } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = (searchParams.get('type') || 'movie') as MediaType;
    const genre = searchParams.get('genre') || undefined;
    const sortBy = (searchParams.get('sort') || 'popularity.desc') as any;
    const page = parseInt(searchParams.get('page') || '1', 10);

    const provider = metadata();
    const data = await provider.catalog({
      type,
      genre,
      sortBy,
      page: isNaN(page) ? 1 : page
    });

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Catalog API error:', err);
    return NextResponse.json({ error: err.message || 'Catalog failed' }, { status: 500 });
  }
}
