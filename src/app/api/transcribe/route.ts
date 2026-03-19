import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as Blob | null;

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Whisper APIに転送
    const whisperForm = new FormData();
    whisperForm.append('file', file, 'audio.webm');
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('language', 'en');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: whisperForm,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Whisper API error:', response.status, errText);
      return NextResponse.json({ error: errText }, { status: response.status });
    }

    const data = await response.json();
    let text = (data.text || '') as string;

    // Whisperが口語表現を正式形に変換してしまうので戻す
    text = text.replace(/\bgoing to (?=[a-z])/gi, (m: string, offset: number, str: string) => {
      const after = str.slice(offset + m.length);
      if (/^(the|a|an|my|his|her|our|their|this|that)\b/i.test(after)) return m;
      return 'gonna ';
    });
    text = text.replace(/\bwant to\b/gi, 'wanna');
    text = text.replace(/\bgot to\b/gi, 'gotta');

    // Whisperハルシネーション除去
    const hallucinations = [
      'thank you for watching',
      'thanks for watching',
      'bye',
      'goodbye',
      'see you',
      'subscribe',
      'like and subscribe',
    ];
    const lower = text.toLowerCase().trim();
    if (hallucinations.some(h => lower === h || lower === h + '.')) {
      text = '';
    }

    return NextResponse.json({ text });
  } catch (e) {
    console.error('Transcribe error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
