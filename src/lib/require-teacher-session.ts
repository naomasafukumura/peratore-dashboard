import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { isTeacherGateEnabled, TEACHER_SESSION_COOKIE, verifyTeacherJwt } from '@/lib/teacher-token';

/** ゲート無効時は null。要ログインで未ログインなら 401 の Response */
export async function unauthorizedIfNotTeacher(_req: NextRequest): Promise<NextResponse | null> {
  if (!isTeacherGateEnabled()) return null;
  const jar = await cookies();
  const token = jar.get(TEACHER_SESSION_COOKIE)?.value ?? _req.cookies.get(TEACHER_SESSION_COOKIE)?.value;
  const ok = await verifyTeacherJwt(token);
  if (!ok) {
    return NextResponse.json({ error: 'ログインが必要です（先生用）' }, { status: 401 });
  }
  return null;
}
