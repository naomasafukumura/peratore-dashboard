// ボイスID設定（knowledge/operations/patternpractice-voices.md準拠）
export const VOICES = {
  FEMALE_A: '4rwC6xlwNjrg40xWm8Vb', // SPP全般（メイン女性）
  AREEJ: 'YNSIMo7UPo2Hi8ifMF0B',     // trigger: 友人・ママ友・義母・姉
  MALE_A: 'gScUm0AQVZBQ1uUp8KvE',    // trigger: 夫
  MALE_B: 'ChO6kqkVouUn0s7HMunx',    // trigger: 同僚・上司
} as const;

// キャラクター → ボイスペアのマッピング
export const CHARACTER_VOICE_MAP: Record<string, { trigger: string; spp: string }> = {
  '夫':     { trigger: VOICES.MALE_A,   spp: VOICES.FEMALE_A },
  '同僚':   { trigger: VOICES.MALE_B,   spp: VOICES.FEMALE_A },
  '上司':   { trigger: VOICES.MALE_B,   spp: VOICES.FEMALE_A },
  '義母':   { trigger: VOICES.FEMALE_A, spp: VOICES.AREEJ },
  '友人':   { trigger: VOICES.AREEJ,    spp: VOICES.FEMALE_A },
  'ママ友': { trigger: VOICES.AREEJ,    spp: VOICES.FEMALE_A },
  '姉':     { trigger: VOICES.AREEJ,    spp: VOICES.FEMALE_A },
  '近所':   { trigger: VOICES.AREEJ,    spp: VOICES.FEMALE_A },
};

// デフォルトのボイスペア（キャラクター不明時）
export const DEFAULT_VOICE_PAIR = { trigger: VOICES.AREEJ, spp: VOICES.FEMALE_A };

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
