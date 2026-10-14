// ONE ROW PER BLESS NIGHT — pure, so it is unit-tested. The data for goldens rollout step 4.
//
// Step 4 sets the rule 2 and 3 thresholds from a week of dry-run nights, each labeled by a
// person ("would I have accepted this unseen?"), and then switches the bless PR's hybrid
// auto-merge on (engineering/decisions/2026-10-06-goldens-bot-blessed.md §2.1, §5). The
// verdict comment on the bless PR is edited in place every night, so it holds one night,
// not seven. Each run's `golden-bless` artifact keeps that night's verdict.json and
// check.json for 90 days; tools/golden-bless-nights.mjs fetches them and this module turns
// each into a row.
//
// THE CARRY. While the bless PR sits unmerged, every night re-blesses everything since the
// last MERGED bless, so a golden that moved on Monday is in Tuesday's, Wednesday's and every
// later night's list too. Those nights are not independent samples: one unseen golden makes
// every later night say "no". So each row also scores the night's DELTA (the goldens the
// previous night of the same window did not already carry) with the same verdict(), which
// is what that night would have said had the previous bless been merged. A golden counts as
// carried only when its row is unchanged, so one whose drift grew is scored again.

import { goldenRows, verdict } from './golden-bless-verdict.mjs';

/**
 * @param {object} night
 * @param {string} night.date                 YYYY-MM-DD the run started
 * @param {string} night.runUrl
 * @param {object} night.verdict              the run's verdict.json
 * @param {object[]|{report: object[]}} night.check  the run's check.json
 * @param {Set<string>|null} night.seen       rule 4's seen set, replayed (null: no earlier bless)
 * @param {{ windowFrom: string, rows: Map<string, object> }|null} prev  the previous night's
 *        window and changed rows, or null
 */
export function nightRow({ date, runUrl, verdict: v, check, seen }, prev = null) {
  const rows = goldenRows(Array.isArray(check) ? check : check.report || []);
  const byGolden = new Map(rows.map((r) => [r.golden, r]));
  const created = v.created || [];
  const full = verdict(rows, seen, v.changed, { created });
  const same = (a, b) => a && b && a.worstFraction === b.worstFraction && a.pageShapeChanged === b.pageShapeChanged && a.status === b.status;
  const carriedFrom = prev && prev.windowFrom === v.windowFrom ? prev.rows : new Map();
  const changedRows = new Map(v.changed.map((g) => [g, byGolden.get(g) || { golden: g, status: 'NEW' }]));
  const delta = v.changed.filter((g) => !(carriedFrom.has(g) && same(carriedFrom.get(g), changedRows.get(g))));
  const alone = verdict(rows, seen, delta, { created: created.filter((g) => delta.includes(g)) });
  const worst = (gs) => gs.reduce((m, g) => Math.max(m, byGolden.get(g)?.worstFraction ?? 0), 0);
  const unseen = (gs) => (seen ? gs.filter((g) => !seen.has(g)) : gs);
  return {
    date,
    runUrl,
    renderedFrom: (v.renderedFrom || '').slice(0, 12),
    windowFrom: (v.windowFrom || '').slice(0, 12),
    changed: v.changed.length,
    created: created.length,
    worst: worst(v.changed),
    rules: full.rules.map((r) => r.ok),
    autoMerge: full.autoMerge,
    unseen: unseen(v.changed),
    delta,
    deltaWorst: worst(delta),
    deltaRules: alone.rules.map((r) => r.ok),
    deltaUnseen: unseen(delta),
    // verdict() would read the carried goldens as "drifted but not written" problems, so
    // the delta takes the full night's problems and its own rules.
    deltaAutoMerge: delta.length > 0 && full.problems.length === 0 && alone.rules.every((r) => r.ok),
    problems: full.problems.length,
    rowsByGolden: changedRows,
  };
}

/** Rows for a list of nights, oldest first, threading each night's carry into the next. */
export function nightRows(nights) {
  const out = [];
  let prev = null;
  for (const n of nights) {
    const row = nightRow(n, prev);
    out.push(row);
    prev = { windowFrom: n.verdict.windowFrom, rows: row.rowsByGolden };
  }
  return out;
}

const LIST_MAX = 12;
const pct = (f) => `${(f * 100).toFixed(2)}%`;
const marks = (oks) => oks.map((ok) => (ok ? 'y' : 'n')).join('');

/** The calibration table, with an empty column for a person's label per night. */
export function nightsMarkdown(rows) {
  const lines = [
    '| Night | Rendered from | Changed (new) | Worst page | Rules 1234 | Would merge | Delta (new to the night) | Delta worst | Delta rules 1234 | Delta would merge | Person: accept unseen? |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(`| [${r.date}](${r.runUrl}) | \`${r.renderedFrom}\` | ${r.changed} (${r.created}) | ${pct(r.worst)} | ${marks(r.rules)} | ${r.autoMerge ? 'yes' : 'no'} | ${r.delta.length} | ${pct(r.deltaWorst)} | ${marks(r.deltaRules)} | ${r.delta.length ? (r.deltaAutoMerge ? 'yes' : 'no') : 'nothing new'} | |`);
  }
  lines.push('', 'Rules: 1 no page added, removed or resized; 2 no page past the threshold; 3 at most N goldens; 4 every golden shown on a PR a person merged. `y` holds, `n` fails.');
  for (const r of rows) {
    if (!r.deltaUnseen.length) continue;
    const shown = r.deltaUnseen.slice(0, LIST_MAX).map((g) => `\`${g}\``).join(', ');
    const more = r.deltaUnseen.length > LIST_MAX ? ` and ${r.deltaUnseen.length - LIST_MAX} more` : '';
    lines.push(`- ${r.date} (\`${r.renderedFrom}\`) delta unseen: ${shown}${more}`);
  }
  return lines.join('\n');
}
