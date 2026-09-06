/**
 * The `inline-code:` register — the deck-wide switch for the inline directive grammar.
 *
 * Three things are pinned here, and each one is a mistake that was live at some point
 * while this was written:
 *
 *  1. UNKNOWN FALLS TO THE RUNNING DEFAULT, NOT TO OFF. `inline-code: off` is the value
 *     an author reaches for first — it is what this register was called in its first
 *     draft, and it is what a careless UI would write. Mapping it to "off" would mean a
 *     typo silently disables the grammar; mapping it to the default means the deck keeps
 *     rendering and `unknown-inline-code` tells the author why.
 *  2. THE ONLY OFF VALUE IS `literal`. Anything else — including `false`, `no`, `none` —
 *     leaves the grammar running, on purpose, for the same reason.
 *  3. BOTH RENDER PATHS ASK THE SAME KERNEL (HARD RULE #1). The engine reads the front
 *     matter; the runtime reads the class the engine stamps. If those two could disagree,
 *     a deck would render one way in the CLI and another in a preview.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const {
  INLINE_CODE_NAMES,
  INLINE_CODE_LITERAL,
  inlineCodeClass,
  isKnownInlineCode,
  isLiteralFromSource,
  isLiteralElement,
  readFrontMatterInlineCode,
} = require('../../../lib/core/resolve-inline-code.js');

test('literal is the only value that turns the grammar off', () => {
  assert.equal(inlineCodeClass('literal'), INLINE_CODE_LITERAL);
  assert.equal(inlineCodeClass('LITERAL'), INLINE_CODE_LITERAL, 'case-insensitive, like every other register');
  assert.equal(inlineCodeClass('  literal  '), INLINE_CODE_LITERAL);
  assert.equal(inlineCodeClass('rich'), '', 'the default carries no token');
});

test('an unknown value keeps the grammar RUNNING', () => {
  // The whole point: a typo must not silently change what the deck renders. `off` leads
  // this list because it is the one an author actually types.
  for (const bogus of ['off', 'false', 'no', 'none', 'plain', 'on', '', '  ', 'litera']) {
    assert.equal(inlineCodeClass(bogus), '', `'${bogus}' must fall to the running default`);
  }
  assert.equal(inlineCodeClass(null), '');
  assert.equal(inlineCodeClass(undefined), '');
  assert.equal(inlineCodeClass(42), '');
});

test('the vocabulary the linter offers is the vocabulary the kernel accepts', () => {
  // These two drifting apart is how a register ends up suggesting a value it rejects.
  for (const name of INLINE_CODE_NAMES) assert.ok(isKnownInlineCode(name), `${name} must be known`);
  assert.equal(isKnownInlineCode('off'), false);
  assert.deepEqual([...INLINE_CODE_NAMES], ['rich', 'literal']);
});

test('front matter is read like every other register', () => {
  assert.equal(readFrontMatterInlineCode('---\ninline-code: literal\n---\n'), 'literal');
  assert.equal(isLiteralFromSource('---\ninline-code: literal\n---\n# Deck\n'), true);
  assert.equal(isLiteralFromSource('---\ntheme: indaco\n---\n# Deck\n'), false);
  assert.equal(isLiteralFromSource('# No front matter at all\n'), false);
  // A trailing YAML comment must not defeat the match — the `$`-anchor bug the shared
  // `frontMatterName` helper exists to prevent.
  assert.equal(isLiteralFromSource('---\ninline-code: literal # imported deck\n---\n'), true);
});

test('the runtime gate reads the class, and reads it per section', () => {
  // The class is the contract precisely because it is the one signal present on all three
  // render paths — including a raw Marp preview, where nothing of ours can read front
  // matter and marp-core's own `class:` directive supplies the token.
  const { document } = new JSDOM(`
    <section class="${INLINE_CODE_LITERAL}"><p><code id="off">{A}</code></p></section>
    <section class="content"><p><code id="on">{A}</code></p></section>
  `).window;
  assert.equal(isLiteralElement(document.getElementById('off')), true);
  assert.equal(isLiteralElement(document.getElementById('on')), false, 'a sibling section must be unaffected');
});

test('the runtime gate is safe on an element with no section', () => {
  // The runtime walks `section code`, so this cannot happen today — but the kernel is
  // shared and must not throw for a caller that reaches it another way.
  const { document } = new JSDOM('<p><code id="loose">{A}</code></p>').window;
  assert.equal(isLiteralElement(document.getElementById('loose')), false);
  assert.equal(isLiteralElement(null), false);
  assert.equal(isLiteralElement({}), false);
});
