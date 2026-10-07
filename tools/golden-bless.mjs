#!/usr/bin/env node
// The nightly bless — re-bless only the goldens that drifted, and score the auto-merge rules.
//
// Run by `.github/workflows/golden-bless.yml`. It rewrites golden PDFs in the working tree,
// so it refuses to start when any tracked PDF already has uncommitted changes.
//
//   1. Check the whole corpus (`regression-gate.mjs --scope all --json`).
//   2. Re-bless ONLY what drifted: a gallery by name, a deck by path. A blanket bless would
//      rewrite every golden blessed on another machine, burying a handful of real changes
//      in byte churn (regression-gate.mjs explains why at runDeckGolden).
//   3. A gallery bless rewrites both moods. Put back the mood that did not drift, so the
//      commit holds exactly the goldens that moved.
//   4. Score the four auto-merge rules (lib/golden-bless-verdict.mjs) on what was WRITTEN,
//      not on what the check reported. Rule 4 reads the golden-diff comments of the PRs
//      merged since the last bless, through `gh`; without it, nothing counts as seen.
//
// Writes .scratch/golden-bless/{verdict.json,verdict.md,rendered-from.txt,montages/} and
// prints the markdown. Exits 2 on a dirty tree and 3 when any bless failed (after writing the
// verdict, which names it), so the workflow goes red rather than reading it as a quiet night.
// Design: engineering/decisions/2026-10-06-goldens-bot-blessed.md §2.1.
//
// Usage:
//   node tools/golden-bless.mjs                  # check, bless, score
//   node tools/golden-bless.mjs --report <file>  # skip step 1: reuse a saved --json report

import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  goldenRows,
  lastBlessRenderedFrom,
  parseShownGoldens,
  prNumber,
  seenFromPrs,
  verdict,
  verdictMarkdown,
} from './lib/golden-bless-verdict.mjs';
import { galleryName } from './lib/golden-render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.scratch', 'golden-bless');
const GATE = join(ROOT, 'tools', 'regression-gate.mjs');
const REGRESSION_OUT = join(ROOT, '.scratch', 'regression');

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const changedPdfs = () => git(['diff', '--name-only', '--', '*.pdf']).split('\n').filter(Boolean);

function gate(args, okCodes) {
  const r = spawnSync(process.execPath, [GATE, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 << 20 });
  if (!okCodes.includes(r.status)) {
    return { ok: false, error: `regression-gate ${args.join(' ')} exited ${r.status}: ${(r.stderr || '').trim().split('\n').slice(-3).join(' | ')}` };
  }
  return { ok: true, stdout: r.stdout };
}

// The PRs merged since `from` on the first-parent line, each with what its golden-diff
// comment showed. A PR that cannot be read is returned as a problem, never as "seen".
function prsSince(from) {
  const problems = [];
  const prs = [];
  const subjects = git(['log', '--first-parent', '--format=%s', `${from}..HEAD`]).split('\n').filter(Boolean);
  for (const subject of subjects) {
    const n = prNumber(subject);
    if (!n) continue; // not a squash-merged PR: nothing was shown for it
    try {
      const raw = execFileSync('gh', ['pr', 'view', String(n), '--json', 'title,author,comments'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
      const pr = JSON.parse(raw);
      const shownBodies = (pr.comments || []).map((c) => parseShownGoldens(c.body)).filter(Boolean);
      prs.push({
        number: n,
        title: pr.title,
        authorIsBot: Boolean(pr.author?.is_bot) || /\[bot\]$/.test(pr.author?.login || ''),
        shown: shownBodies.length ? shownBodies[shownBodies.length - 1] : null,
      });
    } catch (err) {
      problems.push(`could not read PR #${n} (${String(err.message).split('\n')[0]})`);
    }
  }
  return { prs, problems };
}

function main() {
  const args = process.argv.slice(2);
  const reportIdx = args.indexOf('--report');

  const dirty = changedPdfs();
  if (dirty.length) {
    process.stderr.write(`golden-bless: ${dirty.length} tracked PDF(s) already have uncommitted changes (${dirty.slice(0, 3).join(', ')}…). Commit or restore them first: this tool rewrites and restores PDFs.\n`);
    process.exit(2);
  }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  // Step 1. The gate exits 1 on drift, which is the normal case here.
  let raw;
  if (reportIdx >= 0) {
    raw = readFileSync(args[reportIdx + 1], 'utf8');
  } else {
    const r = gate(['--scope', 'all', '--json'], [0, 1]);
    if (!r.ok) throw new Error(r.error);
    raw = r.stdout;
  }
  writeFileSync(join(OUT, 'check.json'), raw);
  const rows = goldenRows(JSON.parse(raw).report); // throws on a crash's empty output
  // Each later `--bless` run clears .scratch/regression, so keep the check's montages now.
  if (existsSync(REGRESSION_OUT)) cpSync(REGRESSION_OUT, join(OUT, 'montages'), { recursive: true });
  const drifted = rows.filter((r) => r.status === 'DRIFT');

  // Step 2. A bless must exit 0. One that does not is a problem in the verdict.
  const blessProblems = [];
  const galleryNames = new Set();
  const decks = new Set();
  for (const r of drifted) {
    const m = r.golden.match(/^(.*)\.gallery\.(light|dark)\.pdf$/);
    if (m) galleryNames.add(galleryName(`${m[1]}.gallery.md`));
    else decks.add(r.golden.replace(/\.pdf$/, ''));
  }
  for (const name of galleryNames) {
    const r = gate(['--scope', 'galleries', '--bless', '--only', name], [0]);
    if (!r.ok) blessProblems.push(r.error);
  }
  for (const deck of decks) {
    const r = gate(['--scope', 'decks', '--bless', '--only', deck], [0]);
    if (!r.ok) blessProblems.push(r.error);
  }

  // Step 3. The tree was clean at the start, so every changed PDF is ours to keep or undo.
  const want = new Set(drifted.map((r) => r.golden));
  const restore = changedPdfs().filter((f) => !want.has(f));
  if (restore.length) git(['checkout', 'HEAD', '--', ...restore]);
  const written = changedPdfs();

  // Step 4.
  const renderedFrom = git(['rev-parse', 'HEAD']).trim();
  const log = git(['log', '--first-parent', '-n', '2000', '--format=%H%x09%s', 'HEAD'])
    .split('\n').filter(Boolean).map((l) => { const [sha, ...s] = l.split('\t'); return { sha, subject: s.join('\t') }; });
  const from = lastBlessRenderedFrom(log);
  let seen = null;
  const seenProblems = [];
  if (from) {
    const { prs, problems } = prsSince(from);
    seen = seenFromPrs(prs);
    seenProblems.push(...problems);
  }
  const v = verdict(rows, seen, written);
  v.problems.push(...blessProblems, ...seenProblems);
  if (v.problems.length) v.autoMerge = false;
  v.renderedFrom = renderedFrom;
  v.windowFrom = from;
  v.restoredUnmoved = restore.length;
  const md = verdictMarkdown(v, { renderedFrom });
  writeFileSync(join(OUT, 'verdict.json'), JSON.stringify(v, null, 2));
  writeFileSync(join(OUT, 'verdict.md'), `${md}\n`);
  writeFileSync(join(OUT, 'rendered-from.txt'), `${renderedFrom.slice(0, 12)}\n`);
  process.stdout.write(`${md}\n`);
  // A bless that failed must turn the night red. Otherwise a run that wrote nothing looks
  // exactly like a quiet night, and the workflow would close the PR and go green.
  if (blessProblems.length) {
    process.stderr.write(`golden-bless: ${blessProblems.length} bless(es) failed; see the verdict.\n`);
    process.exit(3);
  }
}

main();
