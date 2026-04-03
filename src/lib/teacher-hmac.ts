import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import { resolveTeacherAuthSecret, resolveTeacherPassword } from '@/lib/teacher-password-resolve';

function getSecret(): string | undefined {
  return resolveTeacherAuthSecret()?.trim() || resolveTeacherPassword()?.trim();
}

/** パスワードからセッショントークン（hex文字列）を生成 */
export function createTeacherSessionToken(): string {
  const secret = getSecret();
  if (!secret) throw new Error('TEACHER_PASSWORD が未設定');
  return createHmac('sha256', secret).update('teacher-session-v1').digest('hex');
}

/** トークンが有効か検証 */
export function verifyTeacherSessionTokenSimple(token: string | undefined): boolean {
  const secret = getSecret();
  if (!secret) return true; // ゲート無効
  if (!token) return false;
  const expected = createHmac('sha256', secret).update('teacher-session-v1').digest('hex');
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function isTeacherGateActiveSimple(): boolean {
  return Boolean(resolveTeacherPassword());
}
