import { sql } from '@/lib/db';
import { VOICE_SETTINGS, getVoicePair } from '@/lib/voices';
import { NextRequest, NextResponse } from 'next/server';

async function generateAudio(text: string, voiceId: string): Promise<Buffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      },
      body: JSON.stringify({
        text,
        model_id: VOICE_SETTINGS.model_id,
        voice_settings: VOICE_SETTINGS.voice_settings,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function POST(request: NextRequest) {
  const { patternId, audioTypes } = await request.json();

  const [pattern] = await sql`SELECT * FROM patterns WHERE id = ${patternId}`;
  if (!pattern) {
    return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
  }

  const voicePair = getVoicePair(pattern.character);
  const results: Record<string, boolean> = {};
  const types = audioTypes || ['fpp_intro', 'fpp_question', 'spp'];

  for (const audioType of types) {
    let text: string | null = null;
    let voiceId: string;

    switch (audioType) {
      case 'fpp_intro':
        text = pattern.fpp_intro;
        voiceId = voicePair.trigger;
        break;
      case 'fpp_question':
        text = pattern.fpp_question;
        voiceId = voicePair.trigger;
        break;
      case 'spp':
        text = pattern.spp;
        voiceId = voicePair.spp;
        break;
      default:
        continue;
    }

    if (!text) {
      results[audioType] = false;
      continue;
    }

    try {
      const audioBuffer = await generateAudio(text, voiceId);

      await sql`
        INSERT INTO audio_files (pattern_id, audio_type, voice_id, audio_data)
        VALUES (${patternId}, ${audioType}, ${voiceId}, ${audioBuffer})
        ON CONFLICT (pattern_id, audio_type)
        DO UPDATE SET audio_data = ${audioBuffer}, voice_id = ${voiceId}, created_at = NOW()
      `;

      results[audioType] = true;
    } catch (error) {
      console.error(`Failed to generate ${audioType} for pattern ${patternId}:`, error);
      results[audioType] = false;
    }
  }

  return NextResponse.json({ patternId, results });
}
