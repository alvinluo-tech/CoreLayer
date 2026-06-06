import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC_DIR = join(import.meta.dirname, '..');
const HARDCODED_PATTERN = /['"]http:\/\/127\.0\.0\.1:3001['"]/;

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectSourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

describe('no hardcoded daemon URLs in production code', () => {
  const files = collectSourceFiles(SRC_DIR);

  for (const file of files) {
    it(`should not contain hardcoded 127.0.0.1:3001 in ${relative(SRC_DIR, file)}`, () => {
      const content = readFileSync(file, 'utf-8');
      const match = content.match(HARDCODED_PATTERN);
      expect(match).toBeNull();
    });
  }
});
