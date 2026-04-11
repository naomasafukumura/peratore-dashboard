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

/** POST /api/admin/students/rename */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { oldName, newName, yomi, displayName } = await req.json();
  if (!oldName?.trim() || !newName?.trim()) {
    return NextResponse.json({ error: '旧名・新名は必須です' }, { status: 400 });
  }

  const old = oldName.trim();
  const next = newName.trim();

  try {
    if (old !== next) {
      await sql`UPDATE assignments SET student_name = ${next} WHERE student_name = ${old}`;
      await sql`UPDATE student_meta SET name = ${next} WHERE name = ${old}`;
      await sql`UPDATE registered_students SET name = ${next} WHERE name = ${old}`.catch(() => {});
    }
    if (yomi !== undefined || displayName !== undefined) {
      await sql`ALTER TABLE student_meta ADD COLUMN IF NOT EXISTS display_name TEXT`;
      await sql`
        INSERT INTO student_meta (name, yomi, display_name)
        VALUES (${next}, ${yomi ?? null}, ${displayName ?? null})
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
