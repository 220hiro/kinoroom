import { NextResponse } from 'next/server';
import { metadata } from '@/lib/providers/metadata';

export async function GET() {
  try {
    const provider = metadata();
    const sections = await provider.home();
    return NextResponse.json(sections);
  } catch (err: any) {
    console.error('Home API error:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch home sections' }, { status: 500 });
  }
}
