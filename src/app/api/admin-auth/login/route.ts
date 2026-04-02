import { NextRequest, NextResponse } from 'next/server';
import { createAdminJwt, ADMIN_SESSION_COOKIE, isAdminGateActive } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isAdminGateActive()) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD が未設定です' }, { status: 400 });
  }
  const { password } = await req.json();
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected || password?.trim() !== expected) {
    return NextResponse.json({ error: 'パスワードが違います' }, { status: 401 });
  }
  const token = await createAdminJwt();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
