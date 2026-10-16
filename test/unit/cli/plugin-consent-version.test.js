/**
 * The plugin consent text's versions (lib/packages/code-shape.mjs `CONSENT_VERSION` / `CONSENT_ACCEPTED`,
 * followups.d/2687-p6). Version 1 is the text as it shipped before versions existed: the digests below were captured
 * from `main` at b6e1dd3, before the version was added, so every approval a user already holds still matches. A later
 * version's approvals sit beside version 1's, and the doors accept a match under any accepted version.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CONSENT_ACCEPTED, CONSENT_VERSION, pluginConsentText } = require('../../../lib/packages/code-shape.mjs');
const { grantTrust, isTrusted, pluginDigest, pluginDigests } = require('../../../lib/packages/trust.js');
const { untrustedCodePackages } = require('../../../lib/packages/code-door.js');

const CODE = 'function render(f){return "<b>x</b>"}';
// [code, fence, kinds, the digest `main` produced before versions existed]
const V1 = [
  [CODE, 'gantt', [], '56133c3a8009026c538f7e88d18d8cbcead8d1fa779dc27c20c911adc0dcf1ce'],
  [CODE, 'gantt', [{ name: 'tag-chip', slot: { positional: [{ name: 'label', type: 'text' }] } }, { name: 'flag' }], 'cb24fffcf4c3291f6c380b07d53c32a4a186d1443afead8cbe60684ab3d46115'],
  ['export default ()=>""', '', [{ name: 'flag' }], '5a8897f4445c0b3ae99174cbf220e8f98f14e21ede4fa06eeeaddd94db40769c'],
];

test('version 1 is the current text, and it is accepted', () => {
  assert.equal(CONSENT_VERSION, 1);
  assert.ok(CONSENT_ACCEPTED.includes(CONSENT_VERSION));
});

test('version 1 digests are byte-identical to the ones approvals were made with before versions existed', () => {
  for (const [code, fence, kinds, want] of V1) {
    assert.equal(pluginDigest(code, fence, kinds), want, `${fence}/${kinds.length}`);
    assert.equal(pluginDigest(code, fence, kinds, 1), want);
    assert.equal(pluginDigests(code, fence, kinds)[0], want, 'the current version leads');
  }
  // No version prefix on version 1: the text opens as it always did.
  assert.equal(pluginConsentText('x', 'gantt'), 'lattice-plugin-fence:5:gantt\u0000x');
});

test('a version the doors do not know is refused, never silently hashed as another', () => {
  assert.throws(() => pluginConsentText('x', 'gantt', [], 2), /no plugin consent text version 2/);
});

test('an approval held under an earlier version still counts, in both CLI checks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'consent-v-'));
  const file = path.join(dir, 'trust.json');
  const [code, fence, kinds, v1] = V1[0];
  // As a later version would leave it: the current digest is new, and version 1's is still accepted.
  const current = 'f'.repeat(64);
  const accepts = [current, v1];
  grantTrust('plugin', 'gantt-plugin', v1, { file });
  assert.equal(isTrusted('plugin', 'gantt-plugin', accepts, file), true, 'isTrusted takes every accepted digest');
  assert.equal(isTrusted('plugin', 'gantt-plugin', current, file), false, 'one digest alone is exactly that digest');
  assert.deepEqual(untrustedCodePackages([{ name: 'gantt-plugin', type: 'plugin', sha256: current, accepts }], { file }), []);
  // A digest no accepted version produced is not approval, whatever list it is offered in.
  grantTrust('plugin', 'gantt-plugin', 'e'.repeat(64), { file });
  assert.equal(isTrusted('plugin', 'gantt-plugin', accepts, file), false);
  assert.equal(untrustedCodePackages([{ name: 'gantt-plugin', type: 'plugin', sha256: current, accepts }], { file }).length, 1);
  // Today's list is version 1's digest alone, so this is the same check as before.
  assert.deepEqual(pluginDigests(code, fence, kinds), [v1]);
  fs.rmSync(dir, { recursive: true, force: true });
});
