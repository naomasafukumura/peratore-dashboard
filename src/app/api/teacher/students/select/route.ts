import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { unauthorizedIfNotTeacher } from '@/lib/require-teacher-session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/students/select
 * body: { name: string; selected: boolean }
 */
export async function POST(req: NextRequest) {
  const denied = await unauthorizedIfNotTeacher(req);
  if (denied) return denied;

  const { name, selected } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: '名前は必須です' }, { status: 400 });
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS student_selected (
        name TEXT PRIMARY KEY,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    if (selected) {
      await sql`
        INSERT INTO student_selected (name, updated_at)
        VALUES (${name.trim()}, NOW())
        ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
      `;
    } else {
      await sql`DELETE FROM student_selected WHERE name = ${name.trim()}`;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
