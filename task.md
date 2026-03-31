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

---

## 着手順チェックリスト（上から順）

「優先順位」に沿った実装順。完了したら `- [ ]` を `- [x]` に書き換える。

### Phase A — 先生フォーム〜DB〜音声（最優先）

- [x] DB・既存 API の確認（`patterns` / `chunks` / `categories` / `audio_files` / `assignments` がフォーム入力と整合するか）
- [x] 先生用アクセス制限（`.env` の `TEACHER_PASSWORD` … 未設定なら従来どおりゲートなし。JWT Cookie＋ミドルウェア＋教材系 API）
- [x] フォーム UI：`/`（および `/teacher/lesson-form`）— 受講生選択＋レッスンメモ＋登録開始（メモ→AI→`submit-preview`）
- [x] 送信 API：`POST /api/lesson-submission`（`analyze-memo` / `submit-preview`）。`DATABASE_URL` あり時は `submit-preview` で DB 保存＋音声生成まで実行
- [x] AI 整形（GPT-4o-mini）：situation 生成、カテゴリ候補、教材フィールドへ整形
- [x] ElevenLabs 連携：`fpp_question` / `spp` / `followup_question` / `natural`（2 往復目回答）、`voices.ts`・「夫」入れ替え
- [x] DB 書き込み：カテゴリ名マッチ or 新規カテゴリ、`chunks`・`patterns`・`assignments`、`audio_files`
- [x] 動作確認：`practice-v2.html?student=...` または `/api/practice-data?student=...` で追加カードが見えるか（Neon＋キー環境で要確認）
  - [x] **前提**: `.env.local` に `DATABASE_URL`（Neon）・`OPENAI_API_KEY`・`ELEVENLABS_API_KEY` が入っている（フォーム保存＋音声まで試す場合）
  - [x] **先生**: `npm run dev` のあと `/` または `/teacher/lesson-form` にアクセス（`TEACHER_PASSWORD` 設定時はログイン）。受講生を選び、プレビュー → **本登録（submit-preview）** まで完了し、画面上で失敗しない
  - [x] **名前の一致**: フォームで選んだ受講生名と DB の `assignments.student_name` が一致している（`/student` の受講生名とも揃える）
  - [x] **API**: ブラウザまたは `curl` で `GET /api/practice-data?student=（その名前をURLエンコード）` が **200** で JSON 配列を返す。レッスン追加分は該当カテゴリの `cards[]` に `id: "db-<patternのid>"` などで載る
  - [x] **画面**: `http://localhost:3000/practice-v2.html?student=（同じ名前）` を開き、カバー画面のカテゴリ一覧から当該フレーズが選べる（可能なら再生ボタンで音声も）
  - [x] 上記まで問題なければ、この行の親チェックを `[x]` にする

### Phase B — 受講生 Google ログイン

- [x] Google OAuth（NextAuth v5 beta、`/api/auth/[...nextauth]`、`AUTH_SECRET` + `GOOGLE_CLIENT_*`）
- [x] 受講生テーブル `students`（`google_sub` / `email` / `name` / `assignment_name` … `assignments.student_name` と一致させる文字列）
- [x] ログイン後の教材取得（`/api/practice-data` がセッションの `assignment_name` でフィルタ。`?student=` も従来どおり）
- [x] ベース ＋ 個別（`practice-v2.html` で埋め込み `DATA` と API 応答を `mergePracticeData` でカテゴリ単位マージ）
- [x] 担当先生・複数クラスなどの拡張、共有リンク `?student=` の扱い見直し（不要と判断：先生複数でも assignments は共有、`?student=` は全員公開でOK）

### Phase C — ベース教材を DB に

- [x] `scripts/seed-practice-v2-base.mjs` … `public/practice-v2.html` の埋め込み `DATA` をパースして `categories` / `chunks`（`origin=base_import`）/ `patterns` に投入（`npm run db:seed:base:dry` で件数確認、`SEED_BASE_CONFIRM=yes npm run db:seed:base` で本番投入）。既存 `audio_files`・`assignments` は chunks 削除で失われる点に注意

### Phase D — 仕上げ

- [ ] 先生向け解説動画（フォーム完成後）

---

## 読み手向けの補足（雄飛向け）

この節は、本文だけではイメージがつきにくい点を、用語をかみ砕いて書いたメモである。仕様の追加ではなく、読み方の補助。

### 用語の置き換え

- **DB（データベース）** … アプリが共有で読み書きする「整理されたデータの置き場」。このプロジェクトでは主に **Neon** 上の PostgreSQL。
- **JSON** … アプリ同士がデータを渡すときの、`{ }` や `[ ]` で書くテキスト形式。教材一覧もこの形で `practice-v2.html` に渡す。
- **Neon** … クラウド上に PostgreSQL を用意してくれるサービス名。接続先文字列が `.env.local` の `DATABASE_URL`。

### 1. 先生用フォームは何か（Googleフォームではない）

- **Googleフォームではない。** この **Next.js アプリ内**に、先生専用の入力ページ（例: `/teacher`）を **これから作る** 想定。
- **土台:** 練習画面・編集機能は `practice-v2.html` にあるが、**レッスン後の「4行＋受講生＋任意メモ」専用フォーム**はタスクで新規。編集モード（ペンアイコン）とは別物。
- **「2往復入力」の意味:** 会話の短いやりとりを2セット書くこと。
  - **1往復目:** 相手の英語（Trigger）／模範回答（SPP）
  - **2往復目:** フォローの質問／その答え  
  画面の細部の指定は本文にない。**上記の項目が揃い送信できること**を満たせばよい。

### 2. 自動パイプライン（スプレッドシート・GASではない）

- 流れは **このアプリのサーバー**が **OpenAI API（GPT-4o-mini）** と **ElevenLabs** を呼ぶ形。**スプレッドシートに書いて GAS が読む、ではない。**
- **GPT が参照するイメージ:** 先生の入力テキスト（＋任意メモ）に加え、**DB に既にあるカテゴリ一覧**（既存に振る／無理なら新規）。実装時はプロンプトでカテゴリ候補を渡す。

### 3. 受講生の Google ログインと「自分の教材」

- **全員分のメールを先にリスト化しなくてもよい**ケースが多い。典型は「受講生レコードに Google のメールまたは ID を紐づける」「初回だけ紐づけ操作をする」など。
- ロジックの芯: **ログインで本人がわかる → DB でその人向けに割り当てたチャンクだけ取得 → 同じ練習画面に載せる。** いまの `?student=名前` は、ログイン実装までの出し分けのイメージに近い。

### 4. 全体図と「ベース＋個別の合体」

- **全体図（一文）:** 先生がフォーム送信 → サーバーが整形・音声生成 → Neon に保存 → 受講生がログインして開くと **自分向けの教材**が載っている。
- **ベース:** 全員共通の教材（現状は `practice-v2.html` 埋め込みの DATA 等。将来は DB インポートも検討）。
- **個別:** 先生がフォームから足し、その受講生に割り当てた分。
- **合体:** 受講生の画面では **ひとつの練習リストとして続きで見える**ようにする（別々の「オリジナルページ URL を量産」が主目的とは限らない。同じ `practice-v2.html` で中身を切り替えるイメージ）。

### 5. 先生ページと先生の人数

- **先生ページ** … 先生だけが触れる **フォーム・管理用の Web ページ**の総称。
- **先生が複数か**は本文で固定していない。同一 URL を共有＋認証で守る想定も、将来ロール分けもありうる。

---

## 続き用メモ（セッション記録）

休憩後や別日に Cursor で「`task.md` の続き用メモを見て続けて」と言えば、文脈を拾いやすい。

### 更新日: 2026-03-24

**いまターミナルでやっていること（ここを自分で書き足す）**

- （例: `claude` で ○○ を調査中 / `npm run dev` 起動中 / `db-setup` 実行予定 など）

**直近コード側で入ったこと（参考）**

- 先生ゲート: `src/lib/teacher-session-server.ts`（Node 専用。パスワード解決＋JWT 検証を API/RSC で統一）
- `require-teacher-session.ts` / `redirect-teacher-login-if-needed.ts` は上記を利用
- `next.config.ts` の `saturateMissingEnvFromDisk` で `AUTH_SECRET` / `TEACHER_PASSWORD` 等をディスクから補完（Turbopack・Edge 向け）
- レッスン後フォーム: `credentials: 'include'`、401 時 `hint`（localhost と IP を混ぜない注意）
- `proxy.ts` は従来どおり `teacher-token`（env ベース）

**続きで確認するとよいこと**

- ログインとフォームを **同じオリジン**（`localhost` と `192.168.x.x` を混ぜない）で試す
- **要修正（録音）**: 例文では "the grocery store" と記載し英語で読んでいるが、説明文では "supermarket" として説明している。例文と英会話、もしくは説明英会話の再録音が必要
- `.env.local` に `TEACHER_PASSWORD` / `OPENAI_API_KEY` / `AUTH_SECRET` / `DATABASE_URL`（使うなら）
- 受講生 Google ログイン周り: `src/app/student/login/GoogleSignInButton.tsx` など
