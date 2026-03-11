// InspectedContents.md パーサー
// 3つのフォーマットに対応:
// 1. FPP前振り: + FPP質問: （チャンク回答の一部）
// 2. trigger: （チャンク回答の一部）
// 3. FPP: （短返答、リアクション、質問返し、再構成、共感）

export interface ParsedCategory {
  type: string;
  name: string;
  chunks: ParsedChunk[];
}

export interface ParsedChunk {
  chunkNumber: number;
  titleEn: string;
  titleJp: string;
  patterns: ParsedPattern[];
}

export interface ParsedPattern {
  setNumber: number;
  situation: string;
  fppIntro: string | null;
  fppQuestion: string;
  spp: string;
}

export function parseInspectedContents(content: string): ParsedCategory[] {
  const categories: ParsedCategory[] = [];
  const lines = content.split('\n');

  let currentType = '';
  let currentName = '';
  let currentChunks: ParsedChunk[] = [];
  let currentChunk: ParsedChunk | null = null;
  let currentPattern: Partial<ParsedPattern> | null = null;
  let inSet = false;

  function pushCategory() {
    if (currentName && currentChunks.length > 0) {
      categories.push({
        type: currentType,
        name: currentName,
        chunks: [...currentChunks],
      });
    }
  }

  function pushChunk() {
    if (currentChunk && currentChunk.patterns.length > 0) {
      currentChunks.push({ ...currentChunk });
    }
  }

  function pushPattern() {
    if (currentPattern && currentPattern.situation && currentPattern.fppQuestion && currentPattern.spp) {
      if (currentChunk) {
        currentChunk.patterns.push({
          setNumber: currentPattern.setNumber || 1,
          situation: currentPattern.situation,
          fppIntro: currentPattern.fppIntro || null,
          fppQuestion: currentPattern.fppQuestion,
          spp: currentPattern.spp,
        });
      }
    }
    currentPattern = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // ## レベル: カテゴリタイプ（チャンク回答、短返答、リアクション、質問返し、再構成、共感）
    if (line.startsWith('## ')) {
      pushPattern();
      pushChunk();
      pushCategory();

      const typeMatch = line.match(/^## (?:\d+\.\s*)?(.+?)(?:\s+\d+チャンク.*)?$/);
      if (typeMatch) {
        currentType = typeMatch[1].trim();
        // タイプが直接カテゴリの場合もある（再構成、共感など）
        // 次の###がなければこのタイプ=名前
        currentName = '';
        currentChunks = [];
        currentChunk = null;
      }
      continue;
    }

    // ### レベル: カテゴリ名（未来、現在、過去... or 確信度、程度...）
    if (line.startsWith('### ')) {
      pushPattern();
      pushChunk();

      // 前のカテゴリをpush（同じtype内の別name）
      if (currentName && currentChunks.length > 0) {
        categories.push({
          type: currentType,
          name: currentName,
          chunks: [...currentChunks],
        });
      }

      const nameMatch = line.match(/^### (.+?)\s+\d+チャンク/);
      if (nameMatch) {
        currentName = nameMatch[1].trim();
      }
      currentChunks = [];
      currentChunk = null;
      continue;
    }

    // #### レベル: チャンク（1. I'm gonna ~ 等）
    if (line.startsWith('#### ')) {
      pushPattern();
      pushChunk();

      const chunkMatch = line.match(/^#### (\d+)\.\s*(.+?)(?:（(.+?)）)?$/);
      if (chunkMatch) {
        // ## がカテゴリ名なしで直接チャンクに来る場合（再構成、共感）
        if (!currentName && currentType) {
          currentName = currentType;
          currentChunks = [];
        }
        currentChunk = {
          chunkNumber: parseInt(chunkMatch[1]),
          titleEn: chunkMatch[2].trim(),
          titleJp: chunkMatch[3]?.trim() || '',
          patterns: [],
        };
      }
      continue;
    }

    // ##### セットN
    if (line.startsWith('##### セット')) {
      pushPattern();
      const setMatch = line.match(/セット(\d+)/);
      currentPattern = {
        setNumber: setMatch ? parseInt(setMatch[1]) : 1,
      };
      inSet = true;
      continue;
    }

    if (!inSet || !currentPattern) continue;

    // situation:
    if (line.startsWith('situation:')) {
      currentPattern.situation = line.replace('situation:', '').trim();
      continue;
    }

    // FPP前振り: （フォーマット1）
    if (line.startsWith('FPP前振り:')) {
      const val = line.replace('FPP前振り:', '').trim();
      currentPattern.fppIntro = val === '（なし）' ? null : val;
      continue;
    }

    // FPP質問: （フォーマット1）
    if (line.startsWith('FPP質問:')) {
      currentPattern.fppQuestion = line.replace('FPP質問:', '').trim();
      continue;
    }

    // trigger: （フォーマット2）
    if (line.startsWith('trigger:')) {
      currentPattern.fppQuestion = line.replace('trigger:', '').trim();
      currentPattern.fppIntro = null;
      continue;
    }

    // FPP: （フォーマット3 - 短返答・リアクション・質問返し等）
    if (line.startsWith('FPP:')) {
      currentPattern.fppQuestion = line.replace('FPP:', '').trim();
      currentPattern.fppIntro = null;
      continue;
    }

    // SPP:
    if (line.startsWith('SPP:')) {
      currentPattern.spp = line.replace('SPP:', '').trim();
      continue;
    }
  }

  // 最後のパターン/チャンク/カテゴリをpush
  pushPattern();
  pushChunk();
  pushCategory();

  return categories;
}
