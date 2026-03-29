import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { unauthorizedIfNotTeacher } from '@/lib/require-teacher-session';
import { synthesizeMp3, upsertPatternAudio } from '@/lib/elevenlabs-tts';
import { getVoicePair } from '@/lib/voices';

export const dynamic = 'force-dynamic';

async function findOrCreateCategory(name: string): Promise<number> {
  const rows = await sql`
    SELECT id FROM categories
    WHERE TRIM(name) = ${name} OR LOWER(TRIM(name)) = LOWER(${name})
    LIMIT 1
  `;
  if (rows[0]) return (rows[0] as { id: number }).id;

  const [maxOrder] = await sql`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories`;
  const [cat] = await sql`
    INSERT INTO categories (type, name, sort_order)
    VALUES ('レッスン', ${name}, ${maxOrder.n})
    RETURNING id
  `;
  return (cat as { id: number }).id;
}

/**
 * POST /api/patterns/manual
 * 手動でカテゴリ→チャンク→パターンを作成し音声生成する
 */
export async function POST(req: NextRequest) {
  const denied = await unauthorizedIfNotTeacher(req);
  if (denied) return denied;

  const { categoryName, situation, fppQuestion, spp, followupQuestion, followupAnswer, studentName, character } =
    await req.json();

  if (!categoryName?.trim() || !fppQuestion?.trim() || !spp?.trim()) {
    return NextResponse.json({ error: 'カテゴリ・FPP・SPPは必須です' }, { status: 400 });
  }

  try {
    const categoryId = await findOrCreateCategory(categoryName.trim());

    const [maxOrder] = await sql`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM chunks WHERE category_id = ${categoryId}`;
    const [maxNum] = await sql`SELECT COALESCE(MAX(chunk_number), 0) + 1 AS n FROM chunks WHERE category_id = ${categoryId}`;
    const [chunk] = await sql`
      INSERT INTO chunks (category_id, chunk_number, title_en, title_jp, sort_order, origin)
      VALUES (${categoryId}, ${maxNum.n}, ${fppQuestion.trim().slice(0, 500)}, ${(situation ?? '').trim().slice(0, 500)}, ${maxOrder.n}, 'manual')
      RETURNING id
    `;

    const [maxPOrder] = await sql`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM patterns WHERE chunk_id = ${chunk.id}`;
    const [pattern] = await sql`
      INSERT INTO patterns (chunk_id, set_number, situation, fpp_question, spp, character, sort_order, followup_question, followup_answer)
      VALUES (
        ${chunk.id}, 1,
        ${(situation ?? '').trim() || '（状況メモなし）'},
        ${fppQuestion.trim()},
        ${spp.trim()},
        ${(character ?? '友人').trim() || '友人'},
        ${maxPOrder.n},
        ${followupQuestion?.trim() || null},
        ${followupAnswer?.trim() || null}
      )
      RETURNING id
    `;

    if (studentName?.trim()) {
      await sql`
        INSERT INTO assignments (student_name, chunk_id)
        VALUES (${studentName.trim()}, ${chunk.id})
        ON CONFLICT DO NOTHING
      `;
    }

    const voicePair = getVoicePair((character ?? '友人').trim() || '友人');
    const audioResults: Record<string, boolean> = {};

    if (process.env.ELEVENLABS_API_KEY) {
      const tasks = [
        { type: 'fpp_question', text: fppQuestion.trim(), voiceId: voicePair.trigger },
        { type: 'spp', text: spp.trim(), voiceId: voicePair.spp },
        ...(followupQuestion?.trim() ? [{ type: 'followup_question', text: followupQuestion.trim(), voiceId: voicePair.trigger }] : []),
        ...(followupAnswer?.trim() ? [{ type: 'natural', text: followupAnswer.trim(), voiceId: voicePair.spp }] : []),
      ];
      for (const t of tasks) {
        try {
          const buf = await synthesizeMp3(t.text, t.voiceId);
          await upsertPatternAudio(pattern.id, t.type, t.voiceId, buf);
          audioResults[t.type] = true;
        } catch {
          audioResults[t.type] = false;
        }
      }
    }

    return NextResponse.json({ ok: true, patternId: pattern.id, audioResults });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
