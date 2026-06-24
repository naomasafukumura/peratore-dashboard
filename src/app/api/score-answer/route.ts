import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/error-log';

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ level: null, chunkUsed: null, fallback: true });
  }

  try {
    const { userAnswer, question, targetChunk, exampleAnswer, turn, scoreMode } = await req.json();
    if (!userAnswer || !question) {
      return NextResponse.json({ error: 'Missing userAnswer or question' }, { status: 400 });
    }

    // 質問モード: turn に関係なく質問再現プロンプトを使う
    if (scoreMode === 'question') {
      const questionPrompt = `お手本の質問文: "${exampleAnswer}"
生徒の発話(文字起こし): "${userAnswer}"

生徒はお手本の質問文をそのまま声に出して再現する練習をしています。
どれだけ忠実に再現できたかを厳しめに評価してください。

評価基準:
- perfect: 語順・単語がお手本とほぼ完全一致（句読点・大文字小文字・gonna/going to等の口語表記揺れは無視）
- great: 1語程度の軽微な違い（冠詞・時制の些細なズレ）はあるが質問として同一
- good: 主要語は再現できているが語順や単語に複数の違いがある
- almost: 一部しか再現できていない／意味は近いが文として崩れている
- retry: 全く違う／無音

注意: 意味が同じでも単語・語順が違えば great 以下にする（原文再現が目的）。
JSON形式のみ出力: {"level":"perfect","chunkUsed":true}`;

      const qResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: questionPrompt }],
          max_tokens: 100,
          temperature: 0.2,
        }),
      });

      if (!qResponse.ok) {
        const errText = await qResponse.text();
        console.error('OpenAI API error (question mode):', qResponse.status, errText);
        return NextResponse.json({ level: null, chunkUsed: null, fallback: true });
      }

      const qData = await qResponse.json();
      const qRaw = (qData.choices?.[0]?.message?.content || '').trim();
      try {
        const jsonMatch = qRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return NextResponse.json({
            level: parsed.level || 'good',
            chunkUsed: true,
          });
        }
      } catch (e) {
        console.error('JSON parse error (question mode):', e, 'raw:', qRaw);
      }
      return NextResponse.json({ level: null, chunkUsed: null, fallback: true });
    }

    const isTurn2 = turn === 2;

    const prompt = isTurn2
      ? `英会話練習アプリで、受講生が会話の続き（Turn 2）に答えました。
会話として成立するかを判定してください。Turn 2 は自由応答なので、甘めに評価してください。

相手の発言: "${question}"
受講生の回答: "${userAnswer}"
回答例: "${exampleAnswer}"

## 評価基準（甘めに。何か言えていれば最低でも almost）
- perfect: 会話として自然に成立する。意味が通じている
- great: 多少荒くても意味が通じて会話が続けられる
- good: 伝わるが、もう少し具体的だとより良い
- almost: 何か言えているが、会話としてはやや成立しにくい
- retry: 何も言えていない、または質問と全く関係ない

重要: 回答例と違う表現でも、意味が通じて会話として成立するなら perfect か great にする。
回答例はあくまで一例。受講生が自分の言葉で答えることを重視する。

JSON形式のみ出力: {"level": "perfect", "chunkUsed": true}
chunkUsed は Turn 2 では常に true にする。`
      : `英会話練習アプリで、受講生が質問に答えました。
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
  例: 回答例が "I'm gonna relax at home." で受講生が "I'm gonna rest at home." → perfect
  例: 回答例が "I'm gonna relax at home." で受講生が "I'm gonna chill at home." → perfect
- ターゲットチャンクの判定: "${targetChunk}" の核となる形を使えているか見る
  例: ターゲットが "I'm gonna ~" なら "I'm going to ~" も OK
- チャンク未使用でも意味が通じていれば good（almost にしない）
  例: "I'm just chilling." はチャンク未使用だが意味は通じる → good

## chunkUsed の判定
ターゲットチャンク "${targetChunk}" またはその同義形を受講生が使えていれば true。
例: "I'm gonna ~" がターゲットなら "I'm going to ~" でも true。

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
    await logError('score-answer', e, { status: 500 });
    return NextResponse.json({ level: null, chunkUsed: null, fallback: true });
  }
}
