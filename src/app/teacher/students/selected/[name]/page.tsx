export const dynamic = 'force-dynamic';

export default async function SelectedStudentPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const studentName = decodeURIComponent(name);
  const homeworkHref = `/homework.html?student=${encodeURIComponent(studentName)}&forceSettings=1`;
  const reviewHref = `/practice-v2.html?student=${encodeURIComponent(studentName)}&forceSettings=1`;

  return (
    <div className="min-h-screen bg-[linear-gradient(165deg,#FFF5EC_0%,#FDE8DC_50%,#F6DDD8_100%)]">
      <main className="max-w-md mx-auto px-6 pt-12 pb-14 flex flex-col">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 text-[#B87A6A] mb-5">
            <span className="h-[1px] w-6 bg-[#D9A79A]" />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-4 h-4">
              <path d="M12 3 C13 7, 17 7, 17 12 C17 17, 12 21, 12 21 C12 21, 7 17, 7 12 C7 7, 11 7, 12 3 Z" />
            </svg>
            <span className="h-[1px] w-6 bg-[#D9A79A]" />
          </div>
          <h1 className="text-[26px] font-semibold tracking-[0.05em] text-[#3D2B24]">
            {studentName}<span className="text-[#B87A6A] text-[18px] font-normal ml-1">さん</span>
          </h1>
          <p className="mt-3 text-[14px] text-[#8F6B5E] tracking-wider">
            今日はどちらにしますか？
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <a
            href={homeworkHref}
            className="group relative block bg-white/85 backdrop-blur-sm rounded-[28px] border border-[#F2CFC2] shadow-[0_10px_30px_rgba(200,130,110,0.15)] hover:shadow-[0_14px_40px_rgba(200,130,110,0.25)] hover:-translate-y-0.5 transition-all overflow-hidden"
          >
            <span className="absolute top-4 right-5 text-[#E8AFA0] text-xl leading-none">✦</span>
            <div className="flex items-center gap-5 py-8 px-7">
              <div className="shrink-0 w-20 h-20 rounded-[22px] bg-[linear-gradient(140deg,#FCE6DB,#F8CFC0)] flex items-center justify-center shadow-[inset_0_-3px_8px_rgba(215,140,120,0.15)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="#A85C47" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-[26px] font-bold tracking-[0.15em] text-[#3D2B24] leading-tight">
                  宿　題
                </div>
                <div className="mt-1.5 text-[12px] text-[#B87A6A] tracking-[0.25em]">
                  homework
                </div>
              </div>
              <div className="shrink-0 w-9 h-9 rounded-full bg-[#F2CFC2] flex items-center justify-center text-[#A85C47] text-lg group-hover:translate-x-1 transition-transform">
                →
              </div>
            </div>
          </a>

          <a
            href={reviewHref}
            className="group relative block bg-white/85 backdrop-blur-sm rounded-[28px] border border-[#DDD0B5] shadow-[0_10px_30px_rgba(160,140,100,0.15)] hover:shadow-[0_14px_40px_rgba(160,140,100,0.25)] hover:-translate-y-0.5 transition-all overflow-hidden"
          >
            <span className="absolute top-4 right-5 text-[#C9B786] text-xl leading-none">✦</span>
            <div className="flex items-center gap-5 py-8 px-7">
              <div className="shrink-0 w-20 h-20 rounded-[22px] bg-[linear-gradient(140deg,#F4ECD6,#E7D9B4)] flex items-center justify-center shadow-[inset_0_-3px_8px_rgba(180,150,90,0.15)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="#7A5A1E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <path d="M10 6h6" />
                  <path d="M10 10h4" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-[26px] font-bold tracking-[0.15em] text-[#3D2B24] leading-tight">
                  復　習
                </div>
                <div className="mt-1.5 text-[12px] text-[#9E8450] tracking-[0.25em]">
                  review
                </div>
              </div>
              <div className="shrink-0 w-9 h-9 rounded-full bg-[#EADFBF] flex items-center justify-center text-[#7A5A1E] text-lg group-hover:translate-x-1 transition-transform">
                →
              </div>
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
