'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Chunk {
  id: number;
  chunkNumber: number;
  titleEn: string;
  titleJp: string;
  patternCount: number;
  audioCount: number;
}

interface Category {
  id: number;
  type: string;
  name: string;
  chunks: Chunk[];
}

interface Props {
  categories: Category[];
}

export default function TeacherDashboardClient({ categories }: Props) {
  const [expandedChunk, setExpandedChunk] = useState<number | null>(null);
  const [patterns, setPatterns] = useState<Record<number, unknown[]>>({});
  const [generating, setGenerating] = useState<Record<number, boolean>>({});

  const loadPatterns = async (chunkId: number) => {
    if (expandedChunk === chunkId) {
      setExpandedChunk(null);
      return;
    }
    setExpandedChunk(chunkId);

    if (patterns[chunkId]) return;

    const res = await fetch(`/api/patterns?chunkId=${chunkId}`);
    const data = await res.json();
    setPatterns((prev) => ({ ...prev, [chunkId]: data.patterns }));
  };

  const generateAudio = async (patternId: number) => {
    setGenerating((prev) => ({ ...prev, [patternId]: true }));

    try {
      const res = await fetch('/api/audio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patternId }),
      });
      const result = await res.json();
      alert(`音声生成完了: ${JSON.stringify(result.results)}`);

      // パターンリスト再読み込み
      if (expandedChunk) {
        const res2 = await fetch(`/api/patterns?chunkId=${expandedChunk}`);
        const data2 = await res2.json();
        setPatterns((prev) => ({ ...prev, [expandedChunk!]: data2.patterns }));
      }
    } catch (err) {
      alert('音声生成エラー: ' + (err as Error).message);
    }

    setGenerating((prev) => ({ ...prev, [patternId]: false }));
  };

  const generateAllAudio = async (chunkId: number) => {
    const chunkPatterns = patterns[chunkId];
    if (!chunkPatterns) return;

    for (const p of chunkPatterns) {
      const pattern = p as { id: number; has_fpp_question_audio: boolean; has_spp_audio: boolean };
      if (!pattern.has_fpp_question_audio || !pattern.has_spp_audio) {
        await generateAudio(pattern.id);
      }
    }
  };

  // タイプごとにグルーピング
  const grouped = new Map<string, Category[]>();
  for (const cat of categories) {
    const existing = grouped.get(cat.type) || [];
    existing.push(cat);
    grouped.set(cat.type, existing);
  }

  return (
    <div>
      {Array.from(grouped.entries()).map(([type, cats]) => (
        <div key={type} className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            {type}
          </h2>
          {cats.map((cat) => (
            <div key={cat.id} className="mb-4">
              <h3 className="text-base font-medium text-zinc-300 mb-2">{cat.name}</h3>
              <div className="space-y-1">
                {cat.chunks.map((chunk) => (
                  <div key={chunk.id}>
                    <button
                      onClick={() => loadPatterns(chunk.id)}
                      className="w-full flex justify-between items-center bg-zinc-900 rounded-lg p-3 hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div>
                        <span className="text-white text-sm">{chunk.titleEn}</span>
                        {chunk.titleJp && (
                          <span className="text-zinc-500 text-xs ml-2">{chunk.titleJp}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-zinc-500">{chunk.patternCount}問</span>
                        <span className={chunk.audioCount >= chunk.patternCount ? 'text-green-500' : 'text-yellow-500'}>
                          {chunk.audioCount}/{chunk.patternCount} 音声
                        </span>
                        <span className="text-zinc-600">
                          {expandedChunk === chunk.id ? '▲' : '▼'}
                        </span>
                      </div>
                    </button>

                    {expandedChunk === chunk.id && patterns[chunk.id] && (
                      <div className="ml-4 mt-1 space-y-2">
                        <div className="flex gap-2 mb-2">
                          <button
                            onClick={() => generateAllAudio(chunk.id)}
                            className="px-3 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-500"
                          >
                            未生成の音声を一括生成
                          </button>
                        </div>
                        {(patterns[chunk.id] as Array<{
                          id: number;
                          set_number: number;
                          situation: string;
                          fpp_intro: string | null;
                          fpp_question: string;
                          spp: string;
                          character: string;
                          has_fpp_intro_audio: boolean;
                          has_fpp_question_audio: boolean;
                          has_spp_audio: boolean;
                        }>).map((p) => (
                          <div key={p.id} className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-zinc-400 text-xs">セット{p.set_number} / {p.character}</span>
                              <div className="flex gap-1">
                                {p.has_fpp_question_audio && <span className="text-green-500 text-xs">FPP</span>}
                                {p.has_spp_audio && <span className="text-green-500 text-xs">SPP</span>}
                                {(!p.has_fpp_question_audio || !p.has_spp_audio) && (
                                  <button
                                    onClick={() => generateAudio(p.id)}
                                    disabled={generating[p.id]}
                                    className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-500 disabled:opacity-50"
                                  >
                                    {generating[p.id] ? '生成中...' : '音声生成'}
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-zinc-400 text-xs mb-1">{p.situation}</p>
                            {p.fpp_intro && <p className="text-zinc-300 text-sm italic">{p.fpp_intro}</p>}
                            <p className="text-white text-sm font-medium">{p.fpp_question}</p>
                            <p className="text-green-400 text-sm mt-1">{p.spp}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
