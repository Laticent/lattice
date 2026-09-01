#!/usr/bin/env node
import { execFile } from 'node:child_process';
/**
 * render.mjs — render a population of decks to HTML sidecars at 3 family sizes.
 *
 * MEASUREMENT ONLY (.scratch/, uncommitted). Mirrors tools/check-chart-fit.js:
 * same front-matter rewrite, same three sizes, same autosplit posture
 * (off at landscape — AUTOSPLIT_APPLIES makes it a no-op there anyway —
 * on at portrait/square, which is what the engine intends for those).
 *
 * Output: .scratch/card-slack/html/<size>/<deck>.html
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const ROOT = process.env.TREE || new URL('../..', import.meta.url).pathname;
const OUT = process.env.OUT || new URL('../../.scratch/card-slack/html', import.meta.url).pathname;
const EMU = path.join(ROOT, 'lattice-emulator.js');

const SIZES = [
  { name: 'landscape', size: null, autosplit: false },
  { name: 'portrait', size: 'portrait', autosplit: true },
  { name: 'square', size: 'square', autosplit: true },
];

function withSize(src, size, autosplit) {
  const extra = [];
  if (size) extra.push(`size: ${size}`);
  if (autosplit) extra.push('autosplit: on');
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(src);
  if (!fm) return extra.length ? `---\n${extra.join('\n')}\n---\n\n${src}` : src;
  const body = fm[1].split(/\r?\n/)
    .filter((l) => !/^\s*(?:size|autosplit)\s*:/.test(l))
    .concat(extra);
  return `---\n${body.join('\n')}\n---\n${src.slice(fm[0].length)}`;
}

const decks = process.argv.slice(2);
if (!decks.length) { console.error('usage: render.mjs <deck.md>...'); process.exit(2); }

const jobs = [];
for (const deck of decks) {
  for (const s of SIZES) jobs.push({ deck, s });
}

let done = 0;
const failures = [];
async function run(job) {
  const { deck, s } = job;
  const slug = path.basename(deck, '.md');
  const dir = path.join(OUT, s.name);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${slug}.html`);
  if (fs.existsSync(target) && !process.env.FORCE) { done += 1; return; }
  // The emulator reads size from front matter, so each size gets its own source
  // file NEXT TO the original (same dir → same relative asset paths).
  const tmp = path.join(path.dirname(deck), `.sparsity-${s.name}-${slug}.md`);
  fs.writeFileSync(tmp, withSize(fs.readFileSync(deck, 'utf8'), s.size, s.autosplit));
  try {
    await execFileP(process.execPath, [EMU, tmp, target, 'indaco', '-q'],
      { cwd: ROOT, timeout: 10 * 60_000, maxBuffer: 64 << 20 });
    if (!fs.existsSync(target)) throw new Error('no HTML written');
  } catch (e) {
    failures.push(`${slug}@${s.name}: ${String(e.message).slice(0, 200)}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  done += 1;
  process.stderr.write(`\r${done}/${jobs.length}`);
}

const CONC = Number(process.env.CONC || Math.max(2, os.cpus().length - 1));
const queue = jobs.slice();
await Promise.all(Array.from({ length: CONC }, async () => {
  while (queue.length) await run(queue.shift());
}));
process.stderr.write('\n');
if (failures.length) { console.error('FAILURES:\n' + failures.join('\n')); process.exit(1); }
console.log(`rendered ${jobs.length} (deck × size) sidecars into ${OUT}`);
