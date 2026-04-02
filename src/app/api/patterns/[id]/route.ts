import { sql } from '@/lib/db';
import { unauthorizedIfNotTeacher } from '@/lib/require-teacher-session';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await unauthorizedIfNotTeacher(request);
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();
  const { situation, fppIntro, fppQuestion, spp, character, followupQuestion, followupAnswer } = body;

  const [pattern] = await sql`
    UPDATE patterns
    SET situation = ${situation},
        fpp_intro = ${fppIntro || null},
        fpp_question = ${fppQuestion},
        spp = ${spp},
        character = ${character || '友人'},
        followup_question = ${followupQuestion || null},
        followup_answer = ${followupAnswer || null}
    WHERE id = ${id}
    RETURNING *
  `;

  if (!pattern) {
    return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
  }

  return NextResponse.json(pattern);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await unauthorizedIfNotTeacher(request);
  if (denied) return denied;

  const { id } = await params;

  await sql`DELETE FROM audio_files WHERE pattern_id = ${id}`;
  await sql`DELETE FROM patterns WHERE id = ${id}`;

  return NextResponse.json({ ok: true });
}
