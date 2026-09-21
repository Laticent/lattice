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
  // `[^{}]*` — ONE unnested quantifier. The obvious form here is a repeated
  // selector group, `(?:section[^{}]*,\s*)*section[^{}]*`, and CodeQL is right to
  // reject it: a quantified group whose body is itself unbounded backtracks
  // exponentially on input like `section,section,section…`. A single negated class
  // cannot cross a `}`, so it stops at the previous rule's brace on its own and
  // matches the whole selector list in linear time.
  const rule = css.match(/([^{}]*)\{\s*--fin-canvas:\s*var\(--surface-inverse\)/);
  assert.ok(rule, 'expected a rule setting `--fin-canvas: var(--surface-inverse)` for the inverse bookends');
  const selector = rule[1];
  for (const bookend of ['.title', '.closing', '.divider']) {
    assert.ok(selector.includes(bookend), `${bookend} paints --surface-inverse, so its finish canvas must follow it`);
  }
  // `print` must be carved out ON EVERY SELECTOR IN THE LIST: it REMAPS every consumed
  // token to the print band rather than exempting anything, so a printed bookend takes
  // `--print-surface-inverse` and a finish mixing toward the screen inverse would flood
  // the page.
  //
  // PER SELECTOR, not over the joined string. `selector.includes(':not(.print)')` is
  // true as long as ONE of the comma-separated selectors carries it — measured: dropping
  // the exclusion from the `title, closing` line passes that check because the `divider`
  // line still has it. The original loop here had the same hole.
  // Split on TOP-LEVEL commas only — `section:is(.title, .closing):not(.print)` carries
  // one inside `:is()`, and a naive `split(',')` cuts it into `section:is(.title` and
  // `.closing):not(.print)`, which fails on a selector that is perfectly correct.
  const topLevel = (list) => {
    const out = [];
    let depth = 0;
    let buf = '';
    for (const ch of list) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) {
        out.push(buf.trim());
        buf = '';
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) out.push(buf.trim());
    return out.filter(Boolean);
  };
  for (const one of topLevel(selector)) {
    assert.ok(one.includes(':not(.print)'), `\`${one}\` must not apply to a print slide`);
  }
  // `.dark` MUST NOT BE CARVED OUT, and this assertion is the inverse of the one that
  // used to stand here. The carve-out was correct while `section.dark` repainted a
  // bookend with `var(--bg)` — on `title dark` the modifier won and the surface really
  // was the deck canvas. `section.dark:not(:where(…))` in base.modifiers.css ended that:
  // a bookend keeps `--surface-inverse` under dark, so excluding `.dark` here would
  // point the finish at a color the slide no longer paints — the very inversion the
  // original carve-out existed to prevent, one modifier over.
  assert.ok(
    !selector.includes(':not(.dark)'),
    'a dark bookend keeps its own canvas now (base.modifiers.css), so the override MUST apply to it',
  );

  // THE FIVE ACCENT COVERS are exempted from the dark canvas by the same rule and paint
  // `var(--accent)`, so they owe the same re-point. Scoped to `.dark` on purpose: a cover
  // paints the accent in every mode, and the plain/light/print rows are a pre-existing
  // miss tracked as #2294 whose fix changes light rendering.
  const coverRule = css.match(/([^{}]*)\{\s*--fin-canvas:\s*var\(--accent\)/);
  assert.ok(coverRule, 'expected a rule setting `--fin-canvas: var(--accent)` for the accent covers');
  const coverSelector = coverRule[1];
  assert.ok(coverSelector.includes('.dark'), 'the accent-cover re-point is scoped to dark (see #2294)');
  for (const cover of [
    '.decision-cover',
    '.compare-code-cover',
    '.compare-split-cover',
    '.list-tabular-cover',
    '.split-panel-cover',
  ]) {
    assert.ok(coverSelector.includes(cover), `${cover} paints var(--accent) under dark, so its finish canvas must follow it`);
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
