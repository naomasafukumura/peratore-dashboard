'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

type SummaryItem = {
  patternId: number;
  categoryName: string;
  section: string;
  trigger: string;
  spp: string;
  followupQuestion: string;
  followupAnswer: string;
  situationJa: string;
  createdAt: string | null;
};

type Props = {
  summary: SummaryItem[];
  categoryLabel: string;
};

export function LessonReviewSection({ summary, categoryLabel }: Props) {
  const [query, setQuery] = useState('');
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [openItemIds, setOpenItemIds] = useState<Set<number>>(new Set());

  // 検索フィルタ
  const filtered = useMemo(() => {
    if (!query.trim()) return summary;
    const q = query.trim().toLowerCase();
    return summary.filter(
      (item) =>
        item.trigger.toLowerCase().includes(q) ||
        item.spp.toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q) ||
        item.section.toLowerCase().includes(q),
    );
  }, [summary, query]);

  // 年度別 → 月別グループ化
  const yearGroups = useMemo(() => {
    const yMap = new Map<string, Map<string, SummaryItem[]>>();
    for (const item of filtered) {
      const d = item.createdAt ? new Date(item.createdAt) : null;
      const year =
        d && !isNaN(d.getTime()) ? `${d.getFullYear()}年` : '日付不明';
      const month =
        d && !isNaN(d.getTime())
          ? `${d.getFullYear()}年${d.getMonth() + 1}月`
          : '日付不明';
      if (!yMap.has(year)) yMap.set(year, new Map());
      const mMap = yMap.get(year)!;
      if (!mMap.has(month)) mMap.set(month, []);
      mMap.get(month)!.push(item);
    }
    return yMap;
  }, [filtered]);

  const toggle = (key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const yearCount = (yMap: Map<string, SummaryItem[]>) => {
    let c = 0;
    for (const items of yMap.values()) c += items.length;
    return c;
  };

  return (
    <section className="mt-6 rounded-xl border border-border bg-bg-card p-4">
      <h2 className="text-sm font-semibold text-text-dark">{categoryLabel}</h2>
      <p className="mt-1 text-xs text-text-muted">
        全 {summary.length} 件{query.trim() && `（検索結果: ${filtered.length} 件）`}
      </p>

      {/* 検索バー */}
      <div className="mt-3 relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例文を検索..."
          className="w-full px-3 py-2 bg-bg-page border border-border rounded-xl text-sm placeholder:text-text-faint"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-dark text-lg leading-none px-1"
          >
            ×
          </button>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="mt-4 text-xs text-text-muted">該当する例文がありません。</p>
      )}

      {/* 年度別 → 月別 */}
      {Array.from(yearGroups.entries()).map(([year, monthMap]) => {
        const yCollapsed = collapsedKeys.has(year);
        return (
          <div key={year} className="mt-4">
            <button
              type="button"
              onClick={() => toggle(year)}
              className="w-full flex items-center justify-between text-left text-sm font-semibold text-text-dark bg-bg-page border border-border rounded-xl px-3 py-2 hover:bg-primary/10"
            >
              <span>{year}（{yearCount(monthMap)}件）</span>
              <span className="text-text-muted text-xs">{yCollapsed ? '▶' : '▼'}</span>
            </button>

            {!yCollapsed &&
              Array.from(monthMap.entries()).map(([month, items]) => {
                const mCollapsed = collapsedKeys.has(month);
                return (
                  <div key={month} className="mt-2 ml-2">
                    <button
                      type="button"
                      onClick={() => toggle(month)}
                      className="w-full flex items-center justify-between text-left text-xs font-semibold text-text-muted border-b border-border pb-1 mb-2 hover:text-text-dark"
                    >
                      <span>{month}（{items.length}件）</span>
                      <span>{mCollapsed ? '▶' : '▼'}</span>
                    </button>

                    {!mCollapsed && (
                      <div className="space-y-2">
                        {items.map((row) => {
                          const d = row.createdAt ? new Date(row.createdAt) : null;
                          const dateLabel =
                            d && !isNaN(d.getTime())
                              ? `${d.getMonth() + 1}/${d.getDate()}`
                              : null;
                          const itemOpen = openItemIds.has(row.patternId);
                          return (
                            <div key={row.patternId} className="rounded-xl border border-border bg-bg-page overflow-hidden">
                              {/* 折り畳みヘッダー */}
                              <button
                                type="button"
                                onClick={() => setOpenItemIds(prev => {
                                  const next = new Set(prev);
                                  next.has(row.patternId) ? next.delete(row.patternId) : next.add(row.patternId);
                                  return next;
                                })}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-primary/5"
                              >
                                <div className="min-w-0">
                                  <span className="text-[10px] text-text-muted">
                                    [{row.categoryName}]
                                    {dateLabel && <span className="ml-1">({dateLabel})</span>}
                                  </span>
                                  <p className="text-sm font-medium text-text-dark truncate mt-0.5">{row.trigger}</p>
                                </div>
                                <span className="text-text-muted text-xs shrink-0">{itemOpen ? '▼' : '▶'}</span>
                              </button>
                              {/* 展開コンテンツ */}
                              {itemOpen && (
                                <div className="px-3 pb-3 border-t border-border space-y-1.5 pt-2">
                                  {row.situationJa && (
                                    <p className="text-[11px] text-text-muted italic mb-1">{row.situationJa}</p>
                                  )}
                                  <div className="flex gap-2">
                                    <span className="text-[10px] font-semibold text-text-muted shrink-0 w-7 pt-0.5">FPP</span>
                                    <span className="text-sm text-text-dark">{row.trigger}</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <span className="text-[10px] font-semibold text-text-muted shrink-0 w-7 pt-0.5">SPP</span>
                                    <span className="text-sm text-text-dark">{row.spp}</span>
                                  </div>
                                  {row.followupQuestion && (
                                    <div className="flex gap-2">
                                      <span className="text-[10px] font-semibold text-text-muted shrink-0 w-7 pt-0.5">FQ</span>
                                      <span className="text-sm text-text-dark">{row.followupQuestion}</span>
                                    </div>
                                  )}
                                  {row.followupAnswer && (
                                    <div className="flex gap-2">
                                      <span className="text-[10px] font-semibold text-text-muted shrink-0 w-7 pt-0.5">FA</span>
                                      <span className="text-sm text-text-dark">{row.followupAnswer}</span>
                                    </div>
                                  )}
                                  <div className="pt-1">
                                    <Link
                                      href={`/practice/pattern/${row.patternId}`}
                                      className="inline-block text-xs font-semibold text-green-700 border border-green-300 rounded-lg px-3 py-1 hover:bg-green-50"
                                    >
                                      練習する
                                    </Link>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}
    </section>
  );
}
