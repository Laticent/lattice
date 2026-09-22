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

test('every frame that paints an inverse panel re-points --fin-canvas at it', () => {
  const css = code(FINISH_CSS);
  // `[^{}]*` — ONE unnested quantifier. The obvious form here is a repeated
  // selector group, `(?:section[^{}]*,\s*)*section[^{}]*`, and CodeQL is right to
  // reject it: a quantified group whose body is itself unbounded backtracks
  // exponentially on input like `section,section,section…`. A single negated class
  // cannot cross a `}`, so it stops at the previous rule's brace on its own and
  // matches the whole selector list in linear time.
  // EVERY such rule, not the first one. The inverse frames are declared in TWO blocks:
  // the bookends in one, and `topic` in its own because topic's arms are the only ones
  // needing `:has()`, and Selectors-4 invalidates a whole selector list on one
  // unparsable complex selector — so while they shared a list, a renderer without
  // `:has()` dropped the declaration for title, closing and divider too. A `match()`
  // that stopped at the first block would have gone on asserting about the bookends
  // while topic drifted unchecked, which is how `.topic` came to be missing from the
  // list below in the first place.
  const rules = [...css.matchAll(/([^{}]*)\{\s*--fin-canvas:\s*var\(--surface-inverse\)/g)];
  assert.ok(rules.length, 'expected a rule setting `--fin-canvas: var(--surface-inverse)` for the inverse frames');
  const selector = rules.map((r) => r[1]).join(',');
  // `.topic` is here because it paints `--surface-inverse` in EVERY mode. It was left
  // out when this test was renamed from "the three inverse bookends" to "every frame
  // that paints an inverse panel" — the name grew, the list did not, and a mutant
  // deleting both topic arms passed this file 4/4.
  for (const frame of ['.title', '.closing', '.divider', '.topic']) {
    assert.ok(selector.includes(frame), `${frame} paints --surface-inverse, so its finish canvas must follow it`);
  }
  // EVERY SELECTOR IN THE LIST MUST EXCLUDE `print`, and the bookends must also exclude
  // the registers that repaint the surface out from under them. The exclusion may be
  // spelled `:not(.print)` or folded into a `:not(:where(…))` group — the second form is
  // what the file uses, because seven chained `:not()` would add (0,7,0) and change what
  // these rules beat, while `:where()` contributes zero.
  //
  // PER SELECTOR, not over the joined string. `selector.includes(':not(.print)')` is
  // true as long as ONE of the comma-separated selectors carries it — measured: dropping
  // the exclusion from the `title, closing` line passes that check because the `divider`
  // line still has it. The original loop here had the same hole.
  // Split on TOP-LEVEL commas only — `section:is(.title, .closing):not(…)` carries one
  // inside `:is()`, and a naive `split(',')` cuts it into `section:is(.title` and
  // `.closing):not(…)`, which fails a selector that is perfectly correct.
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
  // Latent, noted rather than fixed: depth tracks PARENS only, so an attribute value
  // containing a comma — `section[data-class~="a,b"]` — would split wrongly and fail a
  // correct selector. No such selector exists in this file today; if one lands, this
  // splitter needs to skip quoted strings and bracket depth too.
  // Extract each `:not(…)` group with PAREN BALANCING. A regex with `[^)]*` stops at the
  // first `)`, so it cannot see a class inside a nested condition — and the divider arm
  // now has exactly that shape: `:not(:where(.print:not(.spectrum-off)…, .dark.accent…))`.
  // Measured: the regex form reported the accent exclusion missing when it was present.
  const notGroups = (sel) => {
    const out = [];
    let i = 0;
    while ((i = sel.indexOf(':not(', i)) !== -1) {
      let depth = 0;
      let j = i + 4;
      for (; j < sel.length; j += 1) {
        if (sel[j] === '(') depth += 1;
        else if (sel[j] === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      out.push(sel.slice(i + 5, j));
      i = j + 1;
    }
    return out;
  };
  const excludes = (sel, cls) =>
    notGroups(sel).some((g) => new RegExp(`\\.${cls}\\b`).test(g));
  // `print` must be excluded BY EVERY SELECTOR THAT LOSES ITS CANVAS TO IT — which is
  // not all of them. `section.print` resets the surface to white and the token remap
  // sends --surface-inverse to the print band, so a printed `title` really is white
  // (measured: rgb(255,255,255)) and a finish mixing toward the inverse would flood the
  // page. `topic` is the exception: it KEEPS its canvas under print (measured:
  // rgb(236,236,236), the print band's inverse), so excluding print there would demote
  // --fin-canvas to var(--print-bg) and reintroduce the same mismatch one frame over.
  // Keyed on the SHAPE and the VARIANT, not the frame — two ways topic out-specifies
  // `section.print` (0,1,1) and keeps its panel, and both are measured:
  //
  //   :not(:has(> ul.tile-track))  the TRACKLESS shape restates the canvas at (0,2,2).
  //                               Measured: `topic print` trackless is rgb(236,236,236),
  //                               the print band inverse; tracked is rgb(255,255,255).
  //   .fact                       `section.topic.fact` (0,2,1) restates it too, so a
  //                               fact slide keeps the panel EVEN WHEN TRACKED.
  //                               Measured: `topic fact print` with the track is
  //                               rgb(236,236,236) while the plain tracked arm's
  //                               `:not(.print)` was sending --fin-canvas to white.
  //
  // The second one is why this predicate is not simply the shape. A blanket
  // `:not(.print)` on the tracked arm shipped that mismatch on every one of the 33
  // palettes, visible only in the export, and four review rounds went past it — the
  // cross had no axis putting a variant and a register on the same section.
  const KEEPS_CANVAS_UNDER_PRINT = (sel) =>
    sel.includes('.topic') && (sel.includes(':not(:has(> ul.tile-track))') || sel.includes('.fact'));
  for (const one of topLevel(selector)) {
    if (KEEPS_CANVAS_UNDER_PRINT(one)) {
      assert.ok(
        !excludes(one, 'print'),
        `\`${one}\` keeps its canvas under print, so it must NOT exclude print`,
      );
      continue;
    }
    assert.ok(excludes(one, 'print'), `\`${one}\` must not apply to a print slide`);
  }
  // The four registers that OUT-SPECIFY a frame's own (0,1,1) canvas and repaint it to
  // `var(--bg)`: `section.dark.spectrum-off` (0,2,1), `section.dark:is(.spectrum-edge-…)`
  // (0,3,1) and `section.accent.dark` (0,2,1). Re-pointing `--fin-canvas` across them
  // sends the finish at a color the slide does not paint — measured, 60 mismatches
  // against main's 14 over an 11x11 cross, and a `spectrum: off` deck exported a dark
  // title as an inverse-panel flood. `divider` is exempt from this row: base.variants.css
  // gives it carve-outs that KEEP its canvas under every spectrum value, so it excludes
  // only `print` and `accent`.
  // Per frame, because the frames genuinely differ — each row measured, not assumed.
  // `divider`: base.variants.css gives it (0,3,1) carve-outs that keep --surface-inverse
  // under spectrum-off and spectrum-edge-off, which out-specify BOTH section.accent.dark
  // (0,2,1) and section.print (0,1,1) — so its accent and print exclusions are
  // conditional on no carve-out applying, not blanket.
  // `topic`: two DOM shapes AND a variant. Trackless it restates at (0,2,2) and holds
  // its canvas under everything but the spectrum edges; carrying `ul.tile-track` it is
  // (0,1,1) and loses it as title does — EXCEPT as `.fact`, which restates the canvas at
  // `section.topic.fact` (0,2,1) and so out-specifies `section.print` (0,1,1) and keeps
  // its inverse panel under print. Measured across all seven registers, tracked, plain
  // and dark: fact keeps the panel under print, accent, spectrum-off and all four edges,
  // and loses it only under `.dark` plus one of those six. Hence a third arm carrying
  // the mode-scoped group and no `:not(.print)`.
  const REGISTERS = ['accent', 'spectrum-off', 'spectrum-edge-left', 'spectrum-edge-right', 'spectrum-edge-bottom', 'spectrum-edge-off'];
  const NEEDED = (one) => {
    if (one.includes('.divider')) return ['accent'];   // spectrum carve-outs keep its canvas
    if (one.includes('.topic')) {
      // trackless topic (0,2,2) loses only to the edges; tracked topic (0,1,1) loses
      // to everything, exactly as title/closing do.
      return one.includes(':not(:has(> ul.tile-track))')
        ? ['spectrum-edge-left', 'spectrum-edge-right', 'spectrum-edge-bottom', 'spectrum-edge-off']
        : REGISTERS;
    }
    return REGISTERS;
  };
  for (const one of topLevel(selector)) {
    for (const reg of NEEDED(one)) {
      assert.ok(excludes(one, reg), `\`${one}\` must not apply to a .${reg} slide — it repaints the surface`);
    }
  }
  // AND THE EXCLUSIONS MUST BE MODE-SCOPED. Every repainter but `print` requires
  // `.dark`; excluding them unconditionally demotes --fin-canvas on light decks where
  // nothing repaints, which is #1656's defect on the default path (measured: 9 -> 22
  // mismatches over a no-dark cross). So a register exclusion has to carry `.dark`.
  for (const one of topLevel(selector)) {
    for (const reg of NEEDED(one)) {
      const group = one.match(new RegExp(`:not\\(:where\\(([^)]*\\.${reg}\\b[^)]*)`));
      if (!group) continue;
      assert.match(
        one,
        /:not\(:where\(\.dark/,
        `\`${one}\` excludes .${reg} unconditionally — it must be scoped to .dark, which is what makes the exclusion true`,
      );
    }
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
  assert.ok(
    !/:not\([^)]*\.dark/.test(coverSelector),
    'scoped TO dark, not away from it — `includes(".dark")` alone is satisfied by `:not(.dark)`',
  );
  // The cover rule owes the SAME exclusions as the bookends. It shipped without them and
  // a printed dark cover exported as a full-page rgb(26,26,26) flood — 354,175 pixels
  // against main on a real PDF. The bookend rule two lines up had carried `:not(.print)`
  // since #1656; the asymmetry is exactly what let it through.
  for (const reg of ['print', ...REGISTERS]) {
    assert.ok(excludes(coverSelector, reg), `the accent-cover re-point must not apply to a .${reg} slide`);
  }
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
