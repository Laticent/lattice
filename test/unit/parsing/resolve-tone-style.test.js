/**
 * Unit: the `tone:` register resolver (lib/core/resolve-tone-style.js).
 *
 * Pure mapping from the deck front-matter `tone:` value (the tone-marker SHAPE —
 * rail / edge / glow) to the `tone-<style>` class token the three render paths append
 * to every section. Orthogonal to the SEMANTIC tone (`tone-pass`/`tone-warn`/…, which
 * sets the color): this sets the shape. All three tone styles are box-shadow-shaped, so
 * they never collide with the state `::before` or the pagination `::after`.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  TONE_STYLE_NAMES,
  TONE_STYLE_TOKENS,
  readFrontMatterToneStyle,
  isKnownToneStyle,
  toneStyleClass,
  toneStyleClassFromSource,
} = require('../../../lib/core/resolve-tone-style');

describe('resolve-tone-style', () => {
  test('toneStyleClass maps each known name to its class token', () => {
    assert.equal(toneStyleClass('rail'), 'tone-rail');
    assert.equal(toneStyleClass('edge'), 'tone-edge');
    assert.equal(toneStyleClass('glow'), 'tone-glow');
  });

  test('omitted / unrecognized resolve to no class', () => {
    assert.equal(toneStyleClass(''), '');
    assert.equal(toneStyleClass('   '), '');
    assert.equal(toneStyleClass('raill'), '', 'typo → no class (deck-lint flags it)');
    assert.equal(toneStyleClass(undefined), '');
    assert.equal(toneStyleClass(null), '');
  });

  test('value is case- and whitespace-insensitive', () => {
    assert.equal(toneStyleClass('  Edge  '), 'tone-edge');
    assert.equal(toneStyleClass('GLOW'), 'tone-glow');
  });

  test('isKnownToneStyle recognizes the register names only', () => {
    assert.ok(isKnownToneStyle('rail'));
    assert.ok(isKnownToneStyle('glow'));
    assert.ok(!isKnownToneStyle('raill'));
    // The SEMANTIC tone words are NOT tone styles — the two axes are orthogonal.
    assert.ok(!isKnownToneStyle('pass'));
    assert.ok(!isKnownToneStyle(''));
    assert.ok(!isKnownToneStyle(undefined));
  });

  test('TONE_STYLE_NAMES / TONE_STYLE_TOKENS list exactly the three shapes', () => {
    assert.deepEqual([...TONE_STYLE_NAMES], ['rail', 'edge', 'glow']);
    assert.deepEqual([...TONE_STYLE_TOKENS], ['tone-rail', 'tone-edge', 'tone-glow']);
  });

  test('readFrontMatterToneStyle extracts the value from the front-matter block only', () => {
    const md = '---\nmarp: true\ntone: edge\n---\n\n# H\n\n`tone: not-this` in body\n';
    assert.equal(readFrontMatterToneStyle(md), 'edge');
    assert.equal(toneStyleClassFromSource(md), 'tone-edge');
  });

  test('readFrontMatterToneStyle accepts quotes and returns null when absent', () => {
    assert.equal(readFrontMatterToneStyle('---\ntone: "glow"\n---\n'), 'glow');
    assert.equal(readFrontMatterToneStyle("---\ntone: 'rail'\n---\n"), 'rail');
    assert.equal(readFrontMatterToneStyle('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterToneStyle(''), null);
  });

  // Rot-guard: every tone style token must have a real CSS rule in base.variants.css.
  test('every tone style token resolves to a real CSS rule in base.variants.css', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.variants.css'), 'utf8');
    for (const cls of TONE_STYLE_TOKENS) {
      assert.ok(new RegExp(`\\.${cls}\\b`).test(css), `${cls} is registered but base.variants.css has no rule`);
    }
  });
});
