import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  try {
    // Read raw body
    const body = Buffer.from(await req.arrayBuffer());
    const contentType = req.headers.get('content-type') || '';

    let whisperBody: Uint8Array | FormData;
    let whisperHeaders: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
    };

    if (contentType.includes('multipart/form-data')) {
      // FormData from client - forward as-is to Whisper
      whisperBody = body;
      whisperHeaders['Content-Type'] = contentType;
    } else {
      // Legacy: raw audio binary (fallback)
      const ext = contentType.includes('mp4') ? 'mp4' : contentType.includes('ogg') ? 'ogg' : 'webm';
      const mime = contentType || 'audio/webm';
      const boundary = '----WhisperBoundary' + Date.now();
      whisperBody = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mime}\r\n\r\n`),
        body,
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n--${boundary}--\r\n`)
      ]);
      whisperHeaders['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: whisperHeaders,
      body: whisperBody as BodyInit,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Whisper API error:', response.status, errText);
      return NextResponse.json({ error: errText }, { status: response.status });
    }

    const data = await response.json();
    let text = (data.text || '') as string;
    // Whisperが口語表現を正式形に変換してしまうので戻す
    // "going to + 動詞" → gonna（"going to the store"のような場所はそのまま）
    text = text.replace(/\bgoing to (?=[a-z])/gi, (m: string, offset: number, str: string) => {
      const after = str.slice(offset + m.length);
      if (/^(the|a|an|my|his|her|our|their|this|that)\b/i.test(after)) return m;
      return 'gonna ';
    });
    text = text.replace(/\bwant to\b/gi, 'wanna');
    text = text.replace(/\bgot to\b/gi, 'gotta');
    return NextResponse.json({ text });
  } catch (e) {
    console.error('Transcribe error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
