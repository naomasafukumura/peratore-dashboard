import { sql } from '@/lib/db';
import { practiceCardFromPattern } from '@/lib/practice-v2-card';

export type RecentLessonSummaryItem = {
  patternId: number;
  trigger: string;
  spp: string;
  section: string;
  categoryName: string;
};

const RECENT_CATEGORY = {
  category: 'レッスンで追加（最近）',
  icon: 'message',
} as const;

/**
 * 受講生に割り当て済みかつレッスンフォーム由来チャンクのパターンを、新しい順に最大 limit 件。
 */
export async function fetchRecentLessonForStudent(
  studentName: string,
  limit = 20
): Promise<{
  summary: RecentLessonSummaryItem[];
  practiceCategory: { category: string; icon: string; cards: Record<string, unknown>[] } | null;
}> {
  const name = studentName?.trim();
  if (!name) {
    return { summary: [], practiceCategory: null };
  }

  const rows = await sql`
    SELECT p.*,
      ch.title_en AS chunk_title_en,
      c.name AS category_name,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'fpp_question') AS has_trigger_audio,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'spp') AS has_spp_audio,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'followup_question') AS has_followup_audio,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'natural') AS has_natural_audio
    FROM patterns p
    JOIN chunks ch ON ch.id = p.chunk_id
    JOIN categories c ON c.id = ch.category_id
    JOIN assignments a ON a.chunk_id = ch.id AND a.student_name = ${name}
    WHERE ch.origin = 'lesson_form'
    ORDER BY p.id DESC
    LIMIT ${limit}
  `;

  if (!rows.length) {
    return { summary: [], practiceCategory: null };
  }

  const summary: RecentLessonSummaryItem[] = rows.map((r: Record<string, any>) => ({
    patternId: r.id,
    trigger: r.fpp_question || '',
    spp: r.spp || '',
    section: r.chunk_title_en || '',
    categoryName: r.category_name || '',
  }));

  const cards = rows.map((r: Record<string, any>) =>
    practiceCardFromPattern(r, r.chunk_title_en || '')
  );

  return {
    summary,
    practiceCategory: {
      category: RECENT_CATEGORY.category,
      icon: RECENT_CATEGORY.icon,
      cards,
    },
  };
}
