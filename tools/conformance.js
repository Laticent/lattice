#!/usr/bin/env node
/**
 * conformance.js — ask the conformance harness about ONE kind or ONE instance.
 *
 * The matrix (dist/engineering/conformance.md, `npm test`) answers "is the repo conforming?". This
 * answers the two questions a person has while working: "what does this thing owe?" (run it BEFORE
 * you start) and "is it really done?" (run it AFTER). Contracts and clauses: lib/conformance/,
 * engineering/decisions/2026-10-15-conformance-harness.md §6.
 *
 * Usage:
 *   node tools/conformance.js                          # one line per kind
 *   node tools/conformance.js <kind>                   # the kind's checklist and every failing cell
 *   node tools/conformance.js <kind> <name>            # that instance's verdict for every clause
 *   node tools/conformance.js <kind> <name> --new      # a thing you are about to make: print what it will owe
 *   node tools/conformance.js <kind> <name> --before   # save a baseline (with --new: "everything is owed")
 *   node tools/conformance.js <kind> <name> --after    # diff against the baseline
 *   --tier=static (default) | render | all             # render runs tools/conformance-render.js --only=<name>
 *
 * Exit codes: 0 holds · 1 something fails (a failing cell, a ledger entry that is stale or over its
 * ceiling, a broken contract or manifest) · 2 bad usage (unknown kind or flag, --after with no
 * baseline) · 3 no such instance (a typo reads as "new" otherwise; pass --new to say it is).
 * Debt is not a failure, but it is never "fixed" either: paying it down is, and a ledger entry the
 * work made stale fails here, as it does in `npm test`. The default tier checks STATIC clauses only,
 * and says so on every instance view. Baselines live in `.scratch/conformance/` (override with
 * LATTICE_CONFORMANCE_BASELINES) and are wiped by `npm run clean:scratch`.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadContracts, runContract, readLedger, ledgerProblems } = require('../lib/conformance');

const ROOT = path.join(__dirname, '..');
const BASELINE_DIR = process.env.LATTICE_CONFORMANCE_BASELINES || path.join(ROOT, '.scratch', 'conformance');
const MARK = { pass: 'pass', fail: 'FAIL', 'n/a': '  - ', debt: 'debt' };
const FLAGS = new Set(['--new', '--before', '--after']);
const TIERS = new Set(['static', 'render', 'all']);

const baselineFile = (kind, inst) => path.join(BASELINE_DIR, `${kind}.${encodeURIComponent(inst)}.json`);

function checklist(c) {
  const out = [`${c.kind} — what it owes`, ''];
  for (const cl of c.clauses) out.push(`  [static] ${cl.id}  (${cl.level})  ${cl.why}`);
  for (const r of c.renderClauses || []) out.push(`  [render] ${r.id}  (${r.status}; over ${r.axes.join(', ')})  ${r.what}`);
  return out;
}

/** Levenshtein-free near match: same letters ignoring case and separators, or a shared prefix/substring. */
function nearest(name, names) {
  const flat = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = flat(name);
  return names.filter((x) => { const f = flat(x); return f === n || (n.length > 2 && (f.includes(n) || n.includes(f))); }).slice(0, 5);
}

/**
 * The change since a baseline. A cell is OWED while it fails or sits in debt; it is CLEAN when it
 * passes. fixed = owed → pass · movedToDebt = fail → debt (not a fix) · stillFailing = fail → fail
 * · newlyFailing = anything not failing → fail, or clean → debt. A clause absent from the baseline
 * counts as owed (the thing did not exist), so a new instance's first --after lists what it owed.
 *
 * @param {Array<{clause, verdict}>} before
 * @param {Array<{clause, verdict}>} cells
 */
function diffCells(before, cells) {
  const was = new Map(before.map((x) => [x.clause, x.verdict]));
  const out = { fixed: [], movedToDebt: [], stillFailing: [], newlyFailing: [] };
  for (const x of cells) {
    if (x.verdict === 'n/a') continue;
    const b = was.get(x.clause);
    if (b === undefined) { if (x.verdict === 'pass') out.fixed.push(x); else if (x.verdict === 'fail') out.stillFailing.push(x); continue; }
    if (b === 'fail' && x.verdict === 'pass') out.fixed.push(x);
    else if (b === 'debt' && x.verdict === 'pass') out.fixed.push(x);
    else if (b === 'fail' && x.verdict === 'debt') out.movedToDebt.push(x);
    else if (b === 'fail' && x.verdict === 'fail') out.stillFailing.push(x);
    else if ((b === 'pass' || b === 'n/a' || b === 'debt') && x.verdict === 'fail') out.newlyFailing.push(x);
    else if ((b === 'pass' || b === 'n/a') && x.verdict === 'debt') out.newlyFailing.push(x);
  }
  return out;
}

function parseArgs(argv) {
  const flags = new Set();
  const pos = [];
  let tier = 'static';
  for (const a of argv) {
    if (a.startsWith('--tier=')) tier = a.slice(7);
    else if (a.startsWith('--')) flags.add(a);
    else pos.push(a);
  }
  const bad = [...flags].filter((f) => !FLAGS.has(f));
  if (bad.length) return { error: `unknown flag ${bad.join(', ')}` };
  if (!TIERS.has(tier)) return { error: `--tier must be static, render or all (got '${tier}')` };
  if (flags.has('--before') && flags.has('--after')) return { error: '--before and --after together would diff a baseline against itself; run them at different times' };
  if ((flags.has('--before') || flags.has('--after') || flags.has('--new')) && pos.length < 2) return { error: '--new, --before and --after need <kind> <name>' };
  if (pos.length > 2) return { error: `too many arguments: ${pos.slice(2).join(' ')}` };
  return { flags, tier, kind: pos[0], inst: pos[1] };
}

/** A contract that throws (an invalid manifest while a draft is half written) is a failure, not a stack trace. */
function safeRun(contract, ledger) {
  try { return { run: runContract(contract, { ledger }) }; } catch (e) { return { error: `${contract.kind}: the contract could not run — ${e.message}` }; }
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.error) { process.stderr.write(`conformance: ${args.error}\n`); return 2; }
  const { flags, tier, kind, inst } = args;
  const contracts = loadContracts();
  const ledger = readLedger();

  if (!kind) {
    let code = 0;
    for (const c of contracts) {
      const { run, error } = safeRun(c, ledger);
      if (error) { process.stdout.write(`${c.kind.padEnd(14)} ERROR  ${error}\n`); code = 1; continue; }
      const n = (v) => run.cells.filter((x) => x.verdict === v).length;
      process.stdout.write(`${c.kind.padEnd(14)} ${String(run.instances.length).padStart(4)} instances  ${n('pass')} pass  ${n('fail')} fail  ${n('debt')} debt  ${run.problems.length} problems\n`);
      if (n('fail') || run.problems.length) code = 1;
    }
    return code;
  }

  const contract = contracts.find((c) => c.kind === kind);
  if (!contract) {
    process.stderr.write(`conformance: no contract for kind '${kind}'. Kinds: ${contracts.map((c) => c.kind).join(', ')}\n`);
    return 2;
  }
  const { run, error } = safeRun(contract, ledger);
  if (error) { process.stderr.write(`${error}\n(a manifest that is half written does this; fix it, then rerun)\n`); return 1; }
  if (run.problems.length) { process.stderr.write(`${run.problems.join('\n')}\n`); return 1; }

  if (!inst) {
    process.stdout.write(`${checklist(contract).join('\n')}\n\n`);
    const bad = run.cells.filter((x) => x.verdict === 'fail');
    for (const x of bad) process.stdout.write(`FAIL ${x.clause} × ${x.instance}: ${x.reason}\n`);
    process.stdout.write(`${run.instances.length} instances, ${bad.length} failing cell(s)\n`);
    return bad.length ? 1 : 0;
  }

  const cells = run.cells.filter((x) => x.instance === inst);
  const file = baselineFile(kind, inst);

  if (!cells.length) {
    if (!flags.has('--new')) {
      const near = nearest(inst, run.instances);
      process.stderr.write(`conformance: no ${kind} named '${inst}'.${near.length ? ` Did you mean: ${near.join(', ')}?` : ''} To check a ${kind} you are about to make, add --new.\n`);
      return 3;
    }
    process.stdout.write(`${kind} '${inst}' does not exist yet. Once it does, it owes:\n\n${checklist(contract).join('\n')}\n`);
    if (flags.has('--before')) {
      fs.mkdirSync(BASELINE_DIR, { recursive: true });
      fs.writeFileSync(file, '[]\n');
      process.stdout.write(`\nbaseline saved (empty: everything is owed): ${path.relative(ROOT, file)}\n`);
    }
    return 0;
  }

  if (flags.has('--before')) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(cells.map(({ clause, verdict, reason }) => ({ clause, verdict, reason })), null, 2)}\n`);
    process.stdout.write(`baseline saved: ${path.relative(ROOT, file)}\n`);
  }
  for (const x of cells) process.stdout.write(`${MARK[x.verdict]}  ${x.clause}${x.reason ? `  — ${x.reason}` : ''}\n`);

  // The ledger rules `npm test` applies: a stale entry or a count over its ceiling fails here too.
  const clauses = new Map(contract.clauses.map((c) => [c.id, c]));
  const ledgerBad = ledgerProblems(ledger, run.cells, clauses).filter((p) => p.includes(`|${inst}:`));
  for (const p of ledgerBad) process.stdout.write(`LEDGER  ${p}\n`);

  let code = cells.some((x) => x.verdict === 'fail') || ledgerBad.length ? 1 : 0;

  if (flags.has('--after')) {
    let before = [];
    if (fs.existsSync(file)) before = JSON.parse(fs.readFileSync(file, 'utf8'));
    else process.stdout.write(`\n(no baseline for '${inst}': treating everything as owed before this run)\n`);
    const d = diffCells(before, cells);
    const names = (xs) => (xs.length ? `: ${xs.map((x) => x.clause).join(', ')}` : '');
    process.stdout.write(`\nsince baseline: ${d.fixed.length} fixed${names(d.fixed)}\n`);
    process.stdout.write(`                ${d.stillFailing.length} still failing${names(d.stillFailing)}\n`);
    process.stdout.write(`                ${d.newlyFailing.length} newly failing${names(d.newlyFailing)}\n`);
    if (d.movedToDebt.length) process.stdout.write(`                ${d.movedToDebt.length} moved into debt (not a fix)${names(d.movedToDebt)}\n`);
    if (d.stillFailing.length || d.newlyFailing.length) code = 1;
  }

  if (tier === 'static') {
    process.stdout.write(`\nstatic tier only: ${(contract.renderClauses || []).length} render clause(s) NOT evaluated — "done" is not proven until \`--tier=render\` is clean.\n`);
  } else if ((contract.renderClauses || []).length) {
    process.stdout.write('\nrender tier (can take minutes):\n');
    const r = spawnSync(process.execPath, [path.join(__dirname, 'conformance-render.js'), `--only=${inst}`], { stdio: 'inherit' });
    if (r.status) code = 1;
  }
  return code;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main, diffCells, parseArgs, nearest };
