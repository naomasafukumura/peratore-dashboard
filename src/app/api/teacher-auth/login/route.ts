import { SignJWT } from 'jose';
import { TEACHER_SESSION_COOKIE } from '@/lib/teacher-token';
import {
  resolveTeacherAuthSecret,
  resolveTeacherPassword,
} from '@/lib/teacher-password-resolve';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const expected = resolveTeacherPassword();
  if (!expected) {
    return NextResponse.json(
      { error: 'TEACHER_PASSWORD が未設定のため、ログインは無効です' },
      { status: 400 }
    );
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const got = typeof body.password === 'string' ? body.password.trim() : '';
  if (got !== expected) {
    return NextResponse.json({ error: 'パスワードが違います' }, { status: 401 });
  }

  // 検証と同じキー導出ロジックを使ってJWTを署名する
  const rawKey = resolveTeacherAuthSecret()?.trim() || expected;
  const key = new TextEncoder().encode(rawKey);
  const token = await new SignJWT({ role: 'teacher' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TEACHER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
