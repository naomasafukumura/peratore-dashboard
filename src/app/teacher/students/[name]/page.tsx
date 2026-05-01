import { hasDatabaseUrl, sql } from '@/lib/db';
import StudentPatternsClient from './StudentPatternsClient';

export const dynamic = 'force-dynamic';

export default async function StudentDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const studentName = decodeURIComponent(name);

  let patterns: any[] = [];
  let categories: any[] = [];

  if (hasDatabaseUrl()) {
    try {
      [patterns, categories] = await Promise.all([
        sql`
          SELECT
            p.id,
            p.chunk_id,
            p.sort_order,
            p.situation,
            p.fpp_question,
            p.spp,
            p.followup_question,
            p.followup_answer,
            p.character,
            p.created_at,
            c.name AS category_name,
            ch.title_en AS chunk_title_en,
            ch.raw_memo,
            EXISTS(SELECT 1 FROM audio_files af WHERE af.pattern_id = p.id AND af.audio_type = 'fpp_question') AS has_trigger_audio,
            EXISTS(SELECT 1 FROM audio_files af WHERE af.pattern_id = p.id AND af.audio_type = 'spp') AS has_spp_audio,
            EXISTS(SELECT 1 FROM audio_files af WHERE af.pattern_id = p.id AND af.audio_type = 'followup_question') AS has_followup_audio,
            EXISTS(SELECT 1 FROM audio_files af WHERE af.pattern_id = p.id AND af.audio_type = 'natural') AS has_natural_audio
          FROM patterns p
          JOIN chunks ch ON ch.id = p.chunk_id
          JOIN categories c ON c.id = ch.category_id
          JOIN assignments a ON a.chunk_id = ch.id
          WHERE a.student_name = ${studentName}
          ORDER BY
            (SELECT MAX(p2.created_at) FROM patterns p2 WHERE p2.chunk_id = p.chunk_id) DESC NULLS LAST,
            p.chunk_id DESC,
            p.sort_order ASC,
            p.id ASC
        `,
        sql`SELECT id, name FROM categories ORDER BY sort_order`,
      ]);
    } catch {}
  }

  return (
    <StudentPatternsClient
      studentName={studentName}
      initialPatterns={patterns}
      categories={categories}
    />
  );
}
