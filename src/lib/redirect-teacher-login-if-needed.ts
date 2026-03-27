import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  isTeacherGateActive,
  verifyTeacherSessionToken,
} from '@/lib/teacher-session-server';
import { TEACHER_SESSION_COOKIE } from '@/lib/teacher-token';

/**
 * 先生用パスワードゲート ON のとき、有効な teacher_session が無ければログインへ。
 * `/api/lesson-submission` の `unauthorizedIfNotTeacher` と同じ条件。
 */
export async function redirectTeacherLoginIfNeeded(nextPath: string): Promise<void> {
  if (!isTeacherGateActive()) {
    return;
  }
  const jar = await cookies();
  const token = jar.get(TEACHER_SESSION_COOKIE)?.value;
  const ok = await verifyTeacherSessionToken(token);
  if (!ok) {
    redirect(`/teacher/login?next=${encodeURIComponent(nextPath)}`);
  }
}
