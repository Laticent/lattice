/**
 * Unit: the NUL-byte gate (tools/check-ownership.js).
 *
 * A NUL byte in the first 8000 bytes of a tracked file makes git classify it as
 * BINARY, so `git diff` prints "Binary files … differ" and review sees NOTHING.
 * Two of the eleven errors in #1252 were exactly that, both pushed, both caught
 * by a human rather than a gate. This is the mechanical half.
 *
 * Both verdicts are exercised through the PURE functions, because the gate
 * itself shells to `git ls-files` — the injection-point lesson written into
 * `checkCommittedPdfs`'s own docblock, whose four tests all stayed green when
 * its condition was inverted.
 *
 * Every NUL below is BUILT (String.fromCharCode) rather than typed, so this file
 * cannot trip the very gate it tests.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  findNulBytes,
  auditNulBytes,
  SANCTIONED_NUL_FILES,
  NUL_TEXT_EXTENSIONS,
} = require(path.join(__dirname, '..', '..', '..', 'tools', 'check-ownership.js'));

const NUL = String.fromCharCode(0);
const reader = (map) => (f) => {
  if (!(f in map)) throw new Error(`ENOENT: ${f}`);
  return Buffer.from(map[f], 'binary');
};

describe('findNulBytes — detection', () => {
  test('flags a text file containing a NUL', () => {
    assert.deepEqual(findNulBytes(['a.js'], reader({ 'a.js': `const k = a${NUL}b;` })), ['a.js']);
  });
  test('a clean text file is not flagged', () => {
    assert.deepEqual(findNulBytes(['a.js'], reader({ 'a.js': 'const k = a|b;' })), []);
  });
  test('a NUL PAST byte 8000 is still found', () => {
    // git calls such a file text TODAY (`text=auto` inspects the first 8000
    // bytes), so it diffs fine — until one prepended paragraph flips it. That
    // latent case is why the allowlist names four files that still diff cleanly.
    assert.deepEqual(findNulBytes(['a.js'], reader({ 'a.js': 'x'.repeat(9000) + NUL })), ['a.js']);
  });
  test('binary payloads are out of scope — a .woff2 full of NULs is not a finding', () => {
    assert.deepEqual(findNulBytes(['f.woff2'], reader({ 'f.woff2': `wOF2${NUL}${NUL}` })), []);
  });
  test('an unreadable path is skipped, not crashed on', () => {
    assert.doesNotThrow(() => findNulBytes(['gone.js'], reader({})));
    assert.deepEqual(findNulBytes(['gone.js'], reader({})), []);
  });
  test('extension matching is case-insensitive', () => {
    assert.deepEqual(findNulBytes(['A.JS'], reader({ 'A.JS': `x${NUL}` })), ['A.JS']);
  });
});

describe('auditNulBytes — the allowlist is checked BOTH ways', () => {
  test('an unlisted hit is reported', () => {
    assert.deepEqual(auditNulBytes(['new.js', 'old.js'], ['old.js']).unlisted, ['new.js']);
  });
  test('a listed hit is NOT reported', () => {
    assert.deepEqual(auditNulBytes(['old.js'], ['old.js']).unlisted, []);
  });
  test('a sanction whose file was FIXED is reported stale', () => {
    // Without this the allowlist outlives the defect and silently re-opens the
    // hole it was written to document.
    assert.deepEqual(auditNulBytes([], ['old.js']).stale, ['old.js']);
  });
  test('a live sanction is not stale', () => {
    assert.deepEqual(auditNulBytes(['old.js'], ['old.js']).stale, []);
  });
});

describe('the shipped allowlist', () => {
  test('names only files that really do carry a NUL right now', () => {
    const root = path.join(__dirname, '..', '..', '..');
    for (const f of SANCTIONED_NUL_FILES) {
      assert.ok(fs.readFileSync(path.join(root, f)).includes(0), `${f} is sanctioned but clean — drop the entry`);
    }
  });
  test('covers the source extensions this repo actually writes', () => {
    for (const ext of ['.js', '.mjs', '.ts', '.tsx', '.css', '.md', '.json', '.yml']) {
      assert.ok(NUL_TEXT_EXTENSIONS.includes(ext), `${ext} must be in scope`);
    }
  });
});
