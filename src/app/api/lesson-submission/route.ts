import { NextRequest, NextResponse } from 'next/server';
import { hasDatabaseUrl, sql } from '@/lib/db';
import { persistTeacherLesson } from '@/lib/lesson-persist';
import { unauthorizedIfNotTeacher } from '@/lib/require-teacher-session';
import { PRACTICE_V2_EMBEDDED_CATEGORY_NAMES } from '@/lib/practice-v2-embedded-categories';

export const dynamic = 'force-dynamic';

type Body = {
  intent?: 'analyze-memo' | 'submit-preview';
  studentName?: string;
  /** メモ中心フロー：先生の自由記述レッスンメモ */
  rawLessonMemo?: string;
  trigger?: string;
  spp?: string;
  followupQuestion?: string;
  followupAnswer?: string;
  situation?: string;
  suggestedCategory?: string;
  character?: string;
  memo?: string;
  sourceMode?: 'free' | 'db';
  sourcePatternId?: number | null;
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
  | { ok: true; extracted: ReturnType<typeof normalizeExtracted> }
  | { ok: false; error: string; status: number };

function normalizeExtracted(parsed: Record<string, unknown>) {
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

  const userPrompt = `以下は英会話レッスン後の先生メモです（日本語・英語混在可）。パターンプラクティス教材用に構造化してください。メモは2往復分の会話が書かれている想定です。

【先生メモ】
${rawMemo}

【出力ルール】
- 返答は必ず1つの JSON オブジェクトのみ。前後に説明文を書かない。
- 次のキーはすべて必須（空文字 "" は不可）。英語のセリフはいずれも自然な口語の英語に整えること:
  - situation_ja … 受講生向けの状況説明（日本語。オンライン英会話の場面が分かるように）
  - fpp_question … 1往復目・相手（講師側）のセリフ
  - spp … 1往復目・受講生の模範回答
  - followup_question … 2往復目・相手のフォロー質問（メモに無い場合でも、1往復目の流れから教材として自然なフォローを補完してよい）
  - followup_answer … 2往復目・受講生の返答（同上、補完可）
  - character … 会話相手が「夫」なら "夫"、それ以外は "友人"
  - suggested_category … ${catBlock.replace(/\n/g, ' ')}

JSON の例（構造のみ）:
{"situation_ja":"...","fpp_question":"...","spp":"...","followup_question":"...","followup_answer":"...","character":"友人","suggested_category":"..."}`;

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
      max_tokens: 2000,
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

  const extracted = normalizeExtracted(parsed);

  if (!extracted.fpp_question || !extracted.spp) {
    return {
      ok: false,
      error:
        'メモから 1往復目（相手のセリフ・模範回答）を推定できませんでした。メモをもう少し具体的に書いてください。',
      status: 422,
    };
  }

  if (!extracted.followup_question || !extracted.followup_answer) {
    return {
      ok: false,
      error:
        '2往復目（フォロー質問・返答）まで出力できませんでした。会話の続きをメモに書くか、もう少し文脈を足してください。',
      status: 422,
    };
  }

  return { ok: true, extracted };
}

/**
 * POST /api/lesson-submission
 * - intent: analyze-memo … 長文メモを AI で教材フィールドに分解（DB 保存なし）
 * - intent: submit-preview … 2往復＋カテゴリ必須。DATABASE_URL ありなら DB 保存・音声生成
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

    return NextResponse.json({
      ok: true,
      extracted: result.extracted,
      message: '解析しました。',
    });
  }

  const trigger = body.trigger?.trim();
  const spp = body.spp?.trim();
  const followupQuestion = body.followupQuestion?.trim() ?? '';
  const followupAnswer = body.followupAnswer?.trim() ?? '';
  if (!trigger || !spp) {
    return NextResponse.json(
      { error: 'Trigger（FPP）と SPP は必須です。レッスンメモを見直すか、AI 解析が成功しているか確認してください。' },
      { status: 400 }
    );
  }
  if (!followupQuestion || !followupAnswer) {
    return NextResponse.json(
      { error: '2往復目（フォロー質問・返答）も必須です。登録開始は AI 解析成功後に送信されます。' },
      { status: 400 }
    );
  }

  const preview = {
    studentName,
    rawLessonMemo: body.rawLessonMemo?.trim() ?? '',
    situation: body.situation?.trim() ?? '',
    suggestedCategory: body.suggestedCategory?.trim() ?? '',
    character: body.character?.trim() ?? '友人',
    trigger,
    spp,
    followupQuestion,
    followupAnswer,
    memo: body.memo?.trim() ?? '',
    sourceMode: body.sourceMode ?? 'free',
    sourcePatternId: body.sourcePatternId ?? null,
  };

  if (!hasDatabaseUrl()) {
    return NextResponse.json({
      ok: true,
      message:
        '受け付けました（DATABASE_URL 未設定のためプレビューのみ）。Neon を接続すると同じ操作で DB に保存・音声生成されます。',
      preview,
    });
  }

  try {
    const saved = await persistTeacherLesson({
      studentName,
      situation: preview.situation,
      suggestedCategory: preview.suggestedCategory,
      character: preview.character,
      trigger,
      spp,
      followupQuestion: preview.followupQuestion,
      followupAnswer: preview.followupAnswer,
    });

    const failedAudio = Object.entries(saved.audioResults)
      .filter(([, ok]) => !ok)
      .map(([k]) => k);
    let audioNote = '';
    if (saved.mode === 'inserted') {
      if (!process.env.ELEVENLABS_API_KEY) {
        audioNote = ' ELEVENLABS_API_KEY 未設定のため音声は生成していません。';
      } else if (failedAudio.length > 0) {
        audioNote = ` 一部音声の生成に失敗: ${failedAudio.join(', ')}。`;
      }
    }

    const studentQ = encodeURIComponent(studentName);
    const tail = ` /api/practice-data?student=${studentQ} または practice-v2 で確認できます。`;
    const message =
      saved.mode === 'existing'
        ? `既存DBの同一パターンを使用しました（新規追加なし・既存教材の再利用）。受講生への割当のみ行いました。パターン ID ${saved.patternId}。${tail}`
        : `教材を保存しました（新規パターン ID ${saved.patternId}）。${audioNote}${tail}`;

    return NextResponse.json({
      ok: true,
      message,
      preview,
      saved: {
        mode: saved.mode,
        patternId: saved.patternId,
        chunkId: saved.chunkId,
        categoryId: saved.categoryId,
        audioResults: saved.audioResults,
      },
    });
  } catch (e) {
    console.error('lesson-submission persist:', e);
    return NextResponse.json(
      { error: (e as Error).message || 'DB 保存に失敗しました' },
      { status: 500 }
    );
  }
}
