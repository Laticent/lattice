// MAY TONIGHT'S BLESS MERGE ITSELF? — pure, so it is unit-tested.
//
// The nightly bless bot (`.github/workflows/golden-bless.yml`) re-blesses every golden that
// drifted on `main`. The owner decided on 2026-10-07 that its PR merges itself only when
// all four rules below hold, and that the first week is a dry run that only reports them
// (engineering/decisions/2026-10-06-goldens-bot-blessed.md §2.1). This module scores them.
//
//   1. No page was added, removed or resized.
//   2. No page moved more than MAX_PAGE_FRACTION.
//   3. At most MAX_GOLDENS goldens changed.
//   4. Every changed golden was already SHOWN to a person: the golden-diff comment of a
//      PR a person merged since the last bless listed it as changed.
//
// Rule 4 reads what golden-diff actually showed (the `golden-diff-changed` marker in its PR
// comment), not what a PR could have rendered. The adversarial trio on #2570 showed the
// difference matters: replaying the path mapping called a golden "seen" whenever any PR
// touched a shared file, which happens most nights, and whenever a bot PR (Dependabot,
// the release) merged with nobody looking.

// Starting guesses, to be replaced by a week of dry-run data (rollout step 4).
export const MAX_PAGE_FRACTION = 0.01;
export const MAX_GOLDENS = 10;

// The bless PR's title names the commit it rendered from, so rule 4 counts merges since
// THAT commit, not since a person got round to merging the PR. Squash-merge appends
// " (#N)". The pattern matches the whole subject, so a body line or a longer subject
// that merely starts the same way never counts.
export const BLESS_TITLE_PREFIX = 'chore(goldens): nightly bless of ';
const BLESS_SUBJECT_RE = /^chore\(goldens\): nightly bless of ([0-9a-f]{12,40}) \(#\d+\)$/;
const PR_NUMBER_RE = / \(#(\d+)\)$/;

// PRs that merge with no person reviewing them, so whatever their comment showed was
// shown to nobody. Bot-authored PRs are caught by author; these are opened with a
// person's token (AUTOMATION_PAT), so they are caught by title. A revert is excluded
// too: a person reverting a bless must never make the same goldens count as seen.
const UNREVIEWED_TITLE_RE = /^(release: v|chore\(backlog\): |chore\(goldens\): nightly bless|Revert )/;

/**
 * Where tonight's window starts: the commit the last merged bless rendered from.
 * @param {{ sha: string, subject: string }[]} log  first-parent log, newest first
 * @returns {string|null} that commit's sha, or null when no bless has merged
 */
export function lastBlessRenderedFrom(log) {
  for (const { subject } of log) {
    const m = subject.match(BLESS_SUBJECT_RE);
    if (m) return m[1];
  }
  return null;
}

/** The PR number a squash-merge subject ends with, or null. */
export function prNumber(subject) {
  const m = subject.match(PR_NUMBER_RE);
  return m ? Number(m[1]) : null;
}

/**
 * The goldens a golden-diff comment showed as changed, or null if the body has no marker.
 * @param {string} body
 */
export function parseShownGoldens(body) {
  const m = String(body).match(/<!-- golden-diff-changed: ([^>]*?) -->/);
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Goldens a person was shown: listed as changed by a PR a person authored and that is
 * not a machine PR or a revert.
 * @param {{ number: number, title: string, authorIsBot: boolean, shown: string[]|null }[]} prs
 * @returns {Set<string>}
 */
export function seenFromPrs(prs) {
  const seen = new Set();
  for (const pr of prs) {
    if (pr.authorIsBot || UNREVIEWED_TITLE_RE.test(pr.title)) continue;
    for (const g of pr.shown || []) seen.add(g);
  }
  return seen;
}

/**
 * Flatten regression-gate's `--json` report into one row per golden.
 *
 * pixelDiff marks a page that has no same-size counterpart (added, removed or resized)
 * with `pixels: -1`, and regression-gate's worst-page formula then reads it as 0%. So a
 * size change would pass rule 2 silently; it is caught here as a page-shape change for
 * rule 1. A page whose compare printed no readable count is scored as fully moved: the
 * tool could not measure it, so it is never small.
 *
 * @param {object[]} report  regression-gate's `report` array
 */
export function goldenRows(report) {
  const rows = [];
  for (const r of report) {
    for (const [key, t] of Object.entries(r.themes || {})) {
      const golden = t.golden || (r.scope === 'deck'
        ? r.deck.replace(/\.md$/, '.pdf')
        : r.deck.replace(/\.gallery\.md$/, `.gallery.${key}.pdf`));
      const negative = (t.drifted || []).filter((p) => p.pixels < 0);
      const unreadable = negative.some((p) => /no readable/.test(p.note || ''));
      rows.push({
        golden,
        status: t.status,
        pages: t.pages ?? 0,
        worstFraction: unreadable ? 1 : (t.worstFraction ?? 0),
        pageShapeChanged: negative.some((p) => !/no readable/.test(p.note || '')),
      });
    }
  }
  return rows;
}

/**
 * @param {ReturnType<typeof goldenRows>} rows   the check's rows
 * @param {Set<string>|null} seen                null when there is no earlier bless to measure from
 * @param {string[]} written                     the golden PDFs the bless actually changed on disk
 */
export function verdict(rows, seen, written, { maxPageFraction = MAX_PAGE_FRACTION, maxGoldens = MAX_GOLDENS } = {}) {
  const writtenSet = new Set(written);
  const byGolden = new Map(rows.map((r) => [r.golden, r]));
  // The commit is the truth, not the check: a bless can fail, or a re-render can stop
  // drifting, and then the check's list names goldens the commit does not contain.
  const changed = written.map((g) => byGolden.get(g) || { golden: g, status: 'DRIFT', worstFraction: 1, pageShapeChanged: false, unchecked: true });
  const problems = [
    ...rows.filter((r) => r.status !== 'DRIFT' && r.status !== 'ok').map((r) => `${r.golden} (${r.status})`),
    ...rows.filter((r) => r.status === 'DRIFT' && !writtenSet.has(r.golden)).map((r) => `${r.golden} (drifted, but the bless did not write it)`),
    ...changed.filter((r) => r.unchecked).map((r) => `${r.golden} (written, but the check did not report it)`),
  ];
  const pct = (f) => `${(f * 100).toFixed(2)}%`;

  const shape = changed.filter((r) => r.pageShapeChanged).map((r) => r.golden);
  const big = changed.filter((r) => r.worstFraction > maxPageFraction);
  const worst = changed.reduce((m, r) => Math.max(m, r.worstFraction), 0);
  const unseen = seen ? changed.filter((r) => !seen.has(r.golden)).map((r) => r.golden) : changed.map((r) => r.golden);

  const list = (xs) => (xs.length > 5 ? `${xs.slice(0, 5).join(', ')} and ${xs.length - 5} more` : xs.join(', '));
  const rules = [
    { id: 1, ok: shape.length === 0, text: 'No page added, removed or resized', detail: shape.length ? list(shape) : 'none' },
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
      text: 'Every changed golden was shown on a PR a person merged',
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

/** The verdict comment body. The marker lets the workflow update one comment in place. */
export const VERDICT_MARKER = '<!-- golden-bless-verdict -->';
export function verdictMarkdown(v, { dryRun = true, renderedFrom = '' } = {}) {
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
  if (v.problems.length) lines.push('', `**Problems** (a person looks): ${v.problems.join('; ')}`);
  lines.push(
    '',
    `${v.changed.length} golden${v.changed.length === 1 ? '' : 's'} re-blessed${renderedFrom ? ` from \`${renderedFrom.slice(0, 12)}\`` : ''}. The golden-diff comment on this PR shows each one before and after.`,
    '',
    VERDICT_MARKER,
  );
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}
