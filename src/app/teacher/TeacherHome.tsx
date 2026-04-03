'use client';

import Link from 'next/link';

const cards = [
  {
    href: '/teacher/lesson-form',
    label: 'レッスン後フォーム',
    desc: 'レッスン記録・振り返りを入力',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-7 h-7">
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <path d="M8 12h8M8 8h5M8 16h6" strokeLinecap="round"/>
      </svg>
    ),
    bg: 'bg-emerald-400',
    external: false,
  },
  {
    href: '/teacher/students',
    label: '受講生一覧',
    desc: '受講生の個人リンクを管理',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-7 h-7">
        <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round"/>
      </svg>
    ),
    bg: 'bg-sky-400',
    external: false,
  },
  {
    href: '/practice-v2.html',
    label: 'Phrases集',
    desc: 'フレーズ練習・復習ページを確認',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-7 h-7">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
    ),
    bg: 'bg-rose-400',
    external: true,
  },
  {
    href: '/teacher/dashboard',
    label: '教材管理',
    desc: '新しいフレーズを登録・音声生成',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-7 h-7">
        <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
      </svg>
    ),
    bg: 'bg-amber-400',
    external: false,
  },
];

export default function TeacherHome() {
  return (
    <div className="min-h-screen bg-bg-page">
      {/* Header */}
      <header className="bg-bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-[11px] font-black text-black">P</span>
            </div>
            <span className="text-sm font-bold text-text-dark">Peratore 先生ホーム</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <a href="/teacher-manual.html" target="_blank" rel="noopener noreferrer" className="text-primary font-medium">マニュアル</a>
            <Link href="/teacher/logout" className="text-text-muted hover:text-text-dark">ログアウト</Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-text-dark">おはようございます</h1>
          <p className="text-sm text-text-muted mt-1">今日もよろしくお願いします</p>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {cards.map((card) => {
            const inner = (
              <div className="bg-bg-card border border-border rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200 hover:-translate-y-0.5 active:scale-[.98] cursor-pointer h-full flex flex-col gap-4">
                <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center text-white flex-shrink-0`}>
                  {card.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-text-dark leading-snug">{card.label}</p>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-text-light flex-shrink-0 mt-0.5">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </div>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">{card.desc}</p>
                </div>
              </div>
            );

            return card.external ? (
              <a key={card.href} href={card.href} target="_blank" rel="noopener noreferrer">
                {inner}
              </a>
            ) : (
              <Link key={card.href} href={card.href} prefetch={false}>
                {inner}
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
