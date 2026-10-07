#!/usr/bin/env node
// The nightly bless — re-bless only the goldens that drifted, and score the auto-merge rules.
//
// Run by `.github/workflows/golden-bless.yml`. Safe to run by hand: it only rewrites PDFs in
// the working tree.
//
//   1. Check the whole corpus (`regression-gate.mjs --scope all --json`).
//   2. Re-bless ONLY what drifted: a gallery by name, a deck by path. A blanket bless would
//      rewrite every golden blessed on another machine, burying a handful of real changes
//      in byte churn (regression-gate.mjs explains why at runDeckGolden).
//   3. A gallery bless rewrites both moods. Restore the mood that did not drift, so the
//      commit holds exactly the goldens that moved.
//   4. Score the four auto-merge rules (lib/golden-bless-verdict.mjs).
//
// Writes .scratch/golden-bless/verdict.{json,md} and prints the markdown.
// Design: engineering/decisions/2026-10-06-goldens-bot-blessed.md §2.1.
//
// Usage:
//   node tools/golden-bless.mjs                  # check, bless, score
//   node tools/golden-bless.mjs --report <file>  # skip step 1: reuse a saved --json report

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { goldenRows, seenGoldens, verdict, verdictMarkdown } from './lib/golden-bless-verdict.mjs';
import { galleryDecks, galleryName } from './lib/golden-render.mjs';
import { deckGoldenPdfs } from './lib/golden-set.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.scratch', 'golden-bless');
const GATE = join(ROOT, 'tools', 'regression-gate.mjs');
// The subject the bless PR squash-merges under; rule 4 counts merges since the last one.
// git's default (basic) regex reads the parentheses literally. golden-bless.yml uses it too.
const BLESS_SUBJECT = 'chore(goldens): nightly bless';
const CAP = Number(process.env.GOLDEN_DIFF_RENDER_CAP || 40); // the PR job's cap (golden-diff.mjs)

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });

function gate(args) {
  const r = spawnSync(process.execPath, [GATE, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 << 20 });
  // The gate exits 1 on drift, which is the normal case here; only a crash is fatal.
  if (r.status !== 0 && r.status !== 1) throw new Error(`regression-gate ${args.join(' ')} exited ${r.status}\n${r.stderr}`);
  return r.stdout;
}

// The commits merged onto this branch's first-parent line since the last bless, each as its
// changed paths. null when there is no earlier bless.
function commitsSinceLastBless() {
  const anchor = git(['log', '--first-parent', '-1', '--format=%H', `--grep=^${BLESS_SUBJECT}`, 'HEAD']).trim();
  if (!anchor) return null;
  const shas = git(['rev-list', '--first-parent', `${anchor}..HEAD`]).split('\n').filter(Boolean);
  return shas.map((sha) =>
    git(['diff-tree', '--no-commit-id', '--name-only', '-r', `${sha}^1`, sha]).split('\n').filter(Boolean),
  );
}

function main() {
  const args = process.argv.slice(2);
  const reportIdx = args.indexOf('--report');
  mkdirSync(OUT, { recursive: true });

  const raw = reportIdx >= 0 ? readFileSync(args[reportIdx + 1], 'utf8') : gate(['--scope', 'all', '--json']);
  writeFileSync(join(OUT, 'check.json'), raw);
  const rows = goldenRows(JSON.parse(raw).report);
  const drifted = rows.filter((r) => r.status === 'DRIFT');

  // Step 2: bless what drifted.
  const galleryNames = new Set();
  const decks = new Set();
  for (const r of drifted) {
    const m = r.golden.match(/^(.*)\.gallery\.(light|dark)\.pdf$/);
    if (m) galleryNames.add(galleryName(`${m[1]}.gallery.md`));
    else decks.add(r.golden.replace(/\.pdf$/, ''));
  }
  for (const name of galleryNames) gate(['--scope', 'galleries', '--bless', '--only', name]);
  for (const deck of decks) gate(['--scope', 'decks', '--bless', '--only', deck]);

  // Step 3: keep only the goldens that drifted.
  const want = new Set(drifted.map((r) => r.golden));
  const touched = git(['diff', '--name-only', '--', '*.pdf']).split('\n').filter(Boolean);
  const restore = touched.filter((f) => !want.has(f));
  if (restore.length) git(['checkout', 'HEAD', '--', ...restore]);

  // Step 4: score.
  const commits = commitsSinceLastBless();
  const corpus = {
    galleries: galleryDecks(ROOT).map((g) => relative(ROOT, g)),
    deckGoldens: deckGoldenPdfs(ROOT),
    cap: CAP,
  };
  const v = verdict(rows, commits ? seenGoldens(commits, corpus) : null);
  v.commitsSinceLastBless = commits ? commits.length : null;
  v.restoredUnmoved = restore.length;
  const md = verdictMarkdown(v);
  writeFileSync(join(OUT, 'verdict.json'), JSON.stringify(v, null, 2));
  writeFileSync(join(OUT, 'verdict.md'), `${md}\n`);
  process.stdout.write(`${md}\n`);
}

main();
