import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { categoryId, titleEn, titleJp } = await request.json();

  const [maxOrder] = await sql`
    SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM chunks WHERE category_id = ${categoryId}
  `;
  const [maxChunk] = await sql`
    SELECT COALESCE(MAX(chunk_number), 0) + 1 as next_number FROM chunks WHERE category_id = ${categoryId}
  `;

  const [chunk] = await sql`
    INSERT INTO chunks (category_id, chunk_number, title_en, title_jp, sort_order)
    VALUES (${categoryId}, ${maxChunk.next_number}, ${titleEn}, ${titleJp || ''}, ${maxOrder.next_order})
    RETURNING *
  `;

  return NextResponse.json(chunk, { status: 201 });
}
