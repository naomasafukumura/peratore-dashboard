/**
 * perfect3.md（リポジトリ外パス）から投入する旧スクリプト。
 * リポジトリ内の practice-v2 と揃えたい場合は次を使う:
 *   npm run db:seed:base:dry
 *   SEED_BASE_CONFIRM=yes npm run db:seed:base
 */
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

/**
 * perfect3.md パーサー
 *
 * 構造:
 * # カテゴリー1：返答型（実装済み）
 * ## 1. 返答：未来 (12問)          ← カテゴリ (type + name)
 * #### 1. I'm gonna ~              ← チャンク (title_en)
 * ##### セット1                     ← パターン
 * situation: ...
 * trigger: ...                      ← fpp_question
 * SPP: ...                          ← spp
 * followup: ...                     ← followup_question
 * conclusion2Examples: ...           ← followup_answer
 */
function parsePerfect3(content) {
  const categories = [];
  const lines = content.split('\n');

  let currentType = '';        // e.g. "返答型"
  let currentCatName = '';     // e.g. "返答：未来"
  let currentChunks = [];
  let currentChunk = null;     // { titleEn, titleJp, patterns: [] }
  let currentPattern = null;   // { situation, trigger, spp, followup, conclusion2 }

  function pushPattern() {
    if (currentPattern && currentPattern.trigger && currentPattern.spp && currentChunk) {
      currentChunk.patterns.push({ ...currentPattern });
    }
    currentPattern = null;
  }

  function pushChunk() {
    pushPattern();
    if (currentChunk && currentChunk.patterns.length > 0) {
      currentChunks.push({ ...currentChunk });
    }
    currentChunk = null;
  }

  function pushCategory() {
    pushChunk();
    if (currentCatName && currentChunks.length > 0) {
      categories.push({
        type: currentType || currentCatName,
        name: currentCatName,
        chunks: [...currentChunks],
      });
    }
    currentChunks = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const trimmed = line.trim();

    // # カテゴリー1：返答型 or # カテゴリー2以降（未実装）
    if (/^# カテゴリー/.test(trimmed)) {
      pushCategory();
      const m = trimmed.match(/^# カテゴリー\d+[：:](.+?)(?:（.*?）)?$/);
      if (m) {
        currentType = m[1].trim();
      }
      currentCatName = '';
      continue;
    }

    // ## 1. 返答：未来 (12問) or ## 好み 4チャンク / 12問
    if (/^## \d*\.?\s*/.test(trimmed) && !trimmed.startsWith('## #')) {
      pushCategory();
      // "## 1. 返答：未来 (12問)" or "## 好み 4チャンク / 12問"
      const m = trimmed.match(/^## \d*\.?\s*(.+?)(?:\s*[\(（].*)?$/);
      if (m) {
        currentCatName = m[1].replace(/\s+\d+チャンク.*$/, '').trim();
      }
      continue;
    }

    // #### 1. I'm gonna ~ or #### 1. I'm gonna ~→検品済み
    if (/^#### \d+\.\s*/.test(trimmed)) {
      pushChunk();
      const m = trimmed.match(/^#### \d+\.\s*(.+?)(?:→.*)?$/);
      if (m) {
        const titleEn = m[1].trim();
        // 日本語の説明が（）内にあれば抽出
        const jpMatch = titleEn.match(/（(.+?)）/);
        currentChunk = {
          titleEn: titleEn.replace(/（.+?）/, '').trim(),
          titleJp: jpMatch ? jpMatch[1] : '',
          patterns: [],
        };
      }
      continue;
    }

    // ##### セットN
    if (/^##### セット\d+/.test(trimmed)) {
      pushPattern();
      currentPattern = {
        setNumber: parseInt(trimmed.match(/セット(\d+)/)?.[1] || '1'),
        situation: '',
        trigger: '',
        spp: '',
        followup: '',
        conclusion2: '',
      };
      continue;
    }

    // パターンフィールド
    if (currentPattern) {
      if (trimmed.startsWith('situation:')) {
        currentPattern.situation = trimmed.replace('situation:', '').trim();
      } else if (trimmed.startsWith('trigger:')) {
        currentPattern.trigger = trimmed.replace('trigger:', '').trim();
      } else if (trimmed.startsWith('SPP:')) {
        currentPattern.spp = trimmed.replace('SPP:', '').trim();
      } else if (trimmed.startsWith('followup:')) {
        currentPattern.followup = trimmed.replace('followup:', '').trim();
      } else if (trimmed.startsWith('conclusion2Examples:')) {
        currentPattern.conclusion2 = trimmed.replace('conclusion2Examples:', '').trim();
      }
    }
  }

  // 最後のデータをフラッシュ
  pushCategory();

  return categories;
}

// situationからキャラクターを推定
function detectCharacter(situation) {
  if (!situation) return '友人';
  if (situation.includes('夫')) return '夫';
  if (situation.includes('上司')) return '上司';
  if (situation.includes('同僚')) return '同僚';
  if (situation.includes('義母')) return '義母';
  if (situation.includes('ママ友')) return 'ママ友';
  if (situation.includes('姉')) return '姉';
  if (situation.includes('近所')) return '近所';
  if (situation.includes('友人') || situation.includes('友達')) return '友人';
  if (situation.includes('家族') || situation.includes('お母さん')) return '家族';
  if (situation.includes('先生')) return '先生';
  return '友人';
}

async function seed() {
  const mdPath = resolve('../material/masaenglish-patternpractice/perfect3.md');
  console.log('Reading:', mdPath);
  const content = readFileSync(mdPath, 'utf-8');

  const categories = parsePerfect3(content);

  let totalPatterns = 0;
  let totalChunks = 0;

  console.log('\nParsed categories:');
  for (const cat of categories) {
    const pCount = cat.chunks.reduce((s, c) => s + c.patterns.length, 0);
    console.log(`  ${cat.type} / ${cat.name}: ${cat.chunks.length} chunks, ${pCount} patterns`);
    totalChunks += cat.chunks.length;
    totalPatterns += pCount;
  }
  console.log(`\nTotal: ${categories.length} categories, ${totalChunks} chunks, ${totalPatterns} patterns\n`);

  if (totalPatterns === 0) {
    console.error('No patterns found! Check parser.');
    process.exit(1);
  }

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
      for (const p of chunk.patterns) {
        patternOrder++;
        const character = detectCharacter(p.situation);
        await sql`
          INSERT INTO patterns (chunk_id, set_number, situation, fpp_intro, fpp_question, spp, spp_jp, followup_question, followup_answer, followup_answer_jp, character, sort_order)
          VALUES (
            ${chunkRow.id},
            ${p.setNumber || patternOrder},
            ${p.situation || null},
            ${null},
            ${p.trigger},
            ${p.spp},
            ${null},
            ${p.followup || null},
            ${p.conclusion2 || null},
            ${null},
            ${character},
            ${patternOrder}
          )
        `;
      }
    }
    console.log(`  ✓ ${cat.type} / ${cat.name} (${cat.chunks.reduce((s, c) => s + c.patterns.length, 0)} patterns)`);
  }

  console.log(`\nSeeding complete! ${totalPatterns} patterns inserted.`);
}

seed().catch(console.error);
