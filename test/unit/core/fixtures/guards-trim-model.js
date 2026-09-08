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

/** One bounded box with blocks stacked in flow inside it. */
function makeBox(rand, id, opts = {}) {
  const limit = opts.limit ?? Math.round(200 + rand() * 500);
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
  const columns = opts.columns ?? (rand() < 0.3 ? 2 : 1);
  const colTop = y;
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
    const col = columns > 1 ? i % columns : 0;
    const top = columns > 1 && col > 0 ? colTop : y;
    blocks.push({
      id: `${id}-b${i}`,
      role: opts.role ?? ROLES[Math.floor(rand() * ROLES.length)],
      top,
      bottom: top + height,
      lineHeight,
      padTop,
      padBottom,
      chars: 20 + Math.floor(rand() * 400),
    });
    if (col === 0) y = top + height + Math.round(rand() * 10);
  }
  y = blocks.reduce((m, b) => Math.max(m, b.bottom), colTop);
  return { id, limit, contentBottom: y, blocks };
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
 * everything after it moves up. This is the test's stand-in for `applyTrim`, and
 * it is deliberately independent of it — a relation checked with the code under
 * test as its own oracle proves nothing.
 */
function applyToModel(model, plan) {
  // PHYSICS, NOT POLICY. The previous version re-stacked every block by one
  // cumulative shift — the same single-column assumption the planner had — so a
  // relation checked against it could not fail on a multi-column model however
  // wrong the planner was. That is the shape of oracle that proves nothing, and
  // this file's own docblock claimed independence it did not have.
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
        const before = Math.max(1, Math.round((b.bottom - b.top - padTop - padBottom) / b.lineHeight));
        recovered.set(b.id, Math.max(0, (before - a.lines) * b.lineHeight));
      }
      const shiftOf = (b) => box.blocks.reduce((sum, o) =>
        (o.bottom <= b.top ? sum + (recovered.get(o.id) || 0) : sum), 0);
      const blocks = box.blocks.map((b) => {
        const top = b.top - shiftOf(b);
        const height = (b.bottom - b.top) - (recovered.get(b.id) || 0);
        return { ...b, top, bottom: top + height };
      });
      const contentBottom = blocks.reduce((m, b) => Math.max(m, b.bottom), box.limit);
      return { ...box, blocks, contentBottom };
    }),
  };
}

const SEEDS = Object.freeze(Array.from({ length: 300 }, (_, i) => i * 7919 + 13));

module.exports = { rng, ROLES, makeBox, makeModel, applyToModel, SEEDS };
