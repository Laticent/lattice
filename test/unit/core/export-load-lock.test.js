/**
 * The CLI plain export's load lock (lib/core/export-load-lock.js; npm-plugin threat model §5.4).
 * Its own module so the Studio and Playground bundles do not carry the constants (#2785's first CI run:
 * +69 bytes of eager JS on three routes when they lived in subresource-csp.mjs).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { LOCK_LOADS, lockedCspPolicy, lockedCspMeta } = require('../../../lib/core/export-load-lock.js');

test('the locked policy is the shared subresource policy plus the four load directives, in order', async () => {
  const { subresourceCspPolicy } = await import('../../../lib/core/subresource-csp.mjs');
  const shared = subresourceCspPolicy();
  assert.equal(lockedCspPolicy(), `${shared}; ${LOCK_LOADS.join('; ')}`);
  assert.deepEqual(LOCK_LOADS.map((d) => d.split(' ')[0]), ['default-src', 'script-src', 'style-src', 'frame-src']);
  assert.ok(Object.isFrozen(LOCK_LOADS));
});

test('each directive keeps script, style and frames on the file itself, never on a remote origin', () => {
  const policy = lockedCspPolicy();
  for (const d of ['default-src', 'script-src', 'style-src']) {
    const text = policy.split('; ').find((x) => x.startsWith(d));
    assert.doesNotMatch(text, /https?:|\*/, `${d} names a remote origin or a wildcard: ${text}`);
  }
  assert.match(policy, /frame-src 'none'/);
});

test('a web-image origin reaches img-src and media-src only, never a load directive', () => {
  const policy = lockedCspPolicy({ webOrigins: ['https://x.example'] });
  assert.match(policy.split('; ').find((x) => x.startsWith('img-src')), /x\.example/);
  for (const d of ['default-src', 'script-src', 'style-src', 'frame-src']) assert.doesNotMatch(policy.split('; ').find((x) => x.startsWith(d)), /x\.example/);
});

test('the meta tag carries the whole policy', () => {
  assert.equal(lockedCspMeta(), `<meta http-equiv="Content-Security-Policy" content="${lockedCspPolicy()}">`);
});

test('the shared module does not carry the lock: it would ship in the Studio bundle', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lib', 'core', 'subresource-csp.mjs'), 'utf8');
  assert.doesNotMatch(src, /LOCK_LOADS|lockLoads|frame-src/);
});
