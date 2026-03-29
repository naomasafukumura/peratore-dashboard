import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { unauthorizedIfNotTeacher } from '@/lib/require-teacher-session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/students/delete
 * body: { name: string }
 * assignments と student_meta から該当受講生を削除する
 */
export async function POST(req: NextRequest) {
  const denied = await unauthorizedIfNotTeacher(req);
  if (denied) return denied;

  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: '名前は必須です' }, { status: 400 });
  }

  try {
    await sql`DELETE FROM assignments WHERE student_name = ${name.trim()}`;
    await sql`DELETE FROM student_meta WHERE name = ${name.trim()}`.catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
