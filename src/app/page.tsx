import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold text-white mb-2">ペラトレ</h1>
      <p className="text-zinc-400 mb-12">パターンプラクティス学習サイト</p>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <Link
          href="/practice"
          className="flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 text-white rounded-xl font-semibold text-lg hover:bg-blue-500 transition-colors"
        >
          練習する
        </Link>
        <Link
          href="/teacher/login"
          className="flex items-center justify-center gap-3 px-6 py-4 bg-zinc-800 text-zinc-300 rounded-xl font-medium hover:bg-zinc-700 transition-colors"
        >
          先生用ページ
        </Link>
      </div>
    </div>
  );
}
