const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// #1656 — the finish backdrop must composite against THIS SLIDE'S surface.
//
// Every finish layer is palette-blind by mixing toward the slide's canvas. Those
// mixes used to name `var(--bg)` directly, which is right only while `--bg` IS the
// color under the finish. The three INVERSE BOOKENDS break that: `title`, `closing`,
// and a non-`light` `divider` paint `--surface-inverse` while deliberately keeping
// `color-scheme: light`, so `--bg` stayed the light deck canvas. The clearance mask
// then painted a light ellipse across a dark bookend and its white display text
// vanished — a `finish:` deck's title slide exported as a blank page.
//
// The fix routes every layer through `--fin-canvas`. These tests lock the contract in
// source, because the failure is invisible to a unit render: the CSS is valid either
// way, it just paints the wrong color.

const FINISH_CSS = path.join(__dirname, '..', '..', '..', 'lib', 'base', 'base.finish.css');
const GENERATOR = path.join(__dirname, '..', '..', '..', 'docs', 'src', 'components', 'studio', 'finish-generate.ts');

/** Strip /* … *​/ comments so prose mentioning a token is not mistaken for code. */
function code(file) {
  return fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

test('base.finish.css routes every layer through --fin-canvas, never a bare --bg', () => {
  const css = code(FINISH_CSS);
  // The ONE legitimate `var(--bg)` is the token's own default.
  const bare = css.match(/var\(--bg\)/g) || [];
  assert.strictEqual(
    bare.length,
    1,
    `finish layers must mix toward var(--fin-canvas), not var(--bg) — found ${bare.length} bare references (expected exactly 1: the --fin-canvas default)`,
  );
  assert.match(css, /--fin-canvas:\s*var\(--bg\)/, '--fin-canvas must default to the deck canvas');
});

test('the three inverse bookends re-point --fin-canvas at their own surface', () => {
  const css = code(FINISH_CSS);
  const rule = css.match(/((?:section[^{}]*,\s*)*section[^{}]*)\{\s*--fin-canvas:\s*var\(--surface-inverse\)/);
  assert.ok(rule, 'expected a rule setting `--fin-canvas: var(--surface-inverse)` for the inverse bookends');
  const selector = rule[1];
  for (const bookend of ['.title', '.closing', '.divider']) {
    assert.ok(selector.includes(bookend), `${bookend} paints --surface-inverse, so its finish canvas must follow it`);
  }
  // The CANVAS MODIFIERS must be carved out. `dark` and `print` repaint the section
  // themselves from base.modifiers.css, which the bundle loads after the component
  // sheets — so on `title dark` the modifier wins and the surface is `--bg`. Excluding
  // them is what keeps the fix from inverting its own bug (red-team finding).
  for (const mod of [':not(.dark)', ':not(.print)']) {
    assert.ok(selector.includes(mod), `the override must not apply to a ${mod.slice(5, -1)} slide`);
  }
  // …but `light` is carved out for the DIVIDER ONLY: `section.light` paints nothing, so
  // a `title light` keeps its inverse panel while `divider.light` takes the deck canvas.
  assert.match(selector, /section\.divider:not\(\.light\)/, 'divider must exclude .light');
  assert.doesNotMatch(selector, /section:is\([^)]*\):not\(\.light\)/, 'title/closing must NOT exclude .light');
});

// The assertions above are about SOURCE SHAPE, and that is all they can be — the CSS is
// valid whichever color it resolves to. The behavior itself is gated by a computed-value
// matrix in real Chromium: test/integration/invariants/finish-canvas-matrix.test.js.

test('--fin-canvas is declared on `section`, so it is never undefined under a finish', () => {
  const css = code(FINISH_CSS);
  // Declared on the bare element selector — a fabricated finish emits the same token
  // and may be applied before the `.finish` class lands.
  assert.match(css, /(^|\n)section\s*\{\s*--fin-canvas:/, '--fin-canvas must be declared on `section`, not only on `section.finish`');
});

test('the Studio finish generator emits the same token as the base layer', () => {
  const gen = fs.readFileSync(GENERATOR, 'utf8');
  // The generator writes `var(--fin-canvas, var(--bg))`, WITH the fallback — its output
  // is consumed both inside a `<section>` (where the engine declares the token) and on
  // plain chrome `<div>`s, the Library's saved-finish preview strip and the Inspector's
  // finish swatches. A bare `var(--fin-canvas)` is unresolved there, which invalidates
  // the whole gradient and paints nothing. Inside a section the fallback is never taken.
  const withoutFallback = gen.split('var(--fin-canvas, var(--bg))').join('');
  assert.ok(
    !/var\(--bg\)/.test(withoutFallback),
    'a fabricated finish must mix toward var(--fin-canvas) — HARD RULE #1, one contract for both sources',
  );
  assert.ok(/var\(--fin-canvas, var\(--bg\)\)/.test(gen), 'expected the generator to emit var(--fin-canvas) WITH its --bg fallback');
});
