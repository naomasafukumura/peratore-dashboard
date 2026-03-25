import Link from 'next/link';

export default function TeacherDbMissing() {
  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-bg-card border border-border rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-8">
        <h1 className="text-lg font-bold text-text-dark mb-3">データベースに接続できません</h1>
        <p className="text-sm text-text-muted mb-4 leading-relaxed">
          このページ（先生ダッシュボード）は起動時に Neon（PostgreSQL）へ接続します。
          プロジェクト直下の <code className="text-text-dark bg-bg-page px-1 rounded">.env.local</code>{' '}
          に <code className="text-text-dark bg-bg-page px-1 rounded">DATABASE_URL=</code>{' '}
          が入っていないと表示できません。責任者から接続文字列をもらい、貼り付けて保存したあと、開発サーバーを一度止めて{' '}
          <code className="text-text-dark bg-bg-page px-1 rounded">npm run dev</code> をやり直してください。
        </p>
        <p className="text-sm text-text-muted mb-6">
          フォームの画面だけ見る場合は、サーバーで DB を使わない次の URL も開けます。
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/teacher/lesson-form"
            className="inline-flex justify-center px-4 py-3 bg-primary text-white rounded-[var(--radius-button)] text-sm font-medium"
          >
            レッスン後フォームを開く
          </Link>
          <Link
            href="/"
            className="inline-flex justify-center px-4 py-3 border border-border rounded-[var(--radius-button)] text-sm text-text-muted hover:bg-bg-page"
          >
            トップへ
          </Link>
        </div>
      </div>
    </div>
  );
}
