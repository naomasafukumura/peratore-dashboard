import { auth } from '@/auth';
import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/student/assignment-name
 * 受講生が「先生フォームの受講生名」と同じ文字列を登録（assignments.student_name と一致させる）
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
  }

  let body: { assignmentName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const trimmed = body.assignmentName?.trim() ?? '';
  if (!trimmed) {
    return NextResponse.json({ error: '受講生名を入力してください' }, { status: 400 });
  }

  try {
    await sql`
      UPDATE students
      SET assignment_name = ${trimmed}, updated_at = NOW()
      WHERE google_sub = ${session.user.id}
    `;
  } catch (e) {
    console.error('assignment-name update:', e);
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, assignmentName: trimmed });
}
