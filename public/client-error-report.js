/**
 * クライアントエラーを /api/client-error に fire-and-forget で送信する。
 * 例外は一切投げない（本処理を壊さない設計）。
 * 使い方: window.reportClientError('client:mic', error, { studentName, context: {...} })
 */
window.reportClientError = function(source, error, opts) {
  var message = (error instanceof Error) ? error.message : String(error || '');
  var stack = (error instanceof Error) ? (error.stack || undefined) : undefined;
  try {
    fetch('/api/client-error', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: source,
        message: message,
        stack: stack,
        studentName: opts && opts.studentName,
        status: opts && opts.status,
        context: opts && opts.context,
      })
    }).catch(function() {});
  } catch(e) {}
};
