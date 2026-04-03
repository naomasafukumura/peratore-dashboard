import 'server-only';
import {
  isTeacherGateActiveSimple,
  verifyTeacherSessionTokenSimple,
} from '@/lib/teacher-hmac';

export function isTeacherGateActive(): boolean {
  return isTeacherGateActiveSimple();
}

export async function verifyTeacherSessionToken(
  token: string | undefined,
): Promise<boolean> {
  if (!isTeacherGateActiveSimple()) return true;
  const ok = verifyTeacherSessionTokenSimple(token);
  if (!ok) {
    console.warn('[teacher-auth]', token ? 'token mismatch' : 'cookie not found');
  }
  return ok;
}
