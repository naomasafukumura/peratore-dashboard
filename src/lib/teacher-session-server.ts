import 'server-only';

import { jwtVerify } from 'jose';
import {
  resolveTeacherAuthSecret,
  resolveTeacherPassword,
} from '@/lib/teacher-password-resolve';

/**
 * Route Handler / RSC 専用。`teacher-password-resolve` と同じ材料でゲート・JWT を判定する。
 * Edge の `proxy` は引き続き `teacher-token`（env 依存）のみ。
 */
export function isTeacherGateActive(): boolean {
  return Boolean(resolveTeacherPassword());
}

function verificationKey(): Uint8Array | null {
  const raw =
    resolveTeacherAuthSecret()?.trim() || resolveTeacherPassword()?.trim();
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

export async function verifyTeacherSessionToken(
  token: string | undefined,
): Promise<boolean> {
  const key = verificationKey();
  if (!key) return true;
  if (!token) return false;
  try {
    await jwtVerify(token, key);
    return true;
  } catch {
    return false;
  }
}
