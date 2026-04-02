import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const res = NextResponse.redirect(new URL('/teacher/admin/login', process.env.NEXTAUTH_URL || 'http://localhost:3000'));
  res.cookies.set(ADMIN_SESSION_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
