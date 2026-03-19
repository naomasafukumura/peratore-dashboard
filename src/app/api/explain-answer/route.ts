import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  try {
    const { userAnswer, question, exampleAnswer } = await req.json();
    if (!userAnswer || !question) {
      return NextResponse.json({ error: 'Missing userAnswer or question' }, { status: 400 });
    }

    const prompt = `英会話練習アプリで、受講生の回答を分析してフィードバックを作ってください。

相手の質問: "${question}"
受講生の回答: "${userAnswer}"
模範回答: "${exampleAnswer}"

## フィードバックの3ステップ構造（必ずこの順番で書け）

### ステップ1: 受け止める・褒める
受講生の回答の良いところを認める。「伝わります!」「いい感じ!」など。
ただし受講生の回答をオウム返しで繰り返すな（画面に表示済み）。

### ステップ2: 「こう伝わる→こっちだとこう伝わる」の比較で説明
受講生の回答が相手にどう伝わるか、模範回答だとどう伝わるかを比較する形で説明する。
必ず「なぜこの場面ではこの形が自然か」の語用論的な理由をつける。

### ステップ3: 模範回答の形を使うとどう伝わるか
模範回答の形のポイントを短く説明する。

## 重要な注意
- 受講生の回答が模範回答と違っても、文法的に正しくて意味が通じるなら、ステップ1でしっかり認める
- 否定するのではなく「今の形だとこう聞こえる → こっちの形だとこう聞こえる」の形にする

## 禁止ワード
「変」「間違い」「ダメ」「おかしい」「不自然」「誤り」「正しくは」「文法的には」「違う」「できていない」「カジュアルすぎる」

## 禁止パターン
- 受講生の回答をそのまま引用してオウム返し
- 理由なしの励まし
- 「〜ですよ」「〜ますよ」で終わる文 → 「〜です!」「〜ます!」で終わる

## トーン
- 丁寧語ベース。ただし堅すぎない。
- 「〜ですよ」「〜ますよ」は絶対に使うな。「〜です!」「〜ます!」で終わる

## 絶対ルール
- 日本語で書く。3〜5文。3ステップを1つの段落として自然につなげる
- マークダウン禁止
- 模範回答に含まれていない表現を新しく提案しない
- 受講生の回答と模範回答がほぼ同じなら「ばっちりです!」だけでOK`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenAI API error:', response.status, errText);
      return NextResponse.json({ error: errText }, { status: response.status });
    }

    const data = await response.json();
    const feedback = data.choices?.[0]?.message?.content || '';
    return NextResponse.json({ feedback });
  } catch (e) {
    console.error('Explain answer error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
