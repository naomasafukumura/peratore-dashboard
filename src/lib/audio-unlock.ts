// モジュールレベルで単一の HTMLAudioElement を保持し、iOS Safari / LINE内蔵ブラウザ等で
// 「ページ遷移のたびに new Audio() すると autoplay がブロックされる」問題を回避するための
// シングルトン。最初のユーザー操作（gesture）で無音を再生して要素を unlock しておき、
// 以後の再生はこの同じ要素の src を差し替えて使い回す。
//
// 背景: PracticeMode.tsx のチャンク遷移を window.location.href によるフルリロードから
// クライアントサイド遷移（router.replace + key remount）に変更すると、ブラウザの
// user activation はページ全体としては維持されるが、Audio 要素自体を毎回 new Audio() で
// 作り直すと端末によっては unlock 状態が引き継がれないケースがあるため、要素を使い回す。

let sharedAudio: HTMLAudioElement | null = null;
let unlocked = false;
// 再生ごとにインクリメントする世代トークン。stopSharedAudio() や新しい playSharedAudio()
// 呼び出しで進め、古い再生の onended/onerror が誤って新しい再生の結果として解決しないようにする。
let generation = 0;

// 44byte の最小無音 WAV（0フレーム）
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
  }
  return sharedAudio;
}

/**
 * ユーザー操作（クリック/タップ）のハンドラ内で同期的に呼び出すこと。
 * 無音を再生→即停止することで、この共有 Audio 要素を以後 "unlock" 済みの状態にする。
 * 二回目以降の呼び出しは何もしない。
 */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  const audio = getSharedAudio();
  try {
    audio.src = SILENT_WAV;
    const playResult = audio.play();
    if (playResult && typeof playResult.then === 'function') {
      playResult
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => { /* unlock失敗。以後の再生時に改めて play() が試みられる */ });
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  } catch {
    /* ignore */
  }
}

/** 再生失敗時の理由。呼び出し側でログ送信・UI表示の出し分けに使う。 */
export type AudioPlayFailReason = 'onerror' | 'play-reject' | 'too-short';

export interface AudioPlayResult {
  ok: boolean;
  reason?: AudioPlayFailReason;
}

// 再生開始から onended までがこの時間未満なら「鳴っていない」とみなす安全弁。
// public/practice-v2.html の watchdog/advance ロジックを踏襲したシンプル版。
const MIN_PLAY_MS = 300;

/**
 * 共有 Audio 要素の src を差し替えて再生する。new Audio() は作らない。
 * 常に resolve するが、実際に音が鳴ったかどうかを { ok } で区別する:
 *  - onerror 発火 → { ok: false, reason: 'onerror' }
 *  - play() が reject（自動再生ブロック等） → { ok: false, reason: 'play-reject' }
 *  - onended までが MIN_PLAY_MS 未満 → { ok: false, reason: 'too-short' }
 *  - 上記以外で onended → { ok: true }
 */
export function playSharedAudio(url: string): Promise<AudioPlayResult> {
  const audio = getSharedAudio();
  const myGeneration = ++generation;

  return new Promise<AudioPlayResult>((resolve) => {
    let startedAt = 0;
    const finish = (result: AudioPlayResult) => {
      if (myGeneration !== generation) return; // 古い世代からのコールバックは無視
      audio.onended = null;
      audio.onerror = null;
      resolve(result);
    };
    audio.onended = () => {
      const elapsed = Date.now() - startedAt;
      finish(elapsed < MIN_PLAY_MS ? { ok: false, reason: 'too-short' } : { ok: true });
    };
    audio.onerror = () => finish({ ok: false, reason: 'onerror' });
    try {
      audio.src = url;
      audio.currentTime = 0;
      startedAt = Date.now();
      audio.play().catch(() => finish({ ok: false, reason: 'play-reject' }));
    } catch {
      finish({ ok: false, reason: 'onerror' });
    }
  });
}

/** 再生中の音声を即座に止める。世代を進めて、以後古いコールバックが誤発火しないようにする。 */
export function stopSharedAudio(): void {
  generation++;
  if (sharedAudio) {
    try {
      sharedAudio.pause();
      sharedAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}
