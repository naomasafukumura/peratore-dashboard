import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { logError } from '@/lib/error-log';

export const dynamic = 'force-dynamic';

/**
 * ペラトレのPレベル（1〜7）。先生が受講生一覧で登録し、
 * 受講生は practice-v2.html の名前の横で確認する（基準は public/p-level.html）。
 * 変更のたびに student_p_level_history にも1行残す。
 */
async function ensureLevelTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS student_p_levels (
      student_name TEXT PRIMARY KEY,
      level        INT  NOT NULL CHECK (level BETWEEN 1 AND 7),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS student_p_level_history (
      id           SERIAL PRIMARY KEY,
      student_name TEXT NOT NULL,
      level        INT,
      changed_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function GET(req: NextRequest) {
  const studentName = req.nextUrl.searchParams.get('student')?.trim();
  if (!studentName) return NextResponse.json({ level: null });
  try {
    await ensureLevelTables();
    const rows = await sql`SELECT level FROM student_p_levels WHERE student_name = ${studentName}`;
    const level = (rows as { level: number }[])[0]?.level ?? null;
    return NextResponse.json({ level });
  } catch (e) {
    console.error('student-level GET:', e);
    await logError('student-level', e, { status: 500, studentName, context: { method: 'GET' } });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let studentName: string | undefined;
  try {
    const body = await req.json();
    studentName = body.studentName?.trim() || undefined;
    const level = body.level === null || body.level === '' ? null : Number(body.level);
    if (!studentName) return NextResponse.json({ error: 'studentName required' }, { status: 400 });
    if (level !== null && !(Number.isInteger(level) && level >= 1 && level <= 7)) {
      return NextResponse.json({ error: 'level must be 1-7 or null' }, { status: 400 });
    }

    await ensureLevelTables();
    if (level === null) {
      await sql`DELETE FROM student_p_levels WHERE student_name = ${studentName}`;
    } else {
      await sql`
        INSERT INTO student_p_levels (student_name, level, updated_at)
        VALUES (${studentName}, ${level}, NOW())
        ON CONFLICT (student_name) DO UPDATE SET level = EXCLUDED.level, updated_at = NOW()
      `;
    }
    await sql`INSERT INTO student_p_level_history (student_name, level) VALUES (${studentName}, ${level})`;
    return NextResponse.json({ ok: true, level });
  } catch (e) {
    console.error('student-level POST:', e);
    await logError('student-level', e, { status: 500, studentName, context: { method: 'POST' } });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
