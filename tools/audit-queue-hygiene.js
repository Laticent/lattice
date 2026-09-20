#!/usr/bin/env node
/**
 * Audit the open issue QUEUE ITSELF for defects — strays, gaps, duplicate leads,
 * and alarm saturation. The mechanical half of a triage pass.
 *
 * Sibling to tools/audit-queue-dor.js, and the split between them is the point:
 * that one asks "can anyone PULL this card" (the Definition of Ready); this one asks
 * "is the BOARD telling the truth". Neither judges what a card is worth — that is the
 * human/agent half, and `.claude/skills/queue-triage/SKILL.md` holds the rubric.
 *
 * WHY IT EXISTS. A triage pass on 2026-09-20 (engineering/decisions/
 * 2026-09-20-issue-queue-triage.md) found four defects in the queue that no gate was
 * looking for: 50 cards carrying a `model:*` label for a dimension HARD RULE #27
 * retired two months earlier, 13 more on five non-taxonomy `type:` labels, a genuine
 * duplicate pair, and six standing alarms holding a third of all discussion on 2% of
 * the cards. Every one was found by hand, with throwaway scripts, and none of it was
 * re-derivable afterwards. This is that pass, written down.
 *
 * FOUR ARMS, and each reports a LEAD rather than a verdict — the same posture
 * `tools/jank-census.js` takes, and for the same reason: an instrument that overstates
 * its confidence is one people stop reading.
 *
 *   1. STRAYS      a label on a live card that `.github/labels.json` does not declare.
 *                  Catches a retired dimension nobody swept and a typo'd namespace
 *                  alike. `hasDimension` in .github/scripts/triage.js tests only the
 *                  `type:` PREFIX and never consults the taxonomy, so a non-taxonomy
 *                  `type:` satisfies the intake gate and reaches the board unflagged.
 *   2. GAPS        cards missing a required axis, per namespace. The live triage gate
 *                  already flags these one at a time; this counts them so a drift is
 *                  visible as a number rather than as N scattered banners.
 *   3. DUPES       pairs whose titles share enough DISTINCTIVE vocabulary to be worth
 *                  a human look. Deliberately crude — see the note on scoring below.
 *   4. ALARMS      cards holding an outsized share of all comments. A watch that has
 *                  re-fired forty times into one card is a dashboard wearing a card's
 *                  clothes, and the comment count is the only signal that says so.
 *
 * ON THE DUPES ARM, because a reader will want to know how much to trust it — and
 * because the first version of it did not work, which is the more useful half.
 *
 * Three choices, each forced by a measured failure against the real 2026-09-20 queue:
 *
 *   - TOKENS ARE STEMMED (a crude suffix strip, not a real stemmer). Unstemmed, the
 *     duplicate pair #2105/#2205 shares only `state` `chart` `assertion`, because one
 *     title says "linear"/"arm" and the other "linearity"/"arms". Stemming recovers
 *     both.
 *   - THE SCORE IS OVERLAP COEFFICIENT, not Jaccard. Jaccard divides by the UNION, so
 *     it punishes a long title paired with a short one — #2105 carries 16 distinctive
 *     tokens and #2205 carries 11, which scored that pair 0.17 and buried it under two
 *     false positives. Overlap divides by the SMALLER set and scores it 0.38.
 *   - A PAIR NEEDS `MIN_SHARED` TOKENS REGARDLESS, because overlap rates a pair that
 *     shares one token out of two a 0.50. On the real queue this is the difference
 *     between a list of 43 pairs and a list of 14 — i.e. between an arm nobody reads
 *     and one somebody does. It is a VOLUME control, not a precision one.
 *
 * PRECISION, STATED PLAINLY: 2 of those 14 pairs are real. The top-scoring row is a
 * FALSE POSITIVE — `[perf-nightly]` and `[perf-nightly-engine]`, two different watches,
 * score a perfect 1.00 because their three distinctive tokens (`perf` `nightly`
 * `regression`) are all they have. It cannot be thresholded away: it shares exactly as
 * many tokens as the true #2105/#2205 pair does, so any `MIN_SHARED` that rejects it
 * rejects the real duplicate too. **Rank order therefore carries no information about
 * truth here** — read all 14, do not start at the top and stop when one looks wrong.
 *
 * Tokens appearing in more than `COMMON_TOKEN_SHARE` of all titles are dropped before
 * any pair is scored, which is what stops `studio`, `export` and `test` from pairing
 * forty cards in a repo whose titles all draw on one vocabulary.
 *
 * WHAT IT ACTUALLY CAUGHT, on the 317-card queue it was built against: 14 pairs, of
 * which #2105/#2205 was the known duplicate and **#1364/#2010 was one a careful manual
 * pass over all 317 cards had missed** — the same `check-lint-coverage` probe-manifest
 * defect, filed twice two months apart, with the same error text in both bodies. That
 * miss is the argument for this arm existing.
 *
 * It still proposes pairs that merely rhyme (#2060/#2133 and #1562/#1865 are both
 * related-but-distinct), and it cannot see a duplicate phrased with no shared
 * vocabulary at all. Treat a row as a prompt to open two tabs, never as grounds to
 * close anything.
 *
 * INPUT is the same issue JSON tools/sync-backlog.js and tools/audit-queue-dor.js read,
 * so one fetch feeds all three. It never writes to GitHub.
 *
 * Usage:
 *   gh issue list --state open --limit 1000 \
 *     --json number,title,labels,comments | node tools/audit-queue-hygiene.js --input -
 *   node tools/audit-queue-hygiene.js --input issues.json
 *   node tools/audit-queue-hygiene.js --input issues.json --json
 *
 * `gh` is not installed in the cloud sandbox. There, paginate the GitHub MCP's
 * list_issues to exhaustion, merge the pages by number, and feed that file.
 */

const fs = require('node:fs');
const path = require('node:path');

/** Namespaces every card is expected to carry. `status:` is set by the intake gate. */
const REQUIRED_NAMESPACES = ['area:', 'type:', 'priority:', 'status:'];

/** A token in more than this share of all titles carries no signal for pairing. */
const COMMON_TOKEN_SHARE = 0.02;

/** Report a pair at or above this OVERLAP COEFFICIENT (shared / smaller set). Tuned
 *  against the real 2026-09-20 queue: 0.33 admits both true duplicates found there
 *  (#2105/#2205 at 0.38, #1364/#2010 at 0.33 — the floor sits exactly on the second,
 *  which is a tuning smell worth knowing) and yields 14 pairs over 317 cards,
 *  which is a list a human will actually read. */
const DUPE_FLOOR = 0.33;

/** A pair needs at least this many shared distinctive tokens whatever it scores.
 *  Without it, two short titles sharing every token rate 1.0 — which is how two
 *  unrelated nightly watches topped the first run of this arm. */
const MIN_SHARED = 3;

/** A card at or above this share of ALL comments in the queue is saturating. */
const ALARM_SHARE = 0.02;

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'for', 'from', 'has',
  'have', 'in', 'into', 'is', 'it', 'its', 'no', 'not', 'of', 'on', 'one', 'only', 'or',
  'so', 'that', 'the', 'their', 'then', 'there', 'they', 'this', 'to', 'was', 'were',
  'what', 'when', 'which', 'why', 'with', 'you', 'your',
]);

const labelNames = (i) => (i.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
const commentCount = (i) => (typeof i.comments === 'number' ? i.comments : (i.comments?.totalCount ?? 0));

/** Title → distinctive lower-case tokens. Splits on non-word, drops stopwords and
 *  anything under 3 characters (`ui`, `e2e` carry no pairing signal on their own). */
function tokenize(title) {
  return (title || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .map(stem);
}

/** A crude suffix strip, NOT a real stemmer — it exists only to pair `linear` with
 *  `linearity` and `arm` with `arms`. It happily mangles words (`parsing` -> `pars`),
 *  which costs nothing here because both sides of a comparison are mangled alike. */
function stem(word) {
  return word.replace(/(ities|ity|ies|ing|ed|es|s)$/, '');
}

/**
 * @param {object[]} issues open issues (pull requests must already be filtered out)
 * @param {string[]} taxonomy every label name `.github/labels.json` declares
 */
function auditHygiene(issues, taxonomy) {
  const open = (issues || []).filter((i) => !i.pull_request);
  const declared = new Set(taxonomy);

  // 1 — STRAYS
  const strays = new Map();
  for (const issue of open) {
    for (const name of labelNames(issue)) {
      if (declared.has(name)) continue;
      if (!strays.has(name)) strays.set(name, []);
      strays.get(name).push(issue.number);
    }
  }

  // 2 — GAPS
  const gaps = {};
  for (const ns of REQUIRED_NAMESPACES) {
    gaps[ns] = open.filter((i) => !labelNames(i).some((n) => n.startsWith(ns))).map((i) => i.number);
  }

  // 3 — DUPES. Document frequency first, so a token every title shares is dropped
  // before any pair is scored rather than after.
  const df = new Map();
  const tokens = new Map();
  for (const issue of open) {
    const set = new Set(tokenize(issue.title));
    tokens.set(issue.number, set);
    for (const t of set) df.set(t, (df.get(t) || 0) + 1);
  }
  const ceiling = Math.max(2, Math.floor(open.length * COMMON_TOKEN_SHARE));
  const distinctive = new Map();
  for (const [n, set] of tokens) distinctive.set(n, new Set([...set].filter((t) => df.get(t) <= ceiling)));

  const dupes = [];
  for (let a = 0; a < open.length; a++) {
    for (let b = a + 1; b < open.length; b++) {
      const A = distinctive.get(open[a].number);
      const B = distinctive.get(open[b].number);
      if (!A.size || !B.size) continue;
      let shared = 0;
      for (const t of A) if (B.has(t)) shared++;
      if (shared < MIN_SHARED) continue;
      const score = shared / Math.min(A.size, B.size);
      if (score >= DUPE_FLOOR) {
        dupes.push({ a: open[a].number, b: open[b].number, score: Number(score.toFixed(2)), shared, titles: [open[a].title, open[b].title] });
      }
    }
  }
  dupes.sort((x, y) => y.score - x.score || x.a - y.a);

  // 4 — ALARMS
  const total = open.reduce((s, i) => s + commentCount(i), 0);
  const alarms = open
    .filter((i) => total > 0 && commentCount(i) / total >= ALARM_SHARE)
    .map((i) => ({ number: i.number, comments: commentCount(i), share: Number((commentCount(i) / total).toFixed(3)), title: i.title }))
    .sort((x, y) => y.comments - x.comments);

  return {
    open: open.length,
    strays: [...strays.entries()].map(([label, numbers]) => ({ label, count: numbers.length, numbers })).sort((x, y) => y.count - x.count),
    gaps,
    dupes,
    alarms,
    comments: { total, inAlarms: alarms.reduce((s, a) => s + a.comments, 0) },
  };
}

function report(a) {
  const lines = [`queue hygiene — ${a.open} open cards`, ''];

  lines.push(`STRAYS — labels no .github/labels.json entry declares (${a.strays.length})`);
  if (!a.strays.length) lines.push('  none');
  for (const s of a.strays) {
    const shown = s.numbers.slice(0, 12).join(', ');
    lines.push(`  ${s.label.padEnd(22)} ${String(s.count).padStart(3)}  ${shown}${s.numbers.length > 12 ? ', …' : ''}`);
  }

  lines.push('', 'GAPS — cards missing a required axis');
  for (const ns of REQUIRED_NAMESPACES) {
    const g = a.gaps[ns];
    lines.push(`  ${ns.padEnd(10)} ${String(g.length).padStart(3)}${g.length ? `  ${g.slice(0, 12).join(', ')}${g.length > 12 ? ', …' : ''}` : ''}`);
  }

  lines.push('', `DUPE LEADS — overlap >= ${DUPE_FLOOR} on >= ${MIN_SHARED} shared tokens (${a.dupes.length}). A LEAD, not a verdict — open both.`);
  if (!a.dupes.length) lines.push('  none');
  for (const d of a.dupes.slice(0, 20)) {
    lines.push(`  ${d.score.toFixed(2)}  ${d.shared} shared  #${d.a} / #${d.b}`);
    lines.push(`        ${d.titles[0].slice(0, 92)}`);
    lines.push(`        ${d.titles[1].slice(0, 92)}`);
  }
  if (a.dupes.length > 20) lines.push(`  … ${a.dupes.length - 20} more`);

  lines.push('', `ALARM SATURATION — cards holding >=${ALARM_SHARE * 100}% of all ${a.comments.total} comments (${a.alarms.length})`);
  if (!a.alarms.length) lines.push('  none');
  for (const al of a.alarms) {
    lines.push(`  #${String(al.number).padEnd(5)} ${String(al.comments).padStart(3)} comments  ${(al.share * 100).toFixed(1)}%  ${al.title.slice(0, 74)}`);
  }
  if (a.alarms.length) {
    const share = ((a.comments.inAlarms / a.comments.total) * 100).toFixed(1);
    const cards = ((a.alarms.length / a.open) * 100).toFixed(1);
    lines.push(`  -> ${a.comments.inAlarms} of ${a.comments.total} comments (${share}%) on ${a.alarms.length} of ${a.open} cards (${cards}%)`);
  }

  return lines.join('\n');
}

function loadTaxonomy(repoRoot) {
  const file = path.join(repoRoot, '.github', 'labels.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')).map((l) => l.name);
}

function main(argv) {
  const at = argv.indexOf('--input');
  if (at === -1 || !argv[at + 1]) {
    console.error('usage: audit-queue-hygiene.js --input <file|-> [--json]');
    process.exit(64);
  }
  const src = argv[at + 1];
  const raw = src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
  const parsed = JSON.parse(raw);
  const issues = Array.isArray(parsed) ? parsed : parsed.issues;
  if (!Array.isArray(issues)) {
    console.error('audit-queue-hygiene: input must be an issue ARRAY, or an object with an `issues` array.');
    process.exit(65);
  }
  const audit = auditHygiene(issues, loadTaxonomy(path.join(__dirname, '..')));
  console.log(argv.includes('--json') ? JSON.stringify(audit, null, 2) : report(audit));
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { auditHygiene, report, tokenize, stem, REQUIRED_NAMESPACES, DUPE_FLOOR, MIN_SHARED, ALARM_SHARE, COMMON_TOKEN_SHARE };
