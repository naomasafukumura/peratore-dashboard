import 'server-only';
import { createHash, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

/**
 * 旧 masaenglishcompany.com（Xserver）から移した
 * 受講生管理（/peratore-student/）・マイページ（/myportal/）のサーバー側。
 *
 * 旧版は JSON ファイルを PHP で読み書きし、パスワードは HTML に平文で埋め込まれ、
 * students.json は誰でもダウンロードできた。ここでは
 * - データは legacy_store（Neon）に置き、スタッフのセッションが無いと読めない
 * - パスワードは legacy_secrets にハッシュで置き、照合はサーバーで行う
 * - GAS の URL/キーもサーバーだけが持つ
 * 受講生は accessKey で自分の分だけ取得できる。
 */

export const LEGACY_SESSION_COOKIE = 'legacy_session';
const SESSION_DAYS = 30;

export type StoreName = 'students' | 'staff' | 'updates';
export const STORE_NAMES: StoreName[] = ['students', 'staff', 'updates'];

const EMPTY: Record<StoreName, unknown> = {
  students: { students: [], instructors: [], templates: {} },
  staff: {},
  updates: [],
};

export async function ensureLegacyTables() {
  await sql`CREATE TABLE IF NOT EXISTS legacy_store (name TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS legacy_secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS legacy_sessions (token TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL)`;
}

export async function readStore<T = unknown>(name: StoreName): Promise<T> {
  const rows = await sql`SELECT data FROM legacy_store WHERE name = ${name}`;
  return ((rows[0]?.data ?? EMPTY[name]) as T);
}

export async function writeStore(name: StoreName, data: unknown) {
  await sql`
    INSERT INTO legacy_store (name, data, updated_at) VALUES (${name}, ${JSON.stringify(data)}::jsonb, NOW())
    ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
  `;
}

export async function getSecret(name: string): Promise<string | null> {
  const rows = await sql`SELECT value FROM legacy_secrets WHERE name = ${name}`;
  return (rows[0]?.value as string | undefined) ?? null;
}

function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

/** legacy_secrets の pass_hash_* のどれかと一致すれば true */
export async function checkPassword(password: string): Promise<boolean> {
  if (!password) return false;
  const rows = await sql`SELECT value FROM legacy_secrets WHERE name LIKE 'pass_hash_%'`;
  const h = sha256(password);
  return rows.some(r => r.value === h);
}

export async function createSession(res: NextResponse) {
  const token = randomBytes(32).toString('hex');
  await sql`INSERT INTO legacy_sessions (token, expires_at) VALUES (${sha256(token)}, NOW() + make_interval(days => ${SESSION_DAYS}))`;
  await sql`DELETE FROM legacy_sessions WHERE expires_at < NOW()`;
  res.cookies.set(LEGACY_SESSION_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession(req: NextRequest, res: NextResponse) {
  const token = req.cookies.get(LEGACY_SESSION_COOKIE)?.value;
  if (token) await sql`DELETE FROM legacy_sessions WHERE token = ${sha256(token)}`;
  res.cookies.delete(LEGACY_SESSION_COOKIE);
}

export async function isStaff(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(LEGACY_SESSION_COOKIE)?.value;
  if (!token) return false;
  await ensureLegacyTables();
  const rows = await sql`SELECT 1 FROM legacy_sessions WHERE token = ${sha256(token)} AND expires_at > NOW()`;
  return rows.length > 0;
}

export function unauthorized() {
  return NextResponse.json({ success: false, error: 'ログインが必要です' }, { status: 401 });
}

/** GAS のレッスン予定（全受講生分）。URL/キーは legacy_secrets にだけある */
export async function fetchSchedule(studentId?: string | null): Promise<unknown> {
  const url = await getSecret('gas_url');
  const key = await getSecret('gas_key');
  if (!url || !key) return { error: 'schedule api not configured' };
  const u = new URL(url);
  u.searchParams.set('key', key);
  if (studentId) u.searchParams.set('studentId', studentId);
  const r = await fetch(u, { cache: 'no-store', redirect: 'follow' });
  return r.json();
}

export type LegacyLesson = {
  lessonNumber: number; date: string; instructor: string; videoUrl: string; memoUrl: string;
  cancelled?: boolean; note?: string;
};
export type LegacyStudent = {
  id: number; name: string; lineName: string; lineUrl: string; ppUrl?: string; accessKey: string;
  startMonth: string; endMonth: string; status: string; createdAt: string; lessons: LegacyLesson[];
  nonWeekly?: boolean; freq?: string; freqChanges?: unknown[];
};
export type LegacyStudentsDoc = {
  students: LegacyStudent[]; instructors: string[]; templates: Record<string, string>;
};
