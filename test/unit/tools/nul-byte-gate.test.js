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
  NUL_BINARY_EXTENSIONS,
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
    // git calls such a file text TODAY — `text=auto` runs `memchr(buf, 0,
    // min(size, 8000))`, so it never sees this one — and it diffs fine until an
    // edit brings the NUL inside the window. That edit is a DELETION above the
    // NUL (a hoisted constant, a dropped block), not an insertion: prepending
    // pushes the offset UP, away from the window. Measured on
    // tools/check-family-tiers.js at NUL offset 47123 — prepending 2,200 bytes
    // kept it a text diff, deleting 40,000 above the NUL turned it binary.
    // Three of the five files #1780 cleaned up sat in that latent state, which is
    // why the gate reads the whole file rather than the first 8000 bytes.
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
  // The allowlist is EMPTY as of #1780, and an emptied allowlist quietly turns
  // its own audit vacuous: the previous version of this test looped over
  // SANCTIONED_NUL_FILES asserting each entry still carried a NUL, so with
  // nothing to loop over it passed without executing a single assertion.
  //
  // What replaces it asserts the property the allowlist existed to bound —
  // no tracked file carries a raw NUL — against the REAL tree rather than
  // against the list. It cannot go vacuous, and it fails the moment anyone
  // reintroduces one, which is the outcome the allowlist was only ever a
  // placeholder for.
  //
  // Scope, stated precisely because the name cannot be: `findNulBytes` filters
  // on NUL_TEXT_EXTENSIONS, so six tracked EXTENSIONLESS files are not read —
  // LICENSE, LICENSE-EXCEPTIONS, docs/public/CNAME, docs/public/flags/LICENSE,
  // .cell-stage, .vscode/lattice.code-snippets. All six are clean today; the
  // sibling partition test below documents extensionless files as out of scope
  // by design. This is "no tracked file WITH A SCANNED EXTENSION", and saying so
  // is cheaper than someone later discovering the gap the hard way.
  test('no tracked text file carries a raw NUL, and the allowlist is empty', () => {
    const { execFileSync } = require('node:child_process');
    const root = path.join(__dirname, '..', '..', '..');
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0')
      .filter(Boolean);
    assert.ok(tracked.length > 1000, 'a broken query, not an empty repo');

    const hits = findNulBytes(tracked, (f) => fs.readFileSync(path.join(root, f)));
    assert.deepEqual(
      hits,
      [],
      'a tracked text file carries a raw NUL again — write it as the escape, which is byte-identical at runtime',
    );
    assert.deepEqual(
      SANCTIONED_NUL_FILES,
      [],
      'the allowlist is empty and should stay that way — a separator never needs the raw byte',
    );
  });
  test('every tracked extension is classified as text OR binary — nothing unclassified', () => {
    // The first draft of this test asserted a HAND-WRITTEN subset was present in
    // the array it was testing. That is self-referential: it cannot fail for a
    // MISSING extension, which is the only failure mode that matters, and it
    // duly passed while `.astro` — 40 tracked docs-site source files — sat
    // outside the gate entirely.
    //
    // Partitioning the real tree is the version that bites: a new file type
    // fails here until someone decides which half it belongs in.
    const { execFileSync } = require('node:child_process');
    const root = path.join(__dirname, '..', '..', '..');
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0')
      .filter(Boolean);
    assert.ok(tracked.length > 1000, 'a broken query, not an empty repo');

    const unclassified = new Set();
    for (const f of tracked) {
      const base = path.basename(f);
      const m = /(\.[A-Za-z0-9]+)$/.exec(base);
      if (!m) continue; // an extensionless file (LICENSE, Dockerfile) — out of scope by design
      const ext = m[1].toLowerCase();
      if (!NUL_TEXT_EXTENSIONS.includes(ext) && !NUL_BINARY_EXTENSIONS.includes(ext)) unclassified.add(ext);
    }
    assert.deepEqual(
      [...unclassified].sort(),
      [],
      'add each to NUL_TEXT_EXTENSIONS (scanned) or NUL_BINARY_EXTENSIONS (skipped)',
    );
  });

  test('.astro is scanned — it is docs-site SOURCE, and it was the one that got missed', () => {
    assert.ok(NUL_TEXT_EXTENSIONS.includes('.astro'));
  });
});
