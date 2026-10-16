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
 * WHAT THIS CANNOT ENFORCE, stated so nobody leans on it: `seeded` is a field the entry's author
 * writes, so a back-dated entry passes the date rule. Only review sees that. A git-based check
 * (the commit that added the entry against the commit that added the clause) is the fix, and it
 * belongs with the first phase that seeds real debt; phase 1 seeds none.
 */
const fs = require('node:fs');
const path = require('node:path');

const DEBT_FILE = path.join(__dirname, '..', '..', 'test', 'conformance', 'debt.json');

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
  }
  return out;
}

module.exports = { readLedger, ledgerIndex, ledgerProblems, DEBT_FILE };
