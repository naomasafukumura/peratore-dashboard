import { LessonReviewSection } from '../LessonReviewSection';

const dummySummary = [
  { patternId: 1, categoryName: '日常会話', section: '挨拶', trigger: 'How are you doing?', spp: "I'm doing great, thanks!", followupQuestion: 'Anything exciting going on?', followupAnswer: 'Not much, just keeping busy.', situationJa: '友人に近況を聞かれた', createdAt: '2026-04-07T10:00:00Z' },
  { patternId: 2, categoryName: '日常会話', section: '自己紹介', trigger: 'What do you do for work?', spp: 'I work as a designer.', followupQuestion: 'What kind of design do you do?', followupAnswer: 'Mainly UI design for apps.', situationJa: '初対面で仕事を聞かれた', createdAt: '2026-04-05T10:00:00Z' },
  { patternId: 3, categoryName: 'ビジネス', section: '会議', trigger: 'Can you share your screen?', spp: "Sure, let me share my screen.", followupQuestion: 'Can everyone see it?', followupAnswer: 'Yes, looks good on my end.', situationJa: 'オンライン会議で画面共有を求められた', createdAt: '2026-04-02T10:00:00Z' },
  { patternId: 4, categoryName: 'ビジネス', section: 'メール', trigger: 'Have you heard back from them?', spp: "Not yet, I'm still waiting.", followupQuestion: 'When did you send the email?', followupAnswer: 'I sent it two days ago.', situationJa: '返信待ちの状況を聞かれた', createdAt: '2026-03-28T10:00:00Z' },
  { patternId: 5, categoryName: '日常会話', section: '買い物', trigger: 'Do you have this in a smaller size?', spp: "I'll go check in the back.", followupQuestion: 'How long will it take?', followupAnswer: 'Just a minute.', situationJa: '店員にサイズを聞いた', createdAt: '2026-03-20T10:00:00Z' },
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
