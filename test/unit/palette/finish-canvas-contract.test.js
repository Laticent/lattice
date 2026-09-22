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
const BUNDLE = path.join(__dirname, '..', '..', '..', 'dist', 'lattice.css');
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
  // NO RULE MAY MIX A `:has()` ARM WITH A NON-`:has()` ARM, which is the invariant the
  // two blocks exist to hold — and asserting the COUNT would not hold it. Selectors-4
  // invalidates a whole selector list on one unparsable complex selector (`:is()` and
  // `:where()` are the forgiving exceptions; a bare list is not), so a `:has()` arm
  // sharing a list with the bookends takes them down on any renderer that does not know
  // `:has()`. Measured in Chromium 131 with `:has` made unparsable: split, the three
  // bookends hold rgb(0,61,102) and only topic falls; merged, all three drop to
  // rgb(0,29,51). `dist/marp-kit/lattice.css` ships this rule to third-party Marp
  // renderers, so the reach is real.
  //
  // Stated as the invariant rather than `rules.length === 2` deliberately: the count
  // passes a merge back into one list (measured — that mutant passed both gates 4/4
  // before this assertion existed) and fails a legitimate future third block.
  for (const [, sel] of rules) {
    const arms = topLevel(sel);
    const withHas = arms.filter((a) => a.includes(':has('));
    if (!withHas.length || withHas.length === arms.length) continue;
    assert.fail(
      'a `--fin-canvas: var(--surface-inverse)` rule mixes `:has()` and non-`:has()` arms, so a '
        + 'renderer without `:has()` drops the declaration for ALL of them — split them into '
        + `separate blocks:\n  ${arms.join('\n  ')}`,
    );
  }

  // ONE ARM IS THE PRINT FACE ITSELF, and it is recognized by keying ON `.print` rather
  // than by name. `section.print[data-split-role="cover"]` is the de-flood in
  // base.modifiers.css: a split cover's accent field would print as a page of near-black
  // toner, so print repaints it with the bookends' framed panel. Its `--fin-canvas` has
  // to follow, which means applying under print, not excluding it. Keyed on the shape so
  // a second print-face rule is covered without an edit here.
  const IS_PRINT_FACE = (sel) => /^section\.print\b/.test(sel.trim());
  for (const one of topLevel(selector)) {
    if (IS_PRINT_FACE(one)) {
      assert.ok(
        !excludes(one, 'print'),
        `\`${one}\` IS the print face — it must apply under print, not exclude it`,
      );
      assert.match(
        one, /\[data-split-role="cover"\]/,
        `\`${one}\` keys on print with no role stamp — the de-flood it mirrors is keyed on `
          + 'the role, so an unstamped print slide would take the inverse panel it does not paint',
      );
      continue;
    }
    if (KEEPS_CANVAS_UNDER_PRINT(one)) {
      assert.ok(
        !excludes(one, 'print'),
        `\`${one}\` keeps its canvas under print, so it must NOT exclude print`,
      );
      continue;
    }
    assert.ok(excludes(one, 'print'), `\`${one}\` must not apply to a print slide`);
  }
  // NO REGISTER REPAINTS A FRAME'S OWN CANVAS ANY MORE (#2291), and this list being empty
  // is the assertion. Four rules used to: `section.dark.spectrum-off` (0,2,1),
  // `section.dark:is(.spectrum-edge-*)` (0,3,1) and `section.accent.dark` (0,2,1) all
  // out-specified a frame's (0,1,1) canvas, so `--fin-canvas` had to give way to them and
  // every arm below carried a mode-scoped exclusion group naming all six register classes.
  //
  // NONE OF THEM WAS TRYING TO PAINT A CANVAS. Each one draws or removes a BAR — the dark
  // canvas's top hairline, the divider's left rail, the accent stripe — and each restated
  // the color while doing it, one through the `background:` shorthand and one by copying
  // `background-color: var(--bg)` out of the rule it replaced. They declare only what they
  // mean now (`background-image`), so a frame keeps the canvas it paints and the exclusions
  // are gone with them. `:not(.print)` is all that is left, and only where print takes over.
  //
  // If a register is ever given a genuine canvas of its own, this list grows again and the
  // arms below grow a `:not(:where(.dark.<register>))` group with it — mode-scoped, because
  // every repainter of that kind has needed `.dark` to fire.
  const REGISTERS = [];
  const NEEDED = () => REGISTERS;
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

  // ── THE SIX ACCENT COVERS, IN EVERY MODE (#2294) ─────────────────────────────────
  // A cover paints `var(--accent)` in every mode, so the re-point is no longer scoped to
  // `.dark`. It shipped that way with #2293 because that is the mode #2293 broke, and the
  // light, `color-light`, `color-system` and print rows carried the same mismatch — pinned
  // by name in the cross, which is a certificate, not a fix.
  //
  // TWO ARMS, AND THE SPLIT IS THE PRINT ANSWER. `section.print` (0,1,1) is bundled after
  // the five component sheets and takes their accent field, so a printed cover is the deck
  // ground; `section.lat-split-cover` is bundled after `section.print` and keeps its field
  // at the same specificity. Measured, indaco, unstamped: `decision-cover print` is
  // rgb(255,255,255) and `lat-split-cover print` is rgb(26,26,26).
  const accentRules = [...css.matchAll(/([^{}]*)\{\s*--fin-canvas:\s*var\(--accent\)/g)].map((m) => m[1]);
  assert.ok(accentRules.length, 'expected a rule setting `--fin-canvas: var(--accent)` for the accent covers');
  const accentArms = accentRules.flatMap(topLevel);
  const coverSelector = accentArms.join(',');
  for (const cover of [
    '.decision-cover',
    '.compare-code-cover',
    '.compare-split-cover',
    '.list-tabular-cover',
    '.split-panel-cover',
    '.lat-split-cover',
  ]) {
    assert.ok(coverSelector.includes(cover), `${cover} paints var(--accent), so its finish canvas must follow it`);
  }
  // NOT SCOPED TO `.dark` ANY MORE — asserted on the SUBJECT, with the exclusion groups
  // stripped first, because every arm still mentions `.dark` inside `:not(:where(.dark…))`
  // and that mention is the mode-scoping of the exclusion, the opposite of a `.dark` scope
  // on the rule. `includes('.dark')` over the raw string cannot tell the two apart.
  for (const one of accentArms) {
    const subject = one.replace(/:not\((?:[^()]|\([^()]*(?:\([^()]*\)[^()]*)*\))*\)/g, '');
    assert.ok(
      !/\.dark\b/.test(subject),
      `\`${one}\` still scopes the accent re-point to .dark — a cover paints var(--accent) in `
        + 'EVERY mode, and the light half of that is #2294',
    );
  }
  // The exclusions the bookends owe, per arm. The cover rule shipped without them once and
  // a printed dark cover exported as a full-page rgb(26,26,26) flood — 354,175 pixels
  // against main on a real PDF.
  for (const one of accentArms) {
    for (const reg of REGISTERS) {
      assert.ok(excludes(one, reg), `\`${one}\` must not apply to a .${reg} slide — it repaints the surface`);
      assert.match(
        one, /:not\(:where\(\.dark/,
        `\`${one}\` excludes .${reg} unconditionally — a repainter of that kind needs .dark to fire, `
          + 'so an unconditional exclusion demotes --fin-canvas on light decks (#1656, on the default path)',
      );
    }
    // `print` per arm, and the two arms genuinely differ — see the paragraph above.
    if (one.includes('.lat-split-cover')) {
      assert.ok(
        !excludes(one, 'print'),
        `\`${one}\` is declared after section.print in the bundle, so it KEEPS its accent field `
          + 'under print — excluding print there sends --fin-canvas to white over rgb(26,26,26)',
      );
    } else {
      assert.ok(excludes(one, 'print'), `\`${one}\` must not apply to a print slide`);
    }
  }

  // ── THE TWO OTHER CANVASES A FRAME CAN OWN ───────────────────────────────────────
  // Both are gated on an ATTRIBUTE, which is why neither was in this file before: every
  // derivation in the cross walked `ClassSelector` nodes, so `section.split-panel-cover:is(
  // [data-split-mods~="cat-N"])` and the imagery mattes were invisible to it.
  const canvasFor = (token) =>
    [...css.matchAll(new RegExp(`([^{}]*)\\{\\s*--fin-canvas:\\s*var\\(${token}\\)`, 'g'))].map((m) => m[1]);
  const panelFill = canvasFor('--panel-fill');
  assert.strictEqual(panelFill.length, 1, 'split-panel\'s cover paints var(--panel-fill) when the run carries a category');
  assert.match(panelFill[0], /\[data-split-mods~="cat-1"\]/, 'the category tint is keyed on the split mods stamp');
  // NO `:not(.print)`, and that is the mirror of its painter's specificity: at (0,2,1) the
  // tint out-specifies `section.print` (0,1,1) and survives print. Measured, unstamped:
  // `split-panel-cover cat-1 print` paints the tint, not the print ground.
  assert.ok(!excludes(panelFill[0], 'print'), 'the category tint out-specifies section.print, so it must not exclude print');
  for (const reg of REGISTERS) {
    assert.ok(excludes(panelFill[0], reg), `the category tint must not apply to a .${reg} slide`);
  }
  for (const matte of ['--img-matte', '--scene-matte']) {
    const rule = canvasFor(matte);
    assert.strictEqual(rule.length, 1, `expected one rule pointing --fin-canvas at var(${matte})`);
    assert.match(rule[0], /\[data-img-composition="gallery"\]/, `the ${matte} re-point is keyed on the composition stamp`);
    assert.ok(!excludes(rule[0], 'print'), `${matte} is (0,2,1) and out-specifies section.print, so it must not exclude print`);
    for (const reg of REGISTERS) {
      assert.ok(excludes(rule[0], reg), `${matte} must not apply to a .${reg} slide — it repaints the surface`);
      assert.match(rule[0], /:not\(:where\(\.dark/, `${matte}'s .${reg} exclusion must be scoped to .dark`);
    }
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

/**
 * THE SOURCE ORDER OF THE COVER ARMS IS LOAD-BEARING, and nothing checked it.
 *
 * Three arms sit at (0,2,1) and two of them have to BEAT the one before them on order
 * alone: the category tint over the accent field, and print's de-flood over both. Move
 * `D` above `B` and a printed categorical split cover — `<section data-split-role="cover"
 * data-split-mods="cat-3" class="content split-panel-split split-panel-cover form print">`,
 * which `roleOpenTag` stamps in exactly that shape — paints rgb(236,236,236) while
 * `--fin-canvas` resolves to the panel tint. Measured by the HARD RULE #25 checker against
 * a bundle with that one swap: the computed-value cross passed 4/4 and this file passed
 * 4/4, because the cross puts at most ONE attribute on a probe and so never builds the
 * shape where the two rules collide.
 *
 * Asserted on SOURCE POSITION rather than on the cross, because that is where the fact
 * lives — a declaration's position in `base.finish.css` is not a computed value, and the
 * cross cannot reach the collision without a second attribute on the probe.
 */
test('the cover arms stay in the order their specificities require', () => {
  // BOTH the source and the BUILT BUNDLE, because they answer different questions. The
  // source is where an editor moves a rule; the bundle is where the cascade reads it, and
  // `dark-canvas-ownership.test.js` exists because a build step can fold or reorder rules
  // in a way no source-level check can see. All four arms live in one file today, so the
  // two orders agree — asserting only one of them would stop being true the moment they
  // did not.
  for (const [where, file] of [['base.finish.css', FINISH_CSS], ['dist/lattice.css', BUNDLE]]) {
    assertCoverArmOrder(fs.readFileSync(file, 'utf8'), where);
  }
});

/**
 * Ordered by the POSITION OF THE `--fin-canvas` DECLARATION, read with css-tree, not by
 * searching for selector text. In the bundle every one of these selectors also appears as
 * a PAINTER in `base.modifiers.css` hundreds of thousands of characters earlier — and as
 * prose, since this file's comments ship with it — so a text scan reports an order that is
 * not the cascade's. Measured: a first cut of this check read `indexOf('section.print
 * [data-split-role="cover"]')` and found the painter at 556,303 while the arm is at
 * 613,000-something, i.e. it failed a bundle whose order was correct.
 */
function assertCoverArmOrder(css, where) {
  const csstree = require('css-tree');
  const ast = csstree.parse(css, { positions: true });
  const arms = [];
  csstree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      if (node.prelude.type !== 'SelectorList') return;
      const sets = [...node.block.children].some((d) => d.type === 'Declaration' && d.property === '--fin-canvas');
      if (!sets) return;
      arms.push({ at: node.loc.start.offset, sel: csstree.generate(node.prelude) });
    },
  });
  const find = (pred, what) => {
    const hit = arms.find((a) => pred(a.sel));
    assert.ok(hit, `${where}: could not find ${what} among the --fin-canvas rules`);
    return hit.at;
  };
  const accentField = find((x) => x.includes('.list-tabular-cover') && x.includes(':not(.print)'), 'the accent-field arm (A1)');
  const latSplit = find((x) => x === 'section.lat-split-cover', 'the lat-split-cover arm (A2)');
  const categoryTint = find((x) => x.includes('data-split-mods~="cat-1"'), 'the category-tint arm (B)');
  const printFace = find((x) => x.startsWith('section.print[data-split-role="cover"]'), "print's de-flood arm (D)");
  assert.ok(
    categoryTint > accentField,
    `${where}: the category tint (0,2,1) must be declared AFTER the accent field (0,2,1) — they `
      + 'are equal on specificity, so only source order makes the tint win on a split-panel cover '
      + 'carrying cat-N',
  );
  assert.ok(
    printFace > categoryTint && printFace > latSplit,
    `${where}: print's de-flood must be declared LAST — it is (0,2,1) like the tint and higher `
      + "than lat-split-cover's (0,1,1), and it has to beat both on a stamped cover under print",
  );
}

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
