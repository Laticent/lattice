/**
 * lib/conformance/ledger.js — the debt ledger: known failures, each with a reason.
 *
 * test/conformance/debt.json holds `{ entries: [{ clause, instance, reason, seeded }] }`. An entry
 * turns that one cell from `fail` into `debt`. The rules that keep it from becoming a bin for
 * anything inconvenient (engineering/decisions/2026-10-15-conformance-harness.md §6.3 rule 1):
 *   - debt is seeded only on the day its clause lands (`seeded` equals the clause's `added`), so
 *     a later instance cannot arrive carrying debt: it conforms, or it does not merge;
 *   - an entry for a cell that now passes is STALE and fails, so the ledger only shrinks;
 *   - an entry names a clause and an instance that exist, and says why.
 * The repo's 32 `SANCTIONED_*` allowlists stay where they are (§6.1); a clause that reads a gate
 * inherits that gate's exemptions.
 *
 * A clause that COUNTS (`measure`) puts an integer `ceiling` on its entries: the count may not rise
 * above it, and when it falls the ceiling must follow, so a shrinking ratchet stays one.
 *
 * THE DATE IS CHECKED AGAINST GIT, NOT AGAINST THE ENTRY'S OWN WORD. `seeded` is a string the
 * entry's author writes, so `ledgerProblems` alone is satisfied by back-dating. `ledgerGitProblems`
 * reads the history instead: an entry may be added only in the commit that adds its clause (or a
 * commit before it), and a ceiling may never exceed the one the entry was added with. A shallow
 * clone cannot answer, so it answers nothing rather than guessing.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..');
const DEBT_FILE = path.join(REPO, 'test', 'conformance', 'debt.json');
const DEBT_FILE_REL = 'test/conformance/debt.json';
const KINDS_DIR_REL = 'lib/conformance/kinds';

/** The ledger's entries ([] when the file is absent). */
function readLedger(file = DEBT_FILE) {
  if (!fs.existsSync(file)) return [];
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(json.entries) ? json.entries : [];
}

/** `clause|instance` → entry. */
function ledgerIndex(entries) {
  return new Map(entries.map((e) => [`${e.clause}|${e.instance}`, e]));
}

/**
 * Problems with the ledger against a finished run, or []. `cells` is every evaluated
 * `{ clause, instance, verdict }` across the contracts; `clauses` is every clause by id.
 */
function ledgerProblems(entries, cells, clauses) {
  const out = [];
  const byKey = new Map(cells.map((c) => [`${c.clause}|${c.instance}`, c]));
  for (const e of entries) {
    const key = `${e.clause}|${e.instance}`;
    const clause = clauses.get(e.clause);
    if (!clause) { out.push(`debt ${key}: no such clause`); continue; }
    if (typeof e.reason !== 'string' || e.reason.trim().length < 12) out.push(`debt ${key}: needs a reason a reader can act on`);
    if (e.seeded !== clause.added) out.push(`debt ${key}: seeded ${e.seeded}, but debt may be seeded only the day its clause landed (${clause.added})`);
    const cell = byKey.get(key);
    if (!cell) out.push(`debt ${key}: no such instance under that clause`);
    else if (cell.verdict !== 'debt') out.push(`debt ${key}: STALE — the cell is now ${cell.verdict}; delete the entry`);
    else if (clause.measure) {
      // A counting clause: the entry carries the count it was seeded at, and the count only falls.
      if (!Number.isInteger(e.ceiling)) out.push(`debt ${key}: this clause counts something, so the entry needs an integer ceiling`);
      else if (cell.measure > e.ceiling) out.push(`debt ${key}: ${cell.measure} now, above its ceiling of ${e.ceiling} — the count may only fall`);
      else if (cell.measure < e.ceiling) out.push(`debt ${key}: ${cell.measure} now, below its ceiling of ${e.ceiling} — lower the ceiling so the gain is kept`);
    }
  }
  return out;
}

/** git, quiet: trimmed stdout, or null when the command fails. */
function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).trim();
  } catch {
    return null;
  }
}
const gitOk = (args, cwd) => { try { execFileSync('git', args, { cwd, stdio: 'ignore' }); return true; } catch { return false; } };

/**
 * What an entry is found by in debt.json: its clause and instance, in the spacing `formatEntry`
 * writes, one entry per line. A later edit to an entry's reason or ceiling leaves this string alone,
 * so `git log -S` sees only the commits that ADD or REMOVE the entry itself.
 */
function entryIdentity(e) {
  return `"clause": ${JSON.stringify(e.clause)}, "instance": ${JSON.stringify(e.instance)}`;
}

/** One ledger line, in the form `entryIdentity` is searched for. */
function formatEntry(e) {
  const { clause, instance, ...rest } = e;
  const tail = Object.entries(rest).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ');
  return `{ ${entryIdentity({ clause, instance })}${tail ? `, ${tail}` : ''} }`;
}

/**
 * §6.3 rule 1 against git. For each entry:
 *   clause commit  the OLDEST commit under lib/conformance/kinds/ whose diff adds `id: '<clause>'`
 *                  (oldest, so deleting a clause and re-adding it cannot reset its day);
 *   entry commit   the NEWEST commit under test/conformance/debt.json whose diff adds or removes
 *                  the entry's identity (newest, so delete-then-re-add counts as added later; an
 *                  entry added once and edited since has exactly one such commit).
 * Honest when the entry commit IS the clause commit or an ANCESTOR of it. An entry in the working
 * tree and in no commit yet is honest only while its clause is in no commit either. The ceiling
 * must not exceed the one the entry carried in its entry commit, so it cannot be raised later.
 */
function ledgerGitProblems(entries, { cwd = REPO, ledgerFile = DEBT_FILE_REL, kindsDir = KINDS_DIR_REL, base } = {}) {
  if (git(['rev-parse', '--is-shallow-repository'], cwd) !== 'false') return [];
  // THE BASE. Back-dating is judged against what the base branch already holds: a clause that
  // landed on `main` and an entry added to it later is the violation. A branch with several commits
  // that adds a clause and then edits its debt is ONE change, and its commits are not compared with
  // each other (a squash merge makes them one commit anyway, so judging them separately would pass
  // or fail a branch depending on how it is merged). No base ref → compare every commit (a bare repo).
  const baseRef = base === undefined ? ['origin/main', 'main'].find((r) => git(['rev-parse', '--verify', '--quiet', r], cwd)) : base;
  const onBase = (c) => !baseRef || gitOk(['merge-base', '--is-ancestor', c, baseRef], cwd);
  const out = [];
  const file = path.join(cwd, ledgerFile);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const clauseCommits = new Map();
  for (const e of entries) {
    const key = `${e.clause}|${e.instance}`;
    const identity = entryIdentity(e);
    if (!text.includes(identity)) { out.push(`debt ${key}: not found in ${ledgerFile} as one line starting { ${identity}, … } (write it with formatEntry so git can date it)`); continue; }
    if (!clauseCommits.has(e.clause)) {
      const log = git(['log', '--reverse', '--format=%H', `-Sid: '${e.clause}'`, '--', kindsDir], cwd);
      clauseCommits.set(e.clause, log ? log.split('\n')[0] : null);
    }
    const clauseCommit = clauseCommits.get(e.clause);
    // The clause is new in this branch: its debt is seeded in the same change, however many commits.
    if (clauseCommit && !onBase(clauseCommit)) continue;
    const log = git(['log', '--format=%H', `-S${identity}`, '--', ledgerFile], cwd);
    const entryCommit = log ? log.split('\n')[0] : null;
    if (!entryCommit) {
      if (clauseCommit) out.push(`debt ${key}: its clause landed in ${clauseCommit.slice(0, 9)} and this entry is in no commit yet; debt may be seeded only in the commit that adds its clause`);
      continue;
    }
    if (clauseCommit && entryCommit !== clauseCommit && !gitOk(['merge-base', '--is-ancestor', entryCommit, clauseCommit], cwd)) {
      out.push(`debt ${key}: added in ${entryCommit.slice(0, 9)}, after its clause landed in ${clauseCommit.slice(0, 9)}; debt may be seeded only in the commit that adds its clause (the entry's own seeded: ${e.seeded} is its author's word)`);
    }
    // A ceiling is compared with the one the entry carried when it reached the base; an entry added in
    // this branch has no earlier ceiling to exceed.
    if (Number.isInteger(e.ceiling) && onBase(entryCommit)) {
      const then = git(['show', `${entryCommit}:${ledgerFile}`], cwd);
      const line = then && then.split('\n').find((l) => l.includes(identity));
      const was = line && Number((line.match(/"ceiling": (\d+)/) || [])[1]);
      if (Number.isInteger(was) && e.ceiling > was) out.push(`debt ${key}: ceiling ${e.ceiling} is above the ${was} it was added with; a ceiling may only fall`);
    }
  }
  return out;
}

module.exports = { readLedger, ledgerIndex, ledgerProblems, ledgerGitProblems, formatEntry, entryIdentity, DEBT_FILE };
