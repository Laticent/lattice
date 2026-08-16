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
  const rule = css.match(/section:is\(([^)]*(?:\([^)]*\))?[^)]*)\)\s*\{\s*--fin-canvas:\s*var\(--surface-inverse\)/);
  assert.ok(rule, 'expected a `section:is(…) { --fin-canvas: var(--surface-inverse) }` rule');
  for (const bookend of ['.title', '.closing', '.divider:not(.light)']) {
    assert.ok(rule[1].includes(bookend), `${bookend} paints --surface-inverse, so its finish canvas must follow it`);
  }
});

test('--fin-canvas is declared on `section`, so it is never undefined under a finish', () => {
  const css = code(FINISH_CSS);
  // Declared on the bare element selector — a fabricated finish emits the same token
  // and may be applied before the `.finish` class lands.
  assert.match(css, /(^|\n)section\s*\{\s*--fin-canvas:/, '--fin-canvas must be declared on `section`, not only on `section.finish`');
});

test('the Studio finish generator emits the same token as the base layer', () => {
  const gen = fs.readFileSync(GENERATOR, 'utf8');
  assert.ok(!/var\(--bg\)/.test(gen), 'a fabricated finish must mix toward var(--fin-canvas) too — HARD RULE #1, one contract for both sources');
  assert.ok(/var\(--fin-canvas\)/.test(gen), 'expected the generator to emit var(--fin-canvas)');
});
