import { sql } from '@/lib/db';
import { practiceCardFromPattern } from '@/lib/practice-v2-card';

export type RecentLessonSummaryItem = {
  patternId: number;
  trigger: string;
  spp: string;
  section: string;
  categoryName: string;
};

/** patterns.created_at カラムが存在しない場合に追加（冪等） */
let _createdAtEnsured = false;
async function ensureCreatedAt(): Promise<void> {
  if (_createdAtEnsured) return;
  try {
    await sql`ALTER TABLE patterns ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`;
  } catch { /* ignore */ }
  _createdAtEnsured = true;
}

/** JST (UTC+9) で "M/Dレッスン復習" にフォーマット */
function formatCategoryLabel(dateVal: unknown): string {
  if (!dateVal) return 'レッスンで追加（最近）';
  const d = new Date(dateVal as string);
  if (isNaN(d.getTime())) return 'レッスンで追加（最近）';
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}レッスン復習`;
}

/**
 * 受講生に割り当て済みかつレッスンフォーム由来チャンクのパターンを、新しい順に最大 limit 件。
 */
export async function fetchRecentLessonForStudent(
  studentName: string,
  limit = 20
): Promise<{
  summary: RecentLessonSummaryItem[];
  categoryLabel: string;
  practiceCategory: { category: string; icon: string; cards: Record<string, unknown>[] } | null;
}> {
  const name = studentName?.trim();
  if (!name) {
    return { summary: [], categoryLabel: 'レッスンで追加（最近）', practiceCategory: null };
  }

  await ensureCreatedAt();

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
    return { summary: [], categoryLabel: 'レッスンで追加（最近）', practiceCategory: null };
  }

  const categoryLabel = formatCategoryLabel(rows[0].created_at);

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
    categoryLabel,
    practiceCategory: {
      category: categoryLabel,
      icon: 'message',
      cards,
    },
  };
}
