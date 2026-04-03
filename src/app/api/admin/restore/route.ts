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

/** GET — 削除済み受講生一覧 */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const rows = await sql`
      SELECT student_name, MIN(deleted_at) AS deleted_at
      FROM deleted_student_assignments
      GROUP BY student_name
      ORDER BY deleted_at DESC
    `;
    return NextResponse.json({ deleted: rows });
  } catch {
    return NextResponse.json({ deleted: [] });
  }
}

/** POST — 復元 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { studentName } = await req.json();
  if (!studentName) {
    return NextResponse.json({ error: 'studentName が必要です' }, { status: 400 });
  }

  // assignments に復元
  await sql`
    INSERT INTO assignments (student_name, chunk_id)
    SELECT student_name, chunk_id FROM deleted_student_assignments
    WHERE student_name = ${studentName}
    ON CONFLICT DO NOTHING
  `;
  await sql`DELETE FROM deleted_student_assignments WHERE student_name = ${studentName}`;

  // student_meta に復元
  await sql`
    INSERT INTO student_meta (name, yomi)
    SELECT name, yomi FROM deleted_student_meta
    WHERE name = ${studentName}
    ON CONFLICT DO NOTHING
  `.catch(() => {});
  await sql`DELETE FROM deleted_student_meta WHERE name = ${studentName}`.catch(() => {});

  return NextResponse.json({ ok: true, studentName });
}
