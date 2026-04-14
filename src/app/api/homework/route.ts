import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS homework (
      student_name TEXT PRIMARY KEY,
      cards_json   JSONB,
      assigned_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // migrate: add cards_json if old schema had only pattern_ids
  await sql`ALTER TABLE homework ADD COLUMN IF NOT EXISTS cards_json JSONB`;
}

async function resolveStudent(req: NextRequest): Promise<string | null> {
  const q = req.nextUrl.searchParams.get('student')?.trim() || null;
  if (q) return q;
  const session = await auth();
  return (session as any)?.user?.assignmentName?.trim() || null;
}

export async function GET(req: NextRequest) {
  const studentName = await resolveStudent(req);
  if (!studentName) return NextResponse.json({ cards: [] });

  try {
    await ensureTable();
    const rows = await sql`SELECT cards_json FROM homework WHERE student_name = ${studentName}`;
    if (!rows.length || !rows[0].cards_json) return NextResponse.json({ cards: [] });

    let displayName: string | null = null;
    try {
      const meta = await sql`SELECT display_name FROM student_meta WHERE name = ${studentName} LIMIT 1`;
      displayName = (meta[0] as any)?.display_name ?? null;
    } catch { /* カラム未作成の場合はスキップ */ }

    return NextResponse.json({ cards: rows[0].cards_json, displayName });
  } catch (e) {
    console.error('homework GET:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const studentName: string = body.studentName?.trim();
    const cards = body.cards || [];

    if (!studentName) return NextResponse.json({ error: 'studentName required' }, { status: 400 });

    await ensureTable();
    await sql`
      INSERT INTO homework (student_name, cards_json, assigned_at)
      VALUES (${studentName}, ${JSON.stringify(cards)}, NOW())
      ON CONFLICT (student_name) DO UPDATE
        SET cards_json  = EXCLUDED.cards_json,
            assigned_at = NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('homework POST:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
