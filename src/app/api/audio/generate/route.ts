import { sql } from '@/lib/db';
import { synthesizeMp3, upsertPatternAudio } from '@/lib/elevenlabs-tts';
import { unauthorizedIfNotTeacher } from '@/lib/require-teacher-session';
import { getVoicePair } from '@/lib/voices';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const denied = await unauthorizedIfNotTeacher(request);
  if (denied) return denied;

  const { patternId, audioTypes } = await request.json();

  const [pattern] = await sql`SELECT * FROM patterns WHERE id = ${patternId}`;
  if (!pattern) {
    return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
  }

  const voicePair = getVoicePair(String(pattern.character ?? '友人'));
  const results: Record<string, boolean> = {};
  const types = audioTypes || ['fpp_intro', 'fpp_question', 'spp'];

  for (const audioType of types) {
    let text: string | null = null;
    let voiceId: string;

    switch (audioType) {
      case 'fpp_intro':
        text = pattern.fpp_intro ? String(pattern.fpp_intro) : null;
        voiceId = voicePair.trigger;
        break;
      case 'fpp_question':
        text = pattern.fpp_question ? String(pattern.fpp_question) : null;
        voiceId = voicePair.trigger;
        break;
      case 'spp':
        text = pattern.spp ? String(pattern.spp) : null;
        voiceId = voicePair.spp;
        break;
      case 'followup_question':
        text = pattern.followup_question ? String(pattern.followup_question) : null;
        voiceId = voicePair.trigger;
        break;
      case 'natural':
        text = pattern.followup_answer ? String(pattern.followup_answer) : null;
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
      const audioBuffer = await synthesizeMp3(text, voiceId);
      await upsertPatternAudio(patternId, audioType, voiceId, audioBuffer);
      results[audioType] = true;
    } catch (error) {
      console.error(`Failed to generate ${audioType} for pattern ${patternId}:`, error);
      results[audioType] = false;
    }
  }

  return NextResponse.json({ patternId, results });
}
