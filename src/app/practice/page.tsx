import { sql } from '@/lib/db';
import CoverScreen from '@/components/CoverScreen';

interface Category {
  id: number;
  type: string;
  name: string;
  chunks: {
    id: number;
    chunkNumber: number;
    titleEn: string;
    titleJp: string;
    patternCount: number;
  }[];
}

export const dynamic = 'force-dynamic';

export default async function PracticePage() {
  const categories = (await sql`
    SELECT c.id, c.type, c.name, c.sort_order,
      json_agg(
        json_build_object(
          'id', ch.id,
          'chunkNumber', ch.chunk_number,
          'titleEn', ch.title_en,
          'titleJp', ch.title_jp,
          'patternCount', (SELECT COUNT(*)::int FROM patterns p WHERE p.chunk_id = ch.id)
        ) ORDER BY ch.sort_order
      ) as chunks
    FROM categories c
    LEFT JOIN chunks ch ON ch.category_id = c.id
    GROUP BY c.id
    ORDER BY c.sort_order
  `) as Category[];

  return <CoverScreen categories={categories} />;
}
