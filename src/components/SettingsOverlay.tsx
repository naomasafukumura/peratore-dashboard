'use client';

interface Props {
  thinkTime: number;
  speakTime: number;
  inputMode: 'voice' | 'text';
  onThinkTimeChange: (v: number) => void;
  onSpeakTimeChange: (v: number) => void;
  onInputModeChange: (v: 'voice' | 'text') => void;
  onClose: () => void;
}

export default function SettingsOverlay({
  thinkTime,
  speakTime,
  inputMode,
  onThinkTimeChange,
  onSpeakTimeChange,
  onInputModeChange,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-bg-card rounded-t-2xl p-6 pb-10 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-text-dark">設定</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-dark text-xl">&times;</button>
        </div>

        <div className="space-y-6">
          {/* 入力モード */}
          <div>
            <label className="block text-sm font-medium text-text-dark mb-2">入力モード</label>
            <div className="flex gap-2">
              <button
                onClick={() => onInputModeChange('voice')}
                className={`flex-1 py-2.5 rounded-[var(--radius-button)] text-sm font-medium transition-all ${
                  inputMode === 'voice'
                    ? 'bg-cta text-white'
                    : 'bg-bg-page text-text-muted border border-border'
                }`}
              >
                音声入力
              </button>
              <button
                onClick={() => onInputModeChange('text')}
                className={`flex-1 py-2.5 rounded-[var(--radius-button)] text-sm font-medium transition-all ${
                  inputMode === 'text'
                    ? 'bg-cta text-white'
                    : 'bg-bg-page text-text-muted border border-border'
                }`}
              >
                テキスト入力
              </button>
            </div>
          </div>

          {/* 考える時間 */}
          <div>
            <label className="block text-sm font-medium text-text-dark mb-2">
              考える時間: {thinkTime}秒
            </label>
            <input
              type="range"
              min={3}
              max={15}
              value={thinkTime}
              onChange={(e) => onThinkTimeChange(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-text-light mt-1">
              <span>3秒</span>
              <span>15秒</span>
            </div>
          </div>

          {/* 話す時間 */}
          {inputMode === 'voice' && (
            <div>
              <label className="block text-sm font-medium text-text-dark mb-2">
                話す時間: {speakTime}秒
              </label>
              <input
                type="range"
                min={5}
                max={20}
                value={speakTime}
                onChange={(e) => onSpeakTimeChange(parseInt(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-text-light mt-1">
                <span>5秒</span>
                <span>20秒</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
