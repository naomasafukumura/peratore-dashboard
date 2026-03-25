/**
 * Phase C: public/practice-v2.html の埋め込み DATA を Neon に投入する。
 *
 * 前提: .env.local に DATABASE_URL
 *
 * 実行:
 *   SEED_BASE_CONFIRM=yes node scripts/seed-practice-v2-base.mjs
 *
 * 既存の categories / chunks / patterns / audio_files を削除してから入れ直す
 * （chunks は CASCADE で assignments も消えるので本番では要注意）。
 *
 * オプション:
 *   --dry-run  … DB に書かず件数だけ表示
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

config({ path: resolve(root, '.env.local') });

const dryRun = process.argv.includes('--dry-run');
const confirmed = process.env.SEED_BASE_CONFIRM === 'yes';

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

function extractDataArray(html) {
  const marker = 'let DATA=';
  const endMarker = '// ===== Load Data from API';
  const i = html.indexOf(marker);
  if (i < 0) throw new Error('let DATA= が見つかりません');
  const start = i + marker.length;
  const j = html.indexOf(endMarker, start);
  if (j < 0) throw new Error('終端マーカーが見つかりません');
  let raw = html.slice(start, j).trim();
  if (raw.endsWith(';')) raw = raw.slice(0, -1).trim();
  return JSON.parse(raw);
}

function buildCatalog(data) {
  /** @type {{ type: string, name: string, chunks: { titleEn: string, titleJp: string, patterns: any[] }[] }[]} */
  const out = [];

  for (const cat of data) {
    const categoryName = cat.category || '未分類';
    const type = 'ベース';

    /** @type {Map<string, { titleEn: string, titleJp: string, patterns: any[] }>} */
    const chunkBySection = new Map();

    for (const card of cat.cards || []) {
      const section = (card.section || 'General').trim() || 'General';
      if (!chunkBySection.has(section)) {
        chunkBySection.set(section, { titleEn: section, titleJp: '', patterns: [] });
      }
      const st = (card.states && card.states[0]) || {};
      const conclusion2 =
        Array.isArray(st.conclusion2Examples) && st.conclusion2Examples.length > 0
          ? String(st.conclusion2Examples[0])
          : '';
      chunkBySection.get(section).patterns.push({
        situation: st.situation || '（状況メモなし）',
        trigger: card.trigger || '',
        spp: st.conclusion || '',
        followup: st.followup || '',
        followupAnswer: conclusion2,
      });
    }

    const chunks = Array.from(chunkBySection.values()).filter((c) => c.patterns.length > 0);
    if (chunks.length > 0) {
      out.push({ type, name: categoryName, chunks });
    }
  }

  return out;
}

async function main() {
  if (!dryRun && !process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL が未設定です。.env.local を確認してください。');
    process.exit(1);
  }

  if (!dryRun && !confirmed) {
    console.error(`
【警告】このスクリプトは既存の教材行（categories / chunks / patterns / audio_files）を削除し、
        assignments（chunk への参照）も CASCADE で消えます。

再実行するには環境変数を付けてください:
  SEED_BASE_CONFIRM=yes node scripts/seed-practice-v2-base.mjs

ドライラン:
  node scripts/seed-practice-v2-base.mjs --dry-run
`);
    process.exit(1);
  }

  const htmlPath = resolve(root, 'public/practice-v2.html');
  const html = readFileSync(htmlPath, 'utf-8');
  const data = extractDataArray(html);
  const catalog = buildCatalog(data);

  let totalPatterns = 0;
  let totalChunks = 0;
  console.log('\nパース結果（practice-v2 埋め込み DATA）:');
  for (const cat of catalog) {
    const pCount = cat.chunks.reduce((s, c) => s + c.patterns.length, 0);
    console.log(`  ${cat.name}: ${cat.chunks.length} chunks, ${pCount} patterns`);
    totalChunks += cat.chunks.length;
    totalPatterns += pCount;
  }
  console.log(`\n合計: ${catalog.length} カテゴリ, ${totalChunks} チャンク, ${totalPatterns} パターン\n`);

  if (dryRun) {
    console.log('(--dry-run のため DB は変更していません)');
    process.exit(0);
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log('既存データを削除しています...');
  await sql`DELETE FROM audio_files`;
  await sql`DELETE FROM patterns`;
  await sql`DELETE FROM chunks`;
  await sql`DELETE FROM categories`;

  let catOrder = 0;
  for (const cat of catalog) {
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
        INSERT INTO chunks (category_id, chunk_number, title_en, title_jp, sort_order, origin)
        VALUES (${catRow.id}, ${chunkOrder}, ${chunk.titleEn}, ${chunk.titleJp || ''}, ${chunkOrder}, ${'base_import'})
        RETURNING id
      `;

      let patternOrder = 0;
      for (const p of chunk.patterns) {
        patternOrder++;
        if (!p.trigger || !p.spp) {
          console.warn('  skip (trigger/spp 欠落):', chunk.titleEn);
          continue;
        }
        const character = detectCharacter(p.situation);
        await sql`
          INSERT INTO patterns (
            chunk_id, set_number, situation, fpp_intro, fpp_question, spp, spp_jp,
            followup_question, followup_answer, followup_answer_jp, character, sort_order
          )
          VALUES (
            ${chunkRow.id},
            ${patternOrder},
            ${p.situation},
            ${null},
            ${p.trigger},
            ${p.spp},
            ${null},
            ${p.followup || null},
            ${p.followupAnswer || null},
            ${null},
            ${character},
            ${patternOrder}
          )
        `;
      }
      console.log(`  ✓ chunk ${chunk.titleEn} (${chunk.patterns.length} patterns)`);
    }
    console.log(`✓ カテゴリ ${cat.name}`);
  }

  console.log(`\n完了: ${totalPatterns} パターン相当を投入しました（スキップ分除く）。`);
  console.log(
    '注意: practice-v2 は埋め込み DATA と API をマージするため、同じカテゴリ名だとカードが二重に見えることがあります。将来は埋め込みを空にするか API のみに切り替えてください。\n'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
