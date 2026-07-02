/**
 * Unit: the deck front-matter `backdrop:` reader (lib/core/resolve-backdrop.js).
 *
 * `backdrop:` is Lattice's first NESTED front-matter key — a one-level map of
 * controls on the backdrop layer (strength / clearance / spotlight). The reader
 * resolves the indented sub-keys directly (no YAML dependency) and must stop
 * cleanly at a dedent, leave `finish:` untouched, and clamp `strength` to 0–1.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  readFrontMatterBackdrop,
  backdropStrength,
  backdropStyleDecls,
  backdropClearance,
  backdropClasses,
} = require('../../../lib/core/resolve-backdrop');

const fm = (body) => `---\n${body}\n---\n\n# Slide\n`;

describe('resolve-backdrop', () => {
  test('reads the indented axes under `backdrop:` and stops at the dedent', () => {
    const md = fm('finish: atrium\nbackdrop:\n  strength: 0.6\n  clearance: on\npaginate: true');
    assert.deepEqual(readFrontMatterBackdrop(md), { strength: '0.6', clearance: 'on' });
  });

  test('absent `backdrop:` → empty object; no crash on no front matter', () => {
    assert.deepEqual(readFrontMatterBackdrop(fm('finish: atrium')), {});
    assert.deepEqual(readFrontMatterBackdrop('# just a heading\n'), {});
    assert.deepEqual(readFrontMatterBackdrop(''), {});
  });

  test('blank lines inside the block are tolerated; a sibling key ends it', () => {
    const md = fm('backdrop:\n  strength: 0.4\n\n  spotlight: 84 30 40\ntheme: indaco');
    assert.deepEqual(readFrontMatterBackdrop(md), { strength: '0.4', spotlight: '84 30 40' });
  });

  test('does not swallow a following flat key at the same indent', () => {
    // `finish:` must remain untouched by the backdrop reader.
    const md = fm('backdrop:\n  strength: 0.5\nfinish: halo');
    assert.deepEqual(readFrontMatterBackdrop(md), { strength: '0.5' });
  });

  test('strength clamps to 0–1 and rejects non-numeric', () => {
    assert.equal(backdropStrength({ strength: '0.35' }), 0.35);
    assert.equal(backdropStrength({ strength: '1.8' }), 1); // clamp high
    assert.equal(backdropStrength({ strength: '-0.5' }), 0); // clamp low
    assert.equal(backdropStrength({ strength: 'loud' }), null);
    assert.equal(backdropStrength({}), null);
    assert.equal(backdropStrength(null), null);
  });

  test('style decls emit only a non-default strength', () => {
    assert.equal(backdropStyleDecls(fm('backdrop:\n  strength: 0.35')), '--backdrop-strength:0.35');
    assert.equal(backdropStyleDecls(fm('backdrop:\n  strength: 1')), ''); // 1 is the default → nothing
    assert.equal(backdropStyleDecls(fm('finish: atrium')), ''); // no backdrop → nothing
  });

  test('clearance parses on/off and emits a `backdrop-clear` class (opt-in)', () => {
    assert.equal(backdropClearance({ clearance: 'on' }), true);
    assert.equal(backdropClearance({ clearance: 'true' }), true);
    assert.equal(backdropClearance({ clearance: 'yes' }), true);
    assert.equal(backdropClearance({ clearance: 'off' }), false);
    assert.equal(backdropClearance({ clearance: '' }), false);
    assert.equal(backdropClearance({}), false); // default off
    // The class-based axis maps to `backdrop-clear`; strength stays inline (not a class).
    assert.deepEqual(backdropClasses(fm('backdrop:\n  clearance: on')), ['backdrop-clear']);
    assert.deepEqual(backdropClasses(fm('backdrop:\n  clearance: off')), []);
    assert.deepEqual(backdropClasses(fm('backdrop:\n  strength: 0.5')), []); // strength is not a class
    assert.deepEqual(backdropClasses(fm('finish: atrium')), []); // no backdrop map
    // clearance does NOT bleed into the inline strength decls
    assert.equal(backdropStyleDecls(fm('backdrop:\n  clearance: on')), '');
  });

  test('quoted values are unwrapped', () => {
    assert.deepEqual(readFrontMatterBackdrop(fm('backdrop:\n  spotlight: "84 30 40"')), { spotlight: '84 30 40' });
  });

  test('strips a trailing inline comment from a bare value; keeps it inside quotes', () => {
    assert.deepEqual(readFrontMatterBackdrop(fm('backdrop:\n  strength: 0.6 # the dial\n  clearance: on   # opt in')),
      { strength: '0.6', clearance: 'on' });
    // a `#` inside quotes is data, not a comment
    assert.deepEqual(readFrontMatterBackdrop(fm('backdrop:\n  spotlight: "8 #3 40"')), { spotlight: '8 #3 40' });
  });
});
