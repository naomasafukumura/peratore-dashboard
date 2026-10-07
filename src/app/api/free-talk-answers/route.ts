import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { logError } from '@/lib/error-log';

export const dynamic = 'force-dynamic';

/**
 * フリートーク回答。先生がレッスン後フォームでテーマごとに登録し、
 * 受講生は practice-v2.html の「フリートーク一覧」で自分の回答を見る。
 * theme_key = テーマの英語タイトル（public/free-talk-topics.json の t）、q_index = 0〜3。
 */
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS free_talk_answers (
      student_name TEXT NOT NULL,
      theme_key    TEXT NOT NULL,
      q_index      INT  NOT NULL,
      answer       TEXT NOT NULL,
      updated_at   TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (student_name, theme_key, q_index)
    )
  `;
}

export async function GET(req: NextRequest) {
  const studentName = req.nextUrl.searchParams.get('student')?.trim();
  if (!studentName) return NextResponse.json({ answers: [] });
  try {
    await ensureTable();
    const rows = await sql`
      SELECT theme_key, q_index, answer, updated_at
      FROM free_talk_answers
      WHERE student_name = ${studentName}
      ORDER BY theme_key, q_index
    `;
    return NextResponse.json({ answers: rows });
  } catch (e) {
    console.error('free-talk-answers GET:', e);
    await logError('free-talk-answers', e, { status: 500, studentName, context: { method: 'GET' } });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let studentName: string | undefined;
  try {
    const body = await req.json();
    studentName = body.studentName?.trim() || undefined;
    const themeKey = String(body.themeKey || '').trim();
    const answers: unknown[] = Array.isArray(body.answers) ? body.answers : [];
    if (!studentName) return NextResponse.json({ error: 'studentName required' }, { status: 400 });
    if (!themeKey) return NextResponse.json({ error: 'themeKey required' }, { status: 400 });

    await ensureTable();
    for (let i = 0; i < answers.length; i++) {
      const text = String(answers[i] ?? '').trim();
      if (text) {
        await sql`
          INSERT INTO free_talk_answers (student_name, theme_key, q_index, answer, updated_at)
          VALUES (${studentName}, ${themeKey}, ${i}, ${text}, NOW())
          ON CONFLICT (student_name, theme_key, q_index) DO UPDATE
            SET answer = EXCLUDED.answer, updated_at = NOW()
        `;
      } else {
        await sql`
          DELETE FROM free_talk_answers
          WHERE student_name = ${studentName} AND theme_key = ${themeKey} AND q_index = ${i}
        `;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('free-talk-answers POST:', e);
    await logError('free-talk-answers', e, { status: 500, studentName, context: { method: 'POST' } });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
