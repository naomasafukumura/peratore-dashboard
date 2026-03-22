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

    const prompt = `英会話の練習で、受講生の回答と、画面に表示している one natural reply を比較して、短い加点アドバイスを1〜2文で作ってください。

受講生の回答: "${userAnswer}"
one natural reply: "${exampleAnswer}"

目的:
受講生を否定せず、「今回の場面ではこの言い方が使えるとより伝わりやすい」と分かる短い補足を出すこと。
必ず「なぜこの形がこの場面に合うか」の理由を一言添える。

絶対ルール:
- one natural reply に含まれていない表現を新しく提案しない
- one natural reply と矛盾する説明をしない
- one natural reply を唯一の正解のように断定しない
- 受講生の回答を「間違い」「不自然」「カジュアルすぎる」と言わない
- 「文法的には」「答えは」「正しくは」などの講義調の言い方は禁止
- 「〜ですよ」「〜ますよ」は絶対に使わない。「〜です!」「〜ます!」で終わる
- 日本語で1〜2文。短く、やさしく、中学生でも読める言葉で書く
- マークダウン禁止
- 説明は「受講生の回答」と「one natural reply」の差分にだけ触れる
- 差分がない、またはほぼ同じなら、無理に解説せず短い褒めコメントだけにする

出力方針:
- 「今の形だとこう聞こえる → こっちの形だとこう聞こえる」の伝わり方の比較で説明する
- 今回表示している one natural reply の中の重要表現だけを取り上げる
- 余計な別案、類義表現、言い換えは出さない
- なぜその形がこの場面で使えるかの理由を一言入れる

良い出力例:
- 週末の予定の話なので、I'm gonna … をつけると「〜するつもり」と予定感が出てさらに伝わりやすいです🙌
- 今回は at home まで入ると、家でゆっくりする感じがより伝わりやすいです!
- いい感じです! 模範回答とほぼ同じ形で言えています🙌

悪い出力例:
- chill at home を使うと自然です（← one natural reply にない表現を提案している）
- 文法的には現在形ではなく未来形です（← 講義調）
- 正しくは one natural reply の通りです（← 断定）
- カジュアルすぎる印象があります（← 場面に合った指摘か判断できていない）`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
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
    console.error('Check answer error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
