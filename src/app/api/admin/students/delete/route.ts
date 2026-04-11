import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const token =
    req.cookies.get(ADMIN_SESSION_COOKIE)?.value ??
    (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  const ok = await verifyAdminSession(token);
  if (!ok) return NextResponse.json({ error: '管理者ログインが必要です' }, { status: 401 });
  return null;
}

/** POST /api/admin/students/delete — 管理者による直接削除 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: '名前は必須です' }, { status: 400 });

  try {
    const n = name.trim();
    await sql`DELETE FROM assignments WHERE student_name = ${n}`;
    await sql`DELETE FROM student_meta WHERE name = ${n}`.catch(() => {});
    await sql`DELETE FROM registered_students WHERE name = ${n}`.catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
