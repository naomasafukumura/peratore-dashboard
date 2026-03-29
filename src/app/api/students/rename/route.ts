import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { unauthorizedIfNotTeacher } from '@/lib/require-teacher-session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/students/rename
 * body: { oldName: string, newName: string, yomi?: string }
 * assignments.student_name を一括更新し、student_meta のふりがなも保存する
 */
export async function POST(req: NextRequest) {
  const denied = await unauthorizedIfNotTeacher(req);
  if (denied) return denied;

  const { oldName, newName, yomi } = await req.json();
  if (!oldName?.trim() || !newName?.trim()) {
    return NextResponse.json({ error: '旧名・新名は必須です' }, { status: 400 });
  }

  const old = oldName.trim();
  const next = newName.trim();

  try {
    if (old !== next) {
      await sql`
        UPDATE assignments SET student_name = ${next} WHERE student_name = ${old}
      `;
      await sql`
        UPDATE student_meta SET name = ${next} WHERE name = ${old}
      `;
    }
    if (yomi !== undefined) {
      await sql`
        INSERT INTO student_meta (name, yomi)
        VALUES (${next}, ${yomi ?? ''})
        ON CONFLICT (name) DO UPDATE SET yomi = EXCLUDED.yomi
      `;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
