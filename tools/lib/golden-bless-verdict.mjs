// MAY TONIGHT'S BLESS MERGE ITSELF? — pure, so it is unit-tested.
//
// The nightly bless bot (`.github/workflows/golden-bless.yml`) re-blesses every golden that
// drifted on `main`. The owner decided on 2026-10-07 that its PR merges itself only when
// all four rules below hold, and that the first week is a dry run that only reports them
// (engineering/decisions/2026-10-06-goldens-bot-blessed.md §2.1). This module scores them.
//
//   1. No page count changed.
//   2. No page moved more than MAX_PAGE_FRACTION.
//   3. At most MAX_GOLDENS goldens changed.
//   4. Every changed golden was already shown to a reviewer: some PR merged since the last
//      bless could affect it, so that PR's golden-diff job rendered it (§2.2).
//
// Rule 4 reuses the per-PR mapping (golden-affected.mjs) on each merged commit, with the
// same cap the PR job ran under: a golden the cap left out was NOT shown, so it counts as
// unseen. With no earlier bless to measure from, nothing counts as seen.

import { affectedGoldens } from './golden-affected.mjs';

// Starting guesses, to be replaced by a week of dry-run data (rollout step 4).
export const MAX_PAGE_FRACTION = 0.01;
export const MAX_GOLDENS = 10;

/**
 * The goldens each merged commit's PR job rendered, unioned.
 * @param {string[][]} commits  the changed paths of each commit merged since the last bless
 * @param {{ galleries: string[], deckGoldens: string[], cap?: number }} corpus
 * @returns {Set<string>} golden `.pdf` paths
 */
export function seenGoldens(commits, corpus) {
  const seen = new Set();
  for (const changed of commits) {
    const r = affectedGoldens(changed, corpus);
    for (const g of r.galleries) {
      for (const mood of ['light', 'dark']) seen.add(g.replace(/\.gallery\.md$/, `.gallery.${mood}.pdf`));
    }
    for (const d of r.decks) seen.add(d);
    // A golden whose PDF the PR committed was compared from that PDF.
    for (const f of changed) if (f.endsWith('.pdf')) seen.add(f);
  }
  return seen;
}

/**
 * Flatten regression-gate's `--json` report into one row per golden.
 * @param {object[]} report  regression-gate's `report` array
 * @returns {{ golden: string, status: string, pages: number, worstFraction: number, pageCountChanged: boolean }[]}
 */
export function goldenRows(report) {
  const rows = [];
  for (const r of report) {
    for (const [key, t] of Object.entries(r.themes || {})) {
      const golden = t.golden || (r.scope === 'deck'
        ? r.deck.replace(/\.md$/, '.pdf')
        : r.deck.replace(/\.gallery\.md$/, `.gallery.${key}.pdf`));
      rows.push({
        golden,
        status: t.status,
        pages: t.pages ?? 0,
        worstFraction: t.worstFraction ?? 0,
        // pixelDiff marks a page that exists on only one side with pixels === -1.
        pageCountChanged: (t.drifted || []).some((p) => p.pixels === -1 && !/resized/.test(p.note || '')),
      });
    }
  }
  return rows;
}

/**
 * @param {ReturnType<typeof goldenRows>} rows
 * @param {Set<string>|null} seen  null when there is no earlier bless to measure from
 * @returns {{ autoMerge: boolean, changed: string[], problems: string[], rules: { id: number, ok: boolean, text: string, detail: string }[] }}
 */
export function verdict(rows, seen, { maxPageFraction = MAX_PAGE_FRACTION, maxGoldens = MAX_GOLDENS } = {}) {
  const changed = rows.filter((r) => r.status === 'DRIFT');
  // A golden that could not be checked is never small: a person looks.
  const problems = rows.filter((r) => r.status !== 'DRIFT' && r.status !== 'ok').map((r) => `${r.golden} (${r.status})`);
  const pct = (f) => `${(f * 100).toFixed(2)}%`;

  const pageCount = changed.filter((r) => r.pageCountChanged).map((r) => r.golden);
  const big = changed.filter((r) => r.worstFraction > maxPageFraction);
  const worst = changed.reduce((m, r) => Math.max(m, r.worstFraction), 0);
  const unseen = seen ? changed.filter((r) => !seen.has(r.golden)).map((r) => r.golden) : changed.map((r) => r.golden);

  const list = (xs) => (xs.length > 5 ? `${xs.slice(0, 5).join(', ')} and ${xs.length - 5} more` : xs.join(', '));
  const rules = [
    { id: 1, ok: pageCount.length === 0, text: 'No page count changed', detail: pageCount.length ? list(pageCount) : 'none' },
    {
      id: 2,
      ok: big.length === 0,
      text: `No page moved more than ${pct(maxPageFraction)}`,
      detail: big.length ? `${big.length} over; worst ${pct(worst)}` : `worst ${pct(worst)}`,
    },
    { id: 3, ok: changed.length <= maxGoldens, text: `At most ${maxGoldens} goldens changed`, detail: `${changed.length} changed` },
    {
      id: 4,
      ok: unseen.length === 0,
      text: 'Every changed golden was shown on a merged PR',
      detail: !seen ? 'no earlier bless to measure from' : unseen.length ? `unseen: ${list(unseen)}` : 'all seen',
    },
  ];
  return {
    autoMerge: changed.length > 0 && problems.length === 0 && rules.every((r) => r.ok),
    changed: changed.map((r) => r.golden),
    problems,
    rules,
  };
}

/** The dry-run comment body. */
export function verdictMarkdown(v, { dryRun = true } = {}) {
  const lines = [
    `### Golden bless: would auto-merge? **${v.autoMerge ? 'yes' : 'no'}**`,
    '',
    dryRun
      ? '_Dry run (rollout step 2): this PR never merges itself. The four rules are reported so a week of nights can set the thresholds._'
      : '',
    '',
    '| Rule | Holds | Detail |',
    '|---|---|---|',
    ...v.rules.map((r) => `| ${r.id}. ${r.text} | ${r.ok ? 'yes' : '**no**'} | ${r.detail} |`),
  ];
  if (v.problems.length) lines.push('', `**Could not check** (a person looks): ${v.problems.join(', ')}`);
  lines.push('', `${v.changed.length} golden${v.changed.length === 1 ? '' : 's'} re-blessed. The golden-diff comment on this PR shows each one before and after.`);
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}
