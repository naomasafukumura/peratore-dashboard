'use client';

const cards = [
  {
    href: '/teacher/lesson-form',
    label: 'レッスン後フォーム',
    desc: 'レッスン記録・振り返りを入力',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <path d="M8 12h8M8 8h5M8 16h6" strokeLinecap="round"/>
      </svg>
    ),
    accent: 'bg-emerald-500',
    external: false,
  },
  {
    href: '/teacher/students',
    label: '受講生一覧',
    desc: '受講生の個人リンクを管理',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <circle cx="9" cy="7" r="4"/>
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round"/>
      </svg>
    ),
    accent: 'bg-sky-500',
    external: false,
  },
  {
    href: '/practice-v2.html',
    label: 'Phrases集',
    desc: 'フレーズ練習・復習ページを確認',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
    ),
    accent: 'bg-rose-500',
    external: true,
  },
];

export default function TeacherHome() {
  return (
    <div className="min-h-screen bg-bg-page">
      <header className="bg-bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-[11px] font-black text-black">P</span>
            </div>
            <span className="text-sm font-bold text-text-dark">Peratore</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <a href="/teacher-manual.html" target="_blank" rel="noopener noreferrer" className="text-primary font-medium">マニュアル</a>
            <a href="/teacher/logout" className="text-text-muted hover:text-text-dark">ログアウト</a>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-10">
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-1">Dashboard</p>
          <h1 className="text-xl font-bold text-text-dark">先生ホーム</h1>
        </div>

        <div className="flex flex-col gap-3">
          {cards.map((card) => {
            const inner = (
              <div className="flex items-center gap-4 bg-bg-card border border-border rounded-2xl px-4 py-4 shadow-sm hover:shadow-md transition-all duration-150 hover:-translate-y-0.5 active:scale-[.98] cursor-pointer">
                <div className={`w-10 h-10 rounded-xl ${card.accent} flex items-center justify-center text-white flex-shrink-0`}>
                  {card.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-dark">{card.label}</p>
                  <p className="text-xs text-text-muted mt-0.5">{card.desc}</p>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-text-light flex-shrink-0">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            );

            return card.external ? (
              <a key={card.href} href={card.href} target="_blank" rel="noopener noreferrer">
                {inner}
              </a>
            ) : (
              <a key={card.href} href={card.href}>
                {inner}
              </a>
            );
          })}
        </div>
      </main>
    </div>
  );
}
