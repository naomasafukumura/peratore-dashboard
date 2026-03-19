'use client';

import { ScoreLevel } from '@/lib/scoring';

interface Props {
  userAnswer: string;
  expectedAnswer: string;
  fppQuestion: string;
  level: ScoreLevel;
  chunkUsed: boolean;
  chunkTitle: string;
  onReRecord: () => void;
  onNext: () => void;
}

const levelConfig: Record<ScoreLevel, { label: string; color: string; bg: string; emoji: string }> = {
  perfect: { label: 'Perfect!', color: 'text-success', bg: 'bg-success/10', emoji: '🎯' },
  great: { label: 'Great!', color: 'text-emerald-500', bg: 'bg-emerald-50', emoji: '👏' },
  good: { label: 'Good', color: 'text-blue-500', bg: 'bg-blue-50', emoji: '👍' },
  almost: { label: 'Almost', color: 'text-amber-500', bg: 'bg-amber-50', emoji: '💪' },
  retry: { label: 'Retry', color: 'text-error', bg: 'bg-error/10', emoji: '🔄' },
};

function highlightDiff(user: string, expected: string): React.ReactNode[] {
  const userWords = user.toLowerCase().split(/\s+/);
  const expectedWords = expected.toLowerCase().replace(/[^a-z\s']/g, '').split(/\s+/);
  const originalWords = user.split(/\s+/);

  return originalWords.map((word, i) => {
    const lower = word.toLowerCase().replace(/[^a-z']/g, '');
    const isMatch = expectedWords.some(ew => ew === lower);
    return (
      <span key={i} className={isMatch ? 'text-success font-medium' : 'text-error'}>
        {word}{' '}
      </span>
    );
  });
}

export default function ReviewOverlay({
  userAnswer,
  expectedAnswer,
  fppQuestion,
  level,
  chunkUsed,
  chunkTitle,
  onReRecord,
  onNext,
}: Props) {
  const config = levelConfig[level];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-lg bg-bg-card rounded-t-2xl p-6 pb-10 max-h-[85vh] overflow-y-auto animate-slide-up">
        {/* スコアバッジ */}
        <div className="text-center mb-6">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${config.bg}`}>
            <span className="text-xl">{config.emoji}</span>
            <span className={`font-bold text-lg ${config.color}`}>{config.label}</span>
          </div>
          {chunkUsed && (
            <p className="text-xs text-success mt-2">チャンク使用済み: {chunkTitle}</p>
          )}
        </div>

        {/* 質問 */}
        <div className="mb-4">
          <p className="text-xs text-text-muted mb-1">Question</p>
          <p className="text-sm text-text-dark">{fppQuestion}</p>
        </div>

        {/* ユーザーの回答 */}
        <div className="mb-4">
          <p className="text-xs text-text-muted mb-1">Your answer</p>
          <div className="bg-bg-page rounded-[var(--radius-card)] p-3 text-sm">
            {highlightDiff(userAnswer, expectedAnswer)}
          </div>
        </div>

        {/* 模範回答 */}
        <div className="mb-6">
          <p className="text-xs text-text-muted mb-1">Model answer</p>
          <div className="bg-success/5 border border-success/20 rounded-[var(--radius-card)] p-3">
            <p className="text-sm font-medium text-success">{expectedAnswer}</p>
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex gap-3">
          <button
            onClick={onReRecord}
            className="flex-1 py-3 bg-bg-page border border-border rounded-[var(--radius-button)] text-sm font-medium text-text-dark hover:bg-border/30 active:scale-[0.98] transition-all"
          >
            もう一度
          </button>
          <button
            onClick={onNext}
            className="flex-1 py-3 bg-cta text-white rounded-[var(--radius-button)] text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all"
          >
            次へ
          </button>
        </div>
      </div>
    </div>
  );
}
