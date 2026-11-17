/**
 * A browser profile is removed with Node's EBUSY backoff, wherever the code sandbox removes one.
 *
 * Why: on Windows, Chromium's helper processes can hold `Default/Cache/Cache_Data/sqldb0` in the profile for a moment
 * after the browser has exited, and a plain `fs.rmSync` throws EBUSY. platform-suites run 44011046237
 * (os-sandbox-measure, windows-2025) failed the npm-admission test that way, from code-door.js's `reap`, while the
 * three Windows runs before it passed. `removeProfile` passes `maxRetries`, which makes Node retry EBUSY, EPERM and
 * ENOTEMPTY with a linear backoff. EBUSY cannot be produced on Linux, so this file pins the two things that decide
 * the outcome there: the options reach `fs.rmSync`, and no profile removal bypasses the helper. The real-surface
 * evidence is the Windows platform suite, named in the PR.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const { removeProfile } = require('../../../lib/core/os-sandbox.js');

test('removeProfile hands fs.rmSync a retry budget for a file Windows still holds', (t) => {
  const seen = [];
  t.mock.method(fs, 'rmSync', (dir, opts) => seen.push([dir, opts]));
  removeProfile('/tmp/lattice-code-sandbox-x');
  assert.equal(seen.length, 1);
  const [dir, opts] = seen[0];
  assert.equal(dir, '/tmp/lattice-code-sandbox-x');
  assert.equal(opts.recursive, true);
  assert.equal(opts.force, true);
  assert.ok(opts.maxRetries >= 5, `maxRetries is ${opts.maxRetries}`);
  assert.ok(opts.retryDelay >= 50, `retryDelay is ${opts.retryDelay}`);
});

test('removeProfile removes a real profile-shaped folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-code-sandbox-'));
  fs.mkdirSync(path.join(dir, 'Default', 'Cache', 'Cache_Data'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Default', 'Cache', 'Cache_Data', 'sqldb0'), 'x');
  removeProfile(dir);
  assert.equal(fs.existsSync(dir), false);
});

test('no code-sandbox profile is removed with a bare fs.rmSync', () => {
  // The sites that remove a `lattice-code-sandbox-` profile: the three in os-sandbox.js (a failed launch as another
  // user, a failed launch here, a normal close) and code-door.js's reap of a killed worker's browser.
  const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const sandbox = src('lib/core/os-sandbox.js');
  const bare = sandbox.split('\n').filter((l) => /fs\.rmSync\(dir\b/.test(l) && !/maxRetries/.test(l));
  assert.deepEqual(bare, [], 'os-sandbox.js removes a profile without removeProfile');
  assert.equal((sandbox.match(/(?<!function )removeProfile\(dir\)/g) ?? []).length, 3, 'os-sandbox.js: the three profile removals');
  const reap = src('lib/cli/code-door.js').match(/function reap\([\s\S]*?\n}\n/)?.[0] ?? '';
  assert.ok(reap, 'code-door.js has no reap()');
  assert.match(reap, /removeProfile\(dir\)/);
  assert.doesNotMatch(reap, /fs\.rmSync\(dir\b/);
});
