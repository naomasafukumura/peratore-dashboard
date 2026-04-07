import { LessonReviewSection } from '../LessonReviewSection';

const dummySummary = [
  { patternId: 1, categoryName: '日常会話', section: '挨拶', trigger: 'How are you doing?', spp: '調子はどう？', createdAt: '2026-04-07T10:00:00Z' },
  { patternId: 2, categoryName: '日常会話', section: '自己紹介', trigger: 'I work as a designer.', spp: 'デザイナーとして働いています。', createdAt: '2026-04-05T10:00:00Z' },
  { patternId: 3, categoryName: 'ビジネス', section: '会議', trigger: 'Let me share my screen.', spp: '画面を共有させてください。', createdAt: '2026-04-02T10:00:00Z' },
  { patternId: 4, categoryName: 'ビジネス', section: 'メール', trigger: 'I look forward to hearing from you.', spp: 'ご連絡お待ちしております。', createdAt: '2026-03-28T10:00:00Z' },
  { patternId: 5, categoryName: '日常会話', section: '買い物', trigger: 'Do you have this in a smaller size?', spp: 'これの小さいサイズはありますか？', createdAt: '2026-03-20T10:00:00Z' },
  { patternId: 6, categoryName: '旅行', section: 'ホテル', trigger: 'Could I get a late checkout?', spp: 'レイトチェックアウトできますか？', createdAt: '2026-03-15T10:00:00Z' },
  { patternId: 7, categoryName: 'ビジネス', section: 'プレゼン', trigger: 'Let me walk you through the data.', spp: 'データを順にご説明します。', createdAt: '2026-02-10T10:00:00Z' },
  { patternId: 8, categoryName: '日常会話', section: '天気', trigger: "It's supposed to rain tomorrow.", spp: '明日は雨の予報です。', createdAt: '2026-02-05T10:00:00Z' },
  { patternId: 9, categoryName: '旅行', section: '空港', trigger: 'Where is the baggage claim?', spp: '手荷物受取所はどこですか？', createdAt: '2026-01-20T10:00:00Z' },
  { patternId: 10, categoryName: 'ビジネス', section: '電話', trigger: 'May I put you on hold?', spp: '少々お待ちいただけますか？', createdAt: '2025-12-15T10:00:00Z' },
  { patternId: 11, categoryName: '日常会話', section: 'レストラン', trigger: 'Could we get the check, please?', spp: 'お会計をお願いします。', createdAt: '2025-12-10T10:00:00Z' },
  { patternId: 12, categoryName: '旅行', section: '道案内', trigger: 'Is it within walking distance?', spp: '歩いて行ける距離ですか？', createdAt: '2025-11-25T10:00:00Z' },
  { patternId: 13, categoryName: 'ビジネス', section: '交渉', trigger: 'We need to find a middle ground.', spp: '妥協点を見つける必要があります。', createdAt: '2025-11-10T10:00:00Z' },
  { patternId: 14, categoryName: '日常会話', section: '趣味', trigger: "I've been into hiking lately.", spp: '最近ハイキングにハマっています。', createdAt: '2025-10-20T10:00:00Z' },
  { patternId: 15, categoryName: 'ビジネス', section: '報告', trigger: 'The project is on track.', spp: 'プロジェクトは順調です。', createdAt: '2025-10-05T10:00:00Z' },
];

export default function PreviewPage() {
  return (
    <div className="min-h-screen bg-bg-page px-4 py-8 max-w-md mx-auto">
      <h1 className="text-lg font-bold text-text-dark">マイページ（プレビュー）</h1>
      <p className="text-sm text-text-muted mt-1">demo@example.com</p>
      <p className="mt-4 text-sm text-text-dark">
        登録中の受講生名: <strong>秋山太郎</strong>
      </p>
      <LessonReviewSection summary={dummySummary} categoryLabel="レッスン復習集" />
    </div>
  );
}
