import { NextRequest, NextResponse } from 'next/server';
import { hasDatabaseUrl, sql } from '@/lib/db';
import { persistTeacherLesson, persistConversationLesson, findSimilarPatterns, SimilarPattern } from '@/lib/lesson-persist';
import { PRACTICE_V2_EMBEDDED_CATEGORY_NAMES } from '@/lib/practice-v2-embedded-categories';
import { logError } from '@/lib/error-log';

export const dynamic = 'force-dynamic';

/**
 * レッスンメモ解析に使うモデル。品質を上げたいときは環境変数 OPENAI_MODEL_LESSON に
 * gpt-4o 等を設定する（コード変更・再デプロイ不要）。未設定なら従来どおり gpt-4o-mini。
 */
const LESSON_AI_MODEL = process.env.OPENAI_MODEL_LESSON || 'gpt-4o-mini';

type ExtractedPattern = {
  situation_ja: string;
  /** チャンクのタイトル（練習する型。例: "I'm gonna ~"）。空なら FPP 文で代用される */
  title_en: string;
  /** チャンクのタイトル和訳（例: "〜するつもり"）。空なら situation_ja で代用される */
  title_jp: string;
  /** 話題の主体が受講生自身か第三者か。AIに4行を書く前に確定させるためのトークン */
  topic_person?: 'self' | 'third';
  /** topic_person が third のときの代名詞（例: "she / her"）。self なら空文字 */
  topic_pronoun?: string;
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
  const topicPersonRaw = String(parsed.topic_person ?? '').trim().toLowerCase();
  return {
    situation_ja: String(parsed.situation_ja ?? '').trim(),
    title_en: String(parsed.title_en ?? '').trim(),
    title_jp: String(parsed.title_jp ?? '').trim(),
    topic_person: topicPersonRaw === 'third' ? 'third' : topicPersonRaw === 'self' ? 'self' : undefined,
    topic_pronoun: String(parsed.topic_pronoun ?? '').trim(),
    fpp_question: String(parsed.fpp_question ?? '').trim(),
    spp: String(parsed.spp ?? '').trim(),
    followup_question: String(parsed.followup_question ?? '').trim(),
    followup_answer: String(parsed.followup_answer ?? '').trim(),
    character: String(parsed.character ?? '友人').trim() || '友人',
    suggested_category: String(parsed.suggested_category ?? '').trim(),
  };
}

/** FQ に三人称代名詞（she/he/him/her/his）が含まれているか */
const THIRD_PARTY_PRONOUN_RE = /\b(she|he|him|her|his)\b/i;
/**
 * FA の文頭主語が一人称（I / I'm / I've / I'd / I'll）かどうか。
 * FA は「短い相づち＋補足」の形（例: "Oh, I love that movie!"）で始まることが多いため、
 * 先頭の相づち（単語＋区切り記号）を最大3個までスキップしてから主語を判定する。
 */
const FIRST_PERSON_SUBJECT_START_RE = /^(?:[a-zA-Z]+[,!.\s]+){0,3}(I['’]m|I['’]ve|I['’]d|I['’]ll|I)\b/i;

/**
 * FQ↔FA の局所整合性チェック。FQ が三人称代名詞で誰かについて尋ねているのに、
 * FA が一人称で答えてしまっている（人称のすり替わり）ケースだけを違反とみなす。
 * SPP の話題（topic_person）から FQ が「あなたは？」に転換するのは自然な会話なので対象外。
 */
function hasFirstPersonViolation(p: ExtractedPattern): boolean {
  if (!p.followup_question || !p.followup_answer) return false;
  if (!THIRD_PARTY_PRONOUN_RE.test(p.followup_question)) return false;
  return FIRST_PERSON_SUBJECT_START_RE.test(p.followup_answer);
}

/** 人称不一致（FQ=三人称なのにFAが一人称）を検出したパターンだけ FA を1回だけ書き直す（FQ は教師メモ由来の可能性があるため変更しない） */
async function fixPersonMismatch(
  apiKey: string,
  pattern: ExtractedPattern
): Promise<ExtractedPattern> {
  const prompt = `次の英会話の FA（followup_answer）を、FQ（followup_question）が尋ねている人物（${pattern.topic_pronoun || 'the third person'}）に合わせて書き直してください。
FQ は she/he などでその人物について尋ねているのに、FA が一人称（I / my / me など）で答えてしまっている誤りを直すのが目的です。fpp_question・spp・followup_question は変更しないでください。

【現在の内容】
FPP: ${pattern.fpp_question}
SPP: ${pattern.spp}
FQ: ${pattern.followup_question}
FA: ${pattern.followup_answer}

【出力】
{"followup_answer":"..."} のJSONのみを返してください。FA は FQ が尋ねている人物（${pattern.topic_pronoun || 'third person'}）について、一人称（I / my / me）を主語にせず答えること。`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: LESSON_AI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You fix person-agreement errors in short English dialogue. Reply with a single valid JSON object only, no markdown fences.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 500,
      }),
    });
    if (!response.ok) {
      console.error('OpenAI fixPersonMismatch:', response.status, await response.text());
      return pattern;
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') return pattern;
    const fixed = JSON.parse(content) as Record<string, unknown>;
    const followup_answer = String(fixed.followup_answer ?? '').trim();
    if (!followup_answer) return pattern;
    return { ...pattern, followup_answer };
  } catch (err) {
    console.error('fixPersonMismatch failed:', err);
    return pattern;
  }
}

/** 人称不一致パターンを検出し、違反したものだけ最大1回リトライして書き直す */
async function reconcilePersonMismatches(patterns: ExtractedPattern[], apiKey: string): Promise<ExtractedPattern[]> {
  const violations = patterns.filter(hasFirstPersonViolation);
  if (violations.length === 0) return patterns;

  console.warn(`[analyze-memo] 人称不一致を${violations.length}件検出。FQ/FAを再生成します。`);

  const fixedMap = new Map<ExtractedPattern, ExtractedPattern>();
  for (const p of violations) {
    const fixed = await fixPersonMismatch(apiKey, p);
    fixedMap.set(p, fixed);
    if (hasFirstPersonViolation(fixed)) {
      console.warn('[analyze-memo] 再生成後も人称不一致が残存:', {
        fpp: fixed.fpp_question,
        spp: fixed.spp,
        followup_question: fixed.followup_question,
        followup_answer: fixed.followup_answer,
      });
    }
  }

  return patterns.map(p => fixedMap.get(p) ?? p);
}

async function analyzeLessonMemo(rawMemo: string, categoryNames: string[], directStyle?: '1sentence' | 'multi' | 'pairs'): Promise<AnalyzeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'OPENAI_API_KEY が設定されていません', status: 500 };
  }

  const catBlock =
    categoryNames.length > 0
      ? `次の一覧から意味が最も近いものを1つ選び、**1文字も変えずにそのままコピーして** suggested_category に入れてください。
**「（調整中）」が付いている項目は「（調整中）」ごとコピーすること。括弧は全角（）のまま。勝手に省略・変換しないこと。**
**大項目（「1. 返答」「2. 主観」「3. 短返答」「4. リアクション」「5. 質問返し」）と細目の組み合わせは、一覧にある組み合わせだけを使うこと。**
一覧に無い組み合わせを新たに作らないでください（例: 一覧に「1. 返答：習慣」があるのに「2. 主観：習慣」を作るのは誤り。必ず一覧の「1. 返答：習慣」を選ぶ）。
一覧のどれにも当てはまらないときだけ、新しい名前を「数字. 大項目：細目」形式で付けてください。
【選べる一覧】
${categoryNames.map(n => `- ${n}`).join('\n')}`
      : `suggested_category には、practice-v2 の区分に近い形式（「数字. 大項目：細目」）で付けてください。`;

  const isMulti = directStyle === 'multi';

  const chunkRule = isMulti
    ? `**メモ全体を「1つの会話」として扱ってください。** トピックが複数あっても**分割せず、すべてのQ→Aペアを1チャンク内のペアとして順番通りに並べて抽出**してください。**重複統合（主動詞が同じペアの統合）も適用しないでください**。メモに登場するすべてのQ→Aペアを欠落なく抽出すること。`
    : `**Q→Aのペアを1つずつ独立したチャンクとして抽出してください。** ただし、**FPPで使われる主動詞が同じパターンのチャンクは重複とみなし、最も代表的な1つだけを残してください。**（例：「What are you going to eat?」「Where are you going to eat?」「What time are you going to eat?」はすべて "be going to" で同じ構造なので1チャンクのみ抽出する）`;

  const conversationRule = isMulti
    ? `【会話ルール（【添削ルール】より優先）】
## 人称の一貫性（最重要）
- 抽出したペアは「ひとつながりの会話」です。**話題の主語を途中で入れ替えないこと。**
- **メモの主語をそのまま保持すること。勝手に人称を変換してはならない。**
  - メモが一人称（I / my ~）なら、すべてのペアで受講生自身の話にする。
  - メモが三人称（he / she / my son / my husband など）なら、すべてのペアでその人物の話にする。受講生自身（I / you）の話にすり替えてはならない。

## メモの語を活かす
- メモに出てくる語（例: field trip, zoo）は原則すべて会話内で使う。勝手に捨てて別の内容に置き換えない。

## 単語えらび
- 中学英語で言えることは、必ず中学英語で言う。会話でふつう使わない硬い動詞・書き言葉（commute, reside, consume, attend, obtain, purchase, participate など）は使わない。
- 日本語の熟語を辞書的な1語に置き換えない（❌ I commute by bike. → ⭕️ I go to work by bike.）。`
    : `【会話ルール（【添削ルール】より優先）】
## 1. 人称の一貫性（最重要）
- FPP / SPP / FQ / FA の4行は「ひとつながりの1つの会話」です。**話題の主語を途中で入れ替えてはならない。**
- **メモの主語をそのまま保持すること。勝手に人称を変換してはならない。**
  - メモが一人称（I / my ~）なら、**4行とも受講生自身の話**にする。三人称（he / she）に置き換えるのは重大な誤りです。
  - メモが三人称（he / she / my son / my husband など）なら、**4行ともその人物の話**にする。受講生自身（I / you）にすり替えるのは重大な誤りです。
- 悪い例A（三人称の話に I / you が混入・禁止）:
  SPP「He went to the zoo.」→ FQ「What did you see there?」→ FA「I saw lions and tigers.」
- 悪い例B（一人称メモを三人称に変換・禁止）:
  メモ「I started going to the gym.」→ SPP「He started going to the gym.」

## 2. 会話の入り口
- **メモの主語が三人称のときのみ**、FPP は「その人物が誰なのか」が分かる質問にすること。
  - 悪い例（禁止）:「Where did he go on a field trip?」（he が誰か分からず、実際の会話として成立しない）
  - 良い例:「Where is your son today?」「What did your son do today?」
- **メモの主語が一人称のときは**、受講生本人に向けた通常の質問にすること。例:「What do you do to stay in shape?」

## 3. 口語マーカー（必須）
- FQ は相づち・反応から始める。例:「Oh, nice! ~?」「Really? ~?」「Oh yeah? ~?」「That sounds fun! ~?」「Wow! ~?」「Oh, ~ or something?」
- **相づちは毎回同じ語を使わず、話の内容に合った反応を選ぶこと。**「Oh, nice!」ばかりにしない。
- FA は「短い反応 ＋ 補足」の2段構えにする。例:「Super excited! He couldn't stop talking about it.」
- 教科書の設問・模範解答調は禁止。禁止例:「What did you see there?」「I saw lions and tigers.」

## 4. メモの語を活かす
- メモに出てくる語（例: field trip, zoo）は原則すべて会話内で使う。勝手に捨てて別の内容を創作しない。

## 5. 補完してよい範囲
- FQ / FA はメモに無くても補完してよい。ただし上記 1〜4 をすべて満たすこと。
- 補完する内容は、メモに出てくる人物・場面から自然に続くものに限る。無関係な話題を持ち込まない。

## 6. 単語えらび（ここを外すと台無し）
- 中学英語で言えることは、必ず中学英語で言う。日本語の熟語を辞書的な1語に置き換えない。
  - ❌ I commute by bike. → ⭕️ I go to work by bike. / I ride my bike to work.
  - ❌ I purchase clothes online. → ⭕️ I buy clothes online.
  - ❌ I participate in a meeting. → ⭕️ I join a meeting.
- 会話でふつう使わない硬い動詞・書き言葉（commute, reside, consume, attend, obtain, purchase, participate など）は使わない。
- 迷ったら「中学生が知っている単語だけで言えるか」で選ぶ。言えるならそちらにする。
- **メモ本文に硬い語が書かれていても、平易な語に置き換えること**（意味は変えないので【添削ルール】の「意味変更禁止」には反しない）。
  例: メモ「I commute to my office by train.」→ SPP「I go to my office by train.」

## 7. 教科書反転の禁止（ただし噛み合わせが最優先）
- **大前提: FPP は「SPP がその答えとして自然に成立する」質問であること。** 時制と観点（過去の出来事か／習慣か／好みか）を必ず SPP に合わせる。噛み合っていない質問は最悪の失敗です。
  - ❌ FPP「What do you like to watch?」（好み・現在）→ SPP「I watched a movie last night.」（過去の出来事）＝答えになっていない
  - ❌ FPP「What does your husband do for work?」（職業）→ SPP「My husband went to Osaka for work.」（出張）＝答えになっていない
  - ⭕️ FPP「What did you do last night?」→ SPP「I watched a movie last night.」
- **そのうえで**、FPP を SPP の語順をそのまま裏返しただけの質問にしない。少しずらした自然な入り口にすること。
  - ❌ SPP「He went on a field trip to the zoo.」に対して FPP「Where did he go on a field trip?」（語をそのまま裏返しただけ）
  - ⭕️ SPP「He went on a field trip to the zoo.」に対して FPP「Where is your son today?」（自然な入り口で、かつ答えとして成立する）
- 骨だけの短文を並べない。内容同士の関係（具体化 / 理由 / 頻度 / 対比 / 感想）でつなぐ。
  - ❌ I like sushi. I like salmon. I eat it twice a month.
  - ⭕️ I love sushi, especially salmon. I have it about twice a month.

## 8. 型に寄せない
- つなぎ方・相づち・書き出しを固定しない。**毎回同じ型・同じ書き出しに寄せないこと。**
- 上に挙げた表現はあくまで例。同じ語ばかり使わず、話の内容に合ったものを毎回選ぶ。

【お手本1: メモの主語が三人称のとき】
メモ:
He went on a field trip.
zoo

出力すべき4行（4行とも he のまま）:
- fpp_question: Where is your son today?
- spp: He went on a field trip to the zoo.
- followup_question: Oh, nice! Was he excited this morning?
- followup_answer: Super excited! He couldn't stop talking about it.

【お手本2: メモの主語が一人称のとき】
メモ:
I started going to the gym.
three times a week

出力すべき4行（4行とも I / you のまま。he にしないこと）:
- fpp_question: What do you do to stay in shape?
- spp: I started going to the gym.
- followup_question: Really? How often do you go?
- followup_answer: Three times a week. I'm trying to keep it up.

【お手本3: SPP の主語が無生物で、話題の人物が目的語のとき（最重要）】
メモ:
The movie motivated her.

**このパターンでは SPP の文法上の主語は The movie だが、話題の人物は she（her）。FQ/FA は she のままにすること。「主語を SPP に揃える」と考えて I にしてはならない。**
出力すべき4行（topic_person は third、topic_pronoun は "she / her"）:
- fpp_question: What made your daughter study so hard?
- spp: The movie motivated her.
- followup_question: Wow! What did she say about it?
- followup_answer: She loved it. She said it was so inspiring.

**なお、SPP→FQ で話題を「あなたはどう？」と受講生自身に転換するのは自然な会話であり許可される。その場合 FA は I で答えて良い（FQ 自体が誰について聞いているかに合わせること）。**
悪い例（禁止。FQ は she について聞いているのに FA が I になっている）:
- followup_question: Wow! What did she think about it?
- followup_answer: Oh, I love that movie! It's so inspiring! ← FQ は she について聞いているのに FA が I にすり替わっている。誤り。

良い例（OK。SPP は娘の話でも、FQ が「あなたは？」に話題転換すれば FA は I でよい）:
- followup_question: Do you like the movie as well?
- followup_answer: Oh, I love that movie! It's so inspiring! ← FQ 自体が「あなた」について聞いているので、FA が I なのは正しい。`;

  const userPrompt = `以下は英会話レッスン後の先生メモです（日本語・英語混在可）。パターンプラクティス教材用に構造化してください。

${chunkRule}

【先生メモ】
${rawMemo}

【出力ルール】
- 返答は必ず {"patterns": [...]} 形式の JSON のみ。前後に説明文を書かない。
- **各パターンのJSONキーは topic_person, topic_pronoun を先頭に置き、その後で fpp_question 以降を書くこと。** 話題の主体を先に確定させてから4行を生成するため。
${isMulti
  ? `- **メモ内のQ→Aペア1つ = patterns 配列の1要素。** メモに3ペアあるなら patterns は3要素になる。**複数ペアを1要素にまとめないこと。**
- 各パターンの fpp_question と spp は必須（空文字不可）。
- **followup_question と followup_answer は必ず空文字 "" にする。補完してはならない。**（次ペアと内容が混ざるため）
- situation_ja は会話全体の状況を、すべての要素に同じ文字列で入れる。
- 英語のセリフ（fpp_question / spp）は下記【添削ルール】に従って整えること:`
  : `- patterns は配列。メモ内の Q→A ペアの数だけ要素を作ること。
- 各パターンのキーはすべて必須（空文字 "" は不可）。英語のセリフ（fpp_question / spp / followup_question / followup_answer）は下記【添削ルール】に従って整えること:`}

${conversationRule}

【添削ルール】
# ROLE
あなたはプロの英会話講師。目的は「日本人中級者がそのまま口に出せる自然な口語英語」に最小修正で整えること。

# OBJECTIVE
入力英文を「意味を変えず」「最小修正」で自然な会話英語にする。

# PRIORITY（必ずこの順）
1. 文法（冠詞・前置詞・語順）※「通じるが教科書的」な前置詞ゆれも修正対象
2. 口語化（短縮形・自然表現）
3. リズム（話しやすさ）

# RULES（英文を「整形」する際の厳守事項）
- 入力英文の修正は最大2箇所まで
- 入力英文の語順変更は1回まで
- **メモに実在する英文**の意味変更・情報追加は禁止（メモに無い FQ / FA の新規補完はこの制限の対象外。【会話ルール】に従うこと）
- 大幅な書き換え禁止
- 「既に自然」とは**ネイティブが日常会話で実際に使う語法**を指す。文法的に通じるだけでは「自然」とみなさない

${isMulti
  ? '※ followup_question / followup_answer は補完しない（必ず空文字 "" にする）。'
  : '※ ただし followup_question / followup_answer がメモに無い場合は、自然な流れで補完してよい（補完文も上記 STYLE に従う）。'}

# STYLE
- 既存の Pattern Practice で使用されている英語に近いもの（変更する場合）
- 短縮形を優先（I'm, don't, gonna など）
- フォーマル→口語に調整（I would like to → I'd like to）
- 前置詞ゆれは慣用的に自然な方を優先（例: important for → important to / good in → good at / married with → married to / different than → different from / interested on → interested in）

【各キーの定義】
  - topic_person … **必ず他のキーより先に決めること。** このチャンクの話題の主体が受講生自身なら "self"、第三者（息子・夫・友人など）なら "third"。
      4行（fpp_question / spp / followup_question / followup_answer）を書く前に topic_person を確定させ、以降その人称を最後まで一貫させること。
  - topic_pronoun … topic_person が "third" のときにその人物を指す代名詞（例: "she / her" "he / his"）。topic_person が "self" のときは空文字 ""。
  - situation_ja … 受講生向けの状況説明（日本語。そのFPPが飛んでくる場面が分かるように）。**話題の人物を必ず具体的に書くこと。「彼が」「彼女が」と書くのは禁止。**
      メモが he / she でも、FPP で your son / your husband と特定したなら situation_ja も「息子さんが」「ご主人が」と書く。受講生自身の話なら「自分が」と書く。
      例:「息子さんが動物園へ遠足に行った話を聞かれる場面」${isMulti ? '。会話モードでは全要素に同じ文字列を入れる。' : ''}
  - fpp_question … 相手（講師側）の質問
  - spp … 受講生の模範回答（**1文のみ・短く簡潔に**。メモに複数文あっても最初の1文だけ使うこと）
  - followup_question … ${isMulti ? '**会話モードでは必ず空文字 ""**' : 'SPP に自然につながるフォロー質問。**必ず相づち・反応から始める**（【会話ルール】3）。SPP と同じ人物・同じ主語について尋ねること（【会話ルール】1）'}
  - followup_answer … ${isMulti ? '**会話モードでは必ず空文字 ""**' : `**FQ が尋ねている対象（話題転換後の対象も含む）に合わせて答えること。** topic_person / topic_pronoun は FPP/SPP の一貫性の目安であり、FQ で「あなたは？」に話題転換した場合はその対象（受講生自身）に合わせて I で答えてよい。「主語を SPP に揃える」のではなく「FQ が誰について聞いているか」に揃えること。
      **メモに既に FQ/FA が書かれておりそれを添削する場合も、話題の人称・対象人物を変更してはならない。**（是正してよいのは文法・口語化のみ。質問や返答が「誰について」かという意味を変えるのは【添削ルール】違反）
      **「短い反応 ＋ 補足」の2文構成**（【会話ルール】3）`}
  - character … 会話相手が「夫」なら "夫"、それ以外は "友人"
  - title_en … **そのチャンクで練習する「型」**を短く書く（教材の見出しになる。英文をそのまま入れないこと）。
      **必ず SPP（受講生が言う側）の骨組みから作ること。** 形は「主語＋キーとなる語＋ ~」。
      例: SPP「I usually cook breakfast.」→「I usually ~」／ SPP「I don't really run.」→「I don't really ~」
      **禁止:** FPP（相手の質問）から作ること。FA から作ること。疑問文を見出しにすること。
      - ❌ SPP「Yes, we do have it in triple XL.」に対して title_en「Do you have ~」（FPP から取っている）
      - ⭕️ 同じ SPP に対して title_en「Yes, we do have ~」
      長い文をそのまま入れない（**最大30文字程度**）。
  - title_jp … title_en の短い和訳（例:「〜するつもり」「〜へ行った」「たいてい〜する」。**最大20文字程度**）
  - suggested_category … 下記【カテゴリの選び方】に従う

【カテゴリの選び方】
${catBlock}

${isMulti
  ? `JSON の例（Q→Aが3ペアの会話なら patterns は3要素。FQ/FAは必ず ""）:
{"patterns":[{"topic_person":"self","topic_pronoun":"","situation_ja":"...","title_en":"...","title_jp":"...","fpp_question":"...","spp":"...","followup_question":"","followup_answer":"","character":"友人","suggested_category":"..."},{"topic_person":"self","topic_pronoun":"","situation_ja":"...","title_en":"...","title_jp":"...","fpp_question":"...","spp":"...","followup_question":"","followup_answer":"","character":"友人","suggested_category":"..."}]}`
  : `JSON の例（Q→Aが4つある場合は4要素）:
{"patterns":[{"topic_person":"third","topic_pronoun":"he / his","situation_ja":"息子さんが動物園へ遠足に行った話を聞かれる場面","title_en":"He went on ~","title_jp":"〜に行った","fpp_question":"Where is your son today?","spp":"He went on a field trip to the zoo.","followup_question":"Oh, nice! Was he excited this morning?","followup_answer":"Super excited! He couldn't stop talking about it.","character":"友人","suggested_category":"1. 返答：過去"}]}`}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: LESSON_AI_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You extract structured English teaching material from teacher notes. Reply with a single valid JSON object only, no markdown fences.',
        },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.45,
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

  // isMulti は FQ/FA が常に空文字のため対象外。人称不一致（third なのに FA が一人称）だけ検出して1回だけ書き直す。
  const finalPatterns = isMulti ? patterns : await reconcilePersonMismatches(patterns, apiKey);

  return { ok: true, patterns: finalPatterns };
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
          title_en: '',
          title_jp: '',
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
          title_en: '',
          title_jp: '',
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
      model: LESSON_AI_MODEL,
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

  let intent: string = 'submit-preview';
  let studentName: string | undefined;

  try {
  intent = body.intent ?? 'submit-preview';
  studentName = body.studentName?.trim() || undefined;

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
    const result = await analyzeLessonMemo(raw, categoryNames, body.directStyle);
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
      message: body.directStyle === 'multi'
        ? `${result.patterns.length}ペアを解析しました。1チャンクとして保存されます。`
        : `${result.patterns.length}パターンを解析しました。`,
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
          titleEn: p.title_en ?? '',
          titleJp: p.title_jp ?? '',
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
      await logError('lesson-submission', e, { status: 500, studentName, context: { intent, phase: 'persistConversationLesson' } });
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

  } catch (e) {
    await logError('lesson-submission', e, { status: 500, studentName, context: { intent } });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
