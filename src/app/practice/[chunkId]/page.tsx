import { sql } from '@/lib/db';
import PracticeMode from '@/components/PracticeMode';

export const dynamic = 'force-dynamic';

export default async function PracticeChunkPage({
  params,
}: {
  params: Promise<{ chunkId: string }>;
}) {
  const { chunkId } = await params;

  const [chunk] = await sql`
    SELECT ch.*, c.type as category_type, c.name as category_name
    FROM chunks ch
    JOIN categories c ON c.id = ch.category_id
    WHERE ch.id = ${chunkId}
  `;

  if (!chunk) {
    return (
      <div className="min-h-screen bg-bg-page flex items-center justify-center">
        <p className="text-text-muted">チャンクが見つかりません</p>
      </div>
    );
  }

  const patterns = await sql`
    SELECT p.*,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'fpp_intro') as has_fpp_intro_audio,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'fpp_question') as has_fpp_question_audio,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'spp') as has_spp_audio,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'followup_question') as has_followup_audio,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'natural') as has_natural_audio
    FROM patterns p
    WHERE p.chunk_id = ${chunkId}
    ORDER BY p.sort_order
  `;

  return (
    <PracticeMode
      patterns={patterns as any}
      chunkTitle={chunk.title_en}
      chunkTitleJp={chunk.title_jp || ''}
    />
  );
}
