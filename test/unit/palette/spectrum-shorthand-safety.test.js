// #1528 — a multi-layer `background:` shorthand may not read a `var()`.
//
// CSS invalidates the WHOLE declaration when any var() in it is undefined, and the property
// then takes its INITIAL value — it does NOT fall back to an earlier rule that set the same
// property. So `background: var(--spectrum) …, var(--bg)` on `section.dark` did not degrade
// to "dark slide, no ribbon" for a theme short of --spectrum; it degraded to `transparent`,
// and the slide rendered white with its near-white headline invisible on it (measured in
// Chromium 131 on the real export path).
//
// The gate itself is `checkBackgroundLayerVars` in tools/check-ownership.js (budget 0, the
// SANCTIONED_MARGINS idiom), so it runs in `build:check` on every PR. These cases pin the
// pure matcher behind it, plus the six sites the fix hoisted.
//
// WHY A STRUCTURAL RULE AND NOT A TOKEN LIST: the first cut enumerated "droppable" and
// "surface" token names. Two independent adversarial passes defeated it four ways — a single
// layer naming both kinds, an uppercase `BACKGROUND:`, a droppable token outside the list
// (there are 107 such theme tokens), and a surface token outside the list. Every one loses
// the canvas in real Chromium. The four are pinned below as regression cases.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  varInMultiLayerBackground,
  checkBackgroundLayerVars,
  SANCTIONED_BACKGROUND_LAYERS,
} = require('../../../tools/check-ownership.js');

const LIB = path.join(__dirname, '..', '..', '..', 'lib');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

describe('no var() in a multi-layer background shorthand (#1528)', () => {
  test('the live engine CSS is clean, at budget 0', () => {
    const errors = [];
    checkBackgroundLayerVars(errors);
    assert.deepEqual(errors, [], 'engine CSS must carry no multi-layer background shorthand reading a var()');
    assert.deepEqual(SANCTIONED_BACKGROUND_LAYERS, [], 'the allowlist is empty — budget 0 is genuinely reachable');
  });

  describe('CATCHES the original defect and all four evasions found by the trio', () => {
    const offenders = {
      'the original defect — two layers, ribbon + canvas':
        'section.a { background: var(--spectrum) top / 100% 1px no-repeat, var(--bg); }',
      'a single layer naming BOTH a droppable and a surface token':
        'section.b { background: color-mix(in srgb, var(--accent) 6%, var(--bg-alt)) top / 100% 1px no-repeat, var(--bg-alt); }',
      'an uppercase property name — CSS is case-insensitive, the first scan was not':
        'section.c { BACKGROUND: var(--spectrum) top / 100% 1px no-repeat, var(--bg); }',
      'a droppable token no hand-kept list would have enumerated':
        'section.d { background: linear-gradient(var(--cat-1-fill), var(--cat-1-fill)) top / 100% 1px no-repeat, var(--bg); }',
      'a surface token no hand-kept list would have enumerated':
        'section.e { background: var(--spectrum) top / 100% 1px no-repeat, var(--accent-soft); }',
      'a var() buried in the LAST layer only':
        'section.f { background: linear-gradient(#fff, #fff) top, var(--bg); }',
    };
    for (const [what, css] of Object.entries(offenders)) {
      test(what, () => assert.equal(varInMultiLayerBackground(css).length, 1, css));
    }
  });

  describe('does NOT fire on the shapes that are correct', () => {
    const allowed = {
      // An invalid single-layer declaration costs exactly the decoration it painted, which
      // is already the right degradation — thead rails, `hr`, the list-steps spine.
      'a single-layer var()': 'section.g { background: var(--spectrum-structure); }',
      // Live today at roadmap.styles.css — one layer, so nothing else can be taken with it.
      'a single layer whose color-mix names two tokens':
        'section.h { background: color-mix(in srgb, var(--accent) 6%, var(--bg-alt)); }',
      'multiple layers with no var() at all':
        'section.i { background: rgba(0,0,0,.2) top / 100% 2px no-repeat, rgba(0,0,0,.1); }',
      'the longhand form the fix uses':
        'section.j { background-color: var(--bg); background-image: var(--spectrum); }',
      'a var() inside a comment':
        '/* background: var(--spectrum) top, var(--bg); */ section.k { color: red; }',
    };
    for (const [what, css] of Object.entries(allowed)) {
      test(what, () => assert.deepEqual(varInMultiLayerBackground(css), [], css));
    }
  });

  test('the six hoisted sites still paint their surface as background-color', () => {
    const want = [
      ['base/base.modifiers.css', 'section.dark', '--bg'],
      ['shared/shared.styles.css', 'section.accent.dark', '--bg'],
      ['components/anchor/divider/divider.styles.css', 'section.divider', '--surface-inverse'],
      ['components/code/code/code.styles.css', 'section.code pre', '--code-bg'],
      ['components/code/compare-code/compare-code.styles.css', 'section.compare-code pre', '--code-bg'],
      ['components/code/compare-code/compare-code.styles.css', 'section.compare-code-block pre', '--code-bg'],
    ];
    for (const [rel, selector, surface] of want) {
      const css = stripComments(fs.readFileSync(path.join(LIB, rel), 'utf8'));
      const block = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`));
      assert.ok(block, `${rel}: could not find the \`${selector}\` rule`);
      assert.match(block[0], new RegExp(`background-color\\s*:\\s*var\\(${surface}`), `${rel}: \`${selector}\` must paint ${surface} as background-color`);
      assert.match(block[0], /background-image\s*:/, `${rel}: \`${selector}\` must carry the decoration on background-image`);
    }
  });
});
