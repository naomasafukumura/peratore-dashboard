import { sql } from '@/lib/db';
import Link from 'next/link';

interface Category {
  id: number;
  type: string;
  name: string;
  chunks: {
    id: number;
    chunkNumber: number;
    titleEn: string;
    titleJp: string;
    patternCount: number;
  }[];
}

export const dynamic = 'force-dynamic';

export default async function PracticePage() {
  const categories = (await sql`
    SELECT c.id, c.type, c.name, c.sort_order,
      json_agg(
        json_build_object(
          'id', ch.id,
          'chunkNumber', ch.chunk_number,
          'titleEn', ch.title_en,
          'titleJp', ch.title_jp,
          'patternCount', (SELECT COUNT(*)::int FROM patterns p WHERE p.chunk_id = ch.id)
        ) ORDER BY ch.sort_order
      ) as chunks
    FROM categories c
    LEFT JOIN chunks ch ON ch.category_id = c.id
    GROUP BY c.id
    ORDER BY c.sort_order
  `) as Category[];

  // タイプごとにグルーピング
  const grouped = new Map<string, Category[]>();
  for (const cat of categories) {
    const existing = grouped.get(cat.type) || [];
    existing.push(cat);
    grouped.set(cat.type, existing);
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-20">
      <div className="max-w-lg mx-auto p-4">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="text-zinc-400 hover:text-white">←</Link>
          <h1 className="text-xl font-bold text-white">カテゴリ選択</h1>
        </div>

        {Array.from(grouped.entries()).map(([type, cats]) => (
          <div key={type} className="mb-8">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-1">
              {type}
            </h2>
            {cats.map((cat) => (
              <div key={cat.id} className="mb-4">
                <h3 className="text-base font-medium text-zinc-300 mb-2 px-1">{cat.name}</h3>
                <div className="space-y-2">
                  {cat.chunks.map((chunk) => (
                    <Link
                      key={chunk.id}
                      href={`/practice/${chunk.id}`}
                      className="block bg-zinc-900 rounded-lg p-4 hover:bg-zinc-800 transition-colors border border-zinc-800"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-white font-medium">{chunk.titleEn}</p>
                          {chunk.titleJp && (
                            <p className="text-zinc-500 text-sm mt-1">{chunk.titleJp}</p>
                          )}
                        </div>
                        <span className="text-zinc-600 text-xs">{chunk.patternCount}問</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
