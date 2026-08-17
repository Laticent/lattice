/**
 * Unit: the `corners:` register resolver (lib/core/resolve-corners.js).
 *
 * Whether the slide's own surface is square or rounded. `square` is the baseline and
 * carries NO token, so a deck that says nothing renders exactly as it did before the
 * register existed; only `rounded` stamps `corners-rounded`. Per-slide `_class:
 * corners-square` opts one slide back out. Sibling of resolve-lift / resolve-spectrum.
 *
 * The CSS half is pinned here too, because the register is worth nothing if the class it
 * stamps resolves to no shape — and because the two mechanisms it depends on are both
 * easy to write in a way that LOOKS right and silently isn't (see the last two cases).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CORNERS_NAMES,
  CORNERS_TOKENS,
  readFrontMatterCorners,
  isKnownCorners,
  cornersClass,
  cornersClassFromSource,
  isCornersToken,
} = require('../../../lib/core/resolve-corners');

const read = (rel) => fs.readFileSync(path.join(__dirname, '../../../', rel), 'utf8');

describe('resolve-corners', () => {
  test('rounded maps to `corners-rounded`; square maps to no token (the baseline)', () => {
    assert.equal(cornersClass('rounded'), 'corners-rounded');
    assert.equal(cornersClass('square'), '', 'square is the baseline — no class');
  });

  test('omitted / unrecognized resolve to no class (square)', () => {
    assert.equal(cornersClass(''), '');
    assert.equal(cornersClass('   '), '');
    assert.equal(cornersClass('round'), '', 'typo → square; `unknown-corners` in lint-core is what tells the author');
    assert.equal(cornersClass(undefined), '');
    assert.equal(cornersClass(null), '');
  });

  test('value is case- and whitespace-insensitive', () => {
    assert.equal(cornersClass('  ROUNDED  '), 'corners-rounded');
    assert.equal(cornersClass('Rounded'), 'corners-rounded');
  });

  test('isKnownCorners recognizes square / rounded only', () => {
    assert.ok(isKnownCorners('square'));
    assert.ok(isKnownCorners('rounded'));
    assert.ok(!isKnownCorners('corners-rounded'), 'that is the TOKEN, not the value');
    assert.ok(!isKnownCorners(''));
    assert.ok(!isKnownCorners(undefined));
  });

  test('isCornersToken matches both override tokens and nothing else', () => {
    assert.ok(isCornersToken('corners-rounded'));
    assert.ok(isCornersToken('corners-square'), 'the explicit opt-OUT a slide needs');
    assert.ok(!isCornersToken('corners'));
    assert.ok(!isCornersToken('rounded'));
    assert.ok(!isCornersToken(undefined));
  });

  test('CORNERS_NAMES / CORNERS_TOKENS list the recognized + override sets', () => {
    assert.deepEqual([...CORNERS_NAMES], ['square', 'rounded']);
    // Both override tokens are listed, including `corners-square` — which carries a token
    // even though square is the DEFAULT, because a slide inside a `corners: rounded` deck
    // cannot express "back to square" by absence once the deck has stamped one.
    assert.deepEqual([...CORNERS_TOKENS], ['corners-rounded', 'corners-square']);
  });

  test('readFrontMatterCorners extracts the value from the front-matter block only', () => {
    const md = '---\nmarp: true\ncorners: rounded\n---\n\n# H\n\n`corners: not-this` in body\n';
    assert.equal(readFrontMatterCorners(md), 'rounded');
    assert.equal(cornersClassFromSource(md), 'corners-rounded');
  });

  test('readFrontMatterCorners accepts quotes, comments, and returns null when absent', () => {
    assert.equal(readFrontMatterCorners('---\ncorners: "rounded"\n---\n'), 'rounded');
    assert.equal(readFrontMatterCorners("---\ncorners: 'square'\n---\n"), 'square');
    // The shared scalar rule strips a trailing YAML comment. A `$`-anchored private regex
    // would fail the whole match here and silently resolve to square — the drift that
    // resolve-finish.js's header records.
    assert.equal(readFrontMatterCorners('---\ncorners: rounded  # for the web deck\n---\n'), 'rounded');
    assert.equal(readFrontMatterCorners('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterCorners(''), null);
  });

  test('both render paths stamp and evict the token — one class list, two kernels', () => {
    // HARD RULE #1. The markdown-it plugin and the browser runtime each build their own
    // deck-token list; a register wired into one and not the other renders two different
    // decks from one source, which is the whole subject of the deck-class-register work.
    for (const rel of ['lib/integrations/markdown-it/plugins.js', 'lib/runtime/index.js']) {
      const src = read(rel);
      assert.match(src, /cornersClass\(/, `${rel} must resolve the register through the kernel`);
      assert.match(src, /\.\.\.cornersTokens/, `${rel} must append the token to the deck list`);
      assert.match(src, /isCornersToken\(t\)/, `${rel} must evict the deck token when a slide names its own`);
    }
  });

  test('base.modifiers.css: the token resolves to a real shape, and clips with clip-path', () => {
    const css = read('lib/base/base.modifiers.css');
    const rounded = css.match(/section\.corners-rounded\s*\{[^}]*\}/);
    assert.ok(rounded, 'section.corners-rounded activation rule missing');
    // The length is declared HERE, on a section selector, and anchored — a section cannot
    // query its own container, so a bare `cqi` would resolve against the host viewport and
    // scale the corner with the browser window. `checkContainerUnits` also catches this.
    assert.match(
      rounded[0],
      /--slide-radius:\s*calc\([^)]*var\(--_sec-1cqi/,
      'rounded must give the corner an anchored length',
    );
    // `clip-path`, NOT `border-radius` alone. The slide's brand bar is a `border-image`,
    // and a border-image does not honor border-radius — the bar keeps square corners and
    // pokes past the rounded surface, a worse artifact than the one being fixed. Measured
    // in Chromium; see the rule's own header.
    assert.match(rounded[0], /clip-path:\s*inset\(0 round var\(--slide-radius\)\)/, 'the clip is what actually rounds the slide');
    const square = css.match(/section\.corners-square\s*\{[^}]*\}/);
    assert.ok(square, 'section.corners-square reset rule missing');
    assert.match(square[0], /clip-path:\s*none/, 'the opt-out must clear the clip, not just the radius');
  });

  test('base.tokens.css: square is the default, and there is exactly ONE corner token', () => {
    const css = read('lib/base/base.tokens.css');
    assert.match(css, /--slide-radius:\s*0/, 'the live value defaults to 0 — square, the pre-register baseline');
    // No second, theme-facing seam. An earlier cut shipped `--slide-radius-rounded` on the
    // engine-owns-names/theme-owns-values charter, but that charter is about COLOR: no theme
    // set it, and a theme that wants its own corner can redeclare `--slide-radius` under
    // `section.corners-rounded` without a token existing to be discovered. Owner-directed.
    // A DECLARATION, not a mention: the name survives in the note above `--slide-radius`
    // recording why the seam was dropped, and that note is the point of keeping it.
    assert.equal(
      (css.match(/--slide-radius-rounded\s*:/g) || []).length, 0,
      'the theme seam was deliberately collapsed — one token, resolved in base.modifiers.css',
    );
  });
});
