#!/usr/bin/env node
/**
 * conformance.js — ask the conformance harness about ONE kind or ONE instance.
 *
 * The matrix (dist/engineering/conformance.md, `npm test`) answers "is the repo conforming?". This
 * answers the two questions a person has while working: "what does this thing owe?" (run it BEFORE
 * you start) and "is it really done?" (run it AFTER). Contracts and clauses:
 * lib/conformance/, engineering/decisions/2026-10-15-conformance-harness.md §6.
 *
 * Usage:
 *   node tools/conformance.js                       # one line per kind: instances, pass/fail/debt
 *   node tools/conformance.js <kind>                # the kind's checklist, and every failing cell
 *   node tools/conformance.js <kind> <instance>     # that instance's cell for every clause
 *   node tools/conformance.js <kind> <instance> --before   # save the verdicts as a baseline
 *   node tools/conformance.js <kind> <instance> --after    # diff against the baseline: fixed / still failing / new
 *
 * An instance that does not exist yet prints the kind's checklist: that is what it will owe.
 * Exit 1 when any cell shown is failing (debt does not fail). Baselines live in `.scratch/`.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadContracts, runContract, readLedger } = require('../lib/conformance');

const ROOT = path.join(__dirname, '..');
const BASELINE_DIR = path.join(ROOT, '.scratch', 'conformance');
const MARK = { pass: 'pass', fail: 'FAIL', 'n/a': '  - ', debt: 'debt' };

const baselineFile = (kind, inst) => path.join(BASELINE_DIR, `${kind}.${inst.replace(/[^\w.-]/g, '_')}.json`);

function checklist(c) {
  const out = [`${c.kind} — what it owes`, ''];
  for (const cl of c.clauses) out.push(`  [static] ${cl.id}  (${cl.level})  ${cl.why}`);
  for (const r of c.renderClauses || []) out.push(`  [render] ${r.id}  (${r.status}; over ${r.axes.join(', ')})  ${r.what}`);
  return out;
}

function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const [kind, inst] = argv.filter((a) => !a.startsWith('--'));
  const contracts = loadContracts();
  const ledger = readLedger();

  if (!kind) {
    for (const c of contracts) {
      const run = runContract(c, { ledger });
      const n = (v) => run.cells.filter((x) => x.verdict === v).length;
      process.stdout.write(`${c.kind.padEnd(14)} ${String(run.instances.length).padStart(4)} instances  ${n('pass')} pass  ${n('fail')} fail  ${n('debt')} debt  ${run.problems.length} problems\n`);
    }
    return 0;
  }

  const contract = contracts.find((c) => c.kind === kind);
  if (!contract) {
    process.stderr.write(`conformance: no contract for kind '${kind}'. Kinds: ${contracts.map((c) => c.kind).join(', ')}\n`);
    return 2;
  }
  const run = runContract(contract, { ledger });
  if (run.problems.length) {
    process.stderr.write(`${run.problems.join('\n')}\n`);
    return 1;
  }

  if (!inst) {
    process.stdout.write(`${checklist(contract).join('\n')}\n\n`);
    const bad = run.cells.filter((x) => x.verdict === 'fail');
    for (const x of bad) process.stdout.write(`FAIL ${x.clause} × ${x.instance}: ${x.reason}\n`);
    process.stdout.write(`${run.instances.length} instances, ${bad.length} failing cell(s)\n`);
    return bad.length ? 1 : 0;
  }

  const cells = run.cells.filter((x) => x.instance === inst);
  if (!cells.length) {
    process.stdout.write(`${kind} '${inst}' does not exist yet. Once it does, it owes:\n\n${checklist(contract).join('\n')}\n`);
    if (flags.has('--before')) process.stdout.write('\n(no baseline saved: there is nothing to measure yet; run --after when it exists)\n');
    return 0;
  }

  const file = baselineFile(kind, inst);
  if (flags.has('--before')) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(cells.map(({ clause, verdict, reason }) => ({ clause, verdict, reason })), null, 2)}\n`);
    process.stdout.write(`baseline saved: ${path.relative(ROOT, file)}\n`);
  }
  for (const x of cells) process.stdout.write(`${MARK[x.verdict]}  ${x.clause}${x.reason ? `  — ${x.reason}` : ''}\n`);
  for (const r of contract.renderClauses || []) process.stdout.write(`rndr  ${r.id}  — run: node tools/conformance-render.js (${r.status})\n`);

  if (flags.has('--after')) {
    if (!fs.existsSync(file)) {
      process.stderr.write(`conformance: no baseline for ${kind} '${inst}'; run --before first\n`);
      return 2;
    }
    const before = new Map(JSON.parse(fs.readFileSync(file, 'utf8')).map((x) => [x.clause, x.verdict]));
    const bad = (v) => v === 'fail';
    const fixed = cells.filter((x) => bad(before.get(x.clause)) && !bad(x.verdict));
    const still = cells.filter((x) => bad(before.get(x.clause)) && bad(x.verdict));
    const fresh = cells.filter((x) => !bad(before.get(x.clause)) && bad(x.verdict));
    process.stdout.write(`\nsince baseline: ${fixed.length} fixed, ${still.length} still failing, ${fresh.length} newly failing\n`);
    return still.length || fresh.length ? 1 : 0;
  }
  return cells.some((x) => x.verdict === 'fail') ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };
