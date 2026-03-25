import { sql } from '@/lib/db';
import { VOICE_SETTINGS } from '@/lib/voices';

export async function synthesizeMp3(text: string, voiceId: string): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error('ELEVENLABS_API_KEY が設定されていません');
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': key,
    },
    body: JSON.stringify({
      text,
      model_id: VOICE_SETTINGS.model_id,
      voice_settings: VOICE_SETTINGS.voice_settings,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${err}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function upsertPatternAudio(
  patternId: number,
  audioType: string,
  voiceId: string,
  buffer: Buffer
): Promise<void> {
  await sql`
    INSERT INTO audio_files (pattern_id, audio_type, voice_id, audio_data)
    VALUES (${patternId}, ${audioType}, ${voiceId}, ${buffer})
    ON CONFLICT (pattern_id, audio_type)
    DO UPDATE SET audio_data = ${buffer}, voice_id = ${voiceId}, created_at = NOW()
  `;
}
