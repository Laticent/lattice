/**
 * Unit: the `lift:` register resolver (lib/core/resolve-lift.js).
 *
 * The opt-in card-elevation control: maps the deck front-matter `lift:` value to the
 * `lifted` class token the three render paths append to every section. `off` is the flat
 * default and carries NO token; only `on` does. Per-slide `_class: lifted` / `flat`
 * override it. Sibling of resolve-spectrum / resolve-finish / resolve-mode.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  LIFT_NAMES,
  LIFT_TOKENS,
  readFrontMatterLift,
  isKnownLift,
  liftClass,
  liftClassFromSource,
} = require('../../../lib/core/resolve-lift');

describe('resolve-lift', () => {
  test('on maps to `lifted`; off maps to no token (the flat default)', () => {
    assert.equal(liftClass('on'), 'lifted');
    assert.equal(liftClass('off'), '', 'off is the flat baseline — no class');
  });

  test('omitted / unrecognized resolve to no class (flat)', () => {
    assert.equal(liftClass(''), '');
    assert.equal(liftClass('   '), '');
    assert.equal(liftClass('onn'), '', 'typo → flat (deck-lint flags it)');
    assert.equal(liftClass(undefined), '');
    assert.equal(liftClass(null), '');
  });

  test('value is case- and whitespace-insensitive', () => {
    assert.equal(liftClass('  ON  '), 'lifted');
    assert.equal(liftClass('On'), 'lifted');
  });

  test('isKnownLift recognizes on / off only', () => {
    assert.ok(isKnownLift('on'));
    assert.ok(isKnownLift('off'));
    assert.ok(!isKnownLift('lifted'));
    assert.ok(!isKnownLift(''));
    assert.ok(!isKnownLift(undefined));
  });

  test('LIFT_NAMES / LIFT_TOKENS list the recognized + override sets', () => {
    assert.deepEqual([...LIFT_NAMES], ['on', 'off']);
    // The override set is the per-slide tokens (in / out), NOT the deck-value names.
    assert.deepEqual([...LIFT_TOKENS], ['lifted', 'flat']);
  });

  test('readFrontMatterLift extracts the value from the front-matter block only', () => {
    const md = '---\nmarp: true\nlift: on\n---\n\n# H\n\n`lift: not-this` in body\n';
    assert.equal(readFrontMatterLift(md), 'on');
    assert.equal(liftClassFromSource(md), 'lifted');
  });

  test('readFrontMatterLift accepts quotes and returns null when absent', () => {
    assert.equal(readFrontMatterLift('---\nlift: "on"\n---\n'), 'on');
    assert.equal(readFrontMatterLift("---\nlift: 'off'\n---\n"), 'off');
    assert.equal(readFrontMatterLift('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterLift(''), null);
  });

  // Rot-guard: the `.lifted` activation must swap BOTH consumed tokens on, and `.flat`
  // must force them back off — else the toggle silently no-ops. And the consumed tokens
  // must DEFAULT to off (opt-in), so a deck with no setting stays flat.
  //
  // The "off" value is `0 0 transparent`, and this case now pins that it is NOT `none`.
  // `none` is legal only as box-shadow's SOLE value, so it made every card that composes
  // the register into a LIST invalid at computed-value time — pricing's elevated tier
  // (`inset 0 0 0 1px var(--accent), var(--elevation-card)`) lost its accent ring on every
  // deck without `lift: on`, and resolved to the property's INITIAL value rather than
  // falling back. Found by the css:values declared-token pass (#1317).
  const OFF = /--elevation-card:\s*0 0 transparent/;
  test('base.tokens.css: lifted activates both tokens, flat resets them, default is off', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.tokens.css'), 'utf8');
    assert.match(css, OFF, 'consumed shadow token must default to a no-op SHADOW (opt-in)');
    assert.match(css, /--elevation-berth:\s*0\b/, 'consumed berth token must default to 0 (opt-in)');
    const lifted = css.match(/section\.lifted\s*\{[^}]*\}/);
    assert.ok(lifted, 'section.lifted activation rule missing');
    assert.match(lifted[0], /--elevation-card:\s*var\(--elevation-recipe\)/, 'lifted must swap in the recipe');
    assert.match(lifted[0], /--elevation-berth:\s*var\(--sp-sm\)/, 'lifted must turn the berth on');
    const flat = css.match(/section\.flat\s*\{[^}]*\}/);
    assert.ok(flat, 'section.flat reset rule missing');
    assert.match(flat[0], OFF, 'flat must force the shadow off');
    assert.match(flat[0], /--elevation-berth:\s*0\b/, 'flat must force the berth off');
  });

  test('base.tokens.css: the elevation register never turns off with `none`', () => {
    // Separate case, because the one above would still pass if a THIRD rule set the
    // register to `none` somewhere else in the file. `none` does not compose into a
    // shadow list; every "off" site must use the no-op shadow.
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.tokens.css'), 'utf8');
    assert.equal(
      (css.match(/--elevation-card:\s*none/g) || []).length, 0,
      '`--elevation-card: none` breaks any card that composes the register into a box-shadow LIST',
    );
  });
});
