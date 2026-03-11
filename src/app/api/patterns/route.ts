import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const chunkId = request.nextUrl.searchParams.get('chunkId');

  if (!chunkId) {
    return NextResponse.json({ error: 'chunkId is required' }, { status: 400 });
  }

  const patterns = await sql`
    SELECT p.*,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'fpp_intro') as has_fpp_intro_audio,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'fpp_question') as has_fpp_question_audio,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'spp') as has_spp_audio
    FROM patterns p
    WHERE p.chunk_id = ${chunkId}
    ORDER BY p.sort_order
  `;

  // チャンク情報も返す
  const [chunk] = await sql`
    SELECT ch.*, c.type as category_type, c.name as category_name
    FROM chunks ch
    JOIN categories c ON c.id = ch.category_id
    WHERE ch.id = ${chunkId}
  `;

  return NextResponse.json({ chunk, patterns });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { chunkId, setNumber, situation, fppIntro, fppQuestion, spp, character } = body;

  const [maxOrder] = await sql`
    SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM patterns WHERE chunk_id = ${chunkId}
  `;

  const [pattern] = await sql`
    INSERT INTO patterns (chunk_id, set_number, situation, fpp_intro, fpp_question, spp, character, sort_order)
    VALUES (${chunkId}, ${setNumber}, ${situation}, ${fppIntro || null}, ${fppQuestion}, ${spp}, ${character || '友人'}, ${maxOrder.next_order})
    RETURNING *
  `;

  return NextResponse.json(pattern, { status: 201 });
}
