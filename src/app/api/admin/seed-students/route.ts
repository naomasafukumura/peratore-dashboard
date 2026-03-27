import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { unauthorizedIfNotTeacher } from '@/lib/require-teacher-session';

export const dynamic = 'force-dynamic';

const STUDENT_NAMES = [
  // Aya先生
  '佐藤結衣', '山田智美', '川上潔', '甲斐博美', '徳世由美子', '高瀬範子',
  // Tomoyo先生
  '犬塚美代子', '佐藤妙', '氏家敦子', '牧内晴代', 'ロバス由貴', '前田結衣',
  // Miku先生
  '高橋通江', '山下千恵子', '松隈由香', '及川祐貴', '小川美喜子', '齋藤りの', '井上優子',
  // Akiko先生
  '木戸真紀子', '伊吾田恵津子', '松本桂子', '小川早喜', '古屋淳',
  // Taro先生
  '桑野千尋',
  // あやこ先生
  '徳原かずみ',
  // Shinobu先生
  '狩野怜菜',
];

/**
 * POST /api/admin/seed-students
 * registered_students テーブルを作成し、受講生名を投入する（冪等）
 */
export async function POST(req: NextRequest) {
  const denied = await unauthorizedIfNotTeacher(req);
  if (denied) return denied;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS registered_students (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    let inserted = 0;
    for (const name of STUDENT_NAMES) {
      const result = await sql`
        INSERT INTO registered_students (name)
        VALUES (${name})
        ON CONFLICT (name) DO NOTHING
      `;
      if (result.length === 0) inserted++;
    }

    return NextResponse.json({
      ok: true,
      total: STUDENT_NAMES.length,
      message: `${STUDENT_NAMES.length}件を処理しました（重複はスキップ）`,
    });
  } catch (e) {
    console.error('seed-students error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
