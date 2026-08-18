/**
 * lib/core/rough-ink.js — the GEOMETRY half of the sketch finish's drawn lines.
 *
 * Turns a MEASURED PLAN (plain numbers: a box, the interior row/column
 * boundaries inside it) into SVG path `d` strings drawn by rough.js. Pure and
 * DOM-free, so it runs identically in Node (the `lattice-emulator.js` export
 * path measures in the page, generates here) and in the browser bundle (the
 * live runtime does both in one tick) — HARD RULE #1, one source of truth for
 * a line's shape.
 *
 * WHY ROUGH.JS AND NOT MORE CSS
 * -----------------------------
 * The finish shipped in 2026-06 with two FAKED primitives, because the
 * authentic look was believed to be unavailable:
 *
 *   · a hand-drawn BOX = an asymmetric `border-radius` + an offset `box-shadow`;
 *   · a hand-drawn LINE = `--sketch-wave`, one sine path used as a TILING mask.
 *
 * Both are visibly synthetic at boardroom scale. The tiled wave is the worse
 * of the two: constant amplitude, constant frequency, mathematically periodic —
 * it reads as a word-processor squiggle, not a pen. Worse, it was applied per
 * `td`, so the tile RE-PHASED at every column seam and a single table rule
 * visibly broke mid-run. Meanwhile the frame around it stayed a smooth rounded
 * rectangle with perfectly straight edges and the column rules were never
 * roughened at all — three different line languages inside one table.
 *
 * The 2026-06-11 decision record vetoed the real thing for a specific and
 * CORRECT reason: an SVG `filter` (`feTurbulence` + `feDisplacementMap`)
 * collapses the print-scale transform, so the slide shrinks in the PDF.
 *
 * That veto does not reach rough.js. **Rough.js uses no filter.** It emits
 * plain `<path d="…">`, which is the same primitive Mermaid's `look:'handDrawn'`
 * has been shipping through this repo's Chromium→PDF pipeline since
 * 2026-08-13 (lib/core/diagram-look.js). The proof was already on the slide
 * next door: a `mode: sketch` deck rendered a genuinely hand-drawn flowchart
 * beside a CSS-faked table.
 *
 * THE TECHNIQUE, and where it comes from
 * --------------------------------------
 * Modeled on `rough-table` (MIT, github.com/h-kono-it/rough-table), which
 * solves exactly the seam bug above. Its load-bearing idea is its `solid` mode:
 * a row rule is ONE line spanning the whole structure (`rc.line(0, y, W, y)`),
 * not one segment per cell, and a column rule is ONE full-height line per
 * unique x (deduped through a Set). One stroke per boundary is what makes the
 * hand read continuous. The real CSS borders are switched off and an
 * absolutely-positioned SVG carries every line.
 *
 * Lattice differs from `rough-table` in one place, deliberately: it does NOT
 * wrap each structure in a container. Wrapping a `<table>` would break every
 * `section.X > table` component selector in the engine. Instead there is ONE
 * overlay per `<section>` — the slide is already `position: relative` and
 * `isolation: isolate` (base.elements.css) — and each structure's lines are
 * emitted in section coordinates. See lib/core/rough-ink-dom.js.
 *
 * DETERMINISM IS A REQUIREMENT, NOT A NICETY
 * ------------------------------------------
 * A PDF baseline, `tools/pixel-check.js` and the screenshot tier all diff
 * renders of the same deck. rough.js is seeded (`Options.seed`), and every
 * line here derives its seed from the structure's stable KEY plus its index —
 * so two renders of one deck are byte-identical, while two lines in one table
 * still get different hands. Never call `rough.newSeed()` on this path.
 *
 * engineering/decisions/2026-08-18-rough-ink.md
 */

const rough = require('roughjs');

/**
 * The drawn-line character. Tuned by eye against `examples/sketch.md` at
 * 2560×1440 — these are ABSOLUTE pixel amounts in the slide's own coordinate
 * space, not ratios, which is why they are stated once here rather than
 * per-caller.
 *
 * `roughness` is how far the stroke wanders off true; `bowing` is how much it
 * bends along its run.
 *
 * BOWING IS NOT NORMALIZED BY LENGTH — this is the one thing to know before
 * touching these numbers, and getting it backwards is what the first two
 * attempts here did. Rough.js computes the mid-point displacement as
 * `bowing * maxRandomnessOffset * (x1 - x2) / 200`, so it scales LINEARLY with
 * the line's length. A `bowing` that looks like a pleasant curve on a 150px
 * segment becomes a 30px sag across a 1700px slide rule — and because the
 * stroke is drawn twice, the two passes bow apart and close at the ends,
 * leaving a lens-shaped gap down the middle of every rule. Measured: at
 * roughness 1.4 / bowing 2.8 the row rules of a full-width table sagged
 * through the text of the row above.
 *
 * So a table rule wants LOW bowing and moderate roughness. The values below
 * hold total deviation to roughly 3–4px whatever the span — about what a
 * steady hand does against a straightedge, and proportionally more character
 * on a short line than a long one, which is also what a hand does.
 *
 * Rough.js draws each line TWICE by default (`disableMultiStroke` off). At
 * this bowing the two passes stay close and read as one inked stroke with
 * weight variation, which is most of what sells the hand. It stays on.
 */
const ROUGH_INK = Object.freeze({
  roughness: 1.8,
  bowing: 0.5,
  // Interior rules are drawn lighter than the frame so a dense table does not
  // read as a wall of equal-weight ink — a hand ruling a table bears down on
  // the outline and skims the rules. Multipliers on the measured stroke width,
  // so a theme that thickens its borders still scales.
  frameWeight: 0.85,
  ruleWeight: 0.7,
});

/**
 * Structures the finish draws lines for, and the SHAPE of each one's line set.
 *
 * The `kind` is the whole contract between this registry and the measurer in
 * lib/core/rough-ink-dom.js:
 *
 *   grid       frame + interior row boundaries, from a real `<table>`'s `tr`s
 *              (compare-table / glossary / obligation-matrix). Column rules
 *              are OPT-IN — see below.
 *   ledger     frame + interior row boundaries, from a list's `:scope > li`
 *              (list-tabular's `ol`). Same lines as `grid`; the difference is
 *              only where the rows are read from.
 *   rows       interior row boundaries only, no frame (list.principles)
 *   mid        ONE line through the middle of the box (an `<hr>` — the box IS
 *              the rule, so its centerline is where the ink goes)
 *   underline  ONE line along the BOTTOM EDGE of the box (a band whose
 *              `border-bottom` is the rule — the masthead↔stage divider)
 *
 * Every selector carries its `.cell-stage >` twin where the component has one:
 * mastheadLift wraps a Form slide's flow in that cell, so a selector without
 * the twin silently matches nothing on exactly the slides that have a masthead
 * (base.modifiers.css §"Every rule below is duplicated with a `.cell-stage >` arm").
 *
 * ORDER MATTERS for nothing here — each entry paints into the same overlay and
 * the sets do not overlap — but `divider` deliberately excludes `.masthead-rule`,
 * which is a real `<hr>` the masthead emits for the `rule-short` / `rule-accent`
 * finishes (base.accent-finish.css) and which `masthead-rule` below owns.
 *
 * COLUMN RULES ARE OPT-IN, AND NOTHING SHIPPED OPTS IN. `grid` measures column
 * boundaries only when the structure sets `--rough-ink-cols: 1`, and no
 * component does. That is not an oversight — it is the finish's own governing
 * rule, stated at the top of base.sketch.css: *the finish roughens lines the
 * deck draws; it never invents one*. Checked against the three table
 * components, and none of them rules columns: compare-table and glossary
 * declare no vertical border at all, and obligation-matrix's only one is a
 * `6px double var(--accent)` fold marker that carries MEANING and must never
 * be flattened into a plain ink line.
 *
 * The first version of this module drew every column anyway, and the result
 * was instructive: a horizontally-ruled comparison table became a full
 * spreadsheet grid. The capability stays because a table that genuinely rules
 * columns is a normal thing to want and the measurement is already written —
 * but turning it on is a per-component design decision, made in CSS, not a
 * default of the ink.
 */
const ROUGH_INK_STRUCTURES = Object.freeze([
  {
    id: 'table',
    kind: 'grid',
    sel:
      'section.sketch.compare-table table,' +
      'section.sketch.glossary table,' +
      'section.sketch.obligation-matrix table',
  },
  {
    id: 'tabular',
    kind: 'ledger',
    sel:
      'section.sketch.list-tabular > ol,' +
      'section.sketch.list-tabular > .cell-stage > ol',
  },
  {
    id: 'principles',
    kind: 'rows',
    sel:
      'section.sketch.list.principles > ol,' +
      'section.sketch.list.principles > .cell-stage > ol',
  },
  {
    id: 'divider',
    kind: 'mid',
    sel: 'section.sketch hr:not(.masthead-rule)',
  },
  {
    // The masthead↔stage divider, and the REASON the sketch `h2` no longer
    // draws its own underline. The finish used to bend the heading's own
    // `border-bottom` into a wobble — which left TWO rules stacked under every
    // masthead heading: the hand-drawn one under the words, and this
    // machine-straight `1px solid var(--border)` hairline ~50px below it
    // (lib/forms/cell/masthead/masthead.css). One slide, two line languages.
    // The band's own rule is the structural one, so it is the one that gets
    // the hand; the heading's bespoke underline is retired.
    id: 'masthead',
    kind: 'underline',
    sel: 'section.sketch.form .cell-masthead',
  },
  {
    // `underline`, not `mid`: the element is `content-box` sized with a
    // `padding-top` gap above the visible segment (base.accent-finish.css), so
    // its centerline lands in the padding. Its bottom edge is the rule.
    id: 'masthead-rule',
    kind: 'underline',
    sel: 'section.sketch.form .cell-masthead .masthead-rule',
  },
  {
    // The agenda ledger's "you are here" rule. The selector here is only the
    // broad prefilter — WHICH row is active is decided by the `progress-N` +
    // `nth-child` chain in base.sketch.css, which sets `--rough-ink-stroke` on
    // exactly one `li`. Every other row is filtered out by the empty-stroke
    // test in `measureRoughInk`, and keeps its dotted leader.
    //
    // `underline` works on a pseudo-element's rule without measuring the
    // pseudo: agenda.styles.css pins that `::after` to `left:0; right:0;
    // bottom:0` of the row, so the row's own bottom edge is the rule's line.
    // One selector, not the usual pair: the `ol` here is a DESCENDANT
    // combinator, so it already reaches through a `.cell-stage` wrapper the
    // way agenda.styles.css's own rules do. Adding the explicit twin would
    // match the same elements a second time.
    id: 'agenda-active',
    kind: 'underline',
    sel: 'section.sketch.agenda ol > li',
  },
]);

/** Which kinds draw a frame rectangle. Read by the measurer AND the painter. */
const ROUGH_INK_FRAMED = Object.freeze(new Set(['grid', 'ledger']));

/**
 * A stable 31-bit seed from a string. FNV-1a — chosen because it is four lines,
 * has no dependency, and (unlike `hashCode`-style sums) does not collide on the
 * short, structured, mostly-shared keys this is fed ("table:0:h3" vs
 * "table:0:h4"), where a weak mixer would hand adjacent rules the same hand.
 *
 * `>>> 0` after each step keeps it in unsigned 32-bit; the final `& 0x7fffffff`
 * keeps it positive, because rough.js seeds its PRNG with the raw number and a
 * negative seed silently degenerates to a much shorter cycle.
 */
function inkSeed(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h & 0x7fffffff;
}

/**
 * One measured structure → the SVG paths that draw it.
 *
 * @param {object} plan  from `measureRoughInk` (lib/core/rough-ink-dom.js):
 *   {string} key        stable identity, e.g. "table:0" — seeds the hand
 *   {string} kind       one of the kinds documented on ROUGH_INK_STRUCTURES
 *   {number} x, y       the structure's offset inside its `<section>`
 *   {number} w, h       the structure's border box
 *   {number[]} hLines   interior horizontal boundaries, structure-relative y
 *   {number[]} vLines   interior vertical boundaries, structure-relative x
 *   {string} stroke     resolved ink color (already a real color, read from
 *                       computed style — this module never resolves a token)
 *   {number} strokeWidth
 * @returns {Array<{d:string, stroke:string, strokeWidth:number}>} in SECTION
 *   coordinates (x/y already folded in), ready to hand to the painter.
 */
function pathsForPlan(plan) {
  const gen = rough.generator();
  const out = [];
  const base = {
    stroke: plan.stroke,
    roughness: ROUGH_INK.roughness,
    bowing: ROUGH_INK.bowing,
    // A rough "fill" is a bundle of stroked hachure lines, which is emphatically
    // not what a table frame wants — the frame is an outline and nothing else.
    // Stated rather than left to the default so a future options change cannot
    // quietly start hatching every table on every sketch deck.
    fill: undefined,
  };

  const emit = (drawable, weight) => {
    for (const p of gen.toPaths(drawable)) {
      // rough.js reports the stroke width it resolved; we override with our own
      // weighted value so `frameWeight`/`ruleWeight` actually reach the DOM.
      out.push({
        d: shiftPath(p.d, plan.x, plan.y),
        stroke: plan.stroke,
        strokeWidth: plan.strokeWidth * weight,
      });
    }
  };

  if (ROUGH_INK_FRAMED.has(plan.kind)) {
    // Inset by half the stroke so the drawn frame sits ON the structure's edge
    // rather than half outside it — the same reason an SVG `rect` stroke is
    // inset. Without it the frame's left edge lands half a stroke into the
    // section's padding, and on a full-bleed table that is visibly off-frame.
    const i = (plan.strokeWidth * ROUGH_INK.frameWeight) / 2;
    emit(
      gen.rectangle(i, i, Math.max(0, plan.w - i * 2), Math.max(0, plan.h - i * 2), {
        ...base,
        strokeWidth: plan.strokeWidth * ROUGH_INK.frameWeight,
        seed: inkSeed(plan.key + ':frame'),
      }),
      ROUGH_INK.frameWeight,
    );
  }

  plan.hLines.forEach((y, i) => {
    emit(
      gen.line(0, y, plan.w, y, {
        ...base,
        strokeWidth: plan.strokeWidth * ROUGH_INK.ruleWeight,
        seed: inkSeed(`${plan.key}:h${i}`),
        // Interior rules keep their endpoints exactly on the structure's edges.
        // Without this rough.js overshoots each end by a few px, and inside a
        // framed table that overshoot pokes THROUGH the frame — an artifact, not
        // a hand. The frame itself keeps its overshoot, where it reads as a
        // drawn corner.
        preserveVertices: true,
      }),
      ROUGH_INK.ruleWeight,
    );
  });

  plan.vLines.forEach((x, i) => {
    emit(
      gen.line(x, 0, x, plan.h, {
        ...base,
        strokeWidth: plan.strokeWidth * ROUGH_INK.ruleWeight,
        seed: inkSeed(`${plan.key}:v${i}`),
        preserveVertices: true,
      }),
      ROUGH_INK.ruleWeight,
    );
  });

  return out;
}

/**
 * Translate an SVG path `d` by (dx, dy).
 *
 * Rough.js emits ONLY absolute `M` and `C` commands with space/comma separated
 * numbers — no arcs, no relative commands, no implicit repeats — so a
 * coordinate-pair walk over the numeric tokens is exact here, and this is not a
 * general-purpose path transformer. It is used instead of wrapping each
 * structure in an `<svg>` of its own (one node per table) or in a `<g
 * transform>` (which would scale the stroke under the export's SVG flattening
 * pass, lattice-emulator.js `flattenSvgStyles`).
 *
 * The pairing is positional: within a command's argument list, index 0,2,4… are
 * x and 1,3,5… are y. That holds for M and C and for nothing else, which is why
 * an unexpected command letter throws rather than silently mis-translating.
 */
function shiftPath(d, dx, dy) {
  if (!dx && !dy) return d;
  let n = -1;
  // The NUMBER branch is first, and the order is load-bearing: an exponent
  // literal like `1e-3` starts with a digit, so a leading `[A-Za-z]` branch
  // matches `1`, then meets `e` and reads it as a path command. Trying the
  // number first consumes `1e-3` whole; `M`/`C` cannot match the number
  // pattern, so they still fall through to the letter branch.
  return d.replace(/-?\d*\.?\d+(?:e-?\d+)?|[A-Za-z]/g, (tok) => {
    // ANCHORED, and that matters: `/[A-Za-z]/.test()` is a CONTAINS check, so
    // an exponent literal like `1e-3` — a number the branch above matched
    // whole — tests true on its `e` and gets rejected as a bad command.
    if (/^[A-Za-z]$/.test(tok)) {
      if (tok !== 'M' && tok !== 'C') {
        throw new Error(`rough-ink: unexpected path command "${tok}" — shiftPath handles M/C only`);
      }
      n = -1;
      return tok;
    }
    n += 1;
    const v = parseFloat(tok) + (n % 2 === 0 ? dx : dy);
    // 3dp is well under a device pixel at export scale and keeps the emitted
    // path (and therefore the PDF, and therefore every pixel diff) stable
    // against float noise in the measured geometry.
    return String(Math.round(v * 1000) / 1000);
  });
}

module.exports = {
  ROUGH_INK,
  ROUGH_INK_STRUCTURES,
  ROUGH_INK_FRAMED,
  inkSeed,
  pathsForPlan,
  shiftPath,
};
