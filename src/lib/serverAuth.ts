import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
const cookieName = 'kinoroom_auth'; // Preserve the existing site's cookie name, not its old forgeable value.
export function authRequired(): boolean { return Boolean(process.env.SITE_PASSWORD?.trim()); }
export function issueSession(now = Date.now()): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET must contain at least 32 characters');
  const expires = String(Math.floor(now / 1000) + 30 * 86400);
  return `${expires}.${createHmac('sha256', secret).update(expires).digest('base64url')}`;
}
export function validSession(token: string | undefined, now = Date.now()): boolean {
  if (!token || !process.env.AUTH_SECRET) return false;
  const [expires, signature, extra] = token.split('.');
  if (extra || !/^\d+$/.test(expires) || Number(expires) <= now / 1000 || !signature) return false;
  const expected = createHmac('sha256', process.env.AUTH_SECRET).update(expires).digest('base64url');
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
export function requireSession(request: NextRequest): Response | null {
  return authRequired() && !validSession(request.cookies.get(cookieName)?.value)
    ? Response.json({ error: 'Войдите в кинозал.' }, { status: 401 }) : null;
}
