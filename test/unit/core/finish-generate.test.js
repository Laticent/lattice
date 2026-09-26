/**
 * The shipped finishes are GENERATED from their recipes (portable-packages §3.6): the build runs
 * lib/finishes/finish-generate.js over every lib/finishes/<name>/<name>.recipe.json and writes the
 * rules into a marked region of lib/base/base.finish.css.
 *
 * These tests pin three things:
 *   - the region is exactly what the generator writes, so a hand edit fails (the build's
 *     `--check` says the same; this names the preset);
 *   - each rule keeps the shipped ONE-class selector, so a deck override such as
 *     `section.finish-meridian { --fin-mark-text: "Q3" }` still wins by source order;
 *   - the four details the vocabulary gained to reproduce the hand-written presets: the thin
 *     `rule` mark, the `hairline` wash strip, the corner-anchored glyph and the tuned rich fold.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const gen = require('../../../lib/finishes/finish-generate.js');
const { FINISH_PRESETS } = require('../../../lib/finishes/presets.generated.js');
const { renderFinishCss, FINISH_CSS_OUT } = require('../../../tools/build-packages-index.js');

const CSS = fs.readFileSync(FINISH_CSS_OUT, 'utf8');
const recipe = (name) => FINISH_PRESETS.find((p) => p.name === name).recipe;
/** One slot's value from a generated rule, whitespace collapsed. */
function slot(rule, name) {
  const m = new RegExp(`\\n\\s*${name}:([^;]*);`).exec(rule);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

test('base.finish.css carries exactly the rules the recipes generate', () => {
  assert.equal(renderFinishCss(), CSS, 'run `node tools/build-packages-index.js` and commit the result');
  for (const { name, recipe: r } of FINISH_PRESETS) {
    assert.ok(CSS.includes(gen.generatePresetCss(name, r)), `the ${name} rule in base.finish.css is not what its recipe generates`);
  }
});

test('a hand edit inside the generated region is caught and overwritten', () => {
  const edited = CSS.replace('--fin-mark-size-bg: 0.47cqi 100%;', '--fin-mark-size-bg: 0.5cqi 100%;');
  assert.notEqual(edited, CSS, 'the fixture edit must land (atrium’s rule mark)');
  // The builder regenerates the region from the recipes: the edit is gone from what it would
  // write, so `--check` (which compares that output to the file) reports the edited file stale.
  const rebuilt = renderFinishCss(undefined, edited);
  assert.notEqual(rebuilt, edited);
  assert.equal(rebuilt, CSS);
  // Text outside the region is the builder's to keep, not to regenerate.
  const outside = CSS.replace(' * THE SHIPPED PRESETS', ' * THE SHIPPED PRESETS (edited)');
  assert.equal(renderFinishCss(undefined, outside), outside);
});

test('a manifest label or blurb cannot end the comment it is written into', () => {
  const { inComment } = require('../../../tools/build-packages-index.js');
  assert.equal(inComment('x */ section { display:none } /*'), 'x * / section { display:none } /*');
});

test('every generated rule uses the shipped one-class selector', () => {
  for (const { name, recipe: r } of FINISH_PRESETS) {
    assert.match(gen.generatePresetCss(name, r), new RegExp(`^section\\.finish-${name} \\{\\n`));
  }
  assert.throws(() => gen.generatePresetCss('Bad Name', recipe('atrium')), /not a finish name/);
});

test('the `rule` mark is the thin margin rule; `bar` stays the bold one', () => {
  const rule = gen.generatePresetCss('atrium', recipe('atrium'));
  assert.equal(slot(rule, '--fin-mark-size-bg'), '0.47cqi 100%');
  const bar = gen.generatePresetCss('ledger', recipe('ledger'));
  assert.equal(slot(bar, '--fin-mark-size-bg'), '1.1cqi 100%');
});

test('the hairline strip sits on top of the wash, sized to a strip, in both faces', () => {
  const css = gen.generatePresetCss('strata', recipe('strata'));
  assert.equal(slot(css, '--fin-size'), '26px 26px, 100% 0.31cqi, cover');
  assert.equal(slot(css, '--fin-repeat'), 'repeat, no-repeat, no-repeat');
  assert.match(slot(css, '--fin-wash'), /^linear-gradient\(90deg, var\(--field-accent\) 0%, .* 55%, transparent 100%\), linear-gradient\(180deg/);
  assert.match(slot(css, '--fin-wash-opaque'), /^linear-gradient\(90deg, var\(--field-accent\) 0%, .* 60%, var\(--fin-canvas\) 100%\), linear-gradient\(180deg/);
  // Without the flag, the same recipe has one wash layer and no strip.
  const plain = gen.generatePresetCss('strata', { ...recipe('strata'), wash: { ...recipe('strata').wash, hairline: false } });
  assert.equal(slot(plain, '--fin-size'), '26px 26px, cover');
  // The Studio face lines its aux slots up with the extra layer too.
  const studio = gen.generateFinishCss('mine', recipe('strata'));
  assert.match(studio, /--fin-size:26px 26px, 100% 0\.31cqi, cover/);
});

test('a corner-anchored glyph is seated by alignment, a free one by translate', () => {
  const cases = [
    ['bottom-right', 'flex-end', 'flex-end'],
    ['top-left', 'flex-start', 'flex-start'],
    ['top-right', 'flex-start', 'flex-end'],
    ['bottom-left', 'flex-end', 'flex-start'],
    ['left', 'center', 'flex-start'],
  ];
  for (const [placement, align, justify] of cases) {
    const css = gen.generatePresetCss('x', { ...recipe('meridian'), mark: { type: 'numeral', placement, anchor: 'corner', inset: 2 } });
    assert.equal(slot(css, '--fin-mark-align'), align, placement);
    assert.equal(slot(css, '--fin-mark-justify'), justify, placement);
    assert.equal(slot(css, '--fin-mark-pad'), '0 2cqi', placement);
    assert.equal(slot(css, '--fin-mark-transform'), null, `${placement}: an untilted corner glyph needs no transform`);
  }
  const tilted = gen.generatePresetCss('x', { ...recipe('meridian'), mark: { ...recipe('meridian').mark, angle: -8 } });
  assert.equal(slot(tilted, '--fin-mark-transform'), 'rotate(-8deg)');
  const free = gen.generatePresetCss('x', { ...recipe('meridian'), mark: { type: 'numeral', placement: 'bottom-right', x: 70, y: 60 } });
  assert.equal(slot(free, '--fin-mark-transform'), 'translate(20%, 10%) rotate(0deg)');
  assert.equal(slot(free, '--fin-mark-align'), 'center');
});

test('the fold’s tuned rich face changes the screen face only', () => {
  const tuned = gen.generatePresetCss('ledger', recipe('ledger'));
  assert.match(slot(tuned, '--fin-edge'), / 22%, transparent\) 0%, transparent 65%\)$/);
  const formula = gen.generatePresetCss('ledger', { ...recipe('ledger'), edge: { type: 'fold', intensity: 16 } });
  assert.match(slot(formula, '--fin-edge'), / 19%, transparent\) 0%, transparent 60%\)$/);
  assert.equal(slot(tuned, '--fin-edge-opaque'), slot(formula, '--fin-edge-opaque'));
});

test('coercion keeps the new details when set, clamps them, and adds nothing when absent', () => {
  const r = gen.coerceRecipe({ wash: { type: 'bands', hairline: 'on' }, mark: { type: 'rule', anchor: 'corner', inset: 40 }, edge: { type: 'fold', rich: { intensity: 99, reach: 5 } } });
  assert.equal(r.wash.hairline, true);
  assert.equal(r.mark.type, 'rule');
  assert.equal(r.mark.anchor, 'corner');
  assert.equal(r.mark.inset, 6);
  assert.deepEqual(r.edge.rich, { intensity: 30, reach: 30 });
  const bare = gen.coerceRecipe({ wash: { type: 'bands' }, mark: { type: 'numeral', anchor: 'middle' }, edge: { type: 'fold', rich: {} } });
  assert.equal('hairline' in bare.wash, false);
  assert.equal('anchor' in bare.mark, false);
  assert.equal('inset' in bare.mark, false);
  assert.equal('rich' in bare.edge, false);
});
