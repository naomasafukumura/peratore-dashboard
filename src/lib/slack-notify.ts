import { readEnvValueFromFiles } from '@/lib/read-env-from-files';

/** Slack Blocks API の payload 型（最小限） */
export interface SlackPayload {
  blocks: object[];
  text?: string; // 通知プレビュー用フォールバックテキスト
}

/**
 * Slack Incoming Webhook に blocks 形式で POST するヘルパー。
 * webhook URL が未設定の場合は console.error を出してスキップ（throw しない）。
 * タイムアウトは 10 秒。
 */
export async function sendSlack(payload: SlackPayload): Promise<void> {
  const webhookUrl =
    process.env.slack_webhook ?? readEnvValueFromFiles('slack_webhook');

  if (!webhookUrl) {
    console.error('[slack-notify] slack_webhook が未設定です。Slack 通知をスキップします。');
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Slack API エラー: ${res.status} ${body}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
