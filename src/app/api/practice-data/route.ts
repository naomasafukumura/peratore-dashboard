import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { practiceCardFromPattern } from '@/lib/practice-v2-card';

/**
 * GET /api/practice-data
 * - ?student=… … その名前で assignments をフィルタ（共有リンク・従来どおり）
 * - セッション（Google）あり … students.assignment_name でフィルタ（未設定なら空配列）
 * - どちらも無し … 空配列（埋め込みベースのみ。全件露出はしない）
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const queryStudent = req.nextUrl.searchParams.get('student')?.trim() || null;
  const session = await auth();
  const sessionStudent =
    !queryStudent && session?.user?.assignmentName?.trim()
      ? session.user.assignmentName.trim()
      : null;
  const studentName = queryStudent || sessionStudent;

  try {
    // カテゴリ取得
    const categories = await sql`
      SELECT id, type, name, sort_order
      FROM categories
      ORDER BY sort_order
    `;

    let chunks: any[];
    if (studentName) {
      chunks = await sql`
        SELECT ch.*, c.type as category_type, c.name as category_name
        FROM chunks ch
        JOIN categories c ON c.id = ch.category_id
        JOIN assignments a ON a.chunk_id = ch.id
        WHERE a.student_name = ${studentName}
        ORDER BY c.sort_order, ch.sort_order
      `;
    } else {
      chunks = [];
    }

    // パターン取得
    const chunkIds = chunks.map((ch: any) => ch.id);
    let patterns: any[] = [];
    if (chunkIds.length > 0) {
      patterns = await sql`
        SELECT p.*,
          EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'fpp_question') as has_trigger_audio,
          EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'spp') as has_spp_audio,
          EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'followup_question') as has_followup_audio,
          EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'natural') as has_natural_audio
        FROM patterns p
        WHERE p.chunk_id = ANY(${chunkIds})
        ORDER BY p.sort_order
      `;
    }

    // practice-v2互換のDATA形式に変換
    const catMap = new Map<number, any>();
    for (const cat of categories) {
      catMap.set(cat.id, {
        category: cat.name,
        icon: 'message',
        cards: [],
      });
    }

    // チャンクごとにパターンをグルーピング
    const chunkPatterns = new Map<number, any[]>();
    for (const p of patterns) {
      if (!chunkPatterns.has(p.chunk_id)) chunkPatterns.set(p.chunk_id, []);
      chunkPatterns.get(p.chunk_id)!.push(p);
    }

    // カード生成
    for (const ch of chunks) {
      const pats = chunkPatterns.get(ch.id) || [];
      for (const p of pats) {
        const card = practiceCardFromPattern(p, ch.category_name || ch.title_en);

        const catData = catMap.get(ch.category_id);
        if (catData) {
          catData.cards.push(card);
        }
      }
    }

    // 空カテゴリを除外
    const data = Array.from(catMap.values()).filter(c => c.cards.length > 0);

    return NextResponse.json(data);
  } catch (e) {
    console.error('Practice data error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
