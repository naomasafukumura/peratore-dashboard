/**
 * ローカルスコアリングユーティリティ（API失敗時のフォールバック）
 */

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

export function fuzzyMatch(userWords: string[], targetWords: string[]): number {
  if (targetWords.length === 0) return 0;
  let matched = 0;
  for (const tw of targetWords) {
    if (userWords.some(uw => levenshteinSimilarity(uw, tw) > 0.7)) {
      matched++;
    }
  }
  return matched / targetWords.length;
}

export function checkChunkUsed(userAnswer: string, targetChunk: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  const user = normalize(userAnswer);
  const chunk = normalize(targetChunk);

  // 直接含む
  if (user.includes(chunk)) return true;

  // 同義変換チェック
  const synonyms: Record<string, string[]> = {
    'gonna': ['going to'],
    'wanna': ['want to'],
    'gotta': ['got to', 'have to'],
    "i'm": ["i am"],
    "don't": ["do not"],
    "can't": ["cannot", "can not"],
    "won't": ["will not"],
    "didn't": ["did not"],
    "isn't": ["is not"],
    "aren't": ["are not"],
    "wasn't": ["was not"],
    "weren't": ["were not"],
    "haven't": ["have not"],
    "hasn't": ["has not"],
    "couldn't": ["could not"],
    "wouldn't": ["would not"],
    "shouldn't": ["should not"],
  };

  let expandedUser = user;
  let expandedChunk = chunk;
  for (const [short, longs] of Object.entries(synonyms)) {
    for (const long of longs) {
      expandedUser = expandedUser.replace(new RegExp(`\\b${long}\\b`, 'g'), short);
      expandedChunk = expandedChunk.replace(new RegExp(`\\b${long}\\b`, 'g'), short);
    }
  }

  return expandedUser.includes(expandedChunk);
}

export type ScoreLevel = 'perfect' | 'great' | 'good' | 'almost' | 'retry';

export function scoreTurn1Local(
  userAnswer: string,
  exampleAnswer: string,
  targetChunk: string,
): { level: ScoreLevel; chunkUsed: boolean } {
  if (!userAnswer.trim()) {
    return { level: 'retry', chunkUsed: false };
  }

  const chunkUsed = checkChunkUsed(userAnswer, targetChunk);
  const userWords = userAnswer.toLowerCase().split(/\s+/);
  const exWords = exampleAnswer.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
  const similarity = fuzzyMatch(userWords, exWords);

  if (chunkUsed && similarity > 0.6) return { level: 'perfect', chunkUsed };
  if (chunkUsed && similarity > 0.3) return { level: 'great', chunkUsed };
  if (similarity > 0.3) return { level: 'good', chunkUsed };
  if (userAnswer.trim().split(/\s+/).length >= 2) return { level: 'almost', chunkUsed };
  return { level: 'retry', chunkUsed };
}
