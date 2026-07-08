/**
 * Unit: the `stamp:` register resolver (lib/core/resolve-stamp.js).
 *
 * Pure mapping from the deck front-matter `stamp:` value (the state-marker SHAPE —
 * tab / seal / notch / …) to the `stamp-<name>` class token the three render paths
 * append to every section. The sibling of resolve-finish / resolve-mode; orthogonal to
 * WHICH state marker shows (that's the semantic `confidential`/`wip`/… token).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  STAMP_STYLES,
  STAMP_STYLE_NAMES,
  STAMP_STYLE_TOKENS,
  readFrontMatterStamp,
  isKnownStamp,
  stampClass,
  stampClassFromSource,
} = require('../../../lib/core/resolve-stamp');

describe('resolve-stamp', () => {
  test('stampClass maps each known name to its class token', () => {
    assert.equal(stampClass('tab'), 'stamp-tab');
    assert.equal(stampClass('seal'), 'stamp-seal');
    assert.equal(stampClass('ribbon'), 'stamp-ribbon');
  });

  test('omitted / unrecognized resolve to no class', () => {
    assert.equal(stampClass(''), '');
    assert.equal(stampClass('   '), '');
    assert.equal(stampClass('taab'), '', 'typo → no class (deck-lint flags it)');
    assert.equal(stampClass(undefined), '');
    assert.equal(stampClass(null), '');
  });

  test('value is case- and whitespace-insensitive', () => {
    assert.equal(stampClass('  Seal  '), 'stamp-seal');
    assert.equal(stampClass('NOTCH'), 'stamp-notch');
  });

  test('isKnownStamp recognizes the register names only', () => {
    assert.ok(isKnownStamp('tab'));
    assert.ok(isKnownStamp('pin'));
    assert.ok(!isKnownStamp('taab'));
    assert.ok(!isKnownStamp(''));
    assert.ok(!isKnownStamp(undefined));
  });

  test('STAMP_STYLE_NAMES is the boardroom subset followed by the wider range', () => {
    // Pinned to a hand-written literal (NOT re-derived from STAMP_STYLES), so an
    // accidental edit/reorder in either group must also touch this list to stay
    // green — a derived-vs-source compare would move in lockstep and prove nothing.
    assert.deepEqual([...STAMP_STYLE_NAMES], [
      'tab', 'notch', 'bracket', 'seal', 'pill', // boardroom: the curated five, in order
      'ribbon', 'flag', 'underline', 'dot', 'mark', 'veil', 'bar', 'pin', // range: the rest
    ]);
    // …and the boardroom subset itself leads with exactly those five.
    assert.deepEqual([...STAMP_STYLES.boardroom], ['tab', 'notch', 'bracket', 'seal', 'pill']);
  });

  test('STAMP_STYLE_TOKENS is each name stamp-prefixed', () => {
    // Literal pin (not `STAMP_STYLE_NAMES.map(...)`, which recreates the impl's
    // own derivation): the `stamp-` prefix AND membership are both asserted here.
    assert.deepEqual([...STAMP_STYLE_TOKENS], [
      'stamp-tab', 'stamp-notch', 'stamp-bracket', 'stamp-seal', 'stamp-pill',
      'stamp-ribbon', 'stamp-flag', 'stamp-underline', 'stamp-dot', 'stamp-mark',
      'stamp-veil', 'stamp-bar', 'stamp-pin',
    ]);
  });

  test('readFrontMatterStamp extracts the value from the front-matter block only', () => {
    const md = '---\nmarp: true\ntheme: carta\nstamp: seal\n---\n\n# H\n\n`stamp: not-this` in body\n';
    assert.equal(readFrontMatterStamp(md), 'seal');
    assert.equal(stampClassFromSource(md), 'stamp-seal');
  });

  test('readFrontMatterStamp accepts quotes and returns null when absent', () => {
    assert.equal(readFrontMatterStamp('---\nstamp: "notch"\n---\n'), 'notch');
    assert.equal(readFrontMatterStamp("---\nstamp: 'pill'\n---\n"), 'pill');
    assert.equal(readFrontMatterStamp('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterStamp(''), null);
  });

  // Rot-guard: every style token the register knows must have a real CSS rule in
  // base.variants.css — keeps the vocabulary in lock-step with the stylesheet the same
  // way resolve-finish guards base.finish.css and resolve-mode guards base.sketch.css.
  test('every stamp style token resolves to a real CSS rule in base.variants.css', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.variants.css'), 'utf8');
    for (const cls of STAMP_STYLE_TOKENS) {
      assert.ok(new RegExp(`\\.${cls}\\b`).test(css), `${cls} is registered but base.variants.css has no rule`);
    }
  });

  // Coexistence guard (2026-07-03 §9): state stamps render via `::before`, so the divider
  // left spectrum rail must NOT use `::before` (it would erase the stamp on a
  // `divider confidential` slide). The rail rides the section BACKGROUND instead.
  test('the divider spectrum rail does not use ::before (keeps it free for state stamps)', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/components/anchor/divider/divider.styles.css'), 'utf8');
    assert.ok(!/section\.divider::before/.test(css), 'divider must not paint its rail with ::before — it collides with the state-stamp ::before');
    assert.match(css, /section\.divider\s*\{[^}]*background:[^}]*var\(--spectrum/, 'the divider rail should ride the section background gradient');
  });

  // Non-flipping dark bookends (title/closing/dark divider) keep color-scheme:light, so
  // the marker ::before must flip its OWN color-scheme to dark or the light-dark()
  // --stamp-color reads faint on the dark field (pinned/revised bug). Guard the rebind.
  test('the marker ::before flips color-scheme:dark on the non-flipping dark bookends', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.variants.css'), 'utf8');
    const rule = css.match(/section:is\(\.title, \.closing\)::before,\s*section\.divider:not\(\.light\)::before\s*\{[^}]*\}/);
    assert.ok(rule, 'expected a color-scheme rebind on the title/closing/divider marker ::before');
    assert.match(rule[0], /color-scheme:\s*dark/, 'the bookend marker ::before should flip color-scheme to dark');
  });
});
