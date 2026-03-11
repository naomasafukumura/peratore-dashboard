import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const categories = await sql`
    SELECT c.id, c.type, c.name, c.sort_order,
      json_agg(
        json_build_object(
          'id', ch.id,
          'chunkNumber', ch.chunk_number,
          'titleEn', ch.title_en,
          'titleJp', ch.title_jp,
          'patternCount', (SELECT COUNT(*) FROM patterns p WHERE p.chunk_id = ch.id)
        ) ORDER BY ch.sort_order
      ) as chunks
    FROM categories c
    LEFT JOIN chunks ch ON ch.category_id = c.id
    GROUP BY c.id
    ORDER BY c.sort_order
  `;

  return NextResponse.json(categories);
}
