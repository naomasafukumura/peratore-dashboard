'use client';

import { signIn } from 'next-auth/react';

export function GoogleSignInButton({ enabled }: { enabled: boolean }) {
  if (!enabled) {
    return (
      <p className="text-sm text-text-muted">
        管理者が <code className="text-xs">GOOGLE_CLIENT_ID</code> /{' '}
        <code className="text-xs">GOOGLE_CLIENT_SECRET</code> を設定すると利用できます。
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signIn('google', { callbackUrl: '/student' })}
      className="w-full py-2.5 px-4 rounded-xl border border-border bg-bg-page text-sm font-medium text-text-dark hover:bg-primary/10"
    >
      Google でログイン
    </button>
  );
}
