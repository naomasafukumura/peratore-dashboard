'use client';

/**
 * クライアントエラーを /api/client-error に fire-and-forget で送信する。
 * 例外は一切投げない（本処理を壊さない設計）。
 */
export function reportClientError(
  source: string,
  error: unknown,
  opts?: { status?: number; studentName?: string; context?: Record<string, unknown> }
): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? undefined) : undefined;

  try {
    fetch('/api/client-error', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source,
        message,
        stack,
        studentName: opts?.studentName,
        status: opts?.status,
        context: opts?.context,
      }),
    }).catch(() => {/* 握りつぶし */});
  } catch {
    /* 握りつぶし */
  }
}
