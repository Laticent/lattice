/**
 * Unit: the `card-lift:` register resolver (lib/core/resolve-card-lift.js).
 *
 * The opt-in card-elevation control: maps the deck front-matter `card-lift:` value to the
 * `card-lift-on` class token the three render paths append to every section. `off` is the flat
 * default and carries NO token; only `on` does. Per-slide `_class: card-lift-on` / `card-lift-off`
 * override it. Sibling of resolve-spectrum / resolve-finish / resolve-drawing.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CARD_LIFT_NAMES,
  CARD_LIFT_TOKENS,
  readFrontMatterCardLift,
  isKnownCardLift,
  cardLiftClass,
  cardLiftClassFromSource,
} = require('../../../lib/core/resolve-card-lift');

describe('resolve-card-lift', () => {
  test('on maps to `card-lift-on`; off maps to no token (the flat default)', () => {
    assert.equal(cardLiftClass('on'), 'card-lift-on');
    assert.equal(cardLiftClass('off'), '', 'off is the flat baseline — no class');
  });

  test('omitted / unrecognized resolve to no class (flat)', () => {
    assert.equal(cardLiftClass(''), '');
    assert.equal(cardLiftClass('   '), '');
    assert.equal(cardLiftClass('onn'), '', 'typo → flat (deck-lint flags it)');
    assert.equal(cardLiftClass(undefined), '');
    assert.equal(cardLiftClass(null), '');
  });

  test('value is case- and whitespace-insensitive', () => {
    assert.equal(cardLiftClass('  ON  '), 'card-lift-on');
    assert.equal(cardLiftClass('On'), 'card-lift-on');
  });

  test('isKnownCardLift recognizes on / off only', () => {
    assert.ok(isKnownCardLift('on'));
    assert.ok(isKnownCardLift('off'));
    assert.ok(!isKnownCardLift('card-lift-on'));
    assert.ok(!isKnownCardLift(''));
    assert.ok(!isKnownCardLift(undefined));
  });

  test('CARD_LIFT_NAMES / CARD_LIFT_TOKENS list the recognized + override sets', () => {
    assert.deepEqual([...CARD_LIFT_NAMES], ['on', 'off']);
    // The override set is the per-slide tokens (in / out), NOT the deck-value names.
    assert.deepEqual([...CARD_LIFT_TOKENS], ['card-lift-on', 'card-lift-off']);
  });

  test('readFrontMatterCardLift extracts the value from the front-matter block only', () => {
    const md = '---\nmarp: true\ncard-lift: on\n---\n\n# H\n\n`lift: not-this` in body\n';
    assert.equal(readFrontMatterCardLift(md), 'on');
    assert.equal(cardLiftClassFromSource(md), 'card-lift-on');
  });

  test('readFrontMatterCardLift accepts quotes and returns null when absent', () => {
    assert.equal(readFrontMatterCardLift('---\ncard-lift: "on"\n---\n'), 'on');
    assert.equal(readFrontMatterCardLift("---\ncard-lift: 'off'\n---\n"), 'off');
    assert.equal(readFrontMatterCardLift('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterCardLift(''), null);
  });

  // Rot-guard: the `.card-lift-on` activation must swap BOTH consumed tokens on, and `.flat`
  // must force them back off — else the toggle silently no-ops. And the consumed tokens
  // must DEFAULT to off (opt-in), so a deck with no setting stays flat.
  //
  // The "off" value is `0 0 transparent`, and this case now pins that it is NOT `none`.
  // `none` is legal only as box-shadow's SOLE value, so it made every card that composes
  // the register into a LIST invalid at computed-value time — pricing's elevated tier
  // (`inset 0 0 0 1px var(--accent), var(--elevation-card)`) lost its accent ring on every
  // deck without `card-lift: on`, and resolved to the property's INITIAL value rather than
  // falling back. Found by the css:values declared-token pass (#1317).
  const OFF = /--elevation-card:\s*0 0 transparent/;
  test('base.tokens.css: card-lift-on activates both tokens, card-lift-off resets them, default is off', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.tokens.css'), 'utf8');
    assert.match(css, OFF, 'consumed shadow token must default to a no-op SHADOW (opt-in)');
    assert.match(css, /--elevation-berth:\s*0\b/, 'consumed berth token must default to 0 (opt-in)');
    const lifted = css.match(/section\.card-lift-on\s*\{[^}]*\}/);
    assert.ok(lifted, 'section.card-lift-on activation rule missing');
    assert.match(lifted[0], /--elevation-card:\s*var\(--elevation-recipe\)/, 'lifted must swap in the recipe');
    assert.match(lifted[0], /--elevation-berth:\s*var\(--sp-sm\)/, 'lifted must turn the berth on');
    const flat = css.match(/section\.card-lift-off\s*\{[^}]*\}/);
    assert.ok(flat, 'section.card-lift-off reset rule missing');
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
