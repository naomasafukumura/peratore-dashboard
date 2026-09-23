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
// 現在 pending 中の playSharedAudio() を「superseded」として確定させるための finish 関数。
// 新しい再生が始まる/stopSharedAudio() が呼ばれるタイミングで、これを直接呼んで
// 古い Promise を即座に resolve する（世代トークンの不一致を待つだけだと、次のコールバックが
// 発火するまで pending のままになってしまうため）。
let pendingFinish: ((result: AudioPlayResult) => void) | null = null;

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

/** 再生失敗（または未確定終了）時の理由。呼び出し側でログ送信・UI表示の出し分けに使う。 */
export type AudioPlayFailReason = 'error' | 'timeout' | 'superseded' | 'play-reject' | 'too-short';

export interface AudioPlayResult {
  ok: boolean;
  reason?: AudioPlayFailReason;
}

// 再生開始から onended までがこの時間未満なら「鳴っていない」とみなす安全弁。
// public/practice-v2.html の watchdog/advance ロジックを踏襲したシンプル版。
const MIN_PLAY_MS = 300;

// watchdog: duration が判明しない場合のフォールバックタイムアウト（静的版 practice-v2.html に合わせる）。
const WATCHDOG_FALLBACK_MS = 15000;
// duration が判明した場合は duration + このマージン分だけ待ってからタイムアウトさせる。
const WATCHDOG_DURATION_MARGIN_MS = 3000;

/**
 * 共有 Audio 要素の src を差し替えて再生する。new Audio() は作らない。
 *
 * 契約: このPromiseは必ずいずれかの結果で resolve する（例外を投げず、pending のまま
 * 放置されることもない）。連続再生ループがこの Promise を await し続けるため、
 * 「絶対に settle する」ことを最優先の契約とする。
 *  - onerror 発火 → { ok: false, reason: 'error' }
 *  - play() が reject（自動再生ブロック等） → { ok: false, reason: 'play-reject' }
 *  - onended までが MIN_PLAY_MS 未満 → { ok: false, reason: 'too-short' }
 *  - 読み込み/再生がストールし、watchdog タイムアウトに達した → { ok: false, reason: 'timeout' }
 *  - stopSharedAudio() や新しい playSharedAudio() 呼び出しにより打ち切られた
 *    → { ok: false, reason: 'superseded' }
 *  - 上記以外で onended → { ok: true }
 */
export function playSharedAudio(url: string): Promise<AudioPlayResult> {
  const audio = getSharedAudio();

  // 前回の再生がまだ pending なら、ここで確定的に superseded として解決してから始める。
  // （世代トークンの不一致チェックだけに頼ると、古い Promise は次のイベントが発火するまで
  //  pending のままになってしまうため、直接 finish を呼んで即座に settle させる）
  if (pendingFinish) {
    const prevFinish = pendingFinish;
    pendingFinish = null;
    prevFinish({ ok: false, reason: 'superseded' });
  }

  generation++;
  const myGeneration = generation;

  return new Promise<AudioPlayResult>((resolve) => {
    let startedAt = 0;
    let settled = false;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: AudioPlayResult) => {
      if (settled) return;
      settled = true;
      if (pendingFinish === finish) pendingFinish = null;
      audio.onended = null;
      audio.onerror = null;
      audio.onloadedmetadata = null;
      audio.ontimeupdate = null;
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
      resolve(result);
    };
    pendingFinish = finish;

    const armWatchdog = (ms: number) => {
      if (settled) return;
      if (watchdogTimer) clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), ms);
    };

    // duration が判明したら watchdog を duration+マージンへ延長する。
    // 判明しない/再生が進まない場合は WATCHDOG_FALLBACK_MS で打ち切る。
    const onDurationKnown = () => {
      const dur = audio.duration;
      if (dur && isFinite(dur) && dur > 0) {
        armWatchdog(dur * 1000 + WATCHDOG_DURATION_MARGIN_MS);
      } else {
        armWatchdog(WATCHDOG_FALLBACK_MS);
      }
    };

    audio.onended = () => {
      // myGeneration が古い場合でも、settled 未確定ならここで確定させる
      // （finish は generation を見ないので、このコールバック自体が最新の再生に紐づいて
      //  いない場合は基本的に既に superseded 済みで settled=true のはず）
      if (myGeneration !== generation) return;
      const elapsed = Date.now() - startedAt;
      finish(elapsed < MIN_PLAY_MS ? { ok: false, reason: 'too-short' } : { ok: true });
    };
    audio.onerror = () => {
      if (myGeneration !== generation) return;
      finish({ ok: false, reason: 'error' });
    };
    audio.onloadedmetadata = onDurationKnown;
    audio.ontimeupdate = onDurationKnown;

    try {
      audio.src = url;
      audio.currentTime = 0;
      startedAt = Date.now();
      armWatchdog(WATCHDOG_FALLBACK_MS);
      audio.play().catch(() => finish({ ok: false, reason: 'play-reject' }));
    } catch {
      finish({ ok: false, reason: 'error' });
    }
  });
}

/** 再生中の音声を即座に止める。世代を進めて、以後古いコールバックが誤発火しないようにする。 */
export function stopSharedAudio(): void {
  generation++;
  if (pendingFinish) {
    const prevFinish = pendingFinish;
    pendingFinish = null;
    prevFinish({ ok: false, reason: 'superseded' });
  }
  if (sharedAudio) {
    try {
      sharedAudio.pause();
      sharedAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}
