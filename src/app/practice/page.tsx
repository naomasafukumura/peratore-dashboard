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

  const grouped = new Map<string, Category[]>();
  for (const cat of categories) {
    const existing = grouped.get(cat.type) || [];
    existing.push(cat);
    grouped.set(cat.type, existing);
  }

  return (
    <div className="min-h-screen bg-bg-page pb-20">
      <header className="bg-bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-text-muted hover:text-text-dark transition-colors">←</Link>
          <h1 className="text-lg font-bold text-text-dark">練習するチャンクを選ぼう</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 mt-6">
        {Array.from(grouped.entries()).map(([type, cats]) => (
          <div key={type} className="mb-8">
            <h2 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3 px-1">
              {type}
            </h2>
            {cats.map((cat) => (
              <div key={cat.id} className="mb-5">
                <h3 className="text-sm font-medium text-text-muted mb-2 px-1">{cat.name}</h3>
                <div className="grid grid-cols-1 gap-2.5">
                  {cat.chunks.map((chunk) => (
                    <Link
                      key={chunk.id}
                      href={`/practice/${chunk.id}`}
                      className="bg-bg-card rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)] border border-border hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 active:scale-[0.98] transition-all"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-text-dark">{chunk.titleEn}</p>
                          {chunk.titleJp && (
                            <p className="text-text-light text-sm mt-0.5">{chunk.titleJp}</p>
                          )}
                        </div>
                        <span className="text-xs text-text-light bg-bg-page px-2.5 py-1 rounded-full">
                          {chunk.patternCount}問
                        </span>
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
