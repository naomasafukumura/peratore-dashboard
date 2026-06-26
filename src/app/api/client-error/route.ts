import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/error-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** client:* source の許可リスト */
const ALLOWED_SOURCES = new Set(['client:mic', 'client:speech', 'client:transcribe', 'client:answer']);

/** 文字列を maxLen 文字に切り詰める */
function truncate(s: unknown, maxLen: number): string | undefined {
  if (typeof s !== 'string') return undefined;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/**
 * POST /api/client-error
 * クライアントからのエラーを受信して error_logs に記録する。
 * 本処理を壊さない設計: 常に成功系レスポンスを返す（検証失敗のみ 400）。
 */
export async function POST(req: NextRequest) {
  let body: {
    source?: unknown;
    message?: unknown;
    stack?: unknown;
    studentName?: unknown;
    status?: unknown;
    context?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // source 検証
  const rawSource = typeof body.source === 'string' ? body.source : '';
  const source = ALLOWED_SOURCES.has(rawSource) ? rawSource : 'client:unknown';

  // サニタイズ
  const message = truncate(body.message, 500) ?? '(no message)';
  const stack = truncate(body.stack, 2000);
  const studentName = typeof body.studentName === 'string' ? body.studentName : undefined;
  const status = typeof body.status === 'number' ? body.status : undefined;

  // context: JSON.stringify 後 2000 字に truncate
  let context: Record<string, unknown> | undefined;
  if (body.context !== null && typeof body.context === 'object' && !Array.isArray(body.context)) {
    const ctxStr = JSON.stringify(body.context);
    context = ctxStr.length > 2000
      ? { __truncated: true, raw: ctxStr.slice(0, 2000) }
      : (body.context as Record<string, unknown>);
  }

  // stack を差し込んだ Error として logError に渡す
  const err = Object.assign(new Error(message), { stack: stack ?? message });

  await logError(source, err, { status, studentName, context });

  return NextResponse.json({ ok: true });
}
