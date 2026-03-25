import { createTeacherJwt, isTeacherGateEnabled, TEACHER_SESSION_COOKIE } from '@/lib/teacher-token';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isTeacherGateEnabled()) {
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

  const expected = process.env.TEACHER_PASSWORD!.trim();
  if (body.password !== expected) {
    return NextResponse.json({ error: 'パスワードが違います' }, { status: 401 });
  }

  const token = await createTeacherJwt();
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
