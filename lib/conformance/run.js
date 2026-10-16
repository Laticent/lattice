/**
 * lib/conformance/run.js — the runner: every instance × every clause → a verdict.
 *
 * Verdicts: pass · fail (with the clause's reason) · n/a (a conditional clause that does not
 * apply) · debt (a fail the ledger records). The runner also proves each clause can fail, for the
 * right reason, on its own fixture (engineering/decisions/2026-10-15-conformance-harness.md
 * §6.3 rule 4), and that each clause reached as many instances as it claims (rule 5).
 */
const fs = require('node:fs');
const path = require('node:path');
const { contractProblems } = require('./contract');
const { ledgerIndex } = require('./ledger');

const FIXTURE_DIR = path.join(__dirname, '..', '..', 'test', 'conformance', 'fixtures');

/** One clause on one instance: { verdict, reason }. A throwing check is a FAIL, never a pass. */
function evaluate(clause, instance, ctx) {
  try {
    if (clause.level !== 'always' && !clause.applies(instance, ctx)) return { verdict: 'n/a', reason: null };
    const reason = clause.check(instance, ctx);
    return reason ? { verdict: 'fail', reason: String(reason) } : { verdict: 'pass', reason: null };
  } catch (e) {
    return { verdict: 'fail', reason: `the check threw: ${e.message}` };
  }
}

/**
 * Run a contract over every instance it enumerates.
 *
 * @returns {{ kind, problems: string[], instances: string[], cells: Array<{clause, instance, verdict, reason}>, reach: Record<string, number> }}
 */
function runContract(contract, { ledger = [] } = {}) {
  const problems = contractProblems(contract);
  if (problems.length) return { kind: contract?.kind, problems, instances: [], cells: [], reach: {} };
  const ctx = contract.context ? contract.context() : {};
  const debt = ledgerIndex(ledger);
  const instances = contract.enumerate(ctx);
  const cells = [];
  const reach = Object.fromEntries(contract.clauses.map((c) => [c.id, 0]));
  for (const inst of instances) {
    const id = contract.instanceId(inst);
    for (const clause of contract.clauses) {
      let { verdict, reason } = evaluate(clause, inst, ctx);
      if (verdict !== 'n/a') reach[clause.id]++;
      if (verdict === 'fail' && debt.has(`${clause.id}|${id}`)) verdict = 'debt';
      // A clause that counts something (physical left/right declarations) reports the number, so
      // a ledger entry can carry a CEILING and the debt can only shrink (ledger.js).
      const cell = { clause: clause.id, instance: id, verdict, reason };
      if (clause.measure && verdict !== 'n/a') {
        try { cell.measure = clause.measure(inst, ctx); } catch (e) { cell.verdict = 'fail'; cell.reason = `the measure threw: ${e.message}`; }
      }
      cells.push(cell);
    }
  }
  for (const c of contract.clauses) {
    if (reach[c.id] < c.reach) problems.push(`${c.id}: reached ${reach[c.id]} instance(s), fewer than the ${c.reach} it claims — an enumeration or applies() went blind`);
  }
  return { kind: contract.kind, problems, instances: instances.map((i) => contract.instanceId(i)), cells, reach };
}

/** A fixture instance, built by the contract from test/conformance/fixtures/<kind>/<name>.json. */
function loadFixture(contract, name) {
  const file = path.join(FIXTURE_DIR, contract.kind, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`${contract.kind}: no fixture ${path.relative(process.cwd(), file)}`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  return contract.fromFixture ? contract.fromFixture(json) : json;
}

/**
 * §6.3 rule 4, for every clause: its failing fixture fails with exactly that clause's id (not a
 * crash, not some other clause), and its passing twin passes every clause. Returns problems, or [].
 */
function fixtureProblems(contract) {
  const out = [];
  const ctx = contract.context ? contract.context() : {};
  const failingIds = (inst) => contract.clauses.map((c) => [c.id, evaluate(c, inst, ctx)]).filter(([, r]) => r.verdict === 'fail');
  for (const clause of contract.clauses) {
    let bad;
    let good;
    try {
      bad = loadFixture(contract, clause.fixtures.fails);
      good = loadFixture(contract, clause.fixtures.passes);
    } catch (e) {
      out.push(`${clause.id}: ${e.message}`);
      continue;
    }
    const failed = failingIds(bad);
    const ids = failed.map(([id]) => id);
    if (ids.length !== 1 || ids[0] !== clause.id) {
      out.push(`${clause.id}: fixture '${clause.fixtures.fails}' must fail with this clause alone; it failed [${ids.join(', ') || 'nothing'}]${failed.length ? ` — ${failed.map(([id, r]) => `${id}: ${r.reason}`).join('; ')}` : ''}`);
    } else if (/^the check threw/.test(failed[0][1].reason)) {
      out.push(`${clause.id}: fixture '${clause.fixtures.fails}' fails by crashing, not for the clause's reason: ${failed[0][1].reason}`);
    }
    const twin = failingIds(good);
    if (twin.length) out.push(`${clause.id}: twin '${clause.fixtures.passes}' must pass every clause; it failed ${twin.map(([id, r]) => `${id} (${r.reason})`).join('; ')}`);
  }
  return out;
}

module.exports = { runContract, fixtureProblems, evaluate, loadFixture, FIXTURE_DIR };
