import Link from 'next/link';
import { GoogleSignInButton } from './GoogleSignInButton';

function googleEnabled() {
  return (
    Boolean(process.env.GOOGLE_CLIENT_ID?.trim()) && Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim())
  );
}

export default function StudentLoginPage() {
  return (
    <div className="min-h-screen bg-bg-page flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm bg-bg-card border border-border rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6">
        <h1 className="text-lg font-bold text-text-dark">受講生ログイン</h1>
        <p className="text-xs text-text-muted mt-2 mb-4">
          ログイン後、先生がフォームで使っている<strong>受講生名</strong>を設定ページで登録すると、個別の教材が練習画面に追加表示されます。
        </p>
        <GoogleSignInButton enabled={googleEnabled()} />
        <p className="text-xs text-text-muted mt-4">
          <Link href="/student" className="text-primary font-medium">
            トップへ戻る
          </Link>
        </p>
      </div>
    </div>
  );
}
