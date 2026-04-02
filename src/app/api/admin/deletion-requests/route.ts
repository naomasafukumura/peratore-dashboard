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

/** GET — 削除依頼一覧（pending） */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const rows = await sql`
    SELECT id, student_name, note, status, requested_at
    FROM student_deletion_requests
    WHERE status = 'pending'
    ORDER BY requested_at ASC
  `;
  return NextResponse.json({ requests: rows });
}

/** POST — 承認（approve）または却下（reject） */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { id, action } = await req.json();
  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'id と action (approve/reject) が必要です' }, { status: 400 });
  }

  const [request] = await sql`
    SELECT student_name FROM student_deletion_requests WHERE id = ${id} AND status = 'pending'
  `;
  if (!request) {
    return NextResponse.json({ error: '依頼が見つかりません' }, { status: 404 });
  }

  if (action === 'approve') {
    // 実際に削除
    await sql`DELETE FROM assignments WHERE student_name = ${request.student_name}`;
    await sql`DELETE FROM student_meta WHERE name = ${request.student_name}`.catch(() => {});
  }

  await sql`
    UPDATE student_deletion_requests
    SET status = ${action === 'approve' ? 'approved' : 'rejected'}, resolved_at = NOW()
    WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true, action, studentName: request.student_name });
}
