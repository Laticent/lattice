/**
 * The model generator for the TRIM metamorphic relations.
 *
 * It lives in its own module for one reason: a relation that fails names a SEED,
 * and a seed is only reproducible if the generator is shared. Re-typing it beside
 * a debug script silently consumes a different number of random draws and
 * produces a different model — which is exactly what happened the first time a
 * relation here went red, and cost a wrong diagnosis.
 *
 * Reproduce one case with:
 *   node -e "const g=require('./test/unit/core/fixtures/guards-trim-model');
 *            console.dir(g.makeModel(23770), {depth:null})"
 */

/** Deterministic LCG. Seeded so a red run is investigable from its seed alone. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const ROLES = Object.freeze([
  'prose', 'list-item', 'caption', 'note',
  'heading', 'value', 'code', 'legal', 'citation',
]);

/**
 * A TRIMMABLE-WEIGHTED draw. Sampling `ROLES` uniformly put a `never` role first in
 * most overflowing boxes, so the planner declined and produced only 24 actions
 * across all 300 seeds — which every anti-vacuity floor in the relations ("checked
 * > 0") was satisfied by, while the arithmetic they exist to pin was exercised a
 * couple of dozen times. Declines still dominate; they are just no longer the whole
 * corpus. The weighting is in the GENERATOR, never in the planner's table.
 */
const TRIM_WEIGHTED = Object.freeze([
  'prose', 'prose', 'prose', 'list-item', 'list-item', 'caption', 'note',
  'heading', 'value', 'code', 'legal', 'citation',
]);

/** One bounded box with blocks stacked in flow inside it. */
function makeBox(rand, id, opts = {}) {
  const top0 = opts.top0 ?? Math.round(rand() * 40);
  const n = opts.blocks ?? 1 + Math.floor(rand() * 6);
  const blocks = [];
  let y = top0;
  // COLUMNS. A generator that only ever stacks blocks cannot exercise the case
  // where two blocks OVERLAP vertically — which is what the measurer emits for any
  // grid or flex layout, because it refuses to treat the container as a text block
  // and walks into its children. A planner that credits one column's recovery
  // against the other passes every single-column relation and is still wrong; that
  // defect shipped and was found by review, not here.
  // Two AND three columns. A cross-column credit is wrong in BOTH directions, and
  // round-robin `i % columns` produced columns of near-equal height in near-equal
  // order — so the corpus only ever presented the earlier column ending above the
  // later one, and a planner that credits only in that direction survived. Three
  // columns with a weighted draw makes the stacks ragged, so both directions occur.
  const columns = opts.columns ?? (rand() < 0.22 ? 2 : rand() < 0.12 ? 3 : 1);
  const colTop = y;
  const colY = new Array(Math.max(1, columns)).fill(colTop);
  const colN = new Array(Math.max(1, columns)).fill(0);
  for (let i = 0; i < n; i++) {
    const lineHeight = 12 + Math.round(rand() * 24);
    const lines = 1 + Math.floor(rand() * 8);
    const padBottom = Math.round(rand() * 8);
    // Top padding and a border DISPLACE the text inside the block. Omitting them
    // made every generated block's height exactly the planner's own formula, so
    // `linesBefore` was exact by construction and the arithmetic was never tested.
    // Up to about three line-heights, because that is what a real card body has:
    // `padding: 30px` against a 20px line.
    //
    // NOTE WHAT THIS DOES AND DOES NOT BUY. Realistic padding makes the planner's
    // top-padding term matter — deleting it changes 18 of 24 line counts. It still
    // does not make any RELATION here fail, and chasing that taught the real lesson:
    // the omission converts actions into declines (`no-height-to-recover` goes 1 to
    // 30), so the planner under-trims rather than mis-fits, and every model-level
    // relation is blind to it by construction. The divergence is model-versus-DOM —
    // the clamped box really occupies `padTop + lines * lh` — so it is the ADAPTER
    // test that catches it, by applying a plan and re-measuring the real box.
    const padTop = opts.padTop ?? Math.round(rand() * lineHeight * 3);
    const height = padTop + lines * lineHeight + padBottom;
    // CHROME below the block — the padding and borders of its own containers, which
    // shrink with it. Every generated block had none, so `outerBottom` was absent
    // from the whole corpus and deleting the planner's chrome term (the fix that
    // ends the sheared card) changed nothing any relation could see.
    const chrome = opts.chrome ?? (rand() < 0.5 ? Math.round(rand() * 40) : 0);
    const col = columns > 1 ? Math.min(columns - 1, Math.floor(rand() * columns)) : 0;
    // EACH COLUMN STACKS, and it did not before: `col > 0` blocks were all pinned to
    // `colTop`, so no second block ever sat BELOW a first one inside a non-first column.
    // That shape is the one the cross-column credit bug needs — a block whose `top`
    // equals another column's `bottom` — and the generator grazed it 9 times in 595
    // boxes, never in a way that made MR3 fire. With per-column stacking MR3 catches it:
    // reverting the planner's flow test to the old vertical-order form turns this suite
    // red. Found by a fourth independent review, which had to hand-build the shape.
    const top = colY[col];
    blocks.push({
      id: `${id}-b${i}`,
      role: opts.role ?? TRIM_WEIGHTED[Math.floor(rand() * TRIM_WEIGHTED.length)],
      top,
      bottom: top + height,
      outerBottom: top + height + chrome,
      lineHeight,
      // THE RENDERER'S OWN LINE COUNT, which the measurer supplies when the block's
      // line boxes are unambiguous and omits when they are not. Emitted for most
      // blocks and withheld for the rest, so BOTH planner paths stay exercised — the
      // measured count and the `round(height / lineHeight)` derivation it replaces.
      ...(rand() < 0.7 ? { lines } : {}),
      // THE BLOCK'S BRANCH OF THE BOX. One column: the box stacks its blocks directly.
      // Several: the box holds one flex ROW (which does not stack) holding the columns
      // (which do). `planBox` reads exactly this to decide whether one clamp lifts
      // another, and a model without it falls back to the vertical-order test.
      ...(columns > 1
        ? { path: [0, col, colN[col]], vstack: [true, false, true] }
        : { path: [i], vstack: [true] }),
      // THE TRUTH, carried separately and never read by the planner. `col` is which
      // vertical stack this block is actually in — the generator KNOWS that, because it
      // built the shape. The oracle judges by `col`; the planner has to derive the same
      // answer from `path`/`vstack`, which is what makes MR3 an oracle rather than a
      // second copy of the code. The previous version of `sameFlowAbove` was a
      // line-for-line transcription of `planBox`'s `liftsAbove`, so a wrong `vstack`
      // would have been wrong in both and invisible to every relation — the exact
      // "the test's oracle re-stacked blocks the same wrong way" retraction this file
      // already records, one level deeper. Found by the maker-checker.
      col,
      padTop,
      padBottom,
      chars: 20 + Math.floor(rand() * 400),
    });
    colY[col] = top + height + chrome + Math.round(rand() * 10);
    colN[col] += 1;
  }
  y = blocks.reduce((m, b) => Math.max(m, b.outerBottom), colTop);
  // THE LIMIT IS DERIVED FROM THE CONTENT, not drawn independently.
  //
  // An independent draw put the limit anywhere in [200, 700] while the content ran
  // wherever it ran, so the overflowing block usually began far BELOW the limit and
  // rule 4 refused it: `mark-would-be-invisible` was 107 of 254 declines and the
  // whole 300-seed corpus produced 34 clamps. A real overflowing slide is one whose
  // content runs a little past its box, which is the case the arithmetic is for.
  // The tail below 1 still generates comfortable fits, and above ~1.1 still generates
  // the hopeless boxes rule 4 must refuse — the distribution moved, the cases did not.
  const limit = opts.limit ?? Math.round(top0 + (0.55 + rand() * 0.75) * (y - top0));
  // A TAIL — content below the deepest text block that the measurer cannot model.
  // A card's bottom padding and border, a grid row gap, a rule under the last line:
  // `measureTrim` classifies innermost TEXT blocks and none of those is one, so the
  // box's measured `contentBottom` runs past the deepest block. Generating boxes
  // where the two are always equal is why every relation passed while the planner
  // cut against the wrong number and shipped an 8px shear on the demo deck's own
  // flagship slide (measured there: model 1531.5, real 1548.8).
  const tail = opts.tail ?? (rand() < 0.45 ? Math.round(rand() * 30) : 0);
  return { id, limit, contentBottom: y + tail, blocks };
}

function makeModel(seed, opts = {}) {
  const rand = rng(seed);
  const boxes = [];
  const n = opts.boxCount ?? 1 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) boxes.push(makeBox(rand, `box${i}`, opts));
  return { boxes };
}

/**
 * Apply a plan to a model the way the DOM would: a clamped block gets shorter and
 * everything after it moves up. This is the test's stand-in for `applyTrim`.
 *
 * HOW INDEPENDENT IT ACTUALLY IS — the honest version. An earlier docblock here
 * claimed it was "deliberately independent" of the planner and modeled "physics, not
 * policy". A second review checked that claim and it does not hold: the two
 * expressions that carry the weight — `linesBefore` and the shift predicate
 * `other.bottom <= b.top` — are the planner's, term for term.
 *
 * So what this oracle CAN catch is a divergence between the planner's decision and
 * the planner's own reflow model — which is real, and is what caught the scalar-shift
 * defect. What it CANNOT catch is that shared model being wrong about a browser:
 * centered or space-between flex, absolutely positioned or sticky blocks, a
 * content-independent grid row. Nothing at this tier can. That is the adapter test's
 * job (`test/integration/parity/guards-trim-adapter.test.js`), and ultimately the
 * apply-re-measure-revert step's, which measures the outcome instead of predicting it.
 */
function applyToModel(model, plan) {
  // The previous version re-stacked every block by one cumulative shift — the same
  // single-column assumption the planner had — so a relation checked against it
  // could not fail on a multi-column model however wrong the planner was. Fixing
  // that made the oracle useful; it did not make it independent (see above).
  //
  // What a browser actually does: clamping a block shortens THAT block, and blocks
  // BELOW it in the same flow move up by the amount recovered. A block beside it
  // does not move. So a block's displacement is the recovery of blocks strictly
  // above it, and the box's content bottom is the maximum over blocks — never a
  // sum.
  return {
    boxes: model.boxes.map((box) => {
      const recovered = new Map();
      for (const a of plan.actions.filter((x) => x.boxId === box.id)) {
        const b = box.blocks.find((x) => x.id === a.blockId);
        if (!b) continue;
        const padTop = b.padTop || 0;
        const padBottom = b.padBottom || 0;
        // The block's REAL line count when it has one. A clamp to N keeps N line
        // boxes, so it removes `(lines - N) * lineHeight` — that is physics, and the
        // rounded derivation is only an estimate of it for a block that never reported
        // its lines.
        const before = b.lines > 0
          ? b.lines
          : Math.max(1, Math.round((b.bottom - b.top - padTop - padBottom) / b.lineHeight));
        recovered.set(b.id, Math.max(0, (before - a.lines) * b.lineHeight));
      }
      // WHAT MOVES WHEN A BLOCK SHRINKS, and `outerBottom <= b.top` is not it. That is
      // a vertical-order test: a block in a DIFFERENT column that merely ends higher
      // satisfies it, and the oracle then credited a lift the browser does not perform —
      // re-encoding the same assumption the planner had, which is how MR3 stayed green
      // while a hand-built two-up came back 16px over. A block moves only when a block
      // ABOVE IT IN THE SAME FLOW shrinks: the branches must diverge at a level whose
      // container stacks its children vertically, with the shrinking block on the
      // earlier side. This is physics, not the planner's policy — reverting the PLANNER
      // to the vertical-order form now turns MR3 red, which is the whole point of an
      // oracle that does not share the code's assumptions.
      // WHAT MOVES WHEN A BLOCK SHRINKS, judged from the shape the generator BUILT.
      //
      // `o.outerBottom <= b.top` alone is a vertical-order test: a block in a DIFFERENT
      // column that merely ends higher satisfies it, and the oracle then credits a lift
      // the browser does not perform. A block moves only when a block above it IN THE
      // SAME VERTICAL STACK shrinks — and `col` says which stack a block is in, as a
      // fact the generator wrote down rather than a property either side re-derives.
      // The planner must reach the same answer from `path`/`vstack`; reverting it to the
      // vertical-order form turns MR3 red, and a wrong `stacksVertically` would too.
      const sameFlowAbove = (o, b) => {
        if (!(o.outerBottom <= b.top)) return false;
        // Out of the normal flow: it does not move, and shrinking it frees nothing.
        if (o.inFlow === false || b.inFlow === false) return false;
        if (Number.isInteger(o.col) && Number.isInteger(b.col)) return o.col === b.col;
        return true;                                   // a model with no columns: one stack
      };
      const shiftOf = (b) => box.blocks.reduce((sum, o) =>
        (sameFlowAbove(o, b) ? sum + (recovered.get(o.id) || 0) : sum), 0);
      const blocks = box.blocks.map((b) => {
        const top = b.top - shiftOf(b);
        const height = (b.bottom - b.top) - (recovered.get(b.id) || 0);
        // The block's own chrome travels with it — that is what makes it the block's.
        const chrome = (b.outerBottom ?? b.bottom) - b.bottom;
        return { ...b, top, bottom: top + height, outerBottom: top + height + chrome };
      });
      // The tail travels with the deepest block — it is that block's container's own
      // chrome — so it is re-added after the reflow rather than dropped. Measured
      // from the ORIGINAL box, which is the only place it is observable.
      const deepest = box.blocks.reduce((m, b) => Math.max(m, b.outerBottom), -Infinity);
      const tail = box.blocks.length ? Math.max(0, box.contentBottom - deepest) : 0;
      const contentBottom = blocks.reduce((m, b) => Math.max(m, b.outerBottom + tail), box.limit);
      return { ...box, blocks, contentBottom };
    }),
  };
}

const SEEDS = Object.freeze(Array.from({ length: 300 }, (_, i) => i * 7919 + 13));

module.exports = { rng, ROLES, TRIM_WEIGHTED, makeBox, makeModel, applyToModel, SEEDS };
