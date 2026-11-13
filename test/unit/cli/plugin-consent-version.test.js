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
const { CONSENT_ACCEPTED, CONSENT_VERSION, pluginConsentText } = require('../../../lib/core/code-shape.mjs');
const { grantTrust, isTrusted, pluginDigest, pluginDigests, readTrust, trustOf } = require('../../../lib/packages/trust.js');
const { untrustedCodePackages } = require('../../../lib/cli/code-door.js');

const CODE = 'function render(f){return "<b>x</b>"}';
// [code, fence, kinds, returns, the digest main produced before versions existed]. The first three were captured at
// b6e1dd3 (2026-10-16) and still matched at 756c1fff (2026-11-09), after `returns` joined the text only when present;
// the fourth, with a `returns` segment, was captured at 756c1fff.
const V1 = [
  [CODE, 'gantt', [], [], '56133c3a8009026c538f7e88d18d8cbcead8d1fa779dc27c20c911adc0dcf1ce'],
  [CODE, 'gantt', [{ name: 'tag-chip', slot: { positional: [{ name: 'label', type: 'text' }] } }, { name: 'flag' }], [], 'cb24fffcf4c3291f6c380b07d53c32a4a186d1443afead8cbe60684ab3d46115'],
  ['export default ()=>""', '', [{ name: 'flag' }], [], '5a8897f4445c0b3ae99174cbf220e8f98f14e21ede4fa06eeeaddd94db40769c'],
  [CODE, 'gantt', [], [{ name: 'rows', type: 'number' }], 'a039fe34369286675b784534574bd39d4ca81da0ab1aab941de3592fa2102d90'],
];

test('version 1 is the current text, and it is accepted', () => {
  assert.equal(CONSENT_VERSION, 1);
  assert.ok(CONSENT_ACCEPTED.includes(CONSENT_VERSION));
});

test('version 1 digests are byte-identical to the ones approvals were made with before versions existed', () => {
  for (const [code, fence, kinds, returns, want] of V1) {
    assert.equal(pluginDigest(code, fence, kinds, returns), want, `${fence}/${kinds.length}/${returns.length}`);
    assert.equal(pluginDigest(code, fence, kinds, returns, 1), want);
    assert.equal(pluginDigests(code, fence, kinds, returns)[0], want, 'the current version leads');
  }
  // No version prefix on version 1: the text opens as it always did.
  assert.equal(pluginConsentText('x', 'gantt'), 'lattice-plugin-fence:5:gantt\u0000x');
});

test('a version the doors do not know is refused, never silently hashed as another', () => {
  assert.throws(() => pluginConsentText('x', 'gantt', [], [], 2), /no plugin consent text version 2/);
});

test('an approval held under an earlier version still counts, in both CLI checks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'consent-v-'));
  const file = path.join(dir, 'trust.json');
  const [code, fence, kinds, returns, v1] = V1[0];
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
  assert.deepEqual(pluginDigests(code, fence, kinds, returns), [v1]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an earlier version\'s digest kept as a PIN (another project\'s, trust.js `keep`) is found through the accepted list too', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'consent-pin-'));
  const file = path.join(dir, 'trust.json');
  const v1 = V1[0][4];
  grantTrust('plugin', 'gantt-plugin', v1, { file, layer: 'on' });
  grantTrust('plugin', 'gantt-plugin', 'd'.repeat(64), { file, keep: true });
  const hit = trustOf(readTrust(file), 'plugin', 'gantt-plugin', ['f'.repeat(64), v1]);
  assert.equal(hit?.sha256, v1, 'the pin matches');
  assert.equal(hit?.layer, 'on', 'with the layer it was approved at');
  assert.equal(trustOf(readTrust(file), 'plugin', 'gantt-plugin', []), undefined, 'an empty list approves nothing');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('every PLUGIN trust read takes the accepted list, never one digest (a census of the tree)', () => {
  // A plugin approval read with `codeDigest` alone refuses an approval held under an earlier consent version, and a layer
  // lookup that does it silently drops that approval's sandbox floor (the checker on #2725: lattice.js `withInstalledPlugins`).
  // A COMPONENT read is single-digest by design: components are not versioned.
  const root = path.join(__dirname, '..', '..', '..');
  const files = [path.join(root, 'lattice.js')];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== 'vendor') walk(p);
      } else if (/\.(?:c?js|mjs)$/.test(e.name) && !/\.generated\./.test(e.name)) files.push(p);
    }
  };
  walk(path.join(root, 'lib'));
  const offenders = [];
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/\b(?:trustOf|isTrusted)\(([^;]*?codeDigest\()/g)) {
        if (!/'component'/.test(m[1])) offenders.push(`${path.relative(root, f)}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, [], 'a plugin approval read passes acceptedDigests(pkg), not codeDigest(pkg)');
});
