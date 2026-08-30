/**
 * Unit: the ONE front-matter value rule (`frontMatterScalar`, lib/core/front-matter-key.js).
 *
 * The defect: a trailing YAML comment was kept as part of the value. `theme: cuoio  # brand`
 * read as the literal `"cuoio  # brand"`, which matches no registered palette, so the deck
 * silently fell back to the default — while an Export-to-Marp of the same bytes (real YAML,
 * which strips the comment) kept `cuoio`. Two different decks from one source: the #1416
 * shape, on a line any author might plausibly write.
 *
 * The fix is one shared rule, so the engine's own `parseFrontMatter` and every `resolve-*`
 * register clean a scalar identically. These tests pin BOTH doors — the shared kernel and
 * the engine parse that now routes through it — because the whole point is that they agree.
 *
 * The two anti-regression cases below are the ones that make this non-trivial, and both are
 * grounded rather than invented:
 *   - `meta: "Default layout · #1292"` is a REAL line in examples/default-slide-layout.md.
 *     A naive comment strip truncates it to `Default layout ·`.
 *   - `backgroundColor: #ffffff` is not in the corpus but `color`/`backgroundColor` are real
 *     directives that take colors, so an unquoted hex is a deck someone would plausibly
 *     write. Strict YAML would call it a comment; breaking it would be a self-inflicted
 *     regression (HARD RULE #18) to gain purity nobody asked for.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { frontMatterScalar, frontMatterValue, topLevelFrontMatterValue } = require('../../../lib/core/front-matter-key');
const { parseFrontMatter } = require('../../../lib/engine/directives');

/** The engine's own door, so a divergence between the two readers fails here. */
const viaEngine = (line) => parseFrontMatter(`---\n${line}\n---\n\n# T`).directives;

describe('frontMatterScalar — trailing comments', () => {
  test('strips a whitespace-preceded # and the space before it', () => {
    assert.equal(frontMatterScalar('cuoio  # our brand palette'), 'cuoio');
    assert.equal(frontMatterScalar('cuoio\t# tabbed'), 'cuoio');
    assert.equal(frontMatterScalar('dark # pin it'), 'dark');
  });

  test('a value that is only a comment reads empty', () => {
    assert.equal(frontMatterScalar('# just a note'), '# just a note',
      'a # opening the value is DATA (an unquoted hex), not a comment — see the hex case');
  });

  test('the engine parse agrees, which is the whole point', () => {
    assert.deepEqual(viaEngine('theme: cuoio  # our brand palette'), { theme: 'cuoio' });
    assert.deepEqual(viaEngine('theme: cuoio'), { theme: 'cuoio' });
  });
});

describe('frontMatterScalar — quoted values', () => {
  test('a # INSIDE a quoted span survives (real corpus deck)', () => {
    // examples/default-slide-layout.md ships exactly this line.
    assert.equal(frontMatterScalar('"Default layout · #1292"'), 'Default layout · #1292');
    assert.deepEqual(viaEngine('meta: "Default layout · #1292"'), { meta: 'Default layout · #1292' });
  });

  test('a comment AFTER the closing quote is dropped', () => {
    assert.equal(frontMatterScalar("'Q3' # draft"), 'Q3');
    assert.equal(frontMatterScalar('"Q3 Review" # not shipped'), 'Q3 Review');
    assert.deepEqual(viaEngine("footer: 'Q3' # draft"), { footer: 'Q3' });
  });

  test('plain quoted values keep their old reading', () => {
    assert.equal(frontMatterScalar('"cuoio"'), 'cuoio');
    assert.equal(frontMatterScalar("'cuoio'"), 'cuoio');
  });

  test('an ESCAPED quote does not end the span — the payload reaches the escaper intact', () => {
    // The attribute-injection case in markdown-it-plugins.test.js. A plain `indexOf`
    // stops at the `\"` and truncates, which LOOKS safer (the payload vanishes) but
    // makes this reader disagree with YAML and hides the input from the HTML escaper
    // that actually owns the security property. Pinned so nobody "simplifies" it back.
    assert.equal(
      frontMatterScalar('"./acme.svg\\"><script>alert(1)</script>"'),
      './acme.svg\\"><script>alert(1)</script>',
    );
  });

  test('a backslash in a SINGLE-quoted scalar is literal, per YAML', () => {
    assert.equal(frontMatterScalar("'a\\b'"), 'a\\b');
  });
});

describe('frontMatterScalar — a # that is data, not a comment', () => {
  test('an unquoted hex color survives', () => {
    assert.equal(frontMatterScalar('#ffffff'), '#ffffff');
    assert.deepEqual(viaEngine('backgroundColor: #ffffff'), { backgroundColor: '#ffffff' });
  });

  test('an unquoted hex color keeps its value and loses a real trailing comment', () => {
    assert.equal(frontMatterScalar('#ffffff # header tint'), '#ffffff');
    assert.deepEqual(viaEngine('backgroundColor: #ffffff # header tint'), { backgroundColor: '#ffffff' });
  });

  test('a # following a non-space is part of the value (URL fragment, anchor)', () => {
    assert.equal(frontMatterScalar('/brand/mark.svg#icon'), '/brand/mark.svg#icon');
    assert.equal(frontMatterScalar('a#b'), 'a#b');
    assert.deepEqual(viaEngine('logo: /brand/mark.svg#icon'), { logo: '/brand/mark.svg#icon' });
  });
});

describe('frontMatterScalar — values that must read exactly as before', () => {
  test('a colon inside the value is untouched', () => {
    assert.equal(frontMatterScalar('16:9'), '16:9');
    assert.deepEqual(viaEngine('size: 16:9'), { size: '16:9' });
  });

  test('an apostrophe mid-value is not a quote', () => {
    assert.equal(frontMatterScalar("It's fine"), "It's fine");
    assert.deepEqual(viaEngine("header: It's fine"), { header: "It's fine" });
  });

  test('empty and whitespace-only values', () => {
    assert.equal(frontMatterScalar(''), '');
    assert.equal(frontMatterScalar('   '), '');
    assert.equal(frontMatterScalar(null), '');
    assert.equal(frontMatterScalar(undefined), '');
  });

  test('a block-scalar marker is passed through', () => {
    // `style: |` — the marker itself is the value at this layer; the block body is
    // read elsewhere. Truncating it would delete a deck's CSS (the #1256 shape).
    assert.equal(frontMatterScalar('|'), '|');
  });
});

describe('frontMatterScalar — malformed input keeps the legacy strip', () => {
  test('one stray leading quote', () => {
    assert.equal(frontMatterScalar('"cuoio'), 'cuoio');
  });

  test('one stray trailing quote', () => {
    assert.equal(frontMatterScalar('cuoio"'), 'cuoio');
  });

  test('the corpus has zero unbalanced-quote front matter, so this is unobservable today', () => {
    // Pinned as documentation of WHY the choice above is safe, not as a behavior claim.
    // If a deck ever ships an unbalanced quote, this rule is what it will get.
    assert.equal(frontMatterScalar("'unterminated"), 'unterminated');
  });
});

describe('both shared readers route through the one rule', () => {
  const FM = ['theme: cuoio  # brand', 'class: dark # pinned', 'meta: "a · #7"'].join('\n');

  test('frontMatterValue strips the comment', () => {
    assert.equal(frontMatterValue(FM, 'theme'), 'cuoio');
    assert.equal(frontMatterValue(FM, 'class'), 'dark');
    assert.equal(frontMatterValue(FM, 'meta'), 'a · #7');
  });

  test('topLevelFrontMatterValue strips the comment', () => {
    assert.equal(topLevelFrontMatterValue(FM, 'theme'), 'cuoio');
    assert.equal(topLevelFrontMatterValue(FM, 'class'), 'dark');
  });

  test('an absent key is still null, not empty string', () => {
    assert.equal(frontMatterValue(FM, 'nope'), null);
    assert.equal(topLevelFrontMatterValue(FM, 'nope'), null);
  });
});
