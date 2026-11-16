// WHAT TONIGHT'S BLESS RE-RECORDS — pure, so it is unit-tested.
//
// `partition` decides, per golden, what the nightly bless re-records and what it holds
// (engineering/decisions/2026-11-16-blessing-invariants-attribution.md, rollout step 1). The bless
// PR merges itself; a held golden stays drifted on `main` and turns the night red.
//
// `verdict` still scores the 2026-10-07 four-rule hybrid (no page count changed, no page moved past a
// threshold, at most a handful changed, every changed golden shown on a merged PR) for the record and
// for tools/golden-bless-nights.mjs. It no longer decides the merge. Rule 4 reads what golden-diff
// actually showed (the `golden-diff-changed` marker), not what a PR could have rendered: the adversarial
// trio on #2570 showed that replaying the path mapping called a golden "seen" whenever any PR touched a
// shared file.
// The retired hybrid's thresholds, kept so `verdict` still scores it for the record.
export const MAX_PAGE_FRACTION = 0.01;
export const MAX_GOLDENS = 10;

// The bless PR's title names the commit it rendered from, so rule 4 counts merges since
// THAT commit, not since a person got round to merging the PR. Squash-merge appends
// " (#N)". The pattern matches the whole subject, so a body line or a longer subject
// that merely starts the same way never counts.
/**
 * The latest moment, in minutes after the golden-bless process starts, at which the night may start a
 * first render of a golden that does not exist yet. The job's cap is 180 minutes and counts from the
 * job start (setup takes about two); what follows the first renders is the showcase build, the artifact
 * upload and the PR, so 20 minutes stay free. A render already running finishes; the rest wait for the
 * next night. Measured on run 40914407337 (2026-10-29): the serial check took 125 minutes and a
 * second, re-bless pass after it ran past the cap, which is why the check now runs one worker per core
 * and promotes what drifted in the same pass (regression-gate.mjs --jobs auto --promote).
 */
export const BLESS_DEADLINE_MS = 160 * 60 * 1000;

/**
 * What tonight's check wrote, held against what it reported. The check (`regression-gate.mjs
 * --promote`) writes a drifted golden's fresh render in place, so after it:
 *   - `stray`: a PDF that changed but no row reports as drifted. The tool broke its own contract,
 *     so the tree is not trusted; golden-bless puts these back and exits 3 before the PR step.
 *   - `unblessed`: a drifted golden whose PDF did not change.
 *   - `unchecked`: a golden the check could not judge (RENDER_ERROR, or a worker that died, which
 *     the gate reports as RENDER_ERROR). NO_GOLDEN is not here: the first-render step owns it.
 * `unblessed` and `unchecked` turn the night red through failed.txt AFTER the PR is updated. Without
 * that, a night where every check failed wrote nothing, read as quiet, and closed the bless PR.
 * @param {ReturnType<typeof goldenRows>} rows
 * @param {string[]} changed repo-relative PDFs the working tree changed or added
 */
export function writtenProblems(rows, changed) {
  const drifted = new Set(rows.filter((r) => r.status === 'DRIFT').map((r) => r.golden));
  const wrote = new Set(changed);
  return {
    stray: changed.filter((f) => !drifted.has(f)),
    unblessed: [...drifted].filter((g) => !wrote.has(g)),
    unchecked: rows.filter((r) => !['ok', 'DRIFT', 'NO_GOLDEN'].includes(r.status)).map((r) => r.golden),
  };
}

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
        // Each drifted page and its pixel count: two nights compare equal only if every page
        // moved by the same amount (tools/lib/golden-bless-nights.mjs).
        drifted: (t.drifted || []).map((p) => [p.page, p.pixels]),
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
export function verdict(rows, seen, written, { maxPageFraction = MAX_PAGE_FRACTION, maxGoldens = MAX_GOLDENS, created = [] } = {}) {
  const writtenSet = new Set(written);
  // A golden rendered for the first time (a deck or gallery merged without a PDF, step 3)
  // has no "before": rules 1 and 2 cannot apply, and the check reported it NO_GOLDEN or not
  // at all. It still counts toward rules 3 and 4: it must have been shown on a merged PR.
  const createdSet = new Set(created.filter((g) => writtenSet.has(g)));
  const asNew = (golden) => ({ golden, status: 'NEW', worstFraction: 0, pageShapeChanged: false });
  rows = rows.map((r) => (createdSet.has(r.golden) && r.status === 'NO_GOLDEN' ? asNew(r.golden) : r));
  const byGolden = new Map(rows.map((r) => [r.golden, r]));
  // The commit is the truth, not the check: a bless can fail, or a re-render can stop
  // drifting, and then the check's list names goldens the commit does not contain.
  const changed = written.map((g) => byGolden.get(g) || (createdSet.has(g) ? asNew(g) : { golden: g, status: 'DRIFT', worstFraction: 1, pageShapeChanged: false, unchecked: true }));
  const problems = [
    ...rows.filter((r) => !['DRIFT', 'ok', 'NEW'].includes(r.status)).map((r) => `${r.golden} (${r.status})`),
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
    created: [...createdSet],
    problems,
    rules,
  };
}

/**
 * Does the source explain a page-count change? Only when the deck or gallery gained or lost
 * EXACTLY as many slides as the PDF gained or lost pages. Owner's call, 2026-11-16 (#3235):
 * "the source changed at all" was too loose, because a typo fix next to an engine change that
 * adds a page would excuse it. A change of zero pages (a page resized) is never explained by
 * the source, and a missing count on any side means the bot cannot tell, so the golden is held.
 *
 * @param {{oldPages?: number, newPages?: number, oldSlides?: number, newSlides?: number}} c
 */
export function slidesExplainPages({ oldPages, newPages, oldSlides, newSlides } = {}) {
  const counts = [oldPages, newPages, oldSlides, newSlides];
  if (!counts.every((n) => Number.isInteger(n) && n >= 0)) return false;
  const pageDelta = newPages - oldPages;
  return pageDelta !== 0 && pageDelta === newSlides - oldSlides;
}

/**
 * WHICH GOLDENS TONIGHT'S BLESS RE-RECORDS — the 2026-11-16 design, rollout step 1
 * (engineering/decisions/2026-11-16-blessing-invariants-attribution.md §5, §10).
 *
 * The bless no longer asks a person, and it is never all-or-nothing. Each golden the check wrote is
 * either BLESSED (re-recorded, and the PR merges itself) or HELD (put back, so it stays drifted on
 * `main` and is reported). A golden is held when:
 *   - it breaks the goldens' invariant: a page was added, removed or resized (`pageShapeChanged`,
 *     which also catches a resized page that regression-gate scores as 0% moved);
 *   - or it cannot be trusted: the check did not report it, or reported it in a state other than
 *     DRIFT, ok or NEW (a render error, a dead worker).
 * Pixel movement alone never holds a golden: what moved is shown in the digest, worst first, and
 * attributing each movement to the merge that caused it is rollout step 3. One held golden never
 * holds back the rest, which is what stalled bless PRs #2624 and #3118.
 *
 * @param {ReturnType<typeof goldenRows>} rows  the check's rows
 * @param {string[]} written                    golden PDFs the bless changed or created on disk
 * @param {{created?: string[], explained?: string[], blessHeld?: boolean}} [opts]  first renders; page changes
 *   the slides explain (`slidesExplainPages`); the owner's `bless_held` dispatch
 * @returns {{bless: string[], held: {golden: string, why: string}[]}}
 */
export function partition(rows, written, { created = [], explained = [], blessHeld = false } = {}) {
  const explainedSet = new Set(explained);
  const byGolden = new Map(rows.map((r) => [r.golden, r]));
  const createdSet = new Set(created);
  const bless = [];
  const held = [];
  for (const golden of written) {
    const r = byGolden.get(golden);
    if (!r) {
      if (createdSet.has(golden)) bless.push(golden);
      else held.push({ golden, why: 'written, but the check did not report it' });
      continue;
    }
    if (createdSet.has(golden) && r.status === 'NO_GOLDEN') { bless.push(golden); continue; }
    if (!['DRIFT', 'ok', 'NEW'].includes(r.status)) { held.push({ golden, why: `the check reported ${r.status}` }); continue; }
    // A page-count change is EXPLAINED when the golden's source gained or lost exactly as many
    // slides as the PDF gained or lost pages (`slidesExplainPages`, computed by the caller): an
    // author added or removed a slide. The last bless before this design (#2987) changed 28 page
    // counts, every one a gallery edit. Unexplained, the engine moved it, and it is held unless the
    // owner's dispatch says otherwise (`blessHeld`).
    if (r.pageShapeChanged && !explainedSet.has(golden) && !blessHeld) {
      held.push({ golden, why: 'a page was added, removed or resized, and its source did not gain or lose as many slides' });
      continue;
    }
    bless.push(golden);
  }
  return { bless, held };
}

/**
 * The night's digest, the PR body's first comment: what was blessed, what was held and why, and the
 * goldens that moved most. It is read, never answered: nothing in it is a question.
 * @param {ReturnType<typeof partition>} part
 * @param {ReturnType<typeof goldenRows>} rows
 */
export function digestMarkdown(part, rows, { renderedFrom = '', runUrl = '', problems = [], worst = 12, created = [], explained = [] } = {}) {
  const pct = (f) => `${(f * 100).toFixed(2)}%`;
  const byGolden = new Map(rows.map((r) => [r.golden, r]));
  // A first render has nothing to have moved from, so it is listed apart, not as "0.00%" moved.
  const createdSet = new Set(created);
  const explainedSet = new Set(explained);
  const fresh = part.bless.filter((g) => createdSet.has(g));
  const recorded = part.bless.filter((g) => !createdSet.has(g));
  const moved = recorded
    .map((g) => ({ g, f: byGolden.get(g)?.worstFraction ?? 0, shape: !!byGolden.get(g)?.pageShapeChanged }))
    // A page added or removed is the biggest change a golden can make: it leads, whatever its pixels.
    .sort((a, b) => Number(b.shape) - Number(a.shape) || b.f - a.f)
    .slice(0, worst);
  const lines = [
    `### Golden bless: ${part.bless.length} re-recorded, ${part.held.length} held${renderedFrom ? ` (from \`${renderedFrom.slice(0, 12)}\`)` : ''}`,
    '',
    part.bless.length
      ? '_This PR merges itself (engineering/decisions/2026-11-16-blessing-invariants-attribution.md). Nothing here needs an answer; it is a record of what moved._'
      : '_Nothing was re-recorded tonight: every golden that drifted is held below._',
  ];
  if (moved.length) {
    lines.push('', `**Moved most** (worst page of each, ${moved.length} of ${recorded.length}):`, '', '| Golden | Worst page moved |', '|---|---|');
    for (const m of moved) {
      const note = m.shape ? (explainedSet.has(m.g) ? 'pages added or removed, matching its slides' : 'pages added, removed or resized') : '';
      lines.push(`| \`${m.g}\` | ${note ? `${pct(m.f)}; ${note}` : pct(m.f)} |`);
    }
  }
  if (fresh.length) lines.push('', `**Rendered for the first time** (${fresh.length}): ${fresh.map((g) => `\`${g}\``).join(', ')}.`);
  if (part.held.length) {
    lines.push('', '**Held** (left drifted on `main`, and the night is red until each is fixed, or blessed by a `bless_held` dispatch of golden-bless.yml):', '');
    for (const h of part.held) lines.push(`- \`${h.golden}\`: ${h.why}`);
  }
  if (problems.length) lines.push('', `**Problems** (the night turns red; the rest still lands): ${problems.join('; ')}`);
  if (runUrl) lines.push('', `Before │ after │ overlay montages of every drifted page: the \`golden-bless\` artifact of [this run](${runUrl}).`);
  lines.push('', VERDICT_MARKER);
  return lines.join('\n');
}

/** The verdict comment body. The marker lets the workflow update one comment in place. */
export const VERDICT_MARKER = '<!-- golden-bless-verdict -->';
export function verdictMarkdown(v, { dryRun = true, renderedFrom = '', runUrl = '' } = {}) {
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
    `${v.changed.length} golden${v.changed.length === 1 ? '' : 's'} re-blessed${(v.created || []).length ? ` (${v.created.length} rendered for the first time)` : ''}${renderedFrom ? ` from \`${renderedFrom.slice(0, 12)}\`` : ''}. The golden-diff comment on this PR shows each one before and after.`,
    // On a large night golden-diff's PR job can run out of time comparing hundreds of
    // PDFs; the check's own before │ after │ overlay montages are always in the run's
    // artifact, so link them.
    ...(runUrl ? ['', `Drift montages from the check (every drifted page): the \`golden-bless\` artifact of [this run](${runUrl}).`] : []),
    '',
    VERDICT_MARKER,
  );
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}
