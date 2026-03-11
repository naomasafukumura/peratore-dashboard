import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// パーサー（TypeScriptと同じロジックをESMで書き直し）
function parseInspectedContents(content) {
  const categories = [];
  const lines = content.split('\n');

  let currentType = '';
  let currentName = '';
  let currentChunks = [];
  let currentChunk = null;
  let currentPattern = null;
  let inSet = false;

  function pushCategory() {
    if (currentName && currentChunks.length > 0) {
      categories.push({
        type: currentType,
        name: currentName,
        chunks: [...currentChunks],
      });
    }
  }

  function pushChunk() {
    if (currentChunk && currentChunk.patterns.length > 0) {
      currentChunks.push({ ...currentChunk });
    }
  }

  function pushPattern() {
    if (currentPattern && currentPattern.situation && currentPattern.fppQuestion && currentPattern.spp) {
      if (currentChunk) {
        currentChunk.patterns.push({
          setNumber: currentPattern.setNumber || 1,
          situation: currentPattern.situation,
          fppIntro: currentPattern.fppIntro || null,
          fppQuestion: currentPattern.fppQuestion,
          spp: currentPattern.spp,
        });
      }
    }
    currentPattern = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('## ')) {
      pushPattern();
      pushChunk();
      pushCategory();
      const typeMatch = line.match(/^## (?:\d+\.\s*)?(.+?)(?:\s+\d+チャンク.*)?$/);
      if (typeMatch) {
        currentType = typeMatch[1].trim();
        currentName = '';
        currentChunks = [];
        currentChunk = null;
      }
      continue;
    }

    if (line.startsWith('### ')) {
      pushPattern();
      pushChunk();
      if (currentName && currentChunks.length > 0) {
        categories.push({ type: currentType, name: currentName, chunks: [...currentChunks] });
      }
      const nameMatch = line.match(/^### (.+?)\s+\d+チャンク/);
      if (nameMatch) {
        currentName = nameMatch[1].trim();
      }
      currentChunks = [];
      currentChunk = null;
      continue;
    }

    if (line.startsWith('#### ')) {
      pushPattern();
      pushChunk();
      const chunkMatch = line.match(/^#### (\d+)\.\s*(.+?)(?:（(.+?)）)?$/);
      if (chunkMatch) {
        if (!currentName && currentType) {
          currentName = currentType;
          currentChunks = [];
        }
        currentChunk = {
          chunkNumber: parseInt(chunkMatch[1]),
          titleEn: chunkMatch[2].trim(),
          titleJp: chunkMatch[3]?.trim() || '',
          patterns: [],
        };
      }
      continue;
    }

    if (line.startsWith('##### セット')) {
      pushPattern();
      const setMatch = line.match(/セット(\d+)/);
      currentPattern = { setNumber: setMatch ? parseInt(setMatch[1]) : 1 };
      inSet = true;
      continue;
    }

    if (!inSet || !currentPattern) continue;

    if (line.startsWith('situation:')) {
      currentPattern.situation = line.replace('situation:', '').trim();
      continue;
    }
    if (line.startsWith('FPP前振り:')) {
      const val = line.replace('FPP前振り:', '').trim();
      currentPattern.fppIntro = val === '（なし）' ? null : val;
      continue;
    }
    if (line.startsWith('FPP質問:')) {
      currentPattern.fppQuestion = line.replace('FPP質問:', '').trim();
      continue;
    }
    if (line.startsWith('trigger:')) {
      currentPattern.fppQuestion = line.replace('trigger:', '').trim();
      currentPattern.fppIntro = null;
      continue;
    }
    if (line.startsWith('FPP:')) {
      currentPattern.fppQuestion = line.replace('FPP:', '').trim();
      currentPattern.fppIntro = null;
      continue;
    }
    if (line.startsWith('SPP:')) {
      currentPattern.spp = line.replace('SPP:', '').trim();
      continue;
    }
  }

  pushPattern();
  pushChunk();
  pushCategory();
  return categories;
}

// situationからキャラクターを推定
function detectCharacter(situation) {
  if (situation.includes('夫')) return '夫';
  if (situation.includes('上司')) return '上司';
  if (situation.includes('同僚')) return '同僚';
  if (situation.includes('義母')) return '義母';
  if (situation.includes('ママ友')) return 'ママ友';
  if (situation.includes('姉')) return '姉';
  if (situation.includes('近所')) return '近所';
  if (situation.includes('友人') || situation.includes('友達')) return '友人';
  return '友人';
}

async function seed() {
  // InspectedContents.mdを読み込み
  const mdPath = resolve('../material/masaenglish-patternpractice/InspectedContents.md');
  console.log('Reading:', mdPath);
  const content = readFileSync(mdPath, 'utf-8');

  const categories = parseInspectedContents(content);

  let totalPatterns = 0;
  let totalChunks = 0;

  console.log('\nParsed categories:');
  for (const cat of categories) {
    console.log(`  ${cat.type} / ${cat.name}: ${cat.chunks.length} chunks, ${cat.chunks.reduce((s, c) => s + c.patterns.length, 0)} patterns`);
    totalChunks += cat.chunks.length;
    totalPatterns += cat.chunks.reduce((s, c) => s + c.patterns.length, 0);
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
        VALUES (${catRow.id}, ${chunk.chunkNumber}, ${chunk.titleEn}, ${chunk.titleJp}, ${chunkOrder})
        RETURNING id
      `;

      let patternOrder = 0;
      for (const pattern of chunk.patterns) {
        patternOrder++;
        const character = detectCharacter(pattern.situation);
        await sql`
          INSERT INTO patterns (chunk_id, set_number, situation, fpp_intro, fpp_question, spp, character, sort_order)
          VALUES (${chunkRow.id}, ${pattern.setNumber}, ${pattern.situation}, ${pattern.fppIntro}, ${pattern.fppQuestion}, ${pattern.spp}, ${character}, ${patternOrder})
        `;
      }
    }
    console.log(`  ✓ ${cat.type} / ${cat.name}`);
  }

  console.log(`\nSeeding complete! ${totalPatterns} patterns inserted.`);
}

seed().catch(console.error);
