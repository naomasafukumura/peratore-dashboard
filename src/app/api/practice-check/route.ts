import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/error-log';

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  try {
    const { userAnswer, question, targetPattern, situation, isRetry, scoreMode, exampleQuestion } = await req.json();
    if (!userAnswer || !question) {
      return NextResponse.json({ error: 'Missing userAnswer or question' }, { status: 400 });
    }

    const retryNote = isRetry
      ? `\n\n## 重要: これは再トライです
受講生がもう一度挑戦した回答です。改善点のコメントは不要です。褒めだけにしてください。suggestionも不要です（空文字にしてください）。`
      : '';

    let prompt: string;

    if (scoreMode === 'question') {
      // 質問モード採点プロンプト
      const exQ = exampleQuestion || question;
      prompt = `受講生は日本語の意図を英語の質問で表現する練習をしています。

お手本の質問: "${exQ}"
受講生の発話: "${userAnswer}"
${retryNote}

## チェック観点
1. 英語の質問として通じるか（疑問文の形になっているか、語順・動詞の形など）
2. お手本の意図（聞きたいこと）に合っているか
3. 自然な英語の質問か

## 評価レベル（実践モードなので寛容に）
- perfect: 文法ミスなし。自然な英語の質問
- great: 意図に合う英語の質問。言い回しが違っても伝わればgreat以上
- good: 小さなミスがあるけど質問として伝わる
- almost: ミスがあって質問として伝わりにくい
- retry: 質問になっていない、または意図と無関係

重要: 意図に合う自然な英語の質問なら、言い回しが違っても great 以上にする。retry は「質問の形になっていない/意図と全く無関係」のみ。

## コメントのルール
- 英語の質問として通じれば褒める（日本語1〜2文）
- ミスがあれば「今の形だとこう聞こえる → こうするとこう伝わる」の形で1〜2文で説明
- 「変」「間違い」「ダメ」「おかしい」「不自然」「誤り」「正しくは」「文法的には」等の否定語・講義調は禁止
- 「〜ですよ」「〜ますよ」は使わない。「〜です!」「〜ます!」で終わる
- 受講生の回答をオウム返しで繰り返さない
- マークダウン禁止

## suggestion（より自然な質問の言い方）
- 受講生の発話が不自然な場合のみ、より自然な英語の質問文を提案する（英文のみ）
- 十分自然なら空文字にする

## 出力フォーマット（JSON）
{"level": "great", "comment": "しっかり伝わります! ...", "suggestion": ""}

必ずJSON形式で出力してください。`;
    } else {
      // 答えモード採点プロンプト（既存・完全維持）
      const situationNote = situation
        ? `\n場面設定: "${situation}"`
        : '';

      const patternNote = targetPattern
        ? `\n練習ターゲットパターン: "${targetPattern}"`
        : '';

      prompt = `受講生が英語で回答しました。文法的なミスがあるかチェックしてください。

質問: "${question}"
受講生の回答: "${userAnswer}"${situationNote}${patternNote}
${retryNote}

## チェック観点
1. 文法的に正しいか（時制、語順、冠詞、前置詞、動詞の形など）
2. 場面に対して自然な表現か

## 評価レベル
- perfect: 文法ミスなし。自然な英語
- great: 文法ミスなし。伝わる
- good: 小さなミスがあるけど伝わる
- almost: ミスがあって伝わりにくい
- retry: 質問に対する回答になっていない

重要: 文法的に正しければ、迷ったらperfectかgreatにする。

## コメントのルール
- 文法ミスがなければ褒める（日本語1〜2文）
- ミスがあれば「今の形だとこう聞こえる → こうするとこう伝わる」の形で1〜2文で説明
- 「変」「間違い」「ダメ」「おかしい」「不自然」「誤り」「正しくは」「文法的には」等の否定語・講義調は禁止
- 「〜ですよ」「〜ますよ」は使わない。「〜です!」「〜ます!」で終わる
- 受講生の回答をオウム返しで繰り返さない
- マークダウン禁止

## suggestion（より自然な言い方）
- 受講生の回答が日本語直訳っぽい場合のみ、より自然な英文を提案する
- 受講生の回答がすでに自然なら空文字にする
- suggestion は英文のみ（日本語の説明は不要）

## 出力フォーマット（JSON）
{"level": "great", "comment": "しっかり伝わります! ...", "suggestion": ""}

必ずJSON形式で出力してください。`;
    }

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
    const raw = (data.choices?.[0]?.message?.content || '').trim();

    // Parse JSON from response
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json({
          level: parsed.level || 'good',
          comment: parsed.comment || '',
          suggestion: parsed.suggestion || '',
        });
      }
    } catch (e) {
      console.error('JSON parse error:', e, 'raw:', raw);
    }
    return NextResponse.json({ level: 'good', comment: raw, suggestion: '' });
  } catch (e) {
    console.error('Practice check error:', e);
    await logError('practice-check', e, { status: 500 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
