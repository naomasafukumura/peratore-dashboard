import { hasDatabaseUrl, sql } from '@/lib/db';
import { redirectTeacherLoginIfNeeded } from '@/lib/redirect-teacher-login-if-needed';
import StudentPatternsClient from './StudentPatternsClient';

export const dynamic = 'force-dynamic';

export default async function StudentDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const studentName = decodeURIComponent(name);
  await redirectTeacherLoginIfNeeded(`/teacher/students/${name}`);

  let patterns: any[] = [];

  if (hasDatabaseUrl()) {
    try {
      patterns = await sql`
        SELECT
          p.id,
          p.situation,
          p.fpp_question,
          p.spp,
          p.followup_question,
          p.followup_answer,
          p.character,
          c.name AS category_name,
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
        ORDER BY c.sort_order, p.id
      `;
    } catch {}
  }

  return <StudentPatternsClient studentName={studentName} initialPatterns={patterns} />;
}
