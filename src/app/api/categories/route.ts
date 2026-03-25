import { sql } from '@/lib/db';
import { unauthorizedIfNotTeacher } from '@/lib/require-teacher-session';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const categories = await sql`
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
  `;

  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const denied = await unauthorizedIfNotTeacher(request);
  if (denied) return denied;

  const { type, name } = await request.json();

  const [maxOrder] = await sql`
    SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM categories
  `;

  const [category] = await sql`
    INSERT INTO categories (type, name, sort_order)
    VALUES (${type}, ${name}, ${maxOrder.next_order})
    RETURNING *
  `;

  return NextResponse.json(category, { status: 201 });
}
