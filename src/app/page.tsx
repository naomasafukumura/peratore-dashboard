import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-bg-page flex flex-col items-center justify-center px-6">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
          <span className="text-3xl">🗣</span>
        </div>
        <h1 className="text-3xl font-bold text-text-dark tracking-tight">ペラトレ</h1>
        <p className="text-text-muted mt-2">パターンプラクティスで英語が口から出る</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-sm">
        <Link
          href="/practice"
          className="flex items-center justify-center gap-3 px-6 py-4 bg-primary text-white rounded-[var(--radius-button)] font-semibold text-lg shadow-[var(--shadow-card)] hover:bg-primary-dark active:scale-[0.98] transition-all"
        >
          練習する
        </Link>
        <Link
          href="/teacher"
          className="flex items-center justify-center gap-3 px-6 py-4 bg-bg-card text-text-dark rounded-[var(--radius-button)] font-medium border border-border shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] active:scale-[0.98] transition-all"
        >
          先生用ページ
        </Link>
      </div>
    </div>
  );
}
