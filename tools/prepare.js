#!/usr/bin/env node
/**
 * npm's `prepare` step, on every OS: wire the git hooks, then build the uncommitted dist/ artifacts.
 *
 * Hooks: `lefthook install`, where it can. Build: `tools/build.js --only-uncommitted`, the
 * generated artifacts the repository does not commit.
 *
 * This used to be the one-liner `lefthook install || true; node tools/build.js --only-uncommitted`.
 * npm runs scripts through cmd.exe on Windows, where `;` separates nothing and `true` is not a
 * command, so the build silently never ran and every Windows checkout started without dist/
 * (#2459). Node runs the same two steps on every platform.
 *
 * The contract is the one-liner's: a hook install that fails (no .git in a tarball install, no
 * lefthook without devDependencies) is not an install failure; a build that fails is, and its
 * exit code is this script's.
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

let lefthook = null;
try {
  lefthook = require.resolve('lefthook/bin/index.js', { paths: [ROOT] });
} catch {
  /* devDependencies not installed: no hooks to wire */
}
if (lefthook) spawnSync(process.execPath, [lefthook, 'install'], { cwd: ROOT, stdio: 'inherit' });

const build = spawnSync(process.execPath, [path.join(__dirname, 'build.js'), '--only-uncommitted'], { cwd: ROOT, stdio: 'inherit' });
if (build.error) console.error(`prepare: the build did not start: ${build.error.message}`);
process.exit(build.status ?? 1);
