import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { unauthorizedIfNotTeacher } from '@/lib/require-teacher-session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/students
 * 受講生名の一覧:
 * - assignments.student_name（教材割り当て済み）
 * - students.assignment_name（Google ログイン側で登録した受講生ラベル）
 * 初めての名前はフォームの「直接入力」でそのまま登録可能（persist 時に assignments が作られる）。
 */
export async function GET(req: NextRequest) {
  const denied = await unauthorizedIfNotTeacher(req);
  if (denied) return denied;

  try {
    const rows = await sql`
      SELECT DISTINCT TRIM(name) AS student_name
      FROM (
        SELECT student_name AS name
        FROM assignments
        WHERE student_name IS NOT NULL AND TRIM(student_name) <> ''
        UNION
        SELECT assignment_name AS name
        FROM students
        WHERE assignment_name IS NOT NULL AND TRIM(assignment_name) <> ''
      ) AS u
      WHERE TRIM(name) <> ''
      ORDER BY student_name
    `;
    const students = (rows as { student_name: string }[]).map((r) => r.student_name);
    return NextResponse.json({ students });
  } catch (e) {
    console.error('students GET:', e);
    return NextResponse.json({ students: [], error: (e as Error).message });
  }
}
