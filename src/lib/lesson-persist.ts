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
  rawMemo?: string;
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

async function createChunk(categoryId: number, titleEn: string, titleJp: string, rawMemo?: string): Promise<{ id: number }> {
  const [maxOrder] = await sql`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM chunks WHERE category_id = ${categoryId}
  `;
  const [maxNum] = await sql`
    SELECT COALESCE(MAX(chunk_number), 0) + 1 AS next_number FROM chunks WHERE category_id = ${categoryId}
  `;
  const [chunk] = await sql`
    INSERT INTO chunks (category_id, chunk_number, title_en, title_jp, sort_order, origin, raw_memo)
    VALUES (
      ${categoryId},
      ${maxNum.next_number},
      ${titleEn.slice(0, 500)},
      ${(titleJp || '').slice(0, 500)},
      ${maxOrder.next_order},
      ${'lesson_form'},
      ${rawMemo ?? null}
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

/** Levenshtein 距離（1D DP） */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const curr = [i + 1];
    for (let j = 0; j < b.length; j++) {
      curr[j + 1] = Math.min(
        curr[j] + 1,
        prev[j + 1] + 1,
        prev[j] + (a[i] === b[j] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** 0〜1 の類似度（大文字小文字無視） */
function triggerSimilarity(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

export type SimilarPattern = {
  patternId: number;
  chunkId: number;
  trigger: string;
  similarityPct: number;
};

/** trigger の類似度が 70% 以上の既存パターンを最大3件返す */
export async function findSimilarPatterns(trigger: string): Promise<SimilarPattern[]> {
  let rows: { pattern_id: number; chunk_id: number; fpp_question: string }[] = [];
  try {
    rows = (await sql`
      SELECT p.id AS pattern_id, p.chunk_id, p.fpp_question
      FROM patterns p
      ORDER BY p.id DESC
      LIMIT 300
    `) as typeof rows;
  } catch {
    return [];
  }
  const similar: SimilarPattern[] = [];
  for (const row of rows) {
    if (!row.fpp_question) continue;
    const sim = triggerSimilarity(trigger, row.fpp_question);
    if (sim >= 0.7) {
      similar.push({
        patternId: row.pattern_id,
        chunkId: row.chunk_id,
        trigger: row.fpp_question,
        similarityPct: Math.round(sim * 100),
      });
    }
  }
  return similar.sort((a, b) => b.similarityPct - a.similarityPct).slice(0, 3);
}

/**
 * Trigger / SPP / フォロー質問・返答の4つがすべて DB 上の同一パターンと一致し、
 * かつ同一受講生のチャンクであるものを1件返す。
 * 一致すれば新規 INSERT はせず既存行＋割当のみとする。
 * 他受講生のチャンクは絶対にマッチしない（完全独立を保証）。
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
  const studentName = input.studentName.trim();

  const rows = await sql`
    SELECT p.id AS pattern_id, p.chunk_id, c.category_id
    FROM patterns p
    JOIN chunks c ON c.id = p.chunk_id
    JOIN assignments a ON a.chunk_id = c.id
    WHERE TRIM(p.fpp_question) = ${t}
      AND TRIM(p.spp) = ${s}
      AND COALESCE(TRIM(p.followup_question), '') = ${fq}
      AND COALESCE(TRIM(p.followup_answer), '') = ${fa}
      AND a.student_name = ${studentName}
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
  similarPatterns: SimilarPattern[];
};

/**
 * 会話モード用: 複数の FPP/SPP ペアを1チャンクにまとめて保存する。
 */
export async function persistConversationLesson(
  studentName: string,
  pairs: Array<{ trigger: string; spp: string }>,
  rawMemo?: string
): Promise<{ chunkId: number; audioResults: Record<string, boolean> }> {
  if (pairs.length === 0) throw new Error('pairsが空です');

  const categoryId = await findOrCreateCategory('レッスン追加');
  const chunk = await createChunk(categoryId, pairs[0].trigger, '', rawMemo);
  await ensureAssignment(studentName.trim(), chunk.id);

  const voicePair = getVoicePair('友人');
  const audioResults: Record<string, boolean> = {};

  for (const pair of pairs) {
    const pattern = await createPattern(chunk.id, {
      studentName,
      situation: '',
      suggestedCategory: '',
      character: '友人',
      trigger: pair.trigger,
      spp: pair.spp,
      followupQuestion: '',
      followupAnswer: '',
      rawMemo,
    });

    if (process.env.ELEVENLABS_API_KEY) {
      for (const t of [
        { type: 'fpp_question', text: pair.trigger, voiceId: voicePair.trigger },
        { type: 'spp', text: pair.spp, voiceId: voicePair.spp },
      ]) {
        try {
          const buf = await synthesizeMp3(t.text, t.voiceId);
          await upsertPatternAudio(pattern.id, t.type, t.voiceId, buf);
          audioResults[`${pattern.id}_${t.type}`] = true;
        } catch (e) {
          console.error(`conversation audio ${t.type}:`, e);
          audioResults[`${pattern.id}_${t.type}`] = false;
        }
      }
    }
  }

  return { chunkId: chunk.id, audioResults };
}

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
      similarPatterns: [],
    };
  }

  const similarPatterns = await findSimilarPatterns(input.trigger);

  const categoryId = await findOrCreateCategory(input.suggestedCategory);
  const chunk = await createChunk(categoryId, input.trigger, input.situation, input.rawMemo);
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
    similarPatterns,
  };
}
