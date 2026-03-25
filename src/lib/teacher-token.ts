import { SignJWT, jwtVerify } from 'jose';

/** HttpOnly Cookie 名（先生セッション） */
export const TEACHER_SESSION_COOKIE = 'teacher_session';

/** `TEACHER_PASSWORD` を設定するとページ・一部 API でログイン必須 */
export function isTeacherGateEnabled(): boolean {
  return Boolean(process.env.TEACHER_PASSWORD?.trim());
}

function secretKey(): Uint8Array {
  const raw = process.env.TEACHER_AUTH_SECRET?.trim() || process.env.TEACHER_PASSWORD?.trim();
  if (!raw) {
    throw new Error('TEACHER_PASSWORD（または TEACHER_AUTH_SECRET）が未設定です');
  }
  return new TextEncoder().encode(raw);
}

export async function createTeacherJwt(): Promise<string> {
  return new SignJWT({ role: 'teacher' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey());
}

export async function verifyTeacherJwt(token: string | undefined): Promise<boolean> {
  if (!isTeacherGateEnabled()) return true;
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}
