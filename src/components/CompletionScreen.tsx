'use client';

import Link from 'next/link';
import { ScoreLevel } from '@/lib/scoring';

interface Stats {
  perfect: number;
  great: number;
  good: number;
  almost: number;
  retry: number;
}

interface Props {
  total: number;
  stats: Stats;
  chunkTitle: string;
}

const levelLabels: { key: ScoreLevel; label: string; color: string }[] = [
  { key: 'perfect', label: 'Perfect', color: 'bg-success' },
  { key: 'great', label: 'Great', color: 'bg-emerald-400' },
  { key: 'good', label: 'Good', color: 'bg-blue-400' },
  { key: 'almost', label: 'Almost', color: 'bg-amber-400' },
  { key: 'retry', label: 'Retry', color: 'bg-error' },
];

export default function CompletionScreen({ total, stats, chunkTitle }: Props) {
  const scored = stats.perfect + stats.great + stats.good + stats.almost + stats.retry;
  const scorePercent = scored > 0
    ? Math.round(((stats.perfect * 4 + stats.great * 3 + stats.good * 2 + stats.almost * 1) / (scored * 4)) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-bg-page flex flex-col items-center justify-center px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-6">
        <span className="text-4xl">🎉</span>
      </div>

      <h2 className="text-2xl font-bold text-text-dark mb-1">練習完了!</h2>
      <p className="text-text-muted mb-2">{chunkTitle}</p>
      <p className="text-text-muted text-sm mb-8">{total}問すべて終わりました</p>

      {/* スコア概要 */}
      {scored > 0 && (
        <div className="w-full max-w-xs mb-8">
          <div className="text-3xl font-bold text-cta mb-4">{scorePercent}%</div>
          <div className="space-y-2">
            {levelLabels.map(({ key, label, color }) => {
              const count = stats[key];
              if (count === 0) return null;
              return (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <span className={`w-3 h-3 rounded-full ${color}`} />
                  <span className="text-text-muted flex-1 text-left">{label}</span>
                  <span className="font-medium text-text-dark">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Link
        href="/practice"
        className="px-8 py-3 bg-cta text-white rounded-[var(--radius-button)] font-medium hover:opacity-90 active:scale-[0.98] transition-all"
      >
        チャンク選択に戻る
      </Link>
    </div>
  );
}
