/**
 * The deck-config "Slide size" picker (docs/src/playground/deck-sizes.js) must
 * stay in step with the engine's size registry (lib/engine/sizes.js): every value
 * it offers must be a real registered size, and the social/mobile formats added
 * in #399 must be present. This is the drift guard that was missing when the
 * picker offered only the three landscape sizes while the engine had eight.
 *
 * The picker stays hand-curated on purpose — it carries human labels and offers
 * ONE entry per format (the `16:9` / `9:16` / `1:1` aliases are deliberately
 * omitted), which is editorial, not data. What must not drift is membership, and
 * that is what this file checks — now against the registry itself rather than
 * against `@size` lines parsed back out of a stylesheet comment
 * (engineering/decisions/2026-08-16-size-registry-ownership.md).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { SIZES } = require('../../../lib/engine/sizes');

const ROOT = path.join(__dirname, '..', '..', '..');
const registered = new Set(Object.keys(SIZES));

describe('deck-config size picker ↔ the size registry', () => {
  // deck-sizes.js is a browser ESM module of pure data — import it dynamically.
  let SIZE_OPTIONS;
  test('load SIZE_OPTIONS', async () => {
    ({ SIZE_OPTIONS } = await import(
      path.join(ROOT, 'docs', 'src', 'playground', 'deck-sizes.js')
    ));
    assert.ok(Array.isArray(SIZE_OPTIONS) && SIZE_OPTIONS.length > 0);
  });

  test('the registry actually defines the social/mobile sizes (#399)', () => {
    for (const s of ['square', 'portrait', 'story', 'mobile']) {
      assert.ok(registered.has(s), `lib/engine/sizes.js is missing the '${s}' size`);
    }
  });

  test('every picker value is a registered size', () => {
    for (const [value] of SIZE_OPTIONS) {
      assert.ok(registered.has(value), `picker offers '${value}' but the registry has no '${value}'`);
    }
  });

  test('the picker surfaces the social/mobile sizes (the #399 drift it missed)', () => {
    const values = new Set(SIZE_OPTIONS.map(([v]) => v));
    for (const s of ['square', 'portrait', 'story', 'mobile']) {
      assert.ok(values.has(s), `the size picker is missing '${s}'`);
    }
  });

  test('each option is a [value, label] pair with a non-empty label', () => {
    for (const opt of SIZE_OPTIONS) {
      assert.equal(opt.length, 2);
      assert.equal(typeof opt[1], 'string');
      assert.ok(opt[1].length > 0);
    }
  });

  // The labels quote the canvas ("HD · 1280×720 (16:9, default)"), which is the one
  // part of this hand-written file that can silently contradict the engine: a
  // registry entry could be retuned and the picker would keep advertising the old
  // pixels. Checked rather than generated, so the editorial shape stays free.
  test('every label quotes the registry\'s actual dimensions', () => {
    for (const [value, label] of SIZE_OPTIONS) {
      const { width, height } = SIZES[value];
      const want = `${parseFloat(width)}\u00d7${parseFloat(height)}`;
      assert.ok(label.includes(want), `the '${value}' label says '${label}' but the registry is ${want}`);
    }
  });

  // The editor autocomplete (grammar-vocab.js SIZE_VALUES) and the deck-config
  // picker (deck-sizes.js SIZE_OPTIONS) must offer the SAME formats — same
  // single source, no drift between the two UI surfaces.
  test('SIZE_VALUES (autocomplete) matches SIZE_OPTIONS (picker), and resolves in the registry', async () => {
    const { SIZE_VALUES } = await import(
      path.join(ROOT, 'docs', 'src', 'playground', 'grammar-vocab.js')
    );
    assert.deepEqual(SIZE_VALUES, SIZE_OPTIONS.map(([v]) => v),
      'grammar-vocab SIZE_VALUES drifted from the deck-config picker SIZE_OPTIONS');
    for (const v of SIZE_VALUES) {
      assert.ok(registered.has(v), `autocomplete offers '${v}' but the registry has no '${v}'`);
    }
  });
});
