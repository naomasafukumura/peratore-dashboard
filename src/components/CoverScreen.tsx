'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Chunk {
  id: number;
  chunkNumber: number;
  titleEn: string;
  titleJp: string;
  patternCount: number;
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

export default function CoverScreen({ categories }: Props) {
  const [expandedType, setExpandedType] = useState<string | null>(null);

  const grouped = new Map<string, Category[]>();
  for (const cat of categories) {
    const existing = grouped.get(cat.type) || [];
    existing.push(cat);
    grouped.set(cat.type, existing);
  }

  return (
    <div className="min-h-screen bg-bg-page pb-20">
      <header className="bg-bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-text-muted hover:text-text-dark transition-colors">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <h1 className="text-lg font-bold text-text-dark">練習するチャンクを選ぼう</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 mt-6 space-y-3">
        {Array.from(grouped.entries()).map(([type, cats]) => {
          const totalPatterns = cats.reduce((s, c) => s + c.chunks.reduce((s2, ch) => s2 + ch.patternCount, 0), 0);
          const totalChunks = cats.reduce((s, c) => s + c.chunks.length, 0);
          const isExpanded = expandedType === type;

          return (
            <div key={type}>
              {/* カテゴリヘッダー（アコーディオン） */}
              <button
                onClick={() => setExpandedType(isExpanded ? null : type)}
                className="w-full bg-bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] border border-border p-4 flex items-center justify-between hover:shadow-[var(--shadow-card-hover)] transition-all active:scale-[0.98]"
              >
                <div className="text-left">
                  <p className="font-semibold text-text-dark">{type}</p>
                  <p className="text-xs text-text-muted mt-0.5">{totalChunks}チャンク / {totalPatterns}問</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-cta bg-primary/20 px-2.5 py-1 rounded-full">
                    {totalPatterns}
                  </span>
                  <svg
                    width="16" height="16" viewBox="0 0 16 16" fill="none"
                    className={`text-text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </button>

              {/* チャンク一覧 */}
              {isExpanded && (
                <div className="mt-2 ml-2 space-y-2">
                  {cats.map((cat) => (
                    <div key={cat.id}>
                      {cat.name !== cat.type && (
                        <p className="text-xs font-medium text-text-muted mb-1.5 px-2">{cat.name}</p>
                      )}
                      {cat.chunks.map((chunk) => (
                        <Link
                          key={chunk.id}
                          href={`/practice/${chunk.id}`}
                          className="block bg-bg-card rounded-[var(--radius-card)] p-3.5 shadow-[var(--shadow-card)] border border-border hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 active:scale-[0.98] transition-all mb-2"
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium text-text-dark text-sm">{chunk.titleEn}</p>
                              {chunk.titleJp && (
                                <p className="text-text-light text-xs mt-0.5">{chunk.titleJp}</p>
                              )}
                            </div>
                            <span className="text-xs text-text-light bg-bg-page px-2 py-0.5 rounded-full">
                              {chunk.patternCount}問
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
