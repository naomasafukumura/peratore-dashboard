'use client';

import { useState } from 'react';

interface PreviewPattern {
  situation: string;
  fppIntro: string | null;
  fppQuestion: string;
  spp: string;
  setNumber: number;
}

interface PreviewChunk {
  chunkNumber: number;
  titleEn: string;
  titleJp: string;
  patterns: PreviewPattern[];
}

interface PreviewCategory {
  type: string;
  name: string;
  chunks: PreviewChunk[];
}

function parseMarkdown(content: string): PreviewCategory[] {
  const categories: PreviewCategory[] = [];
  const lines = content.split('\n');

  let currentType = '';
  let currentName = '';
  let currentChunks: PreviewChunk[] = [];
  let currentChunk: PreviewChunk | null = null;
  let currentPattern: Partial<PreviewPattern> | null = null;
  let inSet = false;

  function pushCategory() {
    if (currentName && currentChunks.length > 0) {
      categories.push({ type: currentType, name: currentName, chunks: [...currentChunks] });
    }
  }
  function pushChunk() {
    if (currentChunk && currentChunk.patterns.length > 0) currentChunks.push({ ...currentChunk });
  }
  function pushPattern() {
    if (currentPattern?.situation && currentPattern?.fppQuestion && currentPattern?.spp && currentChunk) {
      currentChunk.patterns.push({
        setNumber: currentPattern.setNumber || 1,
        situation: currentPattern.situation,
        fppIntro: currentPattern.fppIntro || null,
        fppQuestion: currentPattern.fppQuestion,
        spp: currentPattern.spp,
      });
    }
    currentPattern = null;
  }

  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('## ')) {
      pushPattern(); pushChunk(); pushCategory();
      const m = l.match(/^## (?:\d+\.\s*)?(.+?)(?:\s+\d+チャンク.*)?$/);
      if (m) { currentType = m[1].trim(); currentName = ''; currentChunks = []; currentChunk = null; }
    } else if (l.startsWith('### ')) {
      pushPattern(); pushChunk();
      if (currentName && currentChunks.length > 0) categories.push({ type: currentType, name: currentName, chunks: [...currentChunks] });
      const m = l.match(/^### (.+?)\s+\d+チャンク/);
      if (m) currentName = m[1].trim();
      currentChunks = []; currentChunk = null;
    } else if (l.startsWith('#### ')) {
      pushPattern(); pushChunk();
      const m = l.match(/^#### (\d+)\.\s*(.+?)(?:（(.+?)）)?$/);
      if (m) {
        if (!currentName && currentType) { currentName = currentType; currentChunks = []; }
        currentChunk = { chunkNumber: parseInt(m[1]), titleEn: m[2].trim(), titleJp: m[3]?.trim() || '', patterns: [] };
      }
    } else if (l.startsWith('##### セット')) {
      pushPattern();
      const m = l.match(/セット(\d+)/);
      currentPattern = { setNumber: m ? parseInt(m[1]) : 1 };
      inSet = true;
    } else if (inSet && currentPattern) {
      if (l.startsWith('situation:')) currentPattern.situation = l.replace('situation:', '').trim();
      else if (l.startsWith('FPP前振り:')) { const v = l.replace('FPP前振り:', '').trim(); currentPattern.fppIntro = v === '（なし）' ? null : v; }
      else if (l.startsWith('FPP質問:')) currentPattern.fppQuestion = l.replace('FPP質問:', '').trim();
      else if (l.startsWith('trigger:')) { currentPattern.fppQuestion = l.replace('trigger:', '').trim(); currentPattern.fppIntro = null; }
      else if (l.startsWith('FPP:')) { currentPattern.fppQuestion = l.replace('FPP:', '').trim(); currentPattern.fppIntro = null; }
      else if (l.startsWith('SPP:')) currentPattern.spp = l.replace('SPP:', '').trim();
    }
  }
  pushPattern(); pushChunk(); pushCategory();
  return categories;
}

export default function ImportPage() {
  const [markdown, setMarkdown] = useState('');
  const [preview, setPreview] = useState<PreviewCategory[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handlePreview = () => {
    const parsed = parseMarkdown(markdown);
    setPreview(parsed);
    setResult(null);
  };

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    setResult(null);

    let total = 0;
    for (const cat of preview) {
      for (const chunk of cat.chunks) {
        for (const pattern of chunk.patterns) {
          // まずchunkIdを取得（既存チャンクを使うか新規作成）
          const res = await fetch('/api/patterns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chunkId: chunk.chunkNumber, // TODO: 実際のchunkIdに変換が必要
              setNumber: pattern.setNumber,
              situation: pattern.situation,
              fppIntro: pattern.fppIntro,
              fppQuestion: pattern.fppQuestion,
              spp: pattern.spp,
            }),
          });
          if (res.ok) total++;
        }
      }
    }

    setResult(`${total}パターンをインポートしました`);
    setImporting(false);
  };

  const totalPatterns = preview?.reduce((sum, cat) =>
    sum + cat.chunks.reduce((s, ch) => s + ch.patterns.length, 0), 0) || 0;

  return (
    <div className="min-h-screen bg-zinc-950 pb-20">
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex items-center gap-4 mb-6">
          <a href="/teacher" className="text-zinc-400 hover:text-white">← 戻る</a>
          <h1 className="text-xl font-bold text-white">一括インポート</h1>
        </div>

        <div className="mb-4">
          <p className="text-zinc-400 text-sm mb-2">
            InspectedContents.md形式のMarkdownを貼り付けてください
          </p>
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            className="w-full h-64 bg-zinc-900 border border-zinc-700 rounded-lg p-4 text-white text-sm font-mono resize-y focus:outline-none focus:border-blue-500"
            placeholder={`## チャンク回答\n\n### 未来 4チャンク / 12問\n\n#### 1. I'm gonna ~（〜する予定だよ）\n\n##### セット1\nsituation: ...\nFPP前振り: ...\nFPP質問: ...\nSPP: ...`}
          />
        </div>

        <div className="flex gap-3 mb-6">
          <button
            onClick={handlePreview}
            disabled={!markdown.trim()}
            className="px-4 py-2 bg-zinc-700 text-white rounded-lg text-sm font-medium hover:bg-zinc-600 disabled:opacity-50"
          >
            プレビュー
          </button>
          {preview && (
            <button
              onClick={handleImport}
              disabled={importing || totalPatterns === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              {importing ? 'インポート中...' : `${totalPatterns}パターンをインポート`}
            </button>
          )}
        </div>

        {result && (
          <div className="bg-green-900/50 border border-green-700 rounded-lg p-4 mb-6">
            <p className="text-green-300">{result}</p>
          </div>
        )}

        {preview && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">プレビュー ({totalPatterns}パターン)</h2>
            {preview.map((cat, ci) => (
              <div key={ci} className="bg-zinc-900 rounded-lg p-4">
                <h3 className="text-zinc-300 font-medium mb-2">{cat.type} / {cat.name}</h3>
                {cat.chunks.map((chunk, chi) => (
                  <div key={chi} className="ml-4 mb-3">
                    <p className="text-white text-sm font-medium">
                      {chunk.chunkNumber}. {chunk.titleEn} {chunk.titleJp && `（${chunk.titleJp}）`}
                    </p>
                    {chunk.patterns.map((p, pi) => (
                      <div key={pi} className="ml-4 mt-1 text-xs">
                        <span className="text-zinc-500">セット{p.setNumber}:</span>
                        <span className="text-zinc-400 ml-1">{p.situation.substring(0, 40)}...</span>
                        <span className="text-green-400 ml-2">{p.spp}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
