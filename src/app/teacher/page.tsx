import { hasDatabaseUrl, sql } from '@/lib/db';
import TeacherClient from './TeacherClient';
import TeacherDbMissing from './TeacherDbMissing';

export const dynamic = 'force-dynamic';

export default async function TeacherPage() {
  if (!hasDatabaseUrl()) {
    return <TeacherDbMissing />;
  }

  const categories = (await sql`
    SELECT c.id, c.type, c.name, c.sort_order,
      json_agg(
        json_build_object(
          'id', ch.id,
          'chunkNumber', ch.chunk_number,
          'titleEn', ch.title_en,
          'titleJp', ch.title_jp,
          'patternCount', (SELECT COUNT(*)::int FROM patterns p WHERE p.chunk_id = ch.id),
          'origin', ch.origin
        ) ORDER BY ch.sort_order
      ) as chunks
    FROM categories c
    LEFT JOIN chunks ch ON ch.category_id = c.id
    GROUP BY c.id
    ORDER BY c.sort_order
  `) as Array<{
    id: number;
    type: string;
    name: string;
    chunks: Array<{
      id: number;
      chunkNumber: number;
      titleEn: string;
      titleJp: string;
      patternCount: number;
      origin: string | null;
    }>;
  }>;

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM patterns) as pattern_count,
      (SELECT COUNT(DISTINCT pattern_id)::int FROM audio_files) as audio_pattern_count
  `;

  return <TeacherClient categories={categories} stats={stats as any} />;
}
