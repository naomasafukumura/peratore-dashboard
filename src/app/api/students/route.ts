import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { unauthorizedIfNotTeacher } from '@/lib/require-teacher-session';

export const dynamic = 'force-dynamic';

/** 事前登録済み受講生名（DBに依存せず常に表示） */
const PRESET_STUDENTS = [
  '井上優子', '伊吾田恵津子', '氏家敦子', '及川祐貴',
  '川上潔', '甲斐博美', '狩野怜菜', '木戸真紀子',
  '桑野千尋', '小川早喜', '小川美喜子', '古屋淳',
  '齋藤りの', '佐藤結衣', '佐藤妙', '高瀬範子',
  '高橋通江', '徳世由美子', '徳原かずみ', '犬塚美代子',
  '前田結衣', '牧内晴代', '松隈由香', '松本桂子',
  '山下千恵子', '山田智美', 'ロバス由貴',
];

/**
 * GET /api/students
 * - ?google=1 → Googleログイン済み受講生の詳細一覧（id, name, email, assignment_name）
 * - それ以外  → 受講生名の文字列一覧（assignments + students.assignment_name の UNION）
 */
export async function GET(req: NextRequest) {
  const denied = await unauthorizedIfNotTeacher(req);
  if (denied) return denied;

  const googleMode = req.nextUrl.searchParams.get('google') === '1';

  try {
    if (googleMode) {
      const rows = await sql`
        SELECT id, name, email, assignment_name
        FROM students
        ORDER BY name
      `;
      return NextResponse.json({ students: rows });
    }

    // registered_students テーブルが存在しない場合は無視して続行
    let registeredNames: string[] = [];
    try {
      const regRows = await sql`SELECT name FROM registered_students WHERE name IS NOT NULL AND TRIM(name) <> ''`;
      registeredNames = (regRows as { name: string }[]).map((r) => r.name);
    } catch {
      // テーブル未作成の場合はスキップ（/api/admin/seed-students を呼べば作成される）
    }

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
    const fromDb = (rows as { student_name: string }[]).map((r) => r.student_name);
    const all = Array.from(new Set([...PRESET_STUDENTS, ...fromDb, ...registeredNames])).sort((a, b) =>
      a.localeCompare(b, 'ja')
    );
    return NextResponse.json({ students: all });
  } catch (e) {
    console.error('students GET:', e);
    return NextResponse.json({ students: [], error: (e as Error).message });
  }
}

/**
 * PATCH /api/students
 * body: { id: number, assignmentName: string | null }
 * 受講生の assignment_name を更新する（先生が紐付けを設定）
 */
export async function PATCH(req: NextRequest) {
  const denied = await unauthorizedIfNotTeacher(req);
  if (denied) return denied;

  try {
    const { id, assignmentName } = await req.json();
    if (!id) return NextResponse.json({ error: 'id は必須です' }, { status: 400 });

    const value = typeof assignmentName === 'string' && assignmentName.trim()
      ? assignmentName.trim()
      : null;

    await sql`
      UPDATE students
      SET assignment_name = ${value}, updated_at = NOW()
      WHERE id = ${id}
    `;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('students PATCH:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
