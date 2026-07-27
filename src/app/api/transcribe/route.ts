import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/error-log';

export const maxDuration = 30;

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

    // OpenAI の一過性 5xx / ネットワーク断を吸収するリトライ。
    // 4xx（400 invalid file format / 401 キー無効 / 429 残高不足）は再送しても同じなのでリトライしない。
    // 全体は DEADLINE_MS 内に収める（maxDuration=30 を超えると Vercel 側で 504 になる）。
    const DEADLINE_MS = 27000;
    const ATTEMPT_TIMEOUT_MS = 14000;
    const BACKOFF_MS = [400];
    const startedAt = Date.now();
    const remaining = () => DEADLINE_MS - (Date.now() - startedAt);

    let response: Response | null = null;
    let lastErr: unknown = null;
    let attempt = 0;

    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(ATTEMPT_TIMEOUT_MS, remaining()));
      try {
        response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: whisperHeaders,
          body: whisperBody as BodyInit,
          signal: controller.signal,
        });
        lastErr = null;
      } catch (err) {
        response = null;
        lastErr = err;
      } finally {
        clearTimeout(timer);
      }

      const retriable = response === null || response.status >= 500;
      const backoff = BACKOFF_MS[attempt];
      // 次の試行（バックオフ + 最低限の実行時間）が締切に収まる場合のみリトライ
      if (!retriable || backoff === undefined || remaining() < backoff + 4000) break;

      console.warn('[transcribe] retry', attempt + 1, response ? response.status : String(lastErr));
      await new Promise((r) => setTimeout(r, backoff));
      attempt++;
    }

    const attempts = attempt + 1;

    if (response === null) {
      throw lastErr ?? new Error('transcribe: no response');
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('Whisper API error:', response.status, errText);
      await logError('transcribe', new Error(`OpenAI ${response.status}: ${errText.slice(0, 500)}`), {
        status: response.status,
        context: { phase: 'openai', model: 'whisper-1', attempts },
      });
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
    await logError('transcribe', e, { status: 500 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
