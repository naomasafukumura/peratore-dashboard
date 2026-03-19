import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ level: null, chunkUsed: null, fallback: true });
  }

  try {
    const { userAnswer, question, targetChunk, exampleAnswer } = await req.json();
    if (!userAnswer || !question) {
      return NextResponse.json({ error: 'Missing userAnswer or question' }, { status: 400 });
    }

    const prompt = `英会話練習アプリで、受講生が質問に答えました。
意味が通じるかどうかを判定してください。

質問: "${question}"
受講生の回答: "${userAnswer}"
ターゲットチャンク: "${targetChunk}"
回答例: "${exampleAnswer}"

## 評価基準（甘めに判定すること。迷ったら上のレベルにする）
- perfect: ターゲットチャンクを使えている AND 意味が質問への返答として成立する
- great: ターゲットチャンクを使えている AND 意味は通じるが、細部に改善の余地がある
- good: ターゲットチャンクは使えていないが、意味は通じる。英語として会話が成立する
- almost: 英語として文法が崩れていて伝わりにくい。ただし何か言えていればalmostにする
- retry: 何も言えていない、または質問と全く関係のない回答

## 重要な判定ルール（必ず守れ）
- 意味が通じていれば最低でも good にする。意味が通じるのに almost や retry にするな
- 回答例と単語が違っても、意味が同じで英語として成立すれば perfect にする
- ターゲットチャンクの判定: "${targetChunk}" の核となる形を使えているか見る
- チャンク未使用でも意味が通じていれば good（almost にしない）

## chunkUsed の判定
ターゲットチャンク "${targetChunk}" またはその同義形を受講生が使えていれば true。

JSON形式のみ出力（説明不要）: {"level": "perfect", "chunkUsed": true}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenAI API error:', response.status, errText);
      return NextResponse.json({ level: null, chunkUsed: null, fallback: true });
    }

    const data = await response.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json({
          level: parsed.level || 'good',
          chunkUsed: parsed.chunkUsed !== undefined ? parsed.chunkUsed : true,
        });
      }
    } catch (e) {
      console.error('JSON parse error:', e, 'raw:', raw);
    }

    return NextResponse.json({ level: null, chunkUsed: null, fallback: true });
  } catch (e) {
    console.error('Score answer error:', e);
    return NextResponse.json({ level: null, chunkUsed: null, fallback: true });
  }
}
