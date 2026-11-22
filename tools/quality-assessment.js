#!/usr/bin/env node
/**
 * Quality assessment — the single entry point for the seven codebase-health dimensions from CLAUDE.md's "complexity is the mother of all killers of productivity" list.
 *
 * Structural coupling, architectural boundaries, circular dependencies, git
 * change coupling, complexity, duplication, dead exports/files. Orchestrates
 * dependency-cruiser, jscpd, knip, and the two bespoke scripts
 * (change-coupling.js, complexity-report.js), then writes:
 *
 *   - the FULL per-tool raw output       → .scratch/quality-report/*.json
 *     (gitignored — regenerate any time with `npm run quality`)
 *   - a numeric SUMMARY                  → printed to stdout (or --json)
 *   - the committed RATCHET baseline     → test/quality/baseline.json
 *     (via --bless; compared via --check)
 *
 * This mirrors the bench/scorecard pattern (HARD RULE #19, `tools/theme-
 * scorecard.js`): an on-demand diagnostic with an optional drift check, NOT
 * a blocking CI gate — these seven signals are advisory (false-positive-
 * prone, evolve continuously) rather than collision/invariant checks like
 * `check-ownership.js`. See engineering/quality-assessment.md.
 *
 * Change-coupling is reported but deliberately EXCLUDED from the baseline/
 * --check comparison: its signal strength depends on how much git history is
 * available (a shallow clone truncates it), which has nothing to do with
 * whether the code got better or worse.
 *
 * Usage:
 *   node tools/quality-assessment.js            # print summary, write raw reports
 *   node tools/quality-assessment.js --json      # machine-readable summary
 *   node tools/quality-assessment.js --bless     # write test/quality/baseline.json
 *   node tools/quality-assessment.js --check     # compare vs committed baseline
 *   node tools/quality-assessment.js --check --only dead-code
 *                                                # knip alone (~7 s): the pre-push ratchet (owner's D1,
 *                                                # 2026-11-20); --bless --only dead-code rewrites just its rows
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const changeCoupling = require('./change-coupling.js');
const complexityReport = require('./complexity-report.js');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, '.scratch', 'quality-report');
const BASELINE_FILE = path.join(ROOT, 'test', 'quality', 'baseline.json');

// Thresholds for what counts as "above the noise floor" in the summary —
// independent of each sub-tool's own default (which stays more permissive
// for the human-readable `npm run quality` listing).
const COMPLEXITY_THRESHOLD = 15;
const CHANGE_COUPLING_MIN_CO_CHANGES = 3;
const TOLERANCE_PCT = 0; // these metrics are deterministic given the same source tree — no timing jitter to tolerate

function bin(name) {
  return path.join(ROOT, 'node_modules', '.bin', name);
}

function runBin(name, args) {
  const result = spawnSync(bin(name), args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 128 });
  if (result.error) throw result.error;
  return result;
}

function runDependencyCruiser() {
  const result = runBin('depcruise', [
    '--config', '.dependency-cruiser.cjs',
    '--output-type', 'json',
    'lib', 'tools', 'lattice.js',
  ]);
  // depcruise exits 1 when any error-severity rule fired — expected, not a tool failure.
  const data = JSON.parse(result.stdout);
  const violations = data.summary.violations || [];
  const circular = violations.filter((v) => v.rule.name === 'no-circular');
  const boundary = violations.filter((v) => v.rule.name !== 'no-circular');
  return {
    raw: data,
    modulesAnalyzed: data.modules.length,
    circularDependencies: circular.map((v) => ({ from: v.from, to: v.to })),
    boundaryViolations: boundary.map((v) => ({ rule: v.rule.name, severity: v.rule.severity, from: v.from, to: v.to })),
  };
}

function runDuplication() {
  fs.mkdirSync(path.join(REPORT_DIR, 'jscpd'), { recursive: true });
  runBin('jscpd', ['--config', '.jscpd.json']);
  const reportFile = path.join(REPORT_DIR, 'jscpd', 'jscpd-report.json');
  const data = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  return {
    raw: data,
    clones: data.statistics.total.clones,
    duplicatedLines: data.statistics.total.duplicatedLines,
    duplicatedPercent: Number(data.statistics.total.percentage.toFixed(2)),
    sourcesScanned: data.statistics.total.sources,
  };
}

/**
 * knip's JSON from one run, or a thrown error. knip exits 0 (clean) or 1 (found issues) and prints
 * JSON either way; any other exit, a signal, or output that is not knip's report means knip did not
 * run, and the dead-code ratchet must then FAIL, not read the silence as zero issues.
 */
function parseKnipResult(result) {
  const why = String(result.stderr || '').trim().split('\n').slice(-3).join(' | ');
  if (result.signal || (result.status !== 0 && result.status !== 1)) {
    throw new Error(`knip did not run (exit ${result.status ?? result.signal}): ${why || 'no output'}`);
  }
  let data;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    throw new Error(`knip printed no JSON report (exit ${result.status}): ${why || String(result.stdout).slice(0, 200) || 'no output'}`);
  }
  if (!data || !Array.isArray(data.issues)) throw new Error('knip printed JSON without an `issues` list');
  return data;
}

// The knip report fields these rows count; any other array-valued field (duplicates, enumMembers,
// nsExports, a category a later knip adds…) lands in `other`, so no finding is silently dropped.
const KNIP_COUNTED = new Set(['files', 'exports', 'types', 'namespaceMembers', 'dependencies', 'devDependencies', 'unlisted', 'binaries', 'unresolved']);

/** Count knip's report into the ratchet's totals; refuses a run that found something no field counts. */
function tallyKnip(data, status) {
  const totals = { files: 0, exports: 0, types: 0, unusedDependencies: 0, unlistedDependencies: 0, binaries: 0, unresolved: 0, other: 0 };
  for (const issue of data.issues) {
    totals.files += issue.files?.length || 0;
    totals.exports += (issue.exports?.length || 0) + (issue.types?.length || 0) + (issue.namespaceMembers?.length || 0);
    totals.unusedDependencies += (issue.dependencies?.length || 0) + (issue.devDependencies?.length || 0);
    totals.unlistedDependencies += issue.unlisted?.length || 0;
    totals.binaries += issue.binaries?.length || 0;
    totals.unresolved += issue.unresolved?.length || 0;
    for (const [key, value] of Object.entries(issue)) {
      if (Array.isArray(value) && !KNIP_COUNTED.has(key)) totals.other += value.length;
    }
  }
  const counted = totals.files + totals.exports + totals.unusedDependencies + totals.unlistedDependencies + totals.binaries + totals.unresolved + totals.other;
  if (status === 1 && counted === 0) {
    throw new Error('knip exited 1 (it found something) but no field this tool counts is non-empty; read `npx knip` and teach runDeadCode the new field');
  }
  return totals;
}

/**
 * Read the engine's publish folder as what it is: the manifest of the code at the repository root.
 *
 * `packages/lattice/package.json` declares the engine's dependencies, but the code that imports them
 * (lattice.js, lib/) stays at the root, which knip reads as a different workspace
 * (engineering/decisions/2026-10-07-first-npm-release.md §8, option A). Unfolded, knip calls each
 * root import of an engine dependency "unlisted" and each engine dependency "unused" (400 and 28 on
 * 2026-11-22). Folded: an import the engine declares is listed, and an engine dependency is used
 * when the root imports it (knip's unlisted list), when it is a workspace package (knip resolves
 * those internally and never lists them), or when the root also declares it (puppeteer, for the
 * `$puppeteer` override), where knip already judges the root's copy. An import NOBODY declares
 * stays unlisted, and an engine dependency nothing loads stays unused: the two findings the ratchet
 * exists for.
 */
function foldEngineManifest(data, root = ROOT) {
  const file = 'packages/lattice/package.json';
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  let engine;
  try { engine = read(file); } catch { return data; }
  const rootPkg = read('package.json');
  const declared = new Set([...Object.keys(engine.dependencies || {}), ...Object.keys(engine.optionalDependencies || {})]);
  const importedAtRoot = new Set();
  for (const issue of data.issues) {
    if (!issue.unlisted) continue;
    for (const u of issue.unlisted) if (declared.has(u.name)) importedAtRoot.add(u.name);
    issue.unlisted = issue.unlisted.filter((u) => !declared.has(u.name));
  }
  const rootDeclares = new Set([...Object.keys(rootPkg.dependencies || {}), ...Object.keys(rootPkg.devDependencies || {})]);
  const isWorkspace = (name) => {
    try { return fs.lstatSync(path.join(root, 'node_modules', name)).isSymbolicLink(); } catch { return false; }
  };
  for (const issue of data.issues) {
    if (issue.file !== file || !issue.dependencies) continue;
    issue.dependencies = issue.dependencies.filter((d) => !importedAtRoot.has(d.name) && !isWorkspace(d.name) && !rootDeclares.has(d.name));
  }
  return data;
}

function runDeadCode() {
  // Run knip's own entry through Node, not the extensionless node_modules/.bin shim, which Windows
  // cannot spawn without a shell (engineering/development.md).
  const knipEntry = path.join(ROOT, 'node_modules', 'knip', 'bin', 'knip.js');
  const raw = spawnSync(process.execPath, [knipEntry, '--reporter', 'json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 128 });
  if (raw.error) throw raw.error;
  const reported = parseKnipResult(raw);
  // The exit-1-but-nothing-counted guard reads knip's own report; the fold can empty it legitimately.
  tallyKnip(reported, raw.status);
  const data = foldEngineManifest(structuredClone(reported));
  const totals = tallyKnip(data, 0);
  return { raw: data, totals, issueCount: data.issues.length };
}

function runComplexity() {
  const report = complexityReport.run({ minComplexity: COMPLEXITY_THRESHOLD, top: 9999 });
  return {
    raw: report,
    filesScanned: report.filesScanned,
    functionsAboveThreshold: report.worstFunctions.length,
    worstFunction: report.worstFunctions[0] || null,
  };
}

function runChangeCoupling() {
  const report = changeCoupling.run({ minCoChanges: CHANGE_COUPLING_MIN_CO_CHANGES, top: 9999 });
  return {
    raw: report,
    commitsAnalyzed: report.commitsAnalyzed,
    shallowClone: report.shallowClone,
    pairsAboveThreshold: report.pairsAboveThreshold,
  };
}

function assess() {
  return {
    coupling: runDependencyCruiser(),
    duplication: runDuplication(),
    deadCode: runDeadCode(),
    complexity: runComplexity(),
    changeCoupling: runChangeCoupling(),
  };
}

/** The knip rows: what the pre-push ratchet holds (lower is better, each one). */
function deadCodeMetrics(deadCode) {
  return {
    deadFiles: deadCode.totals.files,
    deadExports: deadCode.totals.exports,
    unusedDependencies: deadCode.totals.unusedDependencies,
    unlistedDependencies: deadCode.totals.unlistedDependencies,
    unlistedBinaries: deadCode.totals.binaries,
    unresolvedImports: deadCode.totals.unresolved,
    otherFindings: deadCode.totals.other,
  };
}

function toMetrics(assessment) {
  if (!assessment.coupling) return deadCodeMetrics(assessment.deadCode); // --only dead-code
  return {
    circularDependencies: assessment.coupling.circularDependencies.length,
    boundaryViolations: assessment.coupling.boundaryViolations.length,
    duplicatedPercent: assessment.duplication.duplicatedPercent,
    duplicateClones: assessment.duplication.clones,
    ...deadCodeMetrics(assessment.deadCode),
    complexityFunctionsAboveThreshold: assessment.complexity.functionsAboveThreshold,
    worstFunctionComplexity: assessment.complexity.worstFunction?.complexity || 0,
  };
}

function writeRawReports(assessment) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  for (const [key, value] of Object.entries(assessment)) {
    fs.writeFileSync(path.join(REPORT_DIR, `${key}.json`), JSON.stringify(value.raw, null, 2));
  }
}

function printSummary(assessment) {
  const m = toMetrics(assessment);
  if (!assessment.coupling) {
    console.log('=== DEAD CODE (knip) ===\n');
    for (const [k, v] of Object.entries(m)) console.log(`${k.padEnd(22)} ${v}`);
    return;
  }
  console.log('=== QUALITY ASSESSMENT SUMMARY ===\n');
  console.log(`Structural coupling   modules analyzed: ${assessment.coupling.modulesAnalyzed}`);
  console.log(`Circular dependencies: ${m.circularDependencies}`);
  console.log(`Boundary violations:   ${m.boundaryViolations}`);
  console.log(`Duplication:           ${m.duplicatedPercent}% (${m.duplicateClones} clones, ${assessment.duplication.sourcesScanned} files scanned)`);
  console.log(`Dead files (knip):     ${m.deadFiles}`);
  console.log(`Dead exports (knip):   ${m.deadExports}`);
  console.log(`Unused deps (knip):    ${m.unusedDependencies}`);
  console.log(`Unlisted deps (knip):  ${m.unlistedDependencies}`);
  console.log(`Binaries / unresolved: ${m.unlistedBinaries} / ${m.unresolvedImports}`);
  console.log(`Complexity:            ${m.complexityFunctionsAboveThreshold} functions ≥ ${COMPLEXITY_THRESHOLD} (worst: ${m.worstFunctionComplexity})`);
  console.log(
    `Change coupling:       ${assessment.changeCoupling.pairsAboveThreshold} pairs ≥ ${CHANGE_COUPLING_MIN_CO_CHANGES} co-changes ` +
      `over ${assessment.changeCoupling.commitsAnalyzed} commits` +
      `${assessment.changeCoupling.shallowClone ? '  (SHALLOW CLONE — informational only, not baseline-gated)' : ''}`
  );
  console.log(`\nFull per-tool reports written to ${path.relative(ROOT, REPORT_DIR)}/`);
  console.log('Run with --bless to (re)write the committed baseline, --check to compare against it.');
}

function blessBaseline(assessment) {
  // A partial run (--only) rewrites only its own rows and keeps every other recorded metric.
  const previous = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).metrics : {};
  const metrics = assessment.coupling ? toMetrics(assessment) : { ...previous, ...toMetrics(assessment) };
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  const baseline = {
    version: 1,
    note:
      'Committed quality-assessment ratchet (structural coupling, boundaries, circular deps, ' +
      'complexity, duplication, dead code). Refresh with `npm run quality:bless`; compare with ' +
      '`npm run quality:check`. Change coupling is intentionally excluded — its signal depends on ' +
      'available git history, not code quality. See engineering/quality-assessment.md.',
    tolerancePct: TOLERANCE_PCT,
    metrics,
  };
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`\nBlessed baseline → ${path.relative(ROOT, BASELINE_FILE)}`);
}

function checkBaseline(assessment) {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error(`\nNo baseline — run \`npm run quality:bless\` first.`);
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const current = toMetrics(assessment);
  let regressed = false;

  console.log('\n=== QUALITY CHECK · current vs committed baseline ===');
  // A partial run checks only the rows it measured; every row it measured must have a baseline.
  const keys = assessment.coupling ? Object.keys(baseline.metrics) : Object.keys(current);
  for (const key of keys) {
    const before = baseline.metrics[key];
    const after = current[key];
    if (before === undefined) {
      console.error(`  ${key}: no baseline row — run with --bless (and the same --only) first`);
      regressed = true;
      continue;
    }
    const worse = after > before; // every one of these metrics: lower is better
    if (worse) regressed = true;
    const flag = worse ? 'REGRESSED' : after < before ? 'improved' : 'unchanged';
    console.log(`  ${key.padEnd(34)} ${String(before).padStart(6)} → ${String(after).padStart(6)}  ${flag}`);
  }

  if (regressed) {
    console.error('\nQuality regression detected. Investigate, or re-bless if the change is intentional and justified in the PR.');
    process.exit(1);
  }
  console.log('\nNo regression vs baseline.');
}

function main() {
  const argv = process.argv.slice(2);
  const wantJson = argv.includes('--json');
  const wantBless = argv.includes('--bless');
  const wantCheck = argv.includes('--check');
  const onlyAt = argv.findIndex((a) => a === '--only' || a.startsWith('--only='));
  const only = onlyAt === -1 ? null : argv[onlyAt].includes('=') ? argv[onlyAt].split('=')[1] : argv[onlyAt + 1];
  if (only !== null && only !== 'dead-code') {
    console.error(`--only accepts dead-code (got ${only || 'nothing'})`);
    process.exit(2);
  }

  const assessment = only === 'dead-code' ? { deadCode: runDeadCode() } : assess();
  writeRawReports(assessment);

  if (wantJson) console.log(JSON.stringify(toMetrics(assessment), null, 2));
  else printSummary(assessment);

  if (wantBless) blessBaseline(assessment);
  else if (wantCheck) checkBaseline(assessment);
}

if (require.main === module) main();

module.exports = { assess, toMetrics, deadCodeMetrics, runDeadCode, parseKnipResult, tallyKnip, foldEngineManifest };
