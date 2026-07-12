/**
 * Unit: the `color-mode:` register resolver (lib/core/resolve-color-mode.js).
 *
 * Pure mapping from the deck front-matter `color-mode:` value (light / dark / system /
 * inherited) to the section class token the three render paths append. The first-class
 * successor to the legacy `class: dark`/`class: light` color axis. See
 * engineering/decisions/2026-07-11-color-mode-frontmatter.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  COLOR_MODE_REGISTER,
  COLOR_MODE_NAMES,
  readFrontMatterColorMode,
  isKnownColorMode,
  colorModeClass,
  colorModeClassFromSource,
} = require('../../../lib/core/resolve-color-mode');
const { COLOR_MODE_TOKENS } = require('../../../lib/core/color-mode');

describe('resolve-color-mode', () => {
  test('register maps each name to its section token', () => {
    // light → `color-light` (NOT bare `light`, which is the divider.light layout component)
    assert.equal(colorModeClass('light'), 'color-light');
    assert.equal(colorModeClass('dark'), 'dark');
    assert.equal(colorModeClass('system'), 'color-system');
    assert.equal(colorModeClass('inherited'), 'color-inherited');
  });

  test('omitted / unrecognized resolve to no token (theme default)', () => {
    assert.equal(colorModeClass(''), '');
    assert.equal(colorModeClass('   '), '');
    assert.equal(colorModeClass('systemm'), '', 'typo → no token (deck-lint flags it)');
    assert.equal(colorModeClass(undefined), '');
    assert.equal(colorModeClass(null), '');
  });

  test('value is case- and whitespace-insensitive', () => {
    assert.equal(colorModeClass('  System  '), 'color-system');
    assert.equal(colorModeClass('INHERITED'), 'color-inherited');
  });

  test('isKnownColorMode recognizes the five register names only', () => {
    for (const n of ['light', 'dark', 'system', 'inherited', 'print']) assert.ok(isKnownColorMode(n));
    assert.ok(!isKnownColorMode('systemm'));
    assert.ok(!isKnownColorMode(''));
    assert.ok(!isKnownColorMode(undefined));
  });

  test('COLOR_MODE_NAMES lists exactly the five registered names', () => {
    assert.deepEqual([...COLOR_MODE_NAMES].sort(), ['dark', 'inherited', 'light', 'print', 'system']);
  });

  test('color-mode: print maps to the section.print band class', () => {
    assert.equal(colorModeClass('print'), 'print');
    assert.equal(colorModeClassFromSource('---\ncolor-mode: print\n---\n'), 'print');
  });

  test('every register token is a member of the shared COLOR_MODE_TOKENS axis', () => {
    const axis = new Set(COLOR_MODE_TOKENS);
    for (const token of Object.values(COLOR_MODE_REGISTER)) {
      assert.ok(axis.has(token), `${token} must be in COLOR_MODE_TOKENS so the propagation guard scopes it`);
    }
  });

  test('readFrontMatterColorMode extracts the value from the front-matter block only', () => {
    const md = '---\nmarp: true\ntheme: carta\ncolor-mode: system\n---\n\n# H\n\n`color-mode: not-this` in body\n';
    assert.equal(readFrontMatterColorMode(md), 'system');
    assert.equal(colorModeClassFromSource(md), 'color-system');
  });

  test('readFrontMatterColorMode accepts quotes and returns null when absent', () => {
    assert.equal(readFrontMatterColorMode('---\ncolor-mode: "inherited"\n---\n'), 'inherited');
    assert.equal(readFrontMatterColorMode("---\ncolor-mode: 'dark'\n---\n"), 'dark');
    assert.equal(readFrontMatterColorMode('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterColorMode(''), null);
  });

  // Rot-guard: every token the register maps to must have a real CSS rule in
  // base.modifiers.css (mirrors resolve-mode's guard against base.sketch.css).
  test('every register token resolves to a real section CSS rule in base.modifiers.css', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.modifiers.css'), 'utf8');
    for (const token of Object.values(COLOR_MODE_REGISTER)) {
      assert.ok(new RegExp(`section\\.${token}\\b`).test(css), `register maps to .${token} but base.modifiers.css has no section rule`);
    }
  });
});
