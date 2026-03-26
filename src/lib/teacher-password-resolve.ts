import 'server-only';

import { readEnvValueFromFiles } from '@/lib/read-env-from-files';

/**
 * Node（Route Handler / RSC）専用。Turbopack で process.env に載らないとき `.env.local` を読む。
 * Edge の `proxy` では使わない（teacher-token は env のみ参照）。
 */
export function resolveTeacherPassword(): string | undefined {
  const e = process.env.TEACHER_PASSWORD?.trim();
  if (e) return e;
  return readEnvValueFromFiles('TEACHER_PASSWORD')?.trim();
}

export function resolveTeacherAuthSecret(): string | undefined {
  const e = process.env.TEACHER_AUTH_SECRET?.trim();
  if (e) return e;
  return readEnvValueFromFiles('TEACHER_AUTH_SECRET')?.trim();
}

export function isTeacherGateEnabledResolved(): boolean {
  return Boolean(resolveTeacherPassword());
}
