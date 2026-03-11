import { sql } from '@/lib/db';
import Link from 'next/link';
import TeacherDashboardClient from './TeacherDashboardClient';

export const dynamic = 'force-dynamic';

export default async function TeacherPage() {

  const categories = await sql`
    SELECT c.id, c.type, c.name, c.sort_order,
      json_agg(
        json_build_object(
          'id', ch.id,
          'chunkNumber', ch.chunk_number,
          'titleEn', ch.title_en,
          'titleJp', ch.title_jp,
          'patternCount', (SELECT COUNT(*)::int FROM patterns p WHERE p.chunk_id = ch.id),
          'audioCount', (SELECT COUNT(DISTINCT a.pattern_id)::int FROM audio_files a JOIN patterns p2 ON p2.id = a.pattern_id WHERE p2.chunk_id = ch.id)
        ) ORDER BY ch.sort_order
      ) as chunks
    FROM categories c
    LEFT JOIN chunks ch ON ch.category_id = c.id
    GROUP BY c.id
    ORDER BY c.sort_order
  `;

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM categories) as category_count,
      (SELECT COUNT(*)::int FROM chunks) as chunk_count,
      (SELECT COUNT(*)::int FROM patterns) as pattern_count,
      (SELECT COUNT(*)::int FROM audio_files) as audio_count
  `;

  return (
    <div className="min-h-screen bg-zinc-950 pb-20">
      <div className="max-w-4xl mx-auto p-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-white">先生ダッシュボード</h1>
          <Link
            href="/teacher/import"
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500"
          >
            一括インポート
          </Link>
        </div>

        {/* 統計 */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          <div className="bg-zinc-900 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{stats.category_count}</p>
            <p className="text-xs text-zinc-500">カテゴリ</p>
          </div>
          <div className="bg-zinc-900 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{stats.chunk_count}</p>
            <p className="text-xs text-zinc-500">チャンク</p>
          </div>
          <div className="bg-zinc-900 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{stats.pattern_count}</p>
            <p className="text-xs text-zinc-500">パターン</p>
          </div>
          <div className="bg-zinc-900 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{stats.audio_count}</p>
            <p className="text-xs text-zinc-500">音声</p>
          </div>
        </div>

        {/* カテゴリ・チャンク一覧 */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <TeacherDashboardClient categories={categories as any} />
      </div>
    </div>
  );
}
