import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { practiceCardFromPattern } from '@/lib/practice-v2-card';

export const dynamic = 'force-dynamic';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS homework (
      student_name TEXT PRIMARY KEY,
      pattern_ids  INTEGER[],
      assigned_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

async function resolveStudent(req: NextRequest): Promise<string | null> {
  const q = req.nextUrl.searchParams.get('student')?.trim() || null;
  if (q) return q;
  const session = await auth();
  return session?.user?.assignmentName?.trim() || null;
}

export async function GET(req: NextRequest) {
  const studentName = await resolveStudent(req);
  if (!studentName) return NextResponse.json({ cards: [] });

  try {
    await ensureTable();
    const rows = await sql`SELECT pattern_ids FROM homework WHERE student_name = ${studentName}`;
    if (!rows.length || !rows[0].pattern_ids?.length) return NextResponse.json({ cards: [] });

    const ids = rows[0].pattern_ids as number[];
    const patterns = await sql`
      SELECT p.*,
        ch.title_en AS chunk_title_en,
        EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'fpp_question') AS has_trigger_audio,
        EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'spp')          AS has_spp_audio,
        EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'followup_question') AS has_followup_audio,
        EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'natural')      AS has_natural_audio
      FROM patterns p
      JOIN chunks ch ON ch.id = p.chunk_id
      WHERE p.id = ANY(${ids})
    `;

    const cards = patterns.map((r: Record<string, any>) =>
      practiceCardFromPattern(r, r.chunk_title_en || '')
    );
    return NextResponse.json({ cards });
  } catch (e) {
    console.error('homework GET:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const studentName: string = body.studentName?.trim();
    const patternIds: number[] = body.patternIds || [];

    if (!studentName) return NextResponse.json({ error: 'studentName required' }, { status: 400 });

    await ensureTable();
    await sql`
      INSERT INTO homework (student_name, pattern_ids, assigned_at)
      VALUES (${studentName}, ${patternIds}, NOW())
      ON CONFLICT (student_name) DO UPDATE
        SET pattern_ids = EXCLUDED.pattern_ids,
            assigned_at = NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('homework POST:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
