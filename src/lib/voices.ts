// ボイスID設定（patternpracticeと統一 / knowledge/operations/ペラトレ運営.md準拠）
export const VOICES = {
  FEMALE: 'XfNU2rGpBa01ckF309OY', // trigger（相手の発話）
  MALE: 'UgBBYS2sOqTuMpoF3BR0',   // SPP（受講生の発話）
} as const;

// キャラクター → ボイスペアのマッピング
// 相手が夫の場合: MALE→trigger, FEMALE→spp（男性が相手、女性が受講生）
// それ以外: FEMALE→trigger, MALE→spp（女性が相手、男性が受講生）
export const CHARACTER_VOICE_MAP: Record<string, { trigger: string; spp: string }> = {
  '夫':     { trigger: VOICES.MALE,   spp: VOICES.FEMALE },
};

// デフォルトのボイスペア（キャラクター不明時・夫以外）
export const DEFAULT_VOICE_PAIR = { trigger: VOICES.FEMALE, spp: VOICES.MALE };

// ElevenLabs音声生成設定
export const VOICE_SETTINGS = {
  model_id: 'eleven_flash_v2_5',
  voice_settings: {
    stability: 0.6,
    similarity_boost: 0.74,
    style: 0.0,
    use_speaker_boost: true,
  },
};

// situationからキャラクターを推定
export function detectCharacter(situation: string): string {
  if (situation.includes('夫')) return '夫';
  if (situation.includes('上司')) return '上司';
  if (situation.includes('同僚')) return '同僚';
  if (situation.includes('義母')) return '義母';
  if (situation.includes('ママ友')) return 'ママ友';
  if (situation.includes('姉')) return '姉';
  if (situation.includes('近所')) return '近所';
  if (situation.includes('友人') || situation.includes('友達')) return '友人';
  return '友人'; // デフォルト
}

// キャラクターからボイスペアを取得
export function getVoicePair(character: string): { trigger: string; spp: string } {
  return CHARACTER_VOICE_MAP[character] || DEFAULT_VOICE_PAIR;
}
