# ペラトレ教材システム — 開発タスク（masaki向け）

## デッドライン：2026-03-29（日）

---

## 概要

ペラトレ = MasaEnglishのオンライン英会話レッスンサービス。
「これを言われたら→これを返す」をシチュエーション付きで自動化する、パターンプラクティス教材。

現在、`practice-v2.html` にpatternpracticeの教材を完全コピー済み。
これをベースに、以下の3つの機能を実装する。

---

## 全体像

```
先生がレッスン後にフォームでメモ送信
    ↓
AIが自動でsituation/trigger/SPP/followupに整形
    ↓
ElevenLabsで音声自動生成
    ↓
DBに保存
    ↓
受講生がGoogleログインすると自分専用の教材ができている
```

---

## タスク1: 受講生管理（Googleログイン）

### やること
- Google OAuth認証を実装
- 受講生がGoogleアカウントでログインすると、自分専用の教材ページが表示される
- 教材の内容 = 全員共通のベースフレーズ + 先生が追加した個別フレーズ

### ベースフレーズ
- 現在の `practice-v2.html` に埋め込まれているDATA（patternpracticeからコピーしたもの）を全受講生共通のベースとして使う
- これに加えて、先生がレッスンで追加したフレーズが受講生ごとに表示される

### DB設計
- 受講生テーブル：Google ID、名前、メールアドレス、担当先生
- 既存テーブル：categories, chunks, patterns, audio_files, assignments（そのまま使える）

---

## タスク2: 先生用フォーム

### やること
- 先生がレッスン後に使うシンプルなフォームを作る
- **極限までシンプルにすること**（先生が面倒だと使わなくなる）

### フォームの流れ
1. 受講生を選択（ドロップダウン）
2. 2往復の会話を入力：
   - **1往復目**
     - Trigger（相手のセリフ）: 例「What are you gonna do this weekend?」
     - 回答（模範回答/SPP）: 例「I'm gonna relax at home.」
   - **2往復目**
     - Followup Question: 例「Oh, are you gonna watch Netflix or something?」
     - Followup Answer: 例「Yeah, something like that.」
3. 追加メモ（任意）: 自由記述。レッスンの文脈や補足
4. 送信ボタン

### 送信後の処理（自動）
1. **AI整形**（GPT-4o-mini）：
   - 先生の入力からsituation（状況説明）を自動生成
   - カテゴリを自動分類（既存カテゴリに振り分け or 新規カテゴリ作成）
   - 入力が雑でも、ちゃんとした教材フォーマットに整える
2. **ElevenLabs音声生成**：
   - trigger音声、SPP音声、followup音声、followup answer音声を自動生成
3. **DB登録**：
   - patternsテーブルに保存
   - audio_filesテーブルに音声保存
   - assignmentsテーブルで受講生に紐付け

### 先生の認証
- 先生用ページにはアクセス制限が必要（パスワード or Google OAuth）

---

## タスク3: 音声自動生成

### ElevenLabs設定
- **モデル**: `eleven_flash_v2_5`
- **女性ボイス**（trigger/followup/相手の発話）: `XfNU2rGpBa01ckF309OY`
- **男性ボイス**（SPP/回答/受講生の発話）: `UgBBYS2sOqTuMpoF3BR0`
- voice_settings:
  - stability: 0.6
  - similarity_boost: 0.74
  - style: 0.0
  - use_speaker_boost: true

### ボイスの使い分け
- 基本：女性 → trigger/followup、男性 → SPP/回答
- 相手が「夫」の場合：男性 → trigger/followup、女性 → SPP/回答
- situationのテキストから自動判定（「夫」が含まれていたら逆転）

### 音声生成タイミング
- 先生がフォーム送信した直後にバックグラウンドで生成
- 生成完了したらDBに保存

---

## タスク4: 先生への解説動画

- 先生が使うフォームの使い方を解説する動画を作成する必要あり
- フォームが完成してから作成

---

## 技術スタック

- **フレームワーク**: Next.js（App Router）
- **DB**: Neon（PostgreSQL）
- **認証**: Google OAuth
- **AI**: OpenAI GPT-4o-mini（フレーズ整形）
- **音声**: ElevenLabs API
- **デプロイ**: Vercel（git push → 自動デプロイ）
- **教材UI**: `public/practice-v2.html`（既存。Single Page App）

### 環境変数（Vercel）
- `OPENAI_API_KEY` — OpenAI API
- `ELEVENLABS_API_KEY` — ElevenLabs API
- `DATABASE_URL` — Neon DB接続文字列
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth

---

## 既存コード構成

```
peratore-dashboard/
├── public/
│   ├── practice-v2.html    ← 教材UI（編集モード付き）
│   ├── data.js             ← ベースフレーズデータ
│   └── audio/              ← 音声ファイル（662個）
├── src/
│   ├── app/api/
│   │   ├── transcribe/     ← Whisper音声認識
│   │   ├── score-answer/   ← 回答評価
│   │   ├── translate/      ← 翻訳
│   │   ├── explain-answer/ ← フィードバック生成
│   │   ├── check-answer/   ← 簡潔アドバイス
│   │   ├── practice-check/ ← 実践モード採点
│   │   ├── practice-data/  ← DB→教材データ取得
│   │   ├── categories/     ← カテゴリCRUD
│   │   ├── chunks/         ← チャンクCRUD
│   │   ├── patterns/       ← パターンCRUD
│   │   ├── assignments/    ← 受講生割り当て
│   │   └── audio/          ← 音声取得・生成
│   └── lib/
│       ├── db.ts           ← Neon DB接続
│       └── voices.ts       ← ElevenLabsボイス設定
├── db-setup.mjs            ← DBスキーマ
└── seed-patternpractice.mjs ← データインポートスクリプト
```

---

## 優先順位

1. **先生用フォーム + AI整形 + 音声生成**（これがないと何も始まらない）
2. **受講生Googleログイン + 個別教材表示**
3. **ベースフレーズのDBインポート**（seed-patternpractice.mjsベース）
4. **解説動画**

---

## 注意事項

- practice-v2.htmlの練習機能（音声認識、評価、フィードバック等）は既に動いている。壊さないこと
- 編集モード（ペンアイコンで切り替え）も既にある。先生用フォームとは別物
- API（6本）はpatternpracticeから完全コピー済み。OpenAI APIキーの設定が必要
