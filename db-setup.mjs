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
      sort_order INT DEFAULT 0
    )
  `;

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

  console.log('All tables created successfully!');
}

setup().catch(console.error);
