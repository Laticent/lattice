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
// every later night say "no". So each row also scores the night's DELTA: what the night
// would have said had the previous night's bless been merged. Three kinds of golden:
//
//   - carried:   in the previous night of the same window, and provably the same. A drifted
//                golden is the same when its status, worst page and every drifted page's
//                pixel count are unchanged. A first-time golden has no check row to compare,
//                so it is the same only when nothing that could move its render changed
//                between the two render commits (`mayHaveMoved`, from the git diff).
//   - uncertain: a first-time golden the previous night carried, whose render inputs did
//                change. Had that bless merged, it would now be a committed golden that may
//                or may not drift; only a render can say. It is never scored as a pass.
//   - delta:     everything else, scored with the same verdict() as the bot.
//
// The delta's rule 4 counts only the PRs merged since the previous night's render commit
// (`deltaSeen`), because a merged bless would have moved the window there.

import { goldenRows, verdict } from './golden-bless-verdict.mjs';

/**
 * @param {object} night
 * @param {string} night.date                 YYYY-MM-DD the run started
 * @param {string} night.runUrl
 * @param {object} night.verdict              the run's verdict.json
 * @param {object[]|{report: object[]}} night.check  the run's check.json
 * @param {Set<string>|null} night.seen       rule 4's seen set over the bot's own window (null: no earlier bless)
 * @param {Set<string>|null} [night.deltaSeen] rule 4's seen set since the previous night's render commit
 * @param {(golden: string) => boolean} [night.mayHaveMoved]  a first-time golden's render inputs
 *        changed since the previous night's render commit (default: assume they did)
 * @param {{ windowFrom: string, rows: Map<string, object>, created: Set<string> }|null} prev
 */
export function nightRow({ date, runUrl, verdict: v, check, seen, deltaSeen = seen, mayHaveMoved = () => true }, prev = null) {
  const rows = goldenRows(Array.isArray(check) ? check : check.report || []);
  const byGolden = new Map(rows.map((r) => [r.golden, r]));
  const created = v.created || [];
  const createdSet = new Set(created);
  const full = verdict(rows, seen, v.changed, { created });
  // The bot adds problems the check cannot show (a failed bless, a first render that failed,
  // a PR it could not read), and verdict.json is the only place they live.
  const problems = v.problems ?? full.problems;

  const inWindow = prev && prev.windowFrom === v.windowFrom;
  const sig = (r) => JSON.stringify([r?.status, r?.worstFraction, r?.pageShapeChanged, r?.drifted]);
  const carried = [];
  const uncertain = [];
  const delta = [];
  for (const g of v.changed) {
    if (!inWindow || !prev.rows.has(g)) delta.push(g);
    else if (createdSet.has(g) && prev.created.has(g)) (mayHaveMoved(g) ? uncertain : carried).push(g);
    else if (!createdSet.has(g) && !prev.created.has(g) && sig(prev.rows.get(g)) === sig(byGolden.get(g))) carried.push(g);
    else delta.push(g);
  }
  const alone = verdict(rows, deltaSeen, delta, { created: created.filter((g) => delta.includes(g)) });
  const deltaHolds = problems.length === 0 && alone.rules.every((r) => r.ok);
  let deltaAutoMerge = 'yes';
  if (!delta.length && !uncertain.length) deltaAutoMerge = 'nothing new';
  else if (!deltaHolds) deltaAutoMerge = 'no';
  else if (uncertain.length) deltaAutoMerge = 'unknown';

  const worst = (gs) => gs.reduce((m, g) => Math.max(m, byGolden.get(g)?.worstFraction ?? 0), 0);
  const unseenBy = (s, gs) => (s ? gs.filter((g) => !s.has(g)) : gs);
  return {
    date,
    runUrl,
    renderedFrom: (v.renderedFrom || '').slice(0, 12),
    windowFrom: (v.windowFrom || '').slice(0, 12),
    // The delta is known when the previous night is in hand, or when the window just opened
    // (no earlier bless, or the previous night belonged to an older window). The oldest night
    // fetched may sit mid-window, with its predecessor's artifact expired: n/a, not a guess.
    deltaKnown: Boolean(prev) || !v.windowFrom,
    changed: v.changed.length,
    created: created.length,
    worst: worst(v.changed),
    rules: full.rules.map((r) => r.ok),
    autoMerge: full.autoMerge && problems.length === 0,
    unseen: unseenBy(seen, v.changed),
    carried,
    uncertain,
    delta,
    deltaWorst: worst(delta),
    deltaRules: alone.rules.map((r) => r.ok),
    deltaUnseen: unseenBy(deltaSeen, delta),
    deltaAutoMerge,
    problems: problems.length,
    rowsByGolden: new Map(v.changed.map((g) => [g, byGolden.get(g) || { golden: g, status: 'NEW' }])),
  };
}

/** Rows for a list of nights, oldest first, threading each night's carry into the next. */
export function nightRows(nights) {
  const out = [];
  let prev = null;
  for (const n of nights) {
    const row = nightRow(n, prev);
    out.push(row);
    prev = { windowFrom: n.verdict.windowFrom, rows: row.rowsByGolden, created: new Set(n.verdict.created || []) };
  }
  return out;
}

const LIST_MAX = 12;
const pct = (f) => `${(f * 100).toFixed(2)}%`;
const marks = (oks) => oks.map((ok) => (ok ? 'y' : 'n')).join('');
const list = (gs) => {
  const shown = gs.slice(0, LIST_MAX).map((g) => `\`${g}\``).join(', ');
  return gs.length > LIST_MAX ? `${shown} and ${gs.length - LIST_MAX} more` : shown;
};

/** The calibration table, with an empty column for a person's label per night. */
export function nightsMarkdown(rows) {
  const lines = [
    '| Night | Rendered from | Changed (new) | Worst page | Rules 1234 | Would merge | Delta | Delta worst | Delta rules 1234 | Delta would merge | Person: accept unseen? |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const d = r.deltaKnown
      ? `${r.delta.length}${r.uncertain.length ? ` (+${r.uncertain.length} uncertain)` : ''} | ${pct(r.deltaWorst)} | ${marks(r.deltaRules)} | ${r.deltaAutoMerge}`
      : 'n/a | | | n/a';
    lines.push(`| [${r.date}](${r.runUrl}) | \`${r.renderedFrom}\` | ${r.changed} (${r.created}) | ${pct(r.worst)} | ${marks(r.rules)} | ${r.autoMerge ? 'yes' : 'no'} | ${d} | |`);
  }
  lines.push(
    '',
    'Rules: 1 no page added, removed or resized; 2 no page past the threshold; 3 at most N goldens; 4 every golden shown on a PR a person merged. `y` holds, `n` fails.',
    'Delta: the goldens the previous night of the same window did not already carry, scored as if its bless had merged. Uncertain: a first-time golden carried from the previous night whose render inputs changed since, so only a render can say whether it moved; a delta that holds with any uncertain golden reads `unknown`.',
  );
  for (const r of rows) {
    if (!r.deltaKnown) continue;
    if (r.deltaUnseen.length) lines.push(`- ${r.date} (\`${r.renderedFrom}\`) delta unseen: ${list(r.deltaUnseen)}`);
    if (r.uncertain.length) lines.push(`- ${r.date} (\`${r.renderedFrom}\`) uncertain: ${list(r.uncertain)}`);
  }
  return lines.join('\n');
}
