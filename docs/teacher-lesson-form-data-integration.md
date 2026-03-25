# 先生レッスン後フォーム — データ連携仕様

このドキュメントは **`/teacher/lesson-form`** と、Neon（PostgreSQL）・既存 API の対応関係をまとめたものです。AI 整形・音声生成・本番保存を接続するときのたたき台にしてください。

## practice-v2 の「例文データ」はどこか

- **メイン:** `public/practice-v2.html` 内の **`let DATA=[...]`**（約1033行付近）。API 取得に失敗したときの **フォールバック** と同じ JSON。
- **別ファイル:** `public/data.js` は別用途（カード一覧 `cardData`）。**カバー画面のカテゴリ名**は `practice-v2.html` の `DATA[].category` を参照。
- **コード側の同期:** 埋め込み DATA から拾ったカテゴリ名の定数は `src/lib/practice-v2-embedded-categories.ts`。`practice-v2.html` の区分を変えたらここも合わせる。

## 画面

| パス | 役割 |
|------|------|
| `/`（トップ）および `/teacher/lesson-form` | レッスン後フォーム（**レッスンメモ** ＋ **登録開始** … AI 解析後に `submit-preview` まで連続実行。中間の編集 UI はなし） |
| `/teacher` | 既存の先生ダッシュボード（チャンク・パターン管理） |

## フォームが呼ぶ API

| メソッド | パス | 用途 |
|----------|------|------|
| GET | `/api/students` | 受講生名一覧（現状は `assignments.student_name` の DISTINCT） |
| GET | `/api/patterns/search?q=` | Trigger（`patterns.fpp_question`）部分一致検索。2文字未満は空配列 |
| POST | `/api/lesson-submission` | ① `analyze-memo` … **2往復4英語＋状況＋カテゴリ**を JSON で出力（`followup_*` も必須。メモに無くても文脈補完可）。カテゴリ候補は **practice-v2 埋め込み DATA の区分名**＋ DB `categories`。② `submit-preview` … 上記＋フォロー2項目が空なら 400。**`DATABASE_URL` あり**なら DB・音声まで保存。**未設定時はプレビュー JSON のみ** |

## DB テーブルとの対応（現状）

| フォーム項目 | 将来の保存先の目安（`patterns` 列） |
|--------------|-------------------------------------|
| Trigger | `fpp_question` |
| SPP | `spp` |
| Follow-up 質問 | `followup_question` |
| Follow-up 回答 | `followup_answer` |
| レッスンメモ（長文） | `analyze-memo` で AI が上記＋`situation`・カテゴリ案を生成。保存時は `preview.rawLessonMemo` などで保持予定 |

登録開始フローでは、AI 出力に基づき **新規チャンク** を 1 件作り、選択した受講生に **assignments** で紐づけます。

## 受講生一覧について

- **いま:** `GET /api/students` → `SELECT DISTINCT student_name FROM assignments`
- **将来:** 専用の「受講生テーブル」ができた場合は **`/api/students` の実装だけ差し替え**すれば、フォーム UI はそのまま利用可能にできる設計にしている。

## 後続タスク（残り）

1. ~~メモからの AI 分解~~ … 実装済み
2. ~~ElevenLabs 4 本~~ … `submit-preview` 保存時に実装済み（`/api/audio/generate` にも `followup_question` / `natural` を追加）
3. ~~DB 実保存~~ … `DATABASE_URL` ありで `submit-preview` 時に実行
4. 先生用アクセス制限（パスワード or Google OAuth）
5. 既存 Neon に **`assignments` テーブル**が無い場合は `db-setup.mjs` の該当 `CREATE TABLE` を実行する

## 関連ファイル（コード）

- `src/app/teacher/lesson-form/LessonFormClient.tsx` — フォーム UI
- `src/app/api/students/route.ts`
- `src/app/api/patterns/search/route.ts`
- `src/app/api/lesson-submission/route.ts`
- `src/lib/lesson-persist.ts` — DB 保存＋音声 upsert
- `src/lib/elevenlabs-tts.ts` — ElevenLabs 呼び出し共通化

## プロジェクト内の他ドキュメント・仕様

- 全体タスク・優先順位: リポジトリ直下の `task.md`
- 読み手向け補足: `task.md` 内「読み手向けの補足（雄飛向け）」
