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
  for (let i = 0; i < n; i++) {
    const lineHeight = 12 + Math.round(rand() * 24);
    const lines = 1 + Math.floor(rand() * 8);
    const padBottom = Math.round(rand() * 8);
    const height = lines * lineHeight + padBottom;
    blocks.push({
      id: `${id}-b${i}`,
      role: opts.role ?? ROLES[Math.floor(rand() * ROLES.length)],
      top: y,
      bottom: y + height,
      lineHeight,
      padBottom,
      chars: 20 + Math.floor(rand() * 400),
    });
    y += height + Math.round(rand() * 10);
  }
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
  return {
    boxes: model.boxes.map((box) => {
      let shift = 0;
      const blocks = box.blocks.slice().sort((a, b) => a.top - b.top).map((b) => {
        const act = plan.actions.find((a) => a.blockId === b.id);
        const top = b.top - shift;
        let height = b.bottom - b.top;
        if (act) {
          const newHeight = act.lines * b.lineHeight + (b.padBottom || 0);
          shift += height - newHeight;
          height = newHeight;
        }
        return { ...b, top, bottom: top + height };
      });
      return { ...box, blocks, contentBottom: box.contentBottom - shift };
    }),
  };
}

const SEEDS = Object.freeze(Array.from({ length: 300 }, (_, i) => i * 7919 + 13));

module.exports = { rng, ROLES, makeBox, makeModel, applyToModel, SEEDS };
