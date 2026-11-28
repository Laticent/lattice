/**
 * Unit: the `stamp-shape:` register resolver (lib/core/resolve-stamp-shape.js).
 *
 * Pure mapping from the deck front-matter `stamp-shape:` value (the state-marker SHAPE —
 * tab / seal / notch / …) to the `stamp-shape-<name>` class token the three render paths
 * append to every section. The sibling of resolve-finish / resolve-mode; orthogonal to
 * WHICH state marker shows (that's the semantic `confidential`/`wip`/… token).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  STAMP_SHAPES,
  STAMP_SHAPE_NAMES,
  STAMP_SHAPE_TOKENS,
  readFrontMatterStampShape,
  isKnownStampShape,
  stampShapeClass,
  stampShapeClassFromSource,
} = require('../../../lib/core/resolve-stamp-shape');

describe('resolve-stamp-shape', () => {
  test('stampShapeClass maps each known name to its class token', () => {
    assert.equal(stampShapeClass('tab'), 'stamp-shape-tab');
    assert.equal(stampShapeClass('seal'), 'stamp-shape-seal');
    assert.equal(stampShapeClass('ribbon'), 'stamp-shape-ribbon');
  });

  test('omitted / unrecognized resolve to no class', () => {
    assert.equal(stampShapeClass(''), '');
    assert.equal(stampShapeClass('   '), '');
    assert.equal(stampShapeClass('taab'), '', 'typo → no class (deck-lint flags it)');
    assert.equal(stampShapeClass(undefined), '');
    assert.equal(stampShapeClass(null), '');
  });

  test('value is case- and whitespace-insensitive', () => {
    assert.equal(stampShapeClass('  Seal  '), 'stamp-shape-seal');
    assert.equal(stampShapeClass('NOTCH'), 'stamp-shape-notch');
  });

  test('isKnownStampShape recognizes the register names only', () => {
    assert.ok(isKnownStampShape('tab'));
    assert.ok(isKnownStampShape('pin'));
    assert.ok(!isKnownStampShape('taab'));
    assert.ok(!isKnownStampShape(''));
    assert.ok(!isKnownStampShape(undefined));
  });

  test('STAMP_SHAPE_NAMES is the boardroom subset followed by the wider range', () => {
    // Pinned to a hand-written literal (NOT re-derived from STAMP_SHAPES), so an
    // accidental edit/reorder in either group must also touch this list to stay
    // green — a derived-vs-source compare would move in lockstep and prove nothing.
    assert.deepEqual([...STAMP_SHAPE_NAMES], [
      'tab', 'notch', 'bracket', 'seal', 'pill', // boardroom: the curated five, in order
      'ribbon', 'flag', 'underline', 'dot', 'mark', 'veil', 'bar', 'pin', // range: the rest
    ]);
    // …and the boardroom subset itself leads with exactly those five.
    assert.deepEqual([...STAMP_SHAPES.boardroom], ['tab', 'notch', 'bracket', 'seal', 'pill']);
  });

  test('STAMP_SHAPE_TOKENS is each name stamp-prefixed', () => {
    // Literal pin (not `STAMP_SHAPE_NAMES.map(...)`, which recreates the impl's
    // own derivation): the `stamp-` prefix AND membership are both asserted here.
    assert.deepEqual([...STAMP_SHAPE_TOKENS], [
      'stamp-shape-tab', 'stamp-shape-notch', 'stamp-shape-bracket', 'stamp-shape-seal', 'stamp-shape-pill',
      'stamp-shape-ribbon', 'stamp-shape-flag', 'stamp-shape-underline', 'stamp-shape-dot', 'stamp-shape-mark',
      'stamp-shape-veil', 'stamp-shape-bar', 'stamp-shape-pin',
    ]);
  });

  test('readFrontMatterStampShape extracts the value from the front-matter block only', () => {
    const md = '---\nmarp: true\ntheme: carta\nstamp-shape: seal\n---\n\n# H\n\n`stamp-shape: not-this` in body\n';
    assert.equal(readFrontMatterStampShape(md), 'seal');
    assert.equal(stampShapeClassFromSource(md), 'stamp-shape-seal');
  });

  test('readFrontMatterStampShape accepts quotes and returns null when absent', () => {
    assert.equal(readFrontMatterStampShape('---\nstamp-shape: "notch"\n---\n'), 'notch');
    assert.equal(readFrontMatterStampShape("---\nstamp-shape: 'pill'\n---\n"), 'pill');
    assert.equal(readFrontMatterStampShape('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterStampShape(''), null);
  });

  // Rot-guard: every style token the register knows must have a real CSS rule in
  // base.variants.css — keeps the vocabulary in lock-step with the stylesheet the same
  // way resolve-finish guards base.finish.css and resolve-mode guards base.sketch.css.
  test('every stamp style token resolves to a real CSS rule in base.variants.css', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.variants.css'), 'utf8');
    for (const cls of STAMP_SHAPE_TOKENS) {
      assert.ok(new RegExp(`\\.${cls}\\b`).test(css), `${cls} is registered but base.variants.css has no rule`);
    }
  });

  // Coexistence guard (2026-07-03 §9): state stamps render via `::before`, so the divider
  // left spectrum rail must NOT use `::before` (it would erase the stamp on a
  // `divider confidential` slide). The rail rides the section BACKGROUND instead.
  test('the divider spectrum rail does not use ::before (keeps it free for state stamps)', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/components/anchor/divider/divider.styles.css'), 'utf8');
    assert.ok(!/section\.divider::before/.test(css), 'divider must not paint its rail with ::before — it collides with the state-stamp ::before');
    // `background-image:`, not the `background:` shorthand this used to match. The rail was
    // hoisted out of the shorthand in #1528 so a theme missing --spectrum loses the RAIL and
    // not the canvas beside it — the guard here is about which LAYER paints the rail
    // (background, not ::before), which the longhand satisfies exactly as the shorthand did.
    assert.match(css, /section\.divider\s*\{[^}]*background-image:\s*var\(--spectrum/, 'the divider rail should ride the section background gradient');
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
