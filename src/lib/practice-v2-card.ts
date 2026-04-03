/**
 * practice-v2 /api/practice-data 互換のカード1件を、DB の pattern 行から組み立てる。
 */
export function practiceCardFromPattern(
  p: Record<string, any>,
  sectionTitleEn: string
): Record<string, unknown> {
  return {
    id: `db-${p.id}`,
    section: sectionTitleEn,
    createdAt: p.created_at ? String(p.created_at) : null,
    trigger: p.fpp_question,
    triggerAudio: p.has_trigger_audio ? `/api/audio/${p.id}?type=fpp_question` : '',
    triggerJa: p.situation || '',
    states: [
      {
        label: sectionTitleEn,
        situation: p.situation || '',
        conclusion: p.spp,
        conclusionAudio: p.has_spp_audio ? `/api/audio/${p.id}?type=spp` : '',
        acceptableVariants: [],
        followup: p.followup_question || '',
        followupAudio: p.has_followup_audio ? `/api/audio/${p.id}?type=followup_question` : '',
        conclusion2Examples: p.followup_answer ? [p.followup_answer] : [],
        naturalAudio: p.has_natural_audio ? `/api/audio/${p.id}?type=natural` : '',
        tip1: '',
        tip2: '',
        conclusionJa: p.spp_jp || '',
        followupJa: '',
        conclusion2Ja: p.followup_answer_jp || '',
      },
    ],
  };
}
