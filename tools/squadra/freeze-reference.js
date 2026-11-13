#!/usr/bin/env node
/**
 * Freeze lint-core for the reference diff: copy lib/authoring/lint-core.js to tools/squadra/reference/lint-core.js
 * with its requires pointed back at the live lib/ modules (decision 2026-11-13-squadra-replaces-lint-core §6, §10).
 *
 * WHEN. Every time this branch takes main's lint-core (a rebase, or a merge of main): the reference must be the
 * lint-core the branch carries, or a family is held to behavior main has since changed, and deleting lint-core at
 * step 6 quietly undoes those changes. test/unit/authoring/squadra-lattice-deck.test.js fails until it is re-run.
 *
 * Usage: node tools/squadra/freeze-reference.js [--check]   (--check exits 1 when the frozen copy is stale)
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'lib', 'authoring', 'lint-core.js');
const OUT = path.join(__dirname, 'reference', 'lint-core.js');

/** The frozen text for a lint-core source, stamped with the commit it was frozen from. */
function freeze(src, commit) {
  const head = `// FROZEN REFERENCE — lib/authoring/lint-core.js as this branch carries it (frozen from commit ${commit}), for the
// lint-core rewrite (engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §6). Test-only:
// tools/squadra-reference-diff.js runs it beside the new \`deck\` ruleset and compares what each reports. Its requires
// point at the live lib/ modules; only lint-core itself is frozen, because it is the file the rewrite deletes. Never
// edit it to make a diff pass: re-freeze with tools/squadra/freeze-reference.js when the branch takes main's
// lint-core. It is deleted when the rewrite merges.
`;
  const body = src
    .replace(/require\((['"])(\.{1,2}\/[^'"]+)\1\)/g, (m, q, p) => (p.startsWith('./') ? `require(${q}../../../lib/authoring/${p.slice(2)}${q})` : `require(${q}../../../lib/${p.slice(3)}${q})`))
    .replace("const FIX_DRIVER_PATH = ['.', 'squadra', 'bridge.js'].join('/');", "const FIX_DRIVER_PATH = ['..', '..', '..', 'lib', 'authoring', 'squadra', 'bridge.js'].join('/');")
    .replace("await import('./squadra/bridge.js')", "await import('../../../lib/authoring/squadra/bridge.js')");
  return head + body;
}

/** The frozen copy without its header line(s), and the live source frozen the same way, so the two compare. */
function stripHeader(text) {
  return text.slice(text.indexOf('\n', text.lastIndexOf('// It is deleted when the rewrite merges.')) + 1);
}
function isCurrent() {
  const live = stripHeader(freeze(fs.readFileSync(SRC, 'utf8'), 'x'));
  return fs.existsSync(OUT) && stripHeader(fs.readFileSync(OUT, 'utf8')) === live;
}

if (require.main === module) {
  if (process.argv.includes('--check')) {
    const ok = isCurrent();
    console.log(ok ? '[freeze-reference] the frozen lint-core matches lib/authoring/lint-core.js' : '[freeze-reference] STALE — run `node tools/squadra/freeze-reference.js`');
    process.exitCode = ok ? 0 : 1;
  } else {
    let commit = 'unknown';
    try {
      commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {}
    fs.writeFileSync(OUT, freeze(fs.readFileSync(SRC, 'utf8'), commit));
    console.log(`[freeze-reference] wrote ${path.relative(ROOT, OUT)} from ${commit}`);
  }
}

module.exports = { freeze, isCurrent };
