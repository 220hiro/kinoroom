import { NextRequest, NextResponse } from 'next/server';
import { metadata } from '@/lib/providers/metadata';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q') || '';
    if (!q.trim()) {
      return NextResponse.json([]);
    }
    const provider = metadata();
    const results = await provider.search(q);
    return NextResponse.json(results);
  } catch (err: any) {
    console.error('Search API error:', err);
    return NextResponse.json({ error: err.message || 'Search failed' }, { status: 500 });
  }
}
