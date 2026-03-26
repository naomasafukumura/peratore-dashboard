import { SignJWT, jwtVerify } from 'jose';

/** HttpOnly Cookie 名（先生セッション） */
export const TEACHER_SESSION_COOKIE = 'teacher_session';

/**
 * `proxy`（Edge）でも動かすため env のみ（fs は使わない）。
 * Turbopack 対策で `Reflect.get`、起動時注入は `next.config` の `saturateMissingEnvFromDisk`。
 */
export function isTeacherGateEnabled(): boolean {
  const v = Reflect.get(process.env, 'TEACHER_PASSWORD');
  return typeof v === 'string' && Boolean(v.trim());
}

function secretKey(): Uint8Array {
  const auth = Reflect.get(process.env, 'TEACHER_AUTH_SECRET');
  const pwd = Reflect.get(process.env, 'TEACHER_PASSWORD');
  const raw =
    (typeof auth === 'string' ? auth.trim() : '') ||
    (typeof pwd === 'string' ? pwd.trim() : '');
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
