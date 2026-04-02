import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const ADMIN_SESSION_COOKIE = 'admin_session';

function resolveAdminPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD?.trim() || undefined;
}

export function isAdminGateActive(): boolean {
  return Boolean(resolveAdminPassword());
}

function secretKey(): Uint8Array | null {
  const raw = resolveAdminPassword();
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

export async function createAdminJwt(): Promise<string> {
  const key = secretKey();
  if (!key) throw new Error('ADMIN_PASSWORD が未設定です');
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

export async function verifyAdminSession(token: string | undefined): Promise<boolean> {
  const key = secretKey();
  if (!key) return false; // ADMIN_PASSWORD 未設定なら管理者機能は無効
  if (!token) return false;
  try {
    await jwtVerify(token, key);
    return true;
  } catch {
    return false;
  }
}

export async function redirectAdminLoginIfNeeded(nextPath: string): Promise<void> {
  if (!isAdminGateActive()) {
    redirect('/teacher/admin/no-password');
  }
  const jar = await cookies();
  const token = jar.get(ADMIN_SESSION_COOKIE)?.value;
  const ok = await verifyAdminSession(token);
  if (!ok) {
    redirect(`/teacher/admin/login?next=${encodeURIComponent(nextPath)}`);
  }
}
