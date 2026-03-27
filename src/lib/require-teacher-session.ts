import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  isTeacherGateActive,
  verifyTeacherSessionToken,
} from '@/lib/teacher-session-server';
import { TEACHER_SESSION_COOKIE } from '@/lib/teacher-token';

const LOGIN_HINT =
  'ログインしたときと同じURLで開いていますか？localhost と 192.168.x.x などを混ぜると Cookie が送られません。';

/** ゲート無効時は null。要ログインで未ログインなら 401 の Response */
export async function unauthorizedIfNotTeacher(
  req: NextRequest,
): Promise<NextResponse | null> {
  if (!isTeacherGateActive()) return null;

  const token =
    req.cookies.get(TEACHER_SESSION_COOKIE)?.value ??
    (await cookies()).get(TEACHER_SESSION_COOKIE)?.value;

  const ok = await verifyTeacherSessionToken(token);
  if (!ok) {
    return NextResponse.json(
      { error: 'ログインが必要です（先生用）', hint: LOGIN_HINT },
      { status: 401 },
    );
  }
  return null;
}
