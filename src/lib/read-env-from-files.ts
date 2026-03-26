import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getNextProjectRoot } from '@/lib/project-root';

function parseEnvValue(raw: string): string {
  let val = raw.trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return val;
}

function normalizeKey(key: string): string {
  return key.replace(/^\uFEFF/, '').trim();
}

/**
 * `.env.local` → `.env` を走査し、最初に一致したキーの値を返す（Turbopack 等で process.env に載らないときのフォールバック）。
 */
export function readEnvValueFromFiles(envKey: string): string | undefined {
  const root = getNextProjectRoot();
  const paths = [join(root, '.env.local'), join(root, '.env')];
  try {
    for (const p of paths) {
      if (!existsSync(p)) continue;
      let text = readFileSync(p, 'utf8');
      if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
      }
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq <= 0) continue;
        const key = normalizeKey(t.slice(0, eq));
        if (key !== envKey) continue;
        const val = parseEnvValue(t.slice(eq + 1));
        if (val) return val;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/** ファイル内で先に現れたキーを優先（AUTH_SECRET と NEXTAUTH_SECRET の併用向け） */
export function readFirstMatchingEnvFromFiles(
  candidates: readonly string[],
): string | undefined {
  const want = new Set(candidates);
  const root = getNextProjectRoot();
  const paths = [join(root, '.env.local'), join(root, '.env')];
  try {
    for (const p of paths) {
      if (!existsSync(p)) continue;
      let text = readFileSync(p, 'utf8');
      if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
      }
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq <= 0) continue;
        const key = normalizeKey(t.slice(0, eq));
        if (!want.has(key)) continue;
        const val = parseEnvValue(t.slice(eq + 1));
        if (val) return val;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}
