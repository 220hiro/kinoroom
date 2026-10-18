import { NextRequest, NextResponse } from 'next/server';
import { issueSession, validSession } from '@/lib/serverAuth';

export async function GET(request: NextRequest) {
  const passwordRequired = Boolean(process.env.SITE_PASSWORD && process.env.SITE_PASSWORD.trim().length > 0);
  if (!passwordRequired) {
    return NextResponse.json({ authenticated: true, required: false });
  }

  const cookie = request.cookies.get('kinoroom_auth');
  const authenticated = validSession(cookie?.value);

  return NextResponse.json({ authenticated, required: true });
}

export async function POST(request: NextRequest) {
  const passwordRequired = Boolean(process.env.SITE_PASSWORD && process.env.SITE_PASSWORD.trim().length > 0);
  if (!passwordRequired) {
    return NextResponse.json({ success: true });
  }

  try {
    const { password } = await request.json();
    if (password === process.env.SITE_PASSWORD) {
      const response = NextResponse.json({ success: true });
      response.cookies.set('kinoroom_auth', issueSession(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30 // 30 days
      });
      return response;
    }

    return NextResponse.json({ success: false, error: 'Неверный пароль' }, { status: 401 });
  } catch {
    return NextResponse.json({ success: false, error: 'Ошибка проверки' }, { status: 400 });
  }
}
