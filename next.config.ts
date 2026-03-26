import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import type { NextConfig } from 'next';
import { config as loadEnv } from 'dotenv';

function hasNextConfigDir(dir: string): boolean {
  return (
    existsSync(join(dir, 'next.config.ts')) ||
    existsSync(join(dir, 'next.config.mjs')) ||
    existsSync(join(dir, 'next.config.cjs')) ||
    existsSync(join(dir, 'next.config.js'))
  );
}

/** dev / ローカルで .env.local が遅延読み込みされないよう、設定読み込みの最初に反映する */
function findNextRoot(): string {
  const seeds = [
    process.cwd(),
    process.env.INIT_CWD,
    process.env.PWD,
  ].filter((s): s is string => typeof s === 'string' && s.length > 0);
  const unique = [...new Set(seeds)];

  for (const seed of unique) {
    let dir = seed;
    for (let i = 0; i < 20; i++) {
      if (hasNextConfigDir(dir)) {
        return dir;
      }
      const parent = dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }
  return process.cwd();
}

function envTrim(key: string): string | undefined {
  const v = Reflect.get(process.env, key);
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * dotenv 後も空のキーを `.env.local` / `.env` から直注入する。
 * Turbopack の Edge `proxy` はここで載った process.env に依存するため、先生ゲート用も含める。
 */
function saturateMissingEnvFromDisk(root: string): void {
  let needAuth = !envTrim('AUTH_SECRET') && !envTrim('NEXTAUTH_SECRET');
  let needTeacherPwd = !envTrim('TEACHER_PASSWORD');
  let needTeacherAuthSec = !envTrim('TEACHER_AUTH_SECRET');

  if (!needAuth && !needTeacherPwd && !needTeacherAuthSec) {
    return;
  }

  for (const fname of ['.env.local', '.env'] as const) {
    const p = join(root, fname);
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
      const key = t.slice(0, eq).replace(/^\uFEFF/, '').trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!val) continue;

      if (
        needAuth &&
        (key === 'AUTH_SECRET' || key === 'NEXTAUTH_SECRET')
      ) {
        process.env.AUTH_SECRET = val;
        needAuth = false;
      }
      if (needTeacherPwd && key === 'TEACHER_PASSWORD') {
        process.env.TEACHER_PASSWORD = val;
        needTeacherPwd = false;
      }
      if (needTeacherAuthSec && key === 'TEACHER_AUTH_SECRET') {
        process.env.TEACHER_AUTH_SECRET = val;
        needTeacherAuthSec = false;
      }
      if (!needAuth && !needTeacherPwd && !needTeacherAuthSec) {
        return;
      }
    }
  }
}

const root = findNextRoot();
const envLocal = join(root, '.env.local');
const envDefault = join(root, '.env');
if (existsSync(envLocal)) {
  loadEnv({ path: envLocal, override: true, quiet: true });
}
if (existsSync(envDefault)) {
  loadEnv({ path: envDefault, override: false, quiet: true });
}
saturateMissingEnvFromDisk(root);

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
