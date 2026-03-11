import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audioType = request.nextUrl.searchParams.get('type') || 'fpp_question';

  const [audio] = await sql`
    SELECT audio_data, duration_ms FROM audio_files
    WHERE pattern_id = ${id} AND audio_type = ${audioType}
  `;

  if (!audio) {
    return NextResponse.json({ error: 'Audio not found' }, { status: 404 });
  }

  // BYTEAはhex文字列で返るのでBufferに変換
  const buffer = Buffer.from(audio.audio_data, 'hex');

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
