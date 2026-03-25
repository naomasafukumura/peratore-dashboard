import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/patterns/search?q=...
 * Trigger（fpp_question）に部分一致する既存パターンを返す（レッスン後フォームの DB 引用用）
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const like = `%${q}%`;
    const results = await sql`
      SELECT
        p.id,
        p.fpp_question,
        p.spp,
        p.followup_question,
        p.followup_answer,
        p.situation,
        ch.title_en as chunk_title_en
      FROM patterns p
      JOIN chunks ch ON ch.id = p.chunk_id
      WHERE p.fpp_question ILIKE ${like}
      ORDER BY p.id DESC
      LIMIT 40
    `;
    return NextResponse.json({ results });
  } catch (e) {
    console.error('patterns/search:', e);
    return NextResponse.json({ error: (e as Error).message, results: [] }, { status: 500 });
  }
}
