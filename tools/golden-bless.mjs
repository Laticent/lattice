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
import { createRequire } from 'node:module';
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

const require = createRequire(import.meta.url);
// classify(): which markdown should have a committed PDF; buildFor(): render those PDFs.
const { classify, buildFor } = require('./build-staged-pdfs.js');

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
// Changed AND new PDFs. `git diff` alone misses an untracked file, so a PDF the bless
// renders for a deck that never had one would be invisible to every step below.
const statusPaths = (pathspecs, { untrackedOnly = false } = {}) =>
  git(['status', '--porcelain=v1', '--untracked-files=all', '--', ...pathspecs])
    .split('\n').filter(Boolean)
    .filter((l) => !untrackedOnly || l.startsWith('??'))
    .map((l) => l.slice(3));
const changedPdfs = () => statusPaths(['*.pdf']);
const newPdfs = () => statusPaths(['*.pdf'], { untrackedOnly: true });

// The PDFs a classified markdown file should have committed beside it.
function expectedPdfs(md, job) {
  if (job.kind === 'deck') return [job.out];
  if (job.kind === 'component' || job.kind === 'bucket' || job.kind === 'showcase') {
    return ['light', 'dark'].map((mood) => md.replace(/(\.gallery|-gallery)\.md$/, `$1.${mood}.pdf`));
  }
  return [];
}

// Tracked markdown that should have a committed PDF and does not. Pull requests no longer
// commit PDFs (step 3), so a new deck or gallery gets its first PDF here, the night after
// it merges.
function sourcesMissingPdfs() {
  const tracked = new Set(git(['ls-files']).split('\n').filter(Boolean));
  const out = [];
  for (const md of git(['ls-files', '--', '*.md']).split('\n').filter(Boolean)) {
    const job = classify(md);
    if (!job) continue;
    if (expectedPdfs(md, job).some((p) => !tracked.has(p))) out.push(md);
  }
  return out;
}

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

const SHOWCASE = 'docs/scripts/rasterize-showcase.mjs';
const SHOWCASE_SOURCES = 'docs/scripts/showcase-sources.json';
const SHOWCASE_DIR = 'docs/public/showcase';

function refreshShowcase(writtenSet) {
  const run = (args) => spawnSync(process.execPath, [SHOWCASE, ...args], { cwd: ROOT, encoding: 'utf8' });
  if (run(['--check']).status === 0) return { kept: [], problems: [] };
  const built = run([]);
  if (built.status !== 0) {
    return { kept: [], problems: [`rasterize-showcase.mjs exited ${built.status}: ${(built.stderr || '').trim().split('\n').slice(-2).join(' | ')}`] };
  }
  const sources = JSON.parse(readFileSync(join(ROOT, SHOWCASE_SOURCES), 'utf8'));
  const unmoved = Object.entries(sources)
    .filter(([, rec]) => !writtenSet.has(rec.src))
    .map(([key]) => `${SHOWCASE_DIR}/${key}.webp`);
  const changed = new Set(git(['diff', '--name-only', '--', SHOWCASE_DIR]).split('\n').filter(Boolean));
  const restore = unmoved.filter((f) => changed.has(f));
  if (restore.length) git(['checkout', 'HEAD', '--', ...restore]);
  const after = run(['--check']);
  const problems = after.status === 0 ? [] : [`showcase still stale after refresh: ${(after.stderr || '').trim().split('\n')[0]}`];
  return { kept: [...changed].filter((f) => !restore.includes(f)), problems };
}

async function main() {
  const args = process.argv.slice(2);
  const reportIdx = args.indexOf('--report');

  const dirty = [...changedPdfs(), ...statusPaths([SHOWCASE_DIR, SHOWCASE_SOURCES, 'examples/*-gallery.md'])];
  if (dirty.length) {
    process.stderr.write(`golden-bless: ${dirty.length} tracked golden or showcase file(s) already have uncommitted changes (${dirty.slice(0, 3).join(', ')}…). Commit or restore them first: this tool rewrites and restores PDFs.\n`);
    process.exit(2);
  }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  // Step 1. The gate exits 1 on drift, which is the normal case here.
  //
  // Read the report from the FILE the gate writes, never from its stdout. The gate wrote
  // its --json report to stdout and then called process.exit(), and Node writes to a pipe
  // asynchronously, so the full corpus's report (several MB) arrived cut off at 146,176
  // bytes: the first real run (Actions run 37652332077) crashed parsing it after 68
  // minutes of rendering. The gate now drains stdout too, but the file is written
  // synchronously before the gate exits, so it cannot be cut short. It is removed first,
  // so a crashed gate cannot leave an older run's report to be read.
  let raw;
  if (reportIdx >= 0) {
    raw = readFileSync(args[reportIdx + 1], 'utf8');
  } else {
    const reportFile = join(REGRESSION_OUT, 'report.json');
    rmSync(reportFile, { force: true });
    const r = gate(['--scope', 'all', '--json'], [0, 1]);
    if (!r.ok) throw new Error(r.error);
    raw = readFileSync(reportFile, 'utf8');
  }
  writeFileSync(join(OUT, 'check.json'), raw);
  // report.json holds the bare array; a saved --json stdout wraps it as { report }.
  const parsed = JSON.parse(raw);
  const rows = goldenRows(Array.isArray(parsed) ? parsed : parsed.report);
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

  // Step 3a. Goldens that do not exist yet: a deck or gallery merged without a PDF.
  const missing = sourcesMissingPdfs();
  if (missing.length) {
    try {
      await buildFor(missing);
    } catch (err) {
      blessProblems.push(`rendering a missing golden failed: ${String(err.message).split('\n')[0]}`);
    }
  }
  // The generated showcase decks (examples/<id>-gallery.md, built from component manifests)
  // were only ever rebuilt by the pre-commit hook step 3 removed. Regenerate them, and keep
  // the result only when the generated markdown changed, which is when a manifest moved.
  for (const md of git(['ls-files', '--', 'examples/*-gallery.md']).split('\n').filter(Boolean)) {
    const job = classify(md);
    if (job?.kind !== 'showcase' || missing.includes(md)) continue;
    try {
      await buildFor([md]);
    } catch (err) {
      blessProblems.push(`regenerating ${md} failed: ${String(err.message).split('\n')[0]}`);
      continue;
    }
    if (!git(['diff', '--name-only', '--', md]).trim()) {
      const back = expectedPdfs(md, job).filter((p) => changedPdfs().includes(p));
      if (back.length) git(['checkout', 'HEAD', '--', ...back]);
    }
  }
  // The showcase decks' PDFs ride in the commit but are not goldens the check scores.
  const showcaseDeckPdf = (f) => /^examples\/[a-z][a-z0-9-]*-gallery\.(light|dark)\.pdf$/.test(f);
  const showcaseDecks = changedPdfs().filter(showcaseDeckPdf);
  const created = newPdfs().filter((f) => !showcaseDeckPdf(f));
  const written = changedPdfs().filter((f) => !showcaseDeckPdf(f));

  // Step 3b. Files derived from the goldens. The docs landing page's showcase WebPs are
  // cut from gallery PDFs, and `rasterize-showcase.mjs --check` (docs-build and preview)
  // fails when a source PDF changed and its WebP did not: the first bless PR (#2598) went
  // red on exactly that. The script rewrites every WebP, and WebP bytes are not stable
  // between runs, so keep only the WebPs whose gallery PDF this bless wrote.
  const derived = refreshShowcase(new Set(written));
  blessProblems.push(...derived.problems);

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
  const v = verdict(rows, seen, written, { created });
  v.problems.push(...blessProblems, ...seenProblems);
  if (v.problems.length) v.autoMerge = false;
  v.renderedFrom = renderedFrom;
  v.windowFrom = from;
  v.restoredUnmoved = restore.length;
  v.showcaseDecks = showcaseDecks;
  v.showcaseRefreshed = derived.kept;
  const md = verdictMarkdown(v, { renderedFrom, runUrl: process.env.GOLDEN_BLESS_RUN_URL || '' });
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

await main();
