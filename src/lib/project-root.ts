import { existsSync } from 'fs';
import { dirname, join } from 'path';

function hasNextConfig(dir: string): boolean {
  return (
    existsSync(join(dir, 'next.config.ts')) ||
    existsSync(join(dir, 'next.config.mjs')) ||
    existsSync(join(dir, 'next.config.cjs')) ||
    existsSync(join(dir, 'next.config.js'))
  );
}

/**
 * `process.cwd()` だけで足りない環境（npm の INIT_CWD、一部ツール）向けに複数起点から辿る。
 */
export function getNextProjectRoot(cwd: string = process.cwd()): string {
  const seeds = [
    cwd,
    process.env.INIT_CWD,
    process.env.PWD,
  ].filter((s): s is string => typeof s === 'string' && s.length > 0);
  const uniqueSeeds = [...new Set(seeds)];

  for (const seed of uniqueSeeds) {
    let dir = seed;
    for (let i = 0; i < 20; i++) {
      if (hasNextConfig(dir)) {
        return dir;
      }
      const parent = dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }
  return cwd;
}
