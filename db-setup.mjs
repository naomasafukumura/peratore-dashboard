import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function setup() {
  console.log('Creating tables...');

  await sql`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INT DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS chunks (
      id SERIAL PRIMARY KEY,
      category_id INT REFERENCES categories(id) ON DELETE CASCADE,
      chunk_number INT NOT NULL,
      title_en TEXT NOT NULL,
      title_jp TEXT NOT NULL,
      sort_order INT DEFAULT 0
    )
  `;

  await sql`ALTER TABLE chunks ADD COLUMN IF NOT EXISTS origin TEXT`;
  await sql`ALTER TABLE chunks ADD COLUMN IF NOT EXISTS raw_memo TEXT`;

  await sql`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      google_sub TEXT NOT NULL UNIQUE,
      email TEXT,
      name TEXT,
      assignment_name TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS patterns (
      id SERIAL PRIMARY KEY,
      chunk_id INT REFERENCES chunks(id) ON DELETE CASCADE,
      set_number INT NOT NULL,
      situation TEXT NOT NULL,
      fpp_intro TEXT,
      fpp_question TEXT NOT NULL,
      spp TEXT NOT NULL,
      spp_jp TEXT,
      followup_question TEXT,
      followup_answer TEXT,
      followup_answer_jp TEXT,
      character TEXT DEFAULT '友人',
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE patterns ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`;

  await sql`
    CREATE TABLE IF NOT EXISTS audio_files (
      id SERIAL PRIMARY KEY,
      pattern_id INT REFERENCES patterns(id) ON DELETE CASCADE,
      audio_type TEXT NOT NULL,
      voice_id TEXT NOT NULL,
      audio_data BYTEA NOT NULL,
      duration_ms INT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(pattern_id, audio_type)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS assignments (
      id SERIAL PRIMARY KEY,
      student_name TEXT NOT NULL,
      chunk_id INT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
      UNIQUE (student_name, chunk_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS student_meta (
      name TEXT PRIMARY KEY,
      yomi TEXT NOT NULL DEFAULT ''
    )
  `;

  // PRESET_STUDENTSのふりがなをシード（既存行は更新しない）
  const presetYomi = [
    ['伊吾田恵津子', 'いごたえつこ'],
    ['犬塚美代子', 'いぬつかみよこ'],
    ['井上優子', 'いのうえゆうこ'],
    ['氏家敦子', 'うじいえあつこ'],
    ['及川祐貴', 'おいかわゆき'],
    ['小川早喜', 'おがわさき'],
    ['小川美喜子', 'おがわみきこ'],
    ['甲斐博美', 'かいひろみ'],
    ['狩野怜菜', 'かのれな'],
    ['川上潔', 'かわかみきよし'],
    ['木戸真紀子', 'きどまきこ'],
    ['桑野千尋', 'くわのちひろ'],
    ['齋藤りの', 'さいとうりの'],
    ['佐藤妙', 'さとうたえ'],
    ['佐藤結衣', 'さとうゆい'],
    ['高瀬範子', 'たかせのりこ'],
    ['高橋通江', 'たかはしみちえ'],
    ['徳原かずみ', 'とくはらかずみ'],
    ['徳世由美子', 'とくよゆみこ'],
    ['古屋淳', 'ふるやじゅん'],
    ['前田結衣', 'まえだゆい'],
    ['牧内晴代', 'まきうちはるよ'],
    ['松隈由香', 'まつくまゆか'],
    ['松本桂子', 'まつもとけいこ'],
    ['山下千恵子', 'やましたちえこ'],
    ['山田智美', 'やまだともみ'],
    ['ロバス由貴', 'ろばすゆき'],
  ];
  for (const [name, yomi] of presetYomi) {
    await sql`
      INSERT INTO student_meta (name, yomi)
      VALUES (${name}, ${yomi})
      ON CONFLICT (name) DO NOTHING
    `;
  }

  console.log('All tables created successfully!');
}

setup().catch(console.error);
