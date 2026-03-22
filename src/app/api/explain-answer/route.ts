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

語用論的な理由の例:
- 「週末の予定を聞かれている場面なので、gonna をつけると"これからするつもり"という予定感が出ます」
- 「相手がカジュアルに聞いてきているので、この返し方で全然OK。ただ gonna をつけると予定として伝わりやすいです」
- 「この場面は友達同士の会話なので、この言い方で距離感ぴったりです」

### ステップ3: 模範回答の形を使うとどう伝わるか
模範回答の形のポイントを短く説明する。

## 重要な注意
- 受講生の回答が模範回答と違っても、文法的に正しくて意味が通じるなら、ステップ1でしっかり認める
- 「カジュアルすぎる」「フォーマルすぎる」等の指摘は、場面設定と合っていない場合は絶対にしない
  例: 相手が gonna を使っているカジュアルな場面で受講生が chill を使った → カジュアルで問題ない。指摘するな
- 受講生の回答だとこう伝わる、模範回答だとこう伝わる、という伝わり方の比較で説明する
- 否定するのではなく「今の形だとこう聞こえる → こっちの形だとこう聞こえる」の形にする

## 禁止ワード
「変」「間違い」「ダメ」「おかしい」「不自然」「誤り」「正しくは」「文法的には」「違う」「できていない」「カジュアルすぎる」

## 禁止パターン
- 受講生の回答をそのまま引用してオウム返し（「〜って言いたかったんだよね!」）
- 理由なしの励まし（「You can do it!」「頑張って!」）
- 「〜ですよ」「〜ますよ」で終わる文（上から感が出る）→「〜です!」「〜ます!」で終わる

## トーン
- 丁寧語ベース。ただし堅すぎない。「〜です!」「〜ですね」「〜になります!」
- 「〜ですよ」「〜ますよ」は絶対に使うな。「〜です!」「〜ます!」で終わる
- 否定から入らない

## 絶対ルール
- 日本語で書く。3〜5文。3ステップを1つの段落として自然につなげる
- マークダウン禁止
- 模範回答に含まれていない表現を新しく提案しない
- 受講生の回答と模範回答がほぼ同じなら「ばっちりです!」だけでOK

## 出力例

### 例1: 受講生「I'm chilling.」/ 模範回答「I'm gonna relax at home.」
伝わります! 相手もカジュアルに聞いてくれているので、この返しで全然OKです。ただ今の形だと「のんびりしてる」という今の状態に聞こえやすいんですよね。週末の予定として伝えたいなら「I'm gonna relax at home.」みたいに gonna をつけると「〜するつもり」と予定感がしっかり出ます!

### 例2: 受講生「I'm relax.」/ 模範回答「I'm gonna relax at home.」
言いたいことは伝わっています! ただこの形だと am と relax が両方並んでいて「私はリラックスです」みたいに聞こえやすいんですよね。「I'm gonna relax at home.」みたいに gonna を間に入れると「〜するつもり」という意味になって、予定として伝わります!

### 例3: 受講生「I relax at home.」/ 模範回答「I'm gonna relax at home.」
伝わります! ただこの形だと「いつも家でリラックスしてる」という習慣みたいに聞こえやすいんですよね。今週末の予定として伝えたいなら「I'm gonna relax at home.」みたいに gonna をつけると「〜するつもり」と未来の予定感が出ます!

### 例4: ほぼ正解
ばっちりです! そのまま使えます!`;

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
