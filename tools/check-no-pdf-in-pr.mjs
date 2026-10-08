#!/usr/bin/env node
// A pull request may not add or change a committed PDF. Run by the `lint` job in ci.yml.
//
// Golden PDFs have one writer: the nightly bless bot (.github/workflows/golden-bless.yml),
// which re-renders what drifted on `main` and commits it on `chore/golden-bless`. A PR shows
// its visual change through golden-diff's rendered before/after instead of committed bytes.
// PDFs were in 11 of 19 real merge conflicts in the week to 2026-10-06, and this is the
// change that takes them off the conflict path
// (engineering/decisions/2026-10-06-goldens-bot-blessed.md §2.3, owner decision 2026-10-07).
//
// What counts: a PDF the PR adds, modifies, copies or renames. DELETING one is allowed, so
// a PR that removes a deck can remove its PDF too. The bless PR itself is exempt: its
// branch is `chore/golden-bless` IN THIS REPOSITORY (a fork can name a branch anything).
// So are the families the bless never writes, which a person still commits by hand: the
// rows of PDF_OWNERSHIP (tools/check-ownership.js) flagged `prCommitted` — decision-record
// evidence, the Marp kit sample, the chart-theme gallery.
//
// It runs on pull_request only. Auto-merge needs the PR's own run green, and the merge
// queue then tests the same change on top of main, so a second check there adds nothing.
// GitHub checks out its test merge commit, whose first parent is the base, so the diff is
// HEAD^1..HEAD and the job's checkout needs fetch-depth: 2.
//
// Usage: node tools/check-no-pdf-in-pr.mjs [--base <ref>]   (default HEAD^1)

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const { PDF_OWNERSHIP } = createRequire(import.meta.url)('./check-ownership.js');
/** True for a PDF the bless never writes, so a pull request still commits it. */
export const prCommitted = (f) => PDF_OWNERSHIP.some((r) => r.prCommitted && r.test(f));

export const BLESS_BRANCH = 'chore/golden-bless';
/**
 * @param {{ status: string, path: string }[]} changes  `git diff --name-status` rows, PDFs only
 * @param {{ headRef?: string, sameRepo?: boolean }} ctx
 * @returns {{ ok: boolean, exempt: boolean, offending: string[] }}
 */
export function judge(changes, { headRef = '', sameRepo = false } = {}) {
  const exempt = headRef === BLESS_BRANCH && sameRepo;
  const offending = changes.filter((c) => !c.status.startsWith('D') && !prCommitted(c.path)).map((c) => c.path);
  return { ok: exempt || offending.length === 0, exempt, offending };
}

/** Parse `git diff --name-status` output; a rename row's new path is the one that counts. */
export function parseNameStatus(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const cols = line.split('\t');
    return { status: cols[0], path: cols[cols.length - 1] };
  });
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--base');
  const base = i >= 0 ? args[i + 1] : 'HEAD^1';
  const git = (a) => execFileSync('git', a, { encoding: 'utf8' });
  const changes = parseNameStatus(git(['diff', '--name-status', '-M', base, 'HEAD', '--', '*.pdf', '*.PDF']));
  const r = judge(changes, {
    headRef: process.env.GITHUB_HEAD_REF || '',
    sameRepo: process.env.PR_FROM_SAME_REPO === 'true',
  });
  if (r.exempt) {
    process.stdout.write(`check-no-pdf-in-pr: the nightly bless PR is the one writer of PDFs; ${r.offending.length} allowed.\n`);
    return;
  }
  if (r.ok) {
    process.stdout.write('check-no-pdf-in-pr: no committed PDF added or changed.\n');
    return;
  }
  process.stderr.write(
    `check-no-pdf-in-pr: this PR adds or changes ${r.offending.length} committed PDF(s):\n` +
      r.offending.map((f) => `  ${f}\n`).join('') +
      '\nPull requests do not commit PDFs: the nightly bless bot renders and commits them\n' +
      'after merge, and golden-diff shows your visual change on this PR meanwhile.\n' +
      'Take them out of the PR with:\n' +
      `  git checkout origin/main -- ${r.offending.join(' ')}   (files main already has)\n` +
      '  git rm --cached <file>                                  (new files)\n' +
      'See engineering/decisions/2026-10-06-goldens-bot-blessed.md.\n',
  );
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
