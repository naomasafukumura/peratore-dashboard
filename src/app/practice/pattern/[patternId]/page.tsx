import { sql } from '@/lib/db';
import PracticeMode from '@/components/PracticeMode';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PracticePatternPage({
  params,
  searchParams,
}: {
  params: Promise<{ patternId: string }>;
  searchParams: Promise<{ student?: string }>;
}) {
  const { patternId } = await params;
  const { student } = await searchParams;
  const backHref = student
    ? `/practice-v2.html?student=${encodeURIComponent(student)}&rv=1`
    : '/practice-v2.html?rv=1';

  const rows = await sql`
    SELECT p.*,
      ch.title_en AS chunk_title_en,
      ch.title_jp AS chunk_title_jp,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'fpp_intro') as has_fpp_intro_audio,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'fpp_question') as has_fpp_question_audio,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'spp') as has_spp_audio,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'followup_question') as has_followup_audio,
      EXISTS(SELECT 1 FROM audio_files a WHERE a.pattern_id = p.id AND a.audio_type = 'natural') as has_natural_audio
    FROM patterns p
    JOIN chunks ch ON ch.id = p.chunk_id
    WHERE p.id = ${patternId}
  `;

  const pattern = rows[0];

  if (!pattern) {
    return (
      <div className="min-h-screen bg-bg-page flex flex-col items-center justify-center gap-4">
        <p className="text-text-muted">例文が見つかりません</p>
        <Link href="/student" className="text-sm text-primary underline">
          マイページに戻る
        </Link>
      </div>
    );
  }

  return (
    <PracticeMode
      patterns={[pattern] as any}
      chunkTitle={pattern.chunk_title_en || ''}
      chunkTitleJp={pattern.chunk_title_jp || ''}
      backHref={backHref}
    />
  );
}
