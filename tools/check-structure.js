#!/usr/bin/env node
/**
 * The structure gate, as build:check's preflight runs it: no part loop, no upward import past
 * SANCTIONED_UPWARD, and the plugin boundary intact (tools/structure.js `--check`, which this
 * calls; engineering/decisions/2026-10-11-codebase-structure.md). Read-only. Exit 1 on a problem.
 *
 *   node tools/check-structure.js
 */

const { analyze, cruise, structureProblems } = require('./structure.js');

const problems = structureProblems(analyze(cruise()));
if (problems.length) {
  console.error(`structure check FAILED — ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.error('\nSee engineering/decisions/2026-10-11-codebase-structure.md; `npm run structure` prints the full report.');
  process.exit(1);
}
console.log('structure: no part loops, no upward imports, plugin boundary holds');
