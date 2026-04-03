import { auth } from '@/auth';
import Link from 'next/link';
import { fetchRecentLessonForStudent } from '@/lib/student-recent-lesson';
import { signOutStudent } from './actions';

export default async function StudentHomePage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-bg-page flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-text-muted text-sm">受講生向けページです。</p>
        <Link
          href="/student/login"
          className="px-4 py-2 rounded-xl bg-primary text-text-dark text-sm font-semibold"
        >
          ログイン
        </Link>
        <Link href="/practice-v2.html" className="text-xs text-primary">
          練習画面へ（ベース教材のみでも利用可）
        </Link>
      </div>
    );
  }

  const name = session.user.assignmentName?.trim();
  const missingLabel = !name;

  let recentSummary: Awaited<ReturnType<typeof fetchRecentLessonForStudent>>['summary'] = [];
  let recentCategoryLabel = 'レッスン復習集';
  if (name) {
    try {
      const r = await fetchRecentLessonForStudent(name);
      recentSummary = r.summary;
      if (r.categoryLabel) recentCategoryLabel = r.categoryLabel;
    } catch {
      recentSummary = [];
    }
  }

  return (
    <div className="min-h-screen bg-bg-page px-4 py-8 max-w-md mx-auto">
      <h1 className="text-lg font-bold text-text-dark">マイページ</h1>
      <p className="text-sm text-text-muted mt-1">{session.user.email ?? session.user.name ?? '受講生'}</p>

      {missingLabel && (
        <div className="mt-4 p-3 rounded-xl bg-amber-bg border border-amber-bd text-sm text-amber">
          まず「先生がフォームで選んでいる受講生名」と同じ表記を登録してください。
        </div>
      )}

      {!missingLabel && (
        <p className="mt-4 text-sm text-text-dark">
          登録中の受講生名: <strong>{name}</strong>
        </p>
      )}

      {!missingLabel && recentSummary.length > 0 && (() => {
        // 月別グループ化
        const groups = new Map<string, typeof recentSummary>();
        for (const item of recentSummary) {
          const d = item.createdAt ? new Date(item.createdAt) : null;
          const key = d && !isNaN(d.getTime())
            ? `${d.getFullYear()}年${d.getMonth() + 1}月`
            : '日付不明';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(item);
        }
        return (
          <section className="mt-6 rounded-xl border border-border bg-bg-card p-4">
            <h2 className="text-sm font-semibold text-text-dark">{recentCategoryLabel}</h2>
            <p className="mt-1 text-xs text-text-muted">全 {recentSummary.length} 件</p>
            {Array.from(groups.entries()).map(([month, items]) => (
              <div key={month} className="mt-4">
                <p className="text-xs font-semibold text-text-muted border-b border-border pb-1 mb-2">{month}（{items.length}件）</p>
                <ol className="space-y-2 text-sm text-text-dark list-decimal list-inside">
                  {items.map((row) => {
                    const d = row.createdAt ? new Date(row.createdAt) : null;
                    const dateLabel = d && !isNaN(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}` : null;
                    return (
                      <li key={row.patternId} className="pl-0">
                        <span className="text-text-muted text-xs">[{row.categoryName}] {row.section}{dateLabel && <span className="ml-1 text-text-faint">({dateLabel})</span>}</span>
                        <br />
                        <span className="font-medium">{row.trigger}</span>
                        <span className="text-text-muted"> → </span>
                        <span>{row.spp}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </section>
        );
      })()}

      {!missingLabel && recentSummary.length === 0 && (
        <p className="mt-6 text-xs text-text-muted">
          レッスンで追加された例文はまだありません。先生がフォームから登録すると、ここに表示されます。
        </p>
      )}

      <ul className="mt-6 space-y-3">
        <li>
          <Link
            href="/student/settings"
            className="block py-3 px-4 rounded-xl bg-bg-card border border-border text-sm font-medium text-text-dark"
          >
            受講生名の設定・変更
          </Link>
        </li>
        <li>
          <Link
            href="/practice-v2.html"
            className="block py-3 px-4 rounded-xl bg-primary text-text-dark text-sm font-semibold text-center"
          >
            練習を始める
          </Link>
        </li>
      </ul>

      <form className="mt-8" action={signOutStudent}>
        <button type="submit" className="text-xs text-text-muted hover:text-text-dark">
          ログアウト
        </button>
      </form>
    </div>
  );
}
