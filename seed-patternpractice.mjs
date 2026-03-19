import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function seed() {
  // data.jsを読み込み（CommonJS形式 → evalで取り出す）
  const dataPath = resolve('../material/masaenglish-patternpractice/data.js');
  console.log('Reading:', dataPath);
  const raw = readFileSync(dataPath, 'utf-8');

  // "const cardData = [...];" → 配列を取り出す
  const match = raw.match(/const cardData\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    console.error('cardData not found in data.js');
    process.exit(1);
  }
  const cardData = eval(match[1]);
  console.log(`Loaded ${cardData.length} cards from data.js\n`);

  // カテゴリでグルーピング
  const catMap = new Map();
  for (const card of cardData) {
    if (!catMap.has(card.cat)) {
      catMap.set(card.cat, []);
    }
    catMap.get(card.cat).push(card);
  }

  // 同じカテゴリ内で同じenをチャンクとしてまとめる
  const categories = [];
  for (const [catName, cards] of catMap) {
    const chunkMap = new Map();
    for (const card of cards) {
      if (!chunkMap.has(card.en)) {
        chunkMap.set(card.en, {
          titleEn: card.en,
          titleJp: card.jp,
          patterns: [],
        });
      }
      chunkMap.get(card.en).patterns.push({
        fppQuestion: card.exJp,
        spp: card.exEn,
        situation: card.jp,
        character: '友人',
      });
    }
    categories.push({
      type: catName,
      name: catName,
      chunks: Array.from(chunkMap.values()),
    });
  }

  let totalPatterns = 0;
  let totalChunks = 0;
  console.log('Parsed categories:');
  for (const cat of categories) {
    const pCount = cat.chunks.reduce((s, c) => s + c.patterns.length, 0);
    console.log(`  ${cat.name}: ${cat.chunks.length} chunks, ${pCount} patterns`);
    totalChunks += cat.chunks.length;
    totalPatterns += pCount;
  }
  console.log(`\nTotal: ${categories.length} categories, ${totalChunks} chunks, ${totalPatterns} patterns\n`);

  // 既存データ削除
  console.log('Clearing existing data...');
  await sql`DELETE FROM audio_files`;
  await sql`DELETE FROM patterns`;
  await sql`DELETE FROM chunks`;
  await sql`DELETE FROM categories`;

  // データ投入
  let catOrder = 0;
  for (const cat of categories) {
    catOrder++;
    const [catRow] = await sql`
      INSERT INTO categories (type, name, sort_order)
      VALUES (${cat.type}, ${cat.name}, ${catOrder})
      RETURNING id
    `;

    let chunkOrder = 0;
    for (const chunk of cat.chunks) {
      chunkOrder++;
      const [chunkRow] = await sql`
        INSERT INTO chunks (category_id, chunk_number, title_en, title_jp, sort_order)
        VALUES (${catRow.id}, ${chunkOrder}, ${chunk.titleEn}, ${chunk.titleJp}, ${chunkOrder})
        RETURNING id
      `;

      let patternOrder = 0;
      for (const pattern of chunk.patterns) {
        patternOrder++;
        await sql`
          INSERT INTO patterns (chunk_id, set_number, situation, fpp_intro, fpp_question, spp, character, sort_order)
          VALUES (${chunkRow.id}, ${patternOrder}, ${pattern.situation}, ${null}, ${pattern.fppQuestion}, ${pattern.spp}, ${pattern.character}, ${patternOrder})
        `;
      }
    }
    console.log(`  ✓ ${cat.name}`);
  }

  console.log(`\nSeeding complete! ${totalPatterns} patterns inserted.`);
}

seed().catch(console.error);
