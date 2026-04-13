import { sql } from '@/lib/db';
import { practiceCardFromPattern } from '@/lib/practice-v2-card';

export type RecentLessonPair = {
  trigger: string;
  spp: string;
};

export type RecentLessonSummaryItem = {
  patternId: number;
  chunkId: number;
  trigger: string;
  spp: string;
  followupQuestion: string;
  followupAnswer: string;
  situationJa: string;
  section: string;
  categoryName: string;
  createdAt: string | null;
  /** 会話モードで複数ペアが1チャンクの場合に設定。pairs.length > 1 のときだけ利用。 */
  pairs: RecentLessonPair[] | null;
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

function formatCategoryLabel(dateVal: unknown): string {
  const d = dateVal ? new Date(String(dateVal)) : null;
  if (d && !isNaN(d.getTime())) {
    return `${d.getFullYear()}年${d.getMonth() + 1}月復習集`;
  }
  return 'レッスン復習集';
}

/**
 * 受講生に割り当て済みかつレッスンフォーム由来チャンクのパターンを、新しい順に最大 limit 件。
 */
export async function fetchRecentLessonForStudent(
  studentName: string,
  limit = 200
): Promise<{
  summary: RecentLessonSummaryItem[];
  categoryLabel: string;
  practiceCategory: { category: string; icon: string; cards: Record<string, unknown>[] } | null;
}> {
  const name = studentName?.trim();
  if (!name) {
    return { summary: [], categoryLabel: 'レッスン復習集', practiceCategory: null };
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
    return { summary: [], categoryLabel: 'レッスン復習集', practiceCategory: null };
  }

  const categoryLabel = formatCategoryLabel(rows[0].created_at);

  // チャンクIDでグループ化（同一チャンク内の複数パターンを1アイテムに）
  const chunkMap = new Map<number, Record<string, any>[]>();
  for (const r of rows as Record<string, any>[]) {
    const cid = r.chunk_id as number;
    if (!chunkMap.has(cid)) chunkMap.set(cid, []);
    chunkMap.get(cid)!.push(r);
  }

  const summary: RecentLessonSummaryItem[] = [];
  for (const group of chunkMap.values()) {
    // グループ内は sort_order ASC（DBクエリは id DESC なので逆順になっている場合があるため並び替え）
    group.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const first = group[0];
    const pairs: RecentLessonPair[] = group.map(r => ({
      trigger: r.fpp_question || '',
      spp: r.spp || '',
    }));
    summary.push({
      patternId: first.id,
      chunkId: first.chunk_id,
      trigger: first.fpp_question || '',
      spp: first.spp || '',
      followupQuestion: first.followup_question || '',
      followupAnswer: first.followup_answer || '',
      situationJa: first.situation || '',
      section: first.chunk_title_en || '',
      categoryName: first.category_name || '',
      createdAt: first.created_at ? String(first.created_at) : null,
      pairs: pairs.length > 1 ? pairs : null,
    });
  }
  // 新しいチャンクが先頭に来るよう作成日降順にソート
  summary.sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db2 = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db2 - da;
  });

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
