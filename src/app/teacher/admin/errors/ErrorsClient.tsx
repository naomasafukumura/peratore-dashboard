'use client';

import { useEffect, useState } from 'react';
import type { ErrorLog } from '@/lib/error-digest';

type DigestResponse =
  | { ok: true; count: 0; note: string; target: string }
  | {
      ok: true;
      count: number;
      appCounts: Record<string, number>;
      sourceCounts: Record<string, number>;
      appCountText: string;
      sourceCountText: string;
      summary: string;
      summaryFailed: boolean;
      detailLogs: ErrorLog[];
      detailText: string;
      target: string;
    };

type ErrorResponse = { error: string; detail?: string };

const formatDate = (iso: string) => {
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`;
};

const formatDelay = (delayedMs: number): string => {
  const hours = delayedMs / 3_600_000;
  if (hours >= 1) return `約${hours.toFixed(1)}時間遅れ`;
  const minutes = delayedMs / 60_000;
  if (minutes >= 1) return `約${minutes.toFixed(1)}分遅れ`;
  const seconds = delayedMs / 1000;
  return `約${seconds.toFixed(0)}秒遅れ`;
};

export default function ErrorsClient() {
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDigest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/error-digest', { credentials: 'include' });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ErrorResponse | null;
        setError(data?.error ?? `取得に失敗しました（HTTP ${res.status}）`);
        setDigest(null);
        return;
      }
      const data = (await res.json()) as DigestResponse;
      setDigest(data);
    } catch {
      setError('通信エラーが発生しました');
      setDigest(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDigest();
  }, []);

  return (
    <div className="min-h-screen bg-bg-page">
      <header className="bg-bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-base font-bold text-text-dark">エラーログ</h1>
          <div className="flex items-center gap-3 text-xs">
            <a href="/teacher/admin" className="text-primary font-medium">管理者ページ</a>
            <a href="/teacher/students" className="text-primary font-medium">受講生一覧</a>
            <a href="/teacher" className="text-primary font-medium">ダッシュボード</a>
            <a href="/api/admin-auth/logout" className="text-text-muted hover:text-text-dark">ログアウト</a>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">直近のエラー</h2>
          <button
            onClick={fetchDigest}
            disabled={loading}
            className="px-3 py-1.5 bg-primary text-text-dark rounded-[var(--radius-button)] text-xs font-semibold disabled:opacity-40"
          >
            {loading ? '更新中…' : '更新'}
          </button>
        </div>

        {loading && !digest && !error && (
          <p className="text-sm text-text-muted text-center py-12">読み込み中…</p>
        )}

        {error && (
          <div className="bg-bg-card border border-error/40 rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)]">
            <p className="text-sm text-error font-semibold">エラー</p>
            <p className="text-sm text-text-dark mt-1">{error}</p>
          </div>
        )}

        {digest && (
          <>
            <p className="text-xs text-text-muted">{digest.target}</p>

            {'note' in digest ? (
              <div className="bg-bg-card border border-border rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)]">
                <p className="text-sm text-text-dark">直近24時間、エラーなし</p>
              </div>
            ) : (
              <>
                {/* アプリ別 / source別 集計 */}
                <div className="bg-bg-card border border-border rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)] space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-text-dark mb-1">アプリ別件数</p>
                    <p className="text-sm text-text-dark whitespace-pre-wrap">{digest.appCountText}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text-dark mb-1">source別件数</p>
                    <p className="text-sm text-text-dark whitespace-pre-wrap">{digest.sourceCountText}</p>
                  </div>
                </div>

                {/* AI要約 */}
                <div className="bg-bg-card border border-border rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)]">
                  <p className="text-xs font-semibold text-text-dark mb-1">
                    AI要約{digest.summaryFailed && <span className="text-error ml-1">（要約失敗）</span>}
                  </p>
                  <p className="text-sm text-text-dark whitespace-pre-wrap">{digest.summary}</p>
                </div>

                {/* 詳細一覧 */}
                <div>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">詳細ログ</p>
                  <div className="space-y-2">
                    {digest.detailLogs.map((log) => {
                      const isDelayed = log.message.includes('[遅延]');
                      const occurredAt = typeof log.context?.occurredAt === 'string' ? log.context.occurredAt : null;
                      const delayedMs = typeof log.context?.delayedMs === 'number' ? log.context.delayedMs : null;
                      return (
                        <div
                          key={log.id}
                          className={`bg-bg-card border rounded-[var(--radius-card)] p-3 shadow-[var(--shadow-card)] ${isDelayed ? 'border-error/50 bg-error/5' : 'border-border'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] text-text-muted">{formatDate(log.created_at)}</p>
                            <p className="text-[11px] text-text-muted">{log.source}</p>
                          </div>
                          <p className="text-sm text-text-dark mt-1 break-words">
                            {isDelayed && (
                              <span className="inline-block px-1.5 py-0.5 mr-1 rounded bg-error text-white text-[10px] font-semibold align-middle">
                                遅延
                              </span>
                            )}
                            {log.message}
                          </p>
                          {(occurredAt || delayedMs !== null) && (
                            <p className="text-[11px] text-error mt-1">
                              {occurredAt && <>本来の発生時刻: {formatDate(occurredAt)}</>}
                              {occurredAt && delayedMs !== null && ' / '}
                              {delayedMs !== null && formatDelay(delayedMs)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
