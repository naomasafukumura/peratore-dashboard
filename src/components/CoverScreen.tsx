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

const chkSvg = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const arrowSvg = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const micSvg = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" x2="12" y1="19" y2="22"/>
  </svg>
);

export default function CoverScreen({ categories }: Props) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [selectedChunks, setSelectedChunks] = useState<Set<number>>(new Set());

  // カテゴリごとにグルーピング
  const grouped = new Map<string, Category[]>();
  for (const cat of categories) {
    const existing = grouped.get(cat.type) || [];
    existing.push(cat);
    grouped.set(cat.type, existing);
  }

  const toggleExpand = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleChunk = (chunkId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedChunks(prev => {
      const next = new Set(prev);
      if (next.has(chunkId)) next.delete(chunkId);
      else next.add(chunkId);
      return next;
    });
  };

  const toggleAllInType = (type: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const cats = grouped.get(type) || [];
    const allChunkIds = cats.flatMap(c => c.chunks.map(ch => ch.id));
    const allSelected = allChunkIds.every(id => selectedChunks.has(id));
    setSelectedChunks(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allChunkIds.forEach(id => next.delete(id));
      } else {
        allChunkIds.forEach(id => next.add(id));
      }
      return next;
    });
    // Also expand
    if (!expandedTypes.has(type)) {
      setExpandedTypes(prev => new Set(prev).add(type));
    }
  };

  const hasSelection = selectedChunks.size > 0;

  // 選択されたチャンクの最初のIDで練習を開始
  const firstSelectedChunkId = selectedChunks.size > 0 ? Array.from(selectedChunks)[0] : null;

  return (
    <div className="app">
      <div className="cover">
        {/* Header */}
        <div className="cv-top">
          <div className="cv-mark">PP</div>
          <div className="cv-brand">Pattern Practice</div>
          <div className="cv-top-spacer" />
          <Link href="/" className="cv-list-btn" style={{ textDecoration: 'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </Link>
        </div>

        {/* Hero */}
        <div className="cv-hero">
          <div className="cv-title"><span className="cv-hl">Pattern</span> Practice</div>
        </div>

        {/* Categories */}
        <div className="cv-sec">
          <div className="cv-sec-hdr">Category</div>
          <div className="cv-cats">
            {Array.from(grouped.entries()).map(([type, cats]) => {
              const totalPatterns = cats.reduce((s, c) => s + c.chunks.reduce((s2, ch) => s2 + ch.patternCount, 0), 0);
              const allChunkIds = cats.flatMap(c => c.chunks.map(ch => ch.id));
              const allSelected = allChunkIds.length > 0 && allChunkIds.every(id => selectedChunks.has(id));
              const isExpanded = expandedTypes.has(type);

              return (
                <div key={type}>
                  {/* Category row */}
                  <div
                    className={`cv-cat ${allSelected ? 'on' : ''} ${isExpanded ? 'expanded' : ''}`}
                    onClick={() => toggleExpand(type)}
                  >
                    <div className={`cv-cat-ic`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/>
                      </svg>
                    </div>
                    <div className="cv-cat-info">
                      <div className="cv-cat-nm">{type}</div>
                      <div className="cv-cat-ct">{totalPatterns} patterns</div>
                    </div>
                    <div className="cv-cat-chk" onClick={(e) => toggleAllInType(type, e)}>
                      {chkSvg}
                    </div>
                    <div className="cv-cat-arrow">{arrowSvg}</div>
                  </div>

                  {/* Subcategories (chunks) */}
                  <div className={`cv-subs ${isExpanded ? 'show' : ''}`}>
                    {cats.map((cat) => (
                      cat.chunks.map((chunk) => {
                        const isOn = selectedChunks.has(chunk.id);
                        return (
                          <div
                            key={chunk.id}
                            className={`cv-sub ${isOn ? 'on' : ''}`}
                            onClick={(e) => toggleChunk(chunk.id, e)}
                          >
                            <div className="cv-sub-nm">{chunk.titleEn}</div>
                            <div className="cv-sub-ct">{chunk.patternCount}</div>
                            <div className="cv-sub-chk">{chkSvg}</div>
                          </div>
                        );
                      })
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="cv-cta">
          {hasSelection && firstSelectedChunkId ? (
            <Link
              href={`/practice/${firstSelectedChunkId}`}
              className="cv-go"
              style={{ textDecoration: 'none' }}
            >
              {micSvg}
              Pattern Practice
            </Link>
          ) : (
            <button className="cv-go" disabled>
              {micSvg}
              Pattern Practice
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
