/**
 * `tools/affected-tests.js` maps a staged `test/unit/<scope>/…` file to a `test:<scope>` npm
 * script and runs it. When that script does not exist the pre-commit hook fails outright with
 * `Missing script` — not a test failure with a useful message, a hook that refuses the commit.
 *
 * WHY THIS FILE EXISTS. That gap has now been closed by hand three times: `test:theme` in
 * #1718, then `test:diagnostics` and `test:runtime` in the change that added this file. Each
 * time it was found by a human tripping over it mid-commit, and each time the fix was to add
 * the one missing script — which is a patch, not a root cause. HARD RULE #14 says a hook
 * failure is a root cause to fix. The root cause is that the mapping is hand-maintained and
 * nothing checks it, so the FOURTH new `test/unit/<dir>` fails somebody's commit exactly the
 * same way.
 *
 * This is the check that ends the class: adding a directory without its script now fails a
 * test, with a message that says what to add and where.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const UNIT_DIR = path.join(ROOT, 'test', 'unit');

test('every test/unit/<scope> directory has a matching `test:<scope>` npm script', () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const scopes = fs
    .readdirSync(UNIT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    // A directory with no test file in it cannot be staged into the mapping.
    .filter((e) => fs.readdirSync(path.join(UNIT_DIR, e.name)).some((f) => f.endsWith('.test.js')))
    .map((e) => e.name);

  assert.ok(scopes.length > 15, `expected the unit suite to have many scopes, found ${scopes.length}`);
  const missing = scopes.filter((s) => !scripts[`test:${s}`]);
  assert.deepEqual(
    missing,
    [],
    `these test/unit/ directories have tests but no test:<scope> script, so a commit staging only ` +
      `files in one of them dies in pre-commit with \`Missing script\` (tools/affected-tests.js). ` +
      `Add to package.json:\n` +
      missing.map((s) => `    "test:${s}": "node --test 'test/unit/${s}/*.test.js'",`).join('\n') +
      `\nand a SCRIPT_META entry in tools/build-capabilities.js (the HARD RULE #15 capabilities ` +
      `gate fails build:check on an undescribed script), then run \`npm run capabilities:build\`.`,
  );
});

test('every `test:<scope>` script points at a directory that exists', () => {
  // The other direction: a script left behind after its directory was renamed or removed runs
  // `node --test` over a glob that matches nothing, which EXITS 0 — so the scope silently stops
  // being tested and the pre-commit hook reports success for a scope it never ran.
  const { scripts } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const stale = Object.keys(scripts)
    .map((k) => /^test:([a-z-]+)$/.exec(k))
    .filter(Boolean)
    .map((m) => m[1])
    // Only the ones whose command really is the `test/unit/<scope>` shape.
    .filter((s) => scripts[`test:${s}`] === `node --test 'test/unit/${s}/*.test.js'`)
    .filter((s) => !fs.existsSync(path.join(UNIT_DIR, s)));
  assert.deepEqual(stale, [], `test:<scope> scripts whose test/unit/<scope> directory is gone: ${stale.join(', ')}`);
});
