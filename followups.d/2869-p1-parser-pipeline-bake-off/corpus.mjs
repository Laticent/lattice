import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)); // the repo root: this folder is followups.d/<item>/
export const files = execSync("git ls-files 'examples/*.md' 'examples/**/*.md' '*.gallery.md' 'test/integration/baseline-decks/*.md' 'design/**/*.md' 'engineering/*.md' 'spec/*.md'", { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean).map((f) => ({ f, s: fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n?/g, '\n') }));
export const MB = files.reduce((n, x) => n + x.s.length, 0) / 1e6;
