import { NextRequest, NextResponse } from 'next/server';
import { hasDatabaseUrl, sql } from '@/lib/db';
import { persistTeacherLesson, findSimilarPatterns, SimilarPattern } from '@/lib/lesson-persist';
import { unauthorizedIfNotTeacher } from '@/lib/require-teacher-session';
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
  intent?: 'analyze-memo' | 'submit-preview';
  studentName?: string;
  rawLessonMemo?: string;
  patterns?: ExtractedPattern[];
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

**Q→Aのペアを1つずつ独立したチャンクとして抽出してください。** メモに4つのQ→Aペアがあれば4チャンク出力します。

【先生メモ】
${rawMemo}

【出力ルール】
- 返答は必ず {"patterns": [...]} 形式の JSON のみ。前後に説明文を書かない。
- patterns は配列。メモ内の Q→A ペアの数だけ要素を作ること。
- 各パターンのキーはすべて必須（空文字 "" は不可）。英語のセリフはいずれも自然な口語の英語に整えること:
  - situation_ja … 受講生向けの状況説明（日本語。そのFPPが飛んでくる場面が分かるように）
  - fpp_question … 相手（講師側）の質問
  - spp … 受講生の模範回答
  - followup_question … そのFPPに自然につながるフォロー質問（メモの別の交換を使ってもよいし、AIが補完してもよい）
  - followup_answer … followup_question への受講生の返答（同上、補完可）
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

/**
 * POST /api/lesson-submission
 * - intent: analyze-memo … メモを AI で複数パターンに分解（DB 保存なし）
 * - intent: submit-preview … パターン配列を DB 保存・音声生成
 */
export async function POST(req: NextRequest) {
  const denied = await unauthorizedIfNotTeacher(req);
  if (denied) return denied;

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
        rawMemo: body.rawLessonMemo?.trim() ?? '',
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
