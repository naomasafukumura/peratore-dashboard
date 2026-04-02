import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { unauthorizedIfNotTeacher } from '@/lib/require-teacher-session';

export const dynamic = 'force-dynamic';

/** テーブルが無ければ作成（冪等） */
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS student_deletion_requests (
      id SERIAL PRIMARY KEY,
      student_name TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )
  `;
}

/** GET /api/students/deletion-request — 依頼中の受講生名一覧 */
export async function GET(req: NextRequest) {
  const denied = await unauthorizedIfNotTeacher(req);
  if (denied) return denied;
  await ensureTable();
  const rows = await sql`
    SELECT student_name, status FROM student_deletion_requests
    WHERE status = 'pending'
  `;
  return NextResponse.json({ pending: rows.map((r: any) => r.student_name) });
}

/** POST /api/students/deletion-request — 削除依頼を作成 */
export async function POST(req: NextRequest) {
  const denied = await unauthorizedIfNotTeacher(req);
  if (denied) return denied;
  const { studentName, note } = await req.json();
  if (!studentName?.trim()) {
    return NextResponse.json({ error: '受講生名は必須です' }, { status: 400 });
  }
  await ensureTable();

  // 既にpending依頼があれば重複作成しない
  const existing = await sql`
    SELECT id FROM student_deletion_requests
    WHERE student_name = ${studentName.trim()} AND status = 'pending'
    LIMIT 1
  `;
  if (existing.length > 0) {
    return NextResponse.json({ ok: true, message: '既に依頼済みです' });
  }

  await sql`
    INSERT INTO student_deletion_requests (student_name, note)
    VALUES (${studentName.trim()}, ${note?.trim() || null})
  `;
  return NextResponse.json({ ok: true });
}
