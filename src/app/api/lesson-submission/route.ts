import { NextRequest, NextResponse } from 'next/server';
import { hasDatabaseUrl, sql } from '@/lib/db';
import { persistTeacherLesson, persistConversationLesson, findSimilarPatterns, SimilarPattern } from '@/lib/lesson-persist';
import { PRACTICE_V2_EMBEDDED_CATEGORY_NAMES } from '@/lib/practice-v2-embedded-categories';

export const dynamic = 'force-dynamic';

type ExtractedPattern = {
  situation_ja: string;
  fpp_question: string;
  spp: string;
  followup_question: string;
  followup_answer: string;
  character: string;
  suggested_category: string;
  similarPatterns?: SimilarPattern[];
};

type Body = {
  intent?: 'analyze-memo' | 'analyze-direct' | 'submit-preview' | 'analyze-and-save';
  studentName?: string;
  rawLessonMemo?: string;
  patterns?: ExtractedPattern[];
  directStyle?: '1sentence' | 'multi' | 'pairs';
};

/** practice-v2 埋め込み DATA の区分 ＋ DB の categories（重複除去）。カテゴリ分けの候補。 */
async function fetchCategoryNamesForPrompt(): Promise<string[]> {
  const set = new Set<string>([...PRACTICE_V2_EMBEDDED_CATEGORY_NAMES]);
  if (!hasDatabaseUrl()) return Array.from(set);
  try {
    const rows = await sql`SELECT name FROM categories ORDER BY sort_order`;
    for (const r of rows as { name: string }[]) {
      if (r.name?.trim()) set.add(r.name.trim());
    }
  } catch {
    /* DB 読めなくても埋め込み一覧は使う */
  }
  return Array.from(set);
}

type AnalyzeResult =
  | { ok: true; patterns: ExtractedPattern[] }
  | { ok: false; error: string; status: number };

function normalizePattern(parsed: Record<string, unknown>): ExtractedPattern {
  return {
    situation_ja: String(parsed.situation_ja ?? '').trim(),
    fpp_question: String(parsed.fpp_question ?? '').trim(),
    spp: String(parsed.spp ?? '').trim(),
    followup_question: String(parsed.followup_question ?? '').trim(),
    followup_answer: String(parsed.followup_answer ?? '').trim(),
    character: String(parsed.character ?? '友人').trim() || '友人',
    suggested_category: String(parsed.suggested_category ?? '').trim(),
  };
}

async function analyzeLessonMemo(rawMemo: string, categoryNames: string[]): Promise<AnalyzeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'OPENAI_API_KEY が設定されていません', status: 500 };
  }

  const catBlock =
    categoryNames.length > 0
      ? `次の一覧は practice-v2 教材（埋め込み DATA）と DB のカテゴリ名です。suggested_category には**この一覧から意味が最も近い1つを選び、可能なら文字列をそのまま（完全一致で）入れてください**。どれも明らかに不適切なときだけ、新しいカテゴリ名を1つ付けてください。**新規名は既存区分に揃え、可能なら「数字. 大項目：細目（調整中）」のような形式**（例: 「1. 返答：未来」「6. 返答：招待」）にしてください。：\n${categoryNames.join('、')}`
      : `suggested_category には、practice-v2 の区分に近い形式（「数字. 大項目：細目」）で付けてください。`;

  const userPrompt = `以下は英会話レッスン後の先生メモです（日本語・英語混在可）。パターンプラクティス教材用に構造化してください。

**Q→Aのペアを1つずつ独立したチャンクとして抽出してください。** ただし、**FPPで使われる主動詞が同じパターンのチャンクは重複とみなし、最も代表的な1つだけを残してください。**（例：「What are you going to eat?」「Where are you going to eat?」「What time are you going to eat?」はすべて "be going to" で同じ構造なので1チャンクのみ抽出する）

【先生メモ】
${rawMemo}

【出力ルール】
- 返答は必ず {"patterns": [...]} 形式の JSON のみ。前後に説明文を書かない。
- patterns は配列。メモ内の Q→A ペアの数だけ要素を作ること。
- 各パターンのキーはすべて必須（空文字 "" は不可）。英語のセリフはいずれも自然な口語の英語に整えること:
  - situation_ja … 受講生向けの状況説明（日本語。そのFPPが飛んでくる場面が分かるように）
  - fpp_question … 相手（講師側）の質問
  - spp … 受講生の模範回答（**1文のみ・短く簡潔に**。メモに複数文あっても最初の1文だけ使うこと）
  - followup_question … そのFPPに自然につながるフォロー質問（メモの別の交換を使ってもよいし、AIが補完してもよい）
  - followup_answer … followup_question への受講生の返答（**1文のみ・短く簡潔に**）
  - character … 会話相手が「夫」なら "夫"、それ以外は "友人"
  - suggested_category … ${catBlock.replace(/\n/g, ' ')}

JSON の例（Q→Aが4つある場合は4要素）:
{"patterns":[{"situation_ja":"...","fpp_question":"...","spp":"...","followup_question":"...","followup_answer":"...","character":"友人","suggested_category":"..."},{"situation_ja":"...","fpp_question":"...","spp":"...","followup_question":"...","followup_answer":"...","character":"友人","suggested_category":"..."}]}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You extract structured English teaching material from teacher notes. Reply with a single valid JSON object only, no markdown fences.',
        },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.35,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('OpenAI analyze-memo:', response.status, errText);
    return { ok: false, error: `OpenAI エラー: ${response.status}`, status: 502 };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    return { ok: false, error: 'AI からの応答が空です', status: 502 };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'AI の JSON が解析できませんでした', status: 502 };
  }

  const rawPatterns = Array.isArray(parsed.patterns) ? parsed.patterns : [parsed];
  const patterns = (rawPatterns as Record<string, unknown>[])
    .map(normalizePattern)
    .filter(p => p.fpp_question && p.spp);

  if (patterns.length === 0) {
    return {
      ok: false,
      error: 'メモからパターンを抽出できませんでした。メモをもう少し具体的に書いてください。',
      status: 422,
    };
  }

  return { ok: true, patterns };
}

/** 例文テキストをそのままチャンク分割（解釈より分割優先） */
async function analyzeDirectText(rawText: string, categoryNames: string[], style: '1sentence' | 'multi' | 'pairs' = '1sentence'): Promise<AnalyzeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'OPENAI_API_KEY が設定されていません', status: 500 };
  }

  const catBlock =
    categoryNames.length > 0
      ? `次の一覧から意味が最も近い1つを suggested_category に選んでください：\n${categoryNames.join('、')}`
      : `suggested_category には「数字. 大項目：細目」形式で付けてください。`;

  // multi モード: 会話テキストを行単位で直接パース。AI補正なし。FQ/FAは空。
  if (style === 'multi') {
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const patterns: ExtractedPattern[] = [];

    // 話者プレフィックス（"A:", "B:", "Name:" など）を除去する
    const stripSpeaker = (line: string) => line.replace(/^[A-Za-z0-9\u3040-\u9FFF\u30A0-\u30FF\uFF00-\uFFEF]+\s*:\s*/, '').trim();

    for (let i = 0; i + 1 < lines.length; i += 2) {
      const fpp = stripSpeaker(lines[i]);
      const spp = stripSpeaker(lines[i + 1]);
      if (fpp && spp) {
        patterns.push({
          situation_ja: '',
          fpp_question: fpp,
          spp,
          followup_question: '',
          followup_answer: '',
          character: '友人',
          suggested_category: '',
        });
      }
    }

    if (patterns.length === 0) {
      return { ok: false, error: '会話テキストをパースできませんでした。', status: 422 };
    }

    return { ok: true, patterns };
  }

  // pairs モード: A→B の1交換を1チャンクに。AIなし直接パース。FQ/FAは空。
  if (style === 'pairs') {
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const patterns: ExtractedPattern[] = [];
    const stripSpeaker = (line: string) => line.replace(/^[A-Za-z0-9\u3040-\u9FFF\u30A0-\u30FF\uFF00-\uFFEF]+\s*:\s*/, '').trim();
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const fpp = stripSpeaker(lines[i]);
      const spp = stripSpeaker(lines[i + 1]);
      if (fpp && spp) {
        patterns.push({
          situation_ja: '',
          fpp_question: fpp,
          spp,
          followup_question: '',
          followup_answer: '',
          character: '友人',
          suggested_category: '',
        });
      }
    }
    if (patterns.length === 0) {
      return { ok: false, error: 'テキストからQ&Aペアを抽出できませんでした。', status: 422 };
    }
    return { ok: true, patterns };
  }

  const turnRule = style === '1sentence'
    ? '**各ターンは原則1文**（短く簡潔に）'
    : '**FPP・FAはA・B複数ターンの会話を含んでよい**';

  const turnDesc = style === '1sentence'
    ? `  - FPP（fpp_question）… Aの質問（1文）
  - SPP（spp）… Bの最初の返答（1文）
  - FQ（followup_question）… Aのフォロー質問（1文。テキストになければ補完）
  - FA（followup_answer）… Bの返答（1文。テキストになければ補完）`
    : `  - FPP（fpp_question）… Aの最初の問いかけ＋Bの途中応答＋Aの追加問いかけを含むセットアップ会話全体。**Bが最初に実質的な情報を答えた文の直前まで**をFPPに含める。AとBのやり取りが複数あってもよい
  - SPP（spp）… **Bが最初に実質的な情報を答えた文**（練習の核心。1文が理想）
  - FQ（followup_question）… SPPの後にAが発する次の質問（1文）
  - FA（followup_answer）… FQへのBの返答＋その後のA・Bのやり取り全体。話題が変わる直前まで含める`;

  const systemMsg = style === '1sentence'
    ? 'You are an English teaching material specialist. Split the conversation into multiple chunks by topic. Each chunk = FPP(A)/SPP(B)/FQ(A)/FA(B), each turn is one sentence. Reply with a single valid JSON object only, no markdown fences.'
    : 'You are an English teaching material specialist. Split the conversation into topic-based chunks. FPP = the entire setup conversation (may include A/B back-and-forth) up to but not including B\'s first substantive answer. SPP = B\'s first substantive answer (the core practice sentence). FQ = A\'s next question after SPP. FA = everything after FQ until the next topic. Reply with a single valid JSON object only, no markdown fences.';

  const userPrompt = `以下のテキストには英会話の例文・会話例が書かれています。**複数のチャンクに分割して**パターンプラクティス教材の形式に整えてください。テキストの内容をできるだけそのまま使い、創作・解釈は最小限にしてください。

## 話者の識別
テキストは**話者A（講師・相手側）と話者B（受講生）の2名**によるやり取りです。
文脈・内容・流れから各文がAの発言かBの発言かを判断してください。

## チャンクの分割ルール
- **話題・場面が変わるタイミングで新しいチャンクを開始してください**（例：映画の選択 → 待ち合わせ → 食事 はそれぞれ別チャンク）
- 1チャンク = A→B→A→B の4ターン構造。${turnRule}
${turnDesc}

【テキスト】
${rawText}

【出力ルール】
- 返答は必ず {"patterns": [...]} 形式の JSON のみ。前後に説明文を書かない。
- 各チャンクのキー（すべて必須・空文字不可）:
  - situation_ja … そのQ&Aが発生する場面（日本語・簡潔に）
  - fpp_question … AのFPP
  - spp … BのSPP
  - followup_question … AのFQ
  - followup_answer … BのFA
  - character … "友人" または "夫"（文脈から判断）
  - suggested_category … ${catBlock.replace(/\n/g, ' ')}

JSON例（話題が3つあれば3要素）: {"patterns":[{"situation_ja":"...","fpp_question":"...","spp":"...","followup_question":"...","followup_answer":"...","character":"友人","suggested_category":"..."},{"situation_ja":"...","fpp_question":"...","spp":"...","followup_question":"...","followup_answer":"...","character":"友人","suggested_category":"..."}]}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemMsg,
        },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('OpenAI analyze-direct:', response.status, errText);
    return { ok: false, error: `OpenAI エラー: ${response.status}`, status: 502 };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    return { ok: false, error: 'AI からの応答が空です', status: 502 };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'AI の JSON が解析できませんでした', status: 502 };
  }

  const rawPatterns = Array.isArray(parsed.patterns) ? parsed.patterns : [parsed];
  const patterns = (rawPatterns as Record<string, unknown>[])
    .map(normalizePattern)
    .filter(p => p.fpp_question && p.spp);

  if (patterns.length === 0) {
    return {
      ok: false,
      error: 'テキストから会話チャンクを抽出できませんでした。Q&Aの形式で書かれているか確認してください。',
      status: 422,
    };
  }

  return { ok: true, patterns };
}

/**
 * POST /api/lesson-submission
 * - intent: analyze-memo … メモを AI で複数パターンに分解（DB 保存なし）
 * - intent: analyze-direct … 例文テキストをそのままチャンク分割（DB 保存なし）
 * - intent: submit-preview … パターン配列を DB 保存・音声生成
 */
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const intent = body.intent ?? 'submit-preview';
  const studentName = body.studentName?.trim();

  if (!studentName) {
    return NextResponse.json({ error: '受講生を選択してください' }, { status: 400 });
  }

  if (intent === 'analyze-memo') {
    const raw = body.rawLessonMemo?.trim() ?? '';
    if (raw.length < 20) {
      return NextResponse.json(
        { error: 'レッスンメモは20文字以上で入力してください' },
        { status: 400 }
      );
    }

    const categoryNames = await fetchCategoryNamesForPrompt();
    const result = await analyzeLessonMemo(raw, categoryNames);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // 各パターンの類似チェックをDBで実行
    const patternsWithSimilar = await Promise.all(
      result.patterns.map(async (p) => ({
        ...p,
        similarPatterns: hasDatabaseUrl() ? await findSimilarPatterns(p.fpp_question) : [],
      }))
    );

    return NextResponse.json({
      ok: true,
      patterns: patternsWithSimilar,
      message: `${result.patterns.length}パターンを解析しました。`,
    });
  }

  if (intent === 'analyze-direct') {
    const raw = body.rawLessonMemo?.trim() ?? '';
    if (raw.length < 20) {
      return NextResponse.json(
        { error: 'テキストは20文字以上で入力してください' },
        { status: 400 }
      );
    }

    const categoryNames = await fetchCategoryNamesForPrompt();
    const result = await analyzeDirectText(raw, categoryNames, body.directStyle ?? '1sentence');
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const patternsWithSimilar = await Promise.all(
      result.patterns.map(async (p) => ({
        ...p,
        similarPatterns: hasDatabaseUrl() ? await findSimilarPatterns(p.fpp_question) : [],
      }))
    );

    return NextResponse.json({
      ok: true,
      patterns: patternsWithSimilar,
      message: body.directStyle === 'multi'
        ? `${result.patterns.length}ペアを解析しました。1チャンクとして保存されます。`
        : `${result.patterns.length}チャンクに分割しました。`,
    });
  }

  if (intent === 'analyze-and-save') {
    const raw = body.rawLessonMemo?.trim() ?? '';
    if (raw.length < 20) {
      return NextResponse.json(
        { error: 'レッスンメモは20文字以上で入力してください' },
        { status: 400 }
      );
    }

    const categoryNames = await fetchCategoryNamesForPrompt();
    const result = await analyzeLessonMemo(raw, categoryNames);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (!hasDatabaseUrl()) {
      return NextResponse.json({
        ok: true,
        message: `DATABASE_URL 未設定のためプレビューのみ（${result.patterns.length}チャンク解析済み）。`,
        savedCount: 0,
      });
    }

    const saveResults: Array<{ ok: boolean; trigger: string; error?: string; similarPatterns?: SimilarPattern[] }> = [];
    for (const p of result.patterns) {
      const trigger = p.fpp_question?.trim();
      const spp = p.spp?.trim();
      if (!trigger || !spp) continue;
      try {
        const saved = await persistTeacherLesson({
          studentName,
          situation: p.situation_ja ?? '',
          suggestedCategory: p.suggested_category ?? '',
          character: p.character ?? '友人',
          trigger,
          spp,
          followupQuestion: p.followup_question?.trim() ?? '',
          followupAnswer: p.followup_answer?.trim() ?? '',
          rawMemo: raw,
        });
        saveResults.push({ ok: true, trigger, similarPatterns: saved.similarPatterns });
      } catch (e) {
        saveResults.push({ ok: false, trigger, error: (e as Error).message });
      }
    }

    const savedCount = saveResults.filter(r => r.ok).length;
    const failedCount = saveResults.filter(r => !r.ok).length;
    const allSimilar = saveResults.flatMap(r => r.similarPatterns ?? []);
    const message = failedCount > 0
      ? `${savedCount}チャンク保存・音声生成完了（${failedCount}件失敗）`
      : `${savedCount}チャンク保存・音声生成完了 ✓`;

    return NextResponse.json({
      ok: true,
      message,
      savedCount,
      saved: { similarPatterns: allSimilar },
    });
  }

  // submit-preview
  const patterns = body.patterns;
  if (!patterns || !Array.isArray(patterns) || patterns.length === 0) {
    return NextResponse.json({ error: 'patterns が必要です' }, { status: 400 });
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json({
      ok: true,
      message: 'DATABASE_URL 未設定のためプレビューのみ。Neon を接続すると DB に保存・音声生成されます。',
      patterns,
    });
  }

  const raw = body.rawLessonMemo?.trim() ?? '';

  // そのまま登録モード（multi / pairs）: 全ペアを1チャンクにまとめて保存
  if (body.directStyle === 'multi' || body.directStyle === 'pairs') {
    const pairs = patterns
      .map(p => ({ trigger: p.fpp_question?.trim() ?? '', spp: p.spp?.trim() ?? '' }))
      .filter(p => p.trigger && p.spp);

    if (pairs.length === 0) {
      return NextResponse.json({ error: 'patterns が必要です' }, { status: 400 });
    }

    try {
      await persistConversationLesson(studentName, pairs, raw);
      return NextResponse.json({
        ok: true,
        message: `${pairs.length}ペアを1チャンクとして保存・音声生成完了 ✓`,
        saved: { similarPatterns: [] },
      });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // 通常モード（1文・AI解析）: パターンごとに個別チャンク保存
  const results: Array<{ ok: boolean; trigger: string; error?: string; similarPatterns?: { trigger: string; similarityPct: number }[] }> = [];

  for (const p of patterns) {
    const trigger = p.fpp_question?.trim();
    const spp = p.spp?.trim();
    if (!trigger || !spp) continue;

    try {
      const saved = await persistTeacherLesson({
        studentName,
        situation: p.situation_ja ?? '',
        suggestedCategory: p.suggested_category ?? '',
        character: p.character ?? '友人',
        trigger,
        spp,
        followupQuestion: p.followup_question?.trim() ?? '',
        followupAnswer: p.followup_answer?.trim() ?? '',
        rawMemo: raw,
      });
      results.push({ ok: true, trigger, similarPatterns: saved.similarPatterns });
    } catch (e) {
      results.push({ ok: false, trigger, error: (e as Error).message });
    }
  }

  const savedCount = results.filter(r => r.ok).length;
  const failedCount = results.filter(r => !r.ok).length;
  const allSimilar = results.flatMap(r => r.similarPatterns ?? []);

  const message = failedCount > 0
    ? `${savedCount}パターン保存・音声生成完了（${failedCount}件失敗）`
    : `${savedCount}パターン保存・音声生成完了 ✓`;

  return NextResponse.json({
    ok: true,
    message,
    saved: { similarPatterns: allSimilar },
  });
}
