/** パターン行に audio_version(音声の最終更新日時) が乗っている場合の型ヒント */
interface PatternRow {
  audio_version?: Date | string | null;
  [key: string]: any;
}

/** audio_version があればキャッシュバージョンクエリ(&v=epoch秒)を付与したURLを返す */
function audioUrl(patternId: unknown, type: string, p: PatternRow): string {
  const base = `/api/audio/${patternId}?type=${type}`;
  if (!p.audio_version) return base;
  const epoch = new Date(p.audio_version).getTime();
  if (Number.isNaN(epoch)) return base;
  return `${base}&v=${epoch}`;
}

/**
 * practice-v2 /api/practice-data 互換のカード1件を、DB の pattern 行から組み立てる。
 */
export function practiceCardFromPattern(
  p: PatternRow,
  sectionTitleEn: string
): Record<string, unknown> {
  return {
    id: `db-${p.id}`,
    chunkId: `db-chunk-${p.chunk_id}`,
    section: sectionTitleEn,
    createdAt: p.created_at ? (p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at)) : null,
    trigger: p.fpp_question,
    triggerAudio: p.has_trigger_audio ? audioUrl(p.id, 'fpp_question', p) : '',
    triggerJa: p.situation || '',
    states: [
      {
        label: sectionTitleEn,
        situation: p.situation || '',
        conclusion: p.spp,
        conclusionAudio: p.has_spp_audio ? audioUrl(p.id, 'spp', p) : '',
        acceptableVariants: [],
        followup: p.followup_question || '',
        followupAudio: p.has_followup_audio ? audioUrl(p.id, 'followup_question', p) : '',
        conclusion2Examples: p.followup_answer ? [p.followup_answer] : [],
        naturalAudio: p.has_natural_audio ? audioUrl(p.id, 'natural', p) : '',
        tip1: '',
        tip2: '',
        conclusionJa: p.spp_jp || '',
        followupJa: '',
        conclusion2Ja: p.followup_answer_jp || '',
      },
    ],
  };
}
