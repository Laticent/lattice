#!/usr/bin/env node
/**
 * bless-split-oracle — write the STANDING ORACLE record (§8 rule 5).
 *
 * Recomputes every component's split facts from its manifest and writes them to
 * test/oracle/split-oracle.json. The gate (`checkSplitOracle` in tools/check-ownership.js,
 * via `build:check`) then fails on ANY drift from this record, so a manifest edit or a
 * resolver refactor that silently changes a component's split behaviour cannot ship
 * unnoticed — the same shape as `bench:bless` / `bench:check` for the perf baseline.
 *
 * Rule 11: "The oracle records a VERIFIED default, it never mints one." Blessing is
 * therefore a DELIBERATE act — run it only when you intend the change, and say in the PR
 * why each moved entry is correct. A diff in this file is a behaviour change to review,
 * not noise to regenerate away.
 *
 *   node tools/bless-split-oracle.js          # rewrite the record
 *   node tools/bless-split-oracle.js --check  # exit 1 on drift (what the gate uses)
 */

const fs = require('fs');
const path = require('path');
const { loadAll } = require('../lib/components');
const { splitFactsFor } = require('../lib/core/split-facts');

const ROOT = path.join(__dirname, '..');
const ORACLE = path.join(ROOT, 'test', 'oracle', 'split-oracle.json');

function build() {
  const manifests = loadAll(path.join(ROOT, 'lib', 'components'));
  const components = {};
  for (const m of manifests.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    components[m.name] = splitFactsFor(m);
  }
  return {
    $comment: 'BLESSED RECORD — §8 rule 5 of engineering/decisions/2026-07-22-structure-derived-split-patterns.md. '
      + 'Recomputed from the component manifests by tools/bless-split-oracle.js and gated by checkSplitOracle in '
      + 'tools/check-ownership.js (build:check). A diff here is a SPLIT-BEHAVIOUR CHANGE to review, not noise: '
      + 'run `npm run oracle:bless` only when you intend it, and justify each moved entry in the PR (rule 11 — '
      + 'the record documents a verified default, it never mints one).',
    components,
  };
}

function read() {
  try { return JSON.parse(fs.readFileSync(ORACLE, 'utf8')); } catch { return null; }
}

function main(argv) {
  const fresh = build();
  if (argv.includes('--check')) {
    const old = read();
    if (!old) { process.stderr.write(`split oracle missing: ${ORACLE}\n  run: npm run oracle:bless\n`); return 1; }
    const same = JSON.stringify(old.components) === JSON.stringify(fresh.components);
    if (!same) { process.stderr.write('split oracle DRIFTED — run `npm run oracle:bless` if intended.\n'); return 1; }
    process.stdout.write(`split oracle OK — ${Object.keys(fresh.components).length} components.\n`);
    return 0;
  }
  fs.mkdirSync(path.dirname(ORACLE), { recursive: true });
  fs.writeFileSync(ORACLE, `${JSON.stringify(fresh, null, 2)}\n`);
  process.stdout.write(`blessed ${Object.keys(fresh.components).length} components → ${path.relative(ROOT, ORACLE)}\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { build, ORACLE };
