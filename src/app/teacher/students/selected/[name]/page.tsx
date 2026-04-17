export const dynamic = 'force-dynamic';

export default async function SelectedStudentPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const studentName = decodeURIComponent(name);
  const homeworkHref = `/homework.html?student=${encodeURIComponent(studentName)}`;
  const reviewHref = `/teacher/students/${encodeURIComponent(studentName)}`;

  return (
    <div className="min-h-screen bg-[linear-gradient(170deg,#FFF5EC_0%,#FCE4D6_100%)]">
      <main className="max-w-md mx-auto px-6 pt-12 pb-14 flex flex-col items-center">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 text-[#B87A6A] mb-4">
            <span className="h-[1px] w-8 bg-[#D9A79A]" />
            <span className="text-[11px] tracking-[0.4em]">WELCOME</span>
            <span className="h-[1px] w-8 bg-[#D9A79A]" />
          </div>
          <h1 className="text-[26px] font-semibold tracking-[0.05em] text-[#3D2B24]">
            {studentName}<span className="text-[#B87A6A] text-[18px] font-normal ml-1">さん</span>
          </h1>
          <p className="mt-3 text-[14px] text-[#8F6B5E] tracking-wider">
            どちらにしますか？
          </p>
        </div>

        <div className="flex flex-col items-center gap-10 w-full">
          <a
            href={homeworkHref}
            className="group flex flex-col items-center active:scale-95 transition-transform"
          >
            <div className="relative w-[220px] h-[220px] rounded-full bg-[radial-gradient(circle_at_30%_25%,#FFFFFF_0%,#FCE1D2_55%,#F0B8A2_100%)] shadow-[0_18px_40px_rgba(200,120,95,0.30),inset_0_-6px_14px_rgba(180,95,70,0.18),inset_0_4px_10px_rgba(255,255,255,0.7)] flex items-center justify-center border-[3px] border-white group-hover:shadow-[0_22px_48px_rgba(200,120,95,0.38),inset_0_-6px_14px_rgba(180,95,70,0.18),inset_0_4px_10px_rgba(255,255,255,0.7)] transition-shadow">
              <svg viewBox="0 0 24 24" fill="none" stroke="#8A3C2A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[96px] h-[96px] drop-shadow-[0_2px_2px_rgba(138,60,42,0.2)]">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              <span className="absolute top-6 right-8 text-white/80 text-base">✦</span>
            </div>
            <div className="mt-5 text-[30px] font-bold tracking-[0.2em] text-[#3D2B24] leading-none">
              宿　題
            </div>
            <div className="mt-1.5 text-[11px] text-[#B87A6A] tracking-[0.35em]">
              HOMEWORK
            </div>
          </a>

          <a
            href={reviewHref}
            className="group flex flex-col items-center active:scale-95 transition-transform"
          >
            <div className="relative w-[220px] h-[220px] rounded-full bg-[radial-gradient(circle_at_30%_25%,#FFFFFF_0%,#F4E7C8_55%,#D9B872_100%)] shadow-[0_18px_40px_rgba(170,135,65,0.30),inset_0_-6px_14px_rgba(140,105,40,0.18),inset_0_4px_10px_rgba(255,255,255,0.7)] flex items-center justify-center border-[3px] border-white group-hover:shadow-[0_22px_48px_rgba(170,135,65,0.38),inset_0_-6px_14px_rgba(140,105,40,0.18),inset_0_4px_10px_rgba(255,255,255,0.7)] transition-shadow">
              <svg viewBox="0 0 24 24" fill="none" stroke="#6B4A0E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[96px] h-[96px] drop-shadow-[0_2px_2px_rgba(107,74,14,0.2)]">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <path d="M10 7h6" />
                <path d="M10 11h4" />
              </svg>
              <span className="absolute top-6 right-8 text-white/80 text-base">✦</span>
            </div>
            <div className="mt-5 text-[30px] font-bold tracking-[0.2em] text-[#3D2B24] leading-none">
              復　習
            </div>
            <div className="mt-1.5 text-[11px] text-[#9E8450] tracking-[0.35em]">
              REVIEW
            </div>
          </a>
        </div>

        <div className="mt-14 flex items-center justify-center gap-2 text-[#C9A79A]">
          <span className="text-[10px]">✦</span>
          <span className="text-[10px] tracking-[0.35em]">PERATORE</span>
          <span className="text-[10px]">✦</span>
        </div>
      </main>
    </div>
  );
}
