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
    'lib', 'tools', 'lattice-emulator.js',
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

function runDeadCode() {
  const result = runBin('knip', ['--reporter', 'json']);
  // knip exits 1 when it finds any issue — expected, not a tool failure.
  const data = JSON.parse(result.stdout || '{"issues":[]}');
  const totals = { files: 0, exports: 0, types: 0, unusedDependencies: 0, unlistedDependencies: 0 };
  for (const issue of data.issues) {
    totals.files += issue.files?.length || 0;
    totals.exports += (issue.exports?.length || 0) + (issue.types?.length || 0) + (issue.namespaceMembers?.length || 0);
    totals.unusedDependencies += (issue.dependencies?.length || 0) + (issue.devDependencies?.length || 0);
    totals.unlistedDependencies += issue.unlisted?.length || 0;
  }
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

function toMetrics(assessment) {
  return {
    circularDependencies: assessment.coupling.circularDependencies.length,
    boundaryViolations: assessment.coupling.boundaryViolations.length,
    duplicatedPercent: assessment.duplication.duplicatedPercent,
    duplicateClones: assessment.duplication.clones,
    deadFiles: assessment.deadCode.totals.files,
    deadExports: assessment.deadCode.totals.exports,
    unlistedDependencies: assessment.deadCode.totals.unlistedDependencies,
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
  console.log('=== QUALITY ASSESSMENT SUMMARY ===\n');
  console.log(`Structural coupling   modules analyzed: ${assessment.coupling.modulesAnalyzed}`);
  console.log(`Circular dependencies: ${m.circularDependencies}`);
  console.log(`Boundary violations:   ${m.boundaryViolations}`);
  console.log(`Duplication:           ${m.duplicatedPercent}% (${m.duplicateClones} clones, ${assessment.duplication.sourcesScanned} files scanned)`);
  console.log(`Dead files (knip):     ${m.deadFiles}`);
  console.log(`Dead exports (knip):   ${m.deadExports}`);
  console.log(`Unlisted deps (knip):  ${m.unlistedDependencies}`);
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
  const metrics = toMetrics(assessment);
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
  for (const key of Object.keys(baseline.metrics)) {
    const before = baseline.metrics[key];
    const after = current[key];
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

  const assessment = assess();
  writeRawReports(assessment);

  if (wantJson) console.log(JSON.stringify(toMetrics(assessment), null, 2));
  else printSummary(assessment);

  if (wantBless) blessBaseline(assessment);
  else if (wantCheck) checkBaseline(assessment);
}

if (require.main === module) main();

module.exports = { assess, toMetrics };
