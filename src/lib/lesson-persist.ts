import { synthesizeMp3, upsertPatternAudio } from '@/lib/elevenlabs-tts';
import { sql } from '@/lib/db';
import { getVoicePair } from '@/lib/voices';

export type TeacherLessonPersistInput = {
  studentName: string;
  situation: string;
  suggestedCategory: string;
  character: string;
  trigger: string;
  spp: string;
  followupQuestion: string;
  followupAnswer: string;
};

async function findOrCreateCategory(suggestedName: string): Promise<number> {
  const fallbackName = 'レッスン追加';
  const searchName = suggestedName.trim() || fallbackName;

  const rows = await sql`
    SELECT id FROM categories
    WHERE TRIM(name) = ${searchName}
       OR LOWER(TRIM(name)) = LOWER(${searchName})
    LIMIT 1
  `;
  const hit = rows[0] as { id: number } | undefined;
  if (hit) return hit.id;

  const [maxOrder] = await sql`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM categories
  `;
  const [cat] = await sql`
    INSERT INTO categories (type, name, sort_order)
    VALUES (${'レッスン'}, ${searchName}, ${maxOrder.next_order})
    RETURNING id
  `;
  return cat.id as number;
}

async function createChunk(categoryId: number, titleEn: string, titleJp: string): Promise<{ id: number }> {
  const [maxOrder] = await sql`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM chunks WHERE category_id = ${categoryId}
  `;
  const [maxNum] = await sql`
    SELECT COALESCE(MAX(chunk_number), 0) + 1 AS next_number FROM chunks WHERE category_id = ${categoryId}
  `;
  const [chunk] = await sql`
    INSERT INTO chunks (category_id, chunk_number, title_en, title_jp, sort_order, origin)
    VALUES (
      ${categoryId},
      ${maxNum.next_number},
      ${titleEn.slice(0, 500)},
      ${(titleJp || '').slice(0, 500)},
      ${maxOrder.next_order},
      ${'lesson_form'}
    )
    RETURNING id
  `;
  return { id: chunk.id as number };
}

async function createPattern(chunkId: number, input: TeacherLessonPersistInput): Promise<{ id: number }> {
  const situation = input.situation.trim() || '（状況メモなし）';
  const [maxOrder] = await sql`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM patterns WHERE chunk_id = ${chunkId}
  `;
  const [pattern] = await sql`
    INSERT INTO patterns (
      chunk_id, set_number, situation, fpp_intro, fpp_question, spp, character, sort_order,
      followup_question, followup_answer
    )
    VALUES (
      ${chunkId},
      1,
      ${situation},
      ${null},
      ${input.trigger},
      ${input.spp},
      ${input.character.trim() || '友人'},
      ${maxOrder.next_order},
      ${input.followupQuestion.trim() || null},
      ${input.followupAnswer.trim() || null}
    )
    RETURNING id
  `;
  return { id: pattern.id as number };
}

async function ensureAssignment(studentName: string, chunkId: number): Promise<void> {
  await sql`
    INSERT INTO assignments (student_name, chunk_id)
    VALUES (${studentName}, ${chunkId})
    ON CONFLICT (student_name, chunk_id) DO NOTHING
  `;
}

/** 比較用（前後空白のみ除去。中身はそのまま＝「全く同じ」判定） */
function normLine(s: string): string {
  return s.trim();
}

/**
 * Trigger / SPP / フォロー質問・返答の4つがすべて DB 上の同一パターンと一致するものを1件返す。
 * 一致すれば新規 INSERT はせず既存行＋割当のみとする。
 */
async function findIdenticalPattern(input: TeacherLessonPersistInput): Promise<{
  patternId: number;
  chunkId: number;
  categoryId: number;
} | null> {
  const t = normLine(input.trigger);
  const s = normLine(input.spp);
  const fq = normLine(input.followupQuestion);
  const fa = normLine(input.followupAnswer);

  const rows = await sql`
    SELECT p.id AS pattern_id, p.chunk_id, c.category_id
    FROM patterns p
    JOIN chunks c ON c.id = p.chunk_id
    WHERE TRIM(p.fpp_question) = ${t}
      AND TRIM(p.spp) = ${s}
      AND COALESCE(TRIM(p.followup_question), '') = ${fq}
      AND COALESCE(TRIM(p.followup_answer), '') = ${fa}
    ORDER BY p.id ASC
    LIMIT 1
  `;
  const row = rows[0] as { pattern_id: number; chunk_id: number; category_id: number } | undefined;
  if (!row) return null;
  return {
    patternId: row.pattern_id,
    chunkId: row.chunk_id,
    categoryId: row.category_id,
  };
}

export type TeacherLessonPersistResult = {
  mode: 'inserted' | 'existing';
  patternId: number;
  chunkId: number;
  categoryId: number;
  audioResults: Record<string, boolean>;
};

/**
 * カテゴリ・チャンク・パターン・assignments を保存し、可能なら ElevenLabs で音声を upsert。
 * 4 英語文が既存パターンと完全一致なら新規行は作らず assignments のみ（既存 DB 利用）。
 * audio_type: fpp_question, spp, followup_question, natural（practice-v2 の naturalAudio に対応）
 */
export async function persistTeacherLesson(input: TeacherLessonPersistInput): Promise<TeacherLessonPersistResult> {
  const existing = await findIdenticalPattern(input);
  if (existing) {
    await ensureAssignment(input.studentName.trim(), existing.chunkId);
    return {
      mode: 'existing',
      patternId: existing.patternId,
      chunkId: existing.chunkId,
      categoryId: existing.categoryId,
      audioResults: {},
    };
  }

  const categoryId = await findOrCreateCategory(input.suggestedCategory);
  const chunk = await createChunk(categoryId, input.trigger, input.situation);
  const pattern = await createPattern(chunk.id, input);
  await ensureAssignment(input.studentName.trim(), chunk.id);

  const voicePair = getVoicePair(input.character.trim() || '友人');
  const audioResults: Record<string, boolean> = {};

  const tasks: { type: string; text: string; voiceId: string }[] = [
    { type: 'fpp_question', text: input.trigger, voiceId: voicePair.trigger },
    { type: 'spp', text: input.spp, voiceId: voicePair.spp },
  ];
  if (input.followupQuestion.trim()) {
    tasks.push({
      type: 'followup_question',
      text: input.followupQuestion.trim(),
      voiceId: voicePair.trigger,
    });
  }
  if (input.followupAnswer.trim()) {
    tasks.push({
      type: 'natural',
      text: input.followupAnswer.trim(),
      voiceId: voicePair.spp,
    });
  }

  if (process.env.ELEVENLABS_API_KEY) {
    for (const t of tasks) {
      try {
        const buf = await synthesizeMp3(t.text, t.voiceId);
        await upsertPatternAudio(pattern.id, t.type, t.voiceId, buf);
        audioResults[t.type] = true;
      } catch (e) {
        console.error(`lesson-persist audio ${t.type}:`, e);
        audioResults[t.type] = false;
      }
    }
  }

  return {
    mode: 'inserted',
    patternId: pattern.id,
    chunkId: chunk.id,
    categoryId,
    audioResults,
  };
}
