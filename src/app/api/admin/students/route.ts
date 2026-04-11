import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PRESET_STUDENTS = [
  '伊吾田恵津子', '犬塚美代子', '井上優子',
  '氏家敦子',
  '及川祐貴', '小川早喜', '小川美喜子',
  '甲斐博美', '狩野怜菜', '川上潔', '木戸真紀子', '桑野千尋',
  '齋藤りの', '佐藤妙', '佐藤結衣',
  '高瀬範子', '高橋通江', '徳原かずみ', '徳世由美子',
  '古屋淳',
  '前田結衣', '牧内晴代', '松隈由香', '松本桂子',
  '山下千恵子', '山田智美',
  'ロバス由貴',
];

async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const token =
    req.cookies.get(ADMIN_SESSION_COOKIE)?.value ??
    (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  const ok = await verifyAdminSession(token);
  if (!ok) return NextResponse.json({ error: '管理者ログインが必要です' }, { status: 401 });
  return null;
}

/** GET /api/admin/students — 受講生一覧（yomi・displayName付き） */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    let assignNames: string[] = [];
    let registeredNames: string[] = [];
    let yomiMap = new Map<string, string>();
    let displayNameMap = new Map<string, string>();

    try {
      const rows = await sql`SELECT DISTINCT TRIM(student_name) AS name FROM assignments WHERE student_name IS NOT NULL AND TRIM(student_name) <> ''`;
      assignNames = (rows as { name: string }[]).map(r => r.name);
    } catch {}

    try {
      const rows = await sql`SELECT name FROM registered_students WHERE name IS NOT NULL AND TRIM(name) <> ''`;
      registeredNames = (rows as { name: string }[]).map(r => r.name);
    } catch {}

    try {
      const rows = await sql`SELECT name, yomi, display_name FROM student_meta`;
      yomiMap = new Map((rows as { name: string; yomi: string; display_name: string }[]).map(r => [r.name, r.yomi ?? '']));
      displayNameMap = new Map((rows as { name: string; yomi: string; display_name: string }[]).map(r => [r.name, r.display_name ?? '']));
    } catch {}

    const allNames = Array.from(new Set([...PRESET_STUDENTS, ...assignNames, ...registeredNames]));
    const students = allNames
      .map(name => ({ name, yomi: yomiMap.get(name) ?? '', displayName: displayNameMap.get(name) ?? '' }))
      .sort((a, b) => (a.yomi || a.name).localeCompare(b.yomi || b.name, 'ja'));

    return NextResponse.json({ students });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/admin/students — 受講生追加 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const { name, yomi, displayName } = await req.json();
    const trimmed = typeof name === 'string' ? name.trim() : '';
    const trimmedYomi = typeof yomi === 'string' ? yomi.trim() : '';
    const trimmedDisplay = typeof displayName === 'string' ? displayName.trim() : '';
    if (!trimmed) return NextResponse.json({ error: '受講生名を入力してください' }, { status: 400 });

    await sql`CREATE TABLE IF NOT EXISTS registered_students (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)`;
    await sql`INSERT INTO registered_students (name) VALUES (${trimmed}) ON CONFLICT (name) DO NOTHING`;
    if (trimmedYomi || trimmedDisplay) {
      await sql`ALTER TABLE student_meta ADD COLUMN IF NOT EXISTS display_name TEXT`;
      await sql`
        INSERT INTO student_meta (name, yomi, display_name)
        VALUES (${trimmed}, ${trimmedYomi || null}, ${trimmedDisplay || null})
        ON CONFLICT (name) DO UPDATE
          SET yomi = COALESCE(EXCLUDED.yomi, student_meta.yomi),
              display_name = COALESCE(EXCLUDED.display_name, student_meta.display_name)
      `;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
