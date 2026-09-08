/**
 * Metamorphic relations for `planTrim` — the TRIM policy (guards-trim.js).
 *
 * WHY METAMORPHIC, AND NOT EXAMPLE-BASED. The investigation behind this feature
 * (`engineering/decisions/2026-09-07-overflow-guards-trim.md`) produced six review
 * passes and every one retracted a load-bearing number. The reason was structural,
 * not careless: each claim was checked by a bespoke detector written by whoever
 * wanted the answer, against a browser harness with no oracle. Two of those
 * detectors reported the flattering result — one said zero failures where there
 * were nineteen, because it asked whether a clamped element's content exceeds its
 * box, which is true of every trim.
 *
 * A metamorphic relation needs no oracle. It does not ask "is this plan right?" —
 * a question nobody could answer without re-implementing the thing under test. It
 * asks "when the input changes THIS way, must the output change THAT way?", which
 * is checkable even where the correct output is unknown. Each relation below is a
 * defect that actually happened, turned into a property.
 *
 * The generator produces models directly, so these run at unit speed with no
 * browser. What a browser tier still owes: that `measureTrim` reports the box
 * faithfully and `applyTrim` does what the plan says. Those are separate, smaller
 * claims and they are NOT covered here — see the note's open problems.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { planTrim, trimClassOf, trimRecord, TRIM_TOLERANCE, FIT_EPSILON } = require('../../../lib/core/guards-trim');

// A LITERAL, not the module's own constant.
//
// MR3 and MR13 asserted against the imported `FIT_EPSILON`, so widening the
// constant widened the assertions in lock-step: setting it back to 12 — which
// restores the exact defect that shipped a sheared card — left all 16 relations
// green. A test that imports its own tolerance from the code under test certifies
// whatever that code currently believes. Measured: at 12, four boxes are claimed
// FIT while still over by up to 11px; at 0.5, none are.
const FIT_PX = 0.5;

const { makeModel, applyToModel, SEEDS, rng } = require('./fixtures/guards-trim-model');

// ── MR1 · determinism ────────────────────────────────────────────────────────
// The policy must not depend on anything but its input. A measured pass whose
// answer moves between runs cannot be reviewed, and the note's corpus numbers did
// move between prototype versions without anyone noticing.
test('MR1 determinism — the same model always yields the same plan', () => {
  for (const seed of SEEDS) {
    const model = makeModel(seed);
    assert.deepEqual(planTrim(model), planTrim(model), `seed ${seed}`);
  }
});

// ── MR2 · idempotence ────────────────────────────────────────────────────────
// Running the guard on its own output must be a no-op. A guard that keeps finding
// work is a guard that keeps removing content, and it is how a DOM-writing pass
// driven by a DOM observer becomes a loop (see fit-sweep.js for the precedent).
test('MR2 idempotence — re-planning an already-trimmed model finds nothing', () => {
  for (const seed of SEEDS) {
    const model = makeModel(seed);
    const plan = planTrim(model);
    if (!plan.actions.length) continue;
    const after = applyToModel(model, plan);
    const again = planTrim(after);
    assert.equal(again.actions.length, 0,
      `seed ${seed}: second pass wanted ${again.actions.length} more trims`);
  }
});

// ── MR3 · fit or change nothing ──────────────────────────────────────────────
// RULE 5, and the one that matters most. A prototype destroyed content on 46 of
// 98 touched slides AND left them overflowing anyway. Trimming is only worth its
// cost if it buys the fit; a plan that does not must emit nothing at all.
test('MR3 fit-or-nothing — every planned box fits after, and a declined box is untouched', () => {
  for (const seed of SEEDS) {
    const model = makeModel(seed);
    const plan = planTrim(model);
    const after = applyToModel(model, plan);

    for (const boxId of plan.fits) {
      const box = after.boxes.find((b) => b.id === boxId);
      // FIT_EPSILON, not TRIM_TOLERANCE. This relation used to accept a residual of
      // up to 12px — the alarm's measurement slack — and that is exactly the defect a
      // second independent review found in the shipped render: page 2 of the demo
      // deck was declared FITTING with 8px still outside its clip cell, enough to
      // shear the card's bottom border, and because 8px is also under the probe's
      // slack the guard then silenced the overflow warning about it. A relation that
      // tolerates the bug cannot catch the bug.
      assert.ok(box.contentBottom - box.limit <= FIT_PX,
        `seed ${seed}: box ${boxId} was planned as fitting but still overflows by ` +
        `${box.contentBottom - box.limit}px`);
    }
    for (const d of plan.declines) {
      const touched = plan.actions.filter((a) => a.boxId === d.boxId);
      assert.equal(touched.length, 0,
        `seed ${seed}: declined box ${d.boxId} still had ${touched.length} actions — ` +
        `content destroyed without buying the fit`);
    }
  }
});

// ── MR4 · no-op on content that already fits ─────────────────────────────────
// A fitting slide must be byte-identical to one rendered before this feature
// existed. Anything else makes `guards:` a rendering change rather than a guard.
test('MR4 no-op — a model where nothing overflows produces an empty plan', () => {
  for (const seed of SEEDS.slice(0, 100)) {
    const model = makeModel(seed);
    // raise every limit above its content
    for (const box of model.boxes) box.limit = box.contentBottom + TRIM_TOLERANCE + 1;
    const plan = planTrim(model);
    assert.equal(plan.actions.length, 0, `seed ${seed}`);
    assert.equal(plan.declines.length, 0, `seed ${seed}`);
  }
});

// ── MR5 · the never-class is never touched ───────────────────────────────────
// §6's whole argument. An ellipsis on a KPI value, a citation, a formula or a
// line of code states something false, and the failure is silent — the deck looks
// better than the truth. The default for an unclassified role is `never`, so this
// relation also pins the default.
test('MR5 role gate — no action ever targets a block that is not trim-classed', () => {
  for (const seed of SEEDS) {
    const model = makeModel(seed);
    const plan = planTrim(model);
    const roleOf = new Map();
    for (const box of model.boxes) for (const b of box.blocks) roleOf.set(b.id, b.role);
    for (const a of plan.actions) {
      assert.equal(trimClassOf(roleOf.get(a.blockId)), 'trim',
        `seed ${seed}: trimmed a ${roleOf.get(a.blockId)} block`);
    }
  }
});

test('MR5b an unknown role defaults closed', () => {
  assert.equal(trimClassOf('something-nobody-classified'), 'never');
  assert.equal(trimClassOf(undefined), 'never');
  const model = { boxes: [{
    id: 'b', limit: 100, contentBottom: 400,
    blocks: [{ id: 'x', role: 'not-a-real-role', top: 0, bottom: 400, lineHeight: 20, padBottom: 0, chars: 99 }],
  }] };
  assert.equal(planTrim(model).actions.length, 0);
});

// ── MR6 · the mark must be visible ───────────────────────────────────────────
// §4d. A block sitting wholly below the box bottom can be clamped into perfect
// invisibility: content gone, ellipsis off-screen, slide looks finished. That hit
// 19 of 81 stressed gallery slides. Every clamp must leave at least one line of
// its own block above the limit, which is where the ellipsis lands.
test('MR6 visible mark — every clamped block keeps a line above the box limit', () => {
  for (const seed of SEEDS) {
    const model = makeModel(seed);
    const plan = planTrim(model);
    const after = applyToModel(model, plan);
    for (const a of plan.actions) {
      const box = after.boxes.find((b) => b.id === a.boxId);
      const block = box.blocks.find((b) => b.id === a.blockId);
      // The rule is over the block's TEXT top (`top + padTop`) with its bottom
      // padding reserved — not over its border-box top. Omitting both terms is why
      // weakening rule 4 to `textTop >= box.limit` changed 28 of 300 plans and left
      // this relation green: with padding up to three line-heights, a mark planned
      // below the limit still satisfied the weaker form.
      const textTop = block.top + (block.padTop || 0);
      assert.ok(textTop + block.lineHeight <= box.limit - (block.padBottom || 0),
        `seed ${seed}: ${a.blockId} clamped with its first line at ${textTop} but the ` +
        `box limit is ${box.limit} — the ellipsis would be off-screen`);
    }
  }
});

// ── MR7 · monotonicity, and the naive form of it is FALSE ──────────────────
// The obvious relation — "a taller box never needs more trims" — is wrong here,
// and finding that out is why this file exists. Reproduced at seed 23770: the
// short box declines because its only trimmable block starts BELOW the limit, so
// rule 4 refuses to put an invisible mark on it; raising the limit by 120px makes
// that same block partly visible and therefore eligible, so the taller box plans
// one trim where the shorter planned none.
//
// That is correct behavior. Raising a limit can ENABLE a trim, because
// eligibility depends on the mark being visible, not only on how much overflow
// there is. Rule 5 compounds it: a plan that cannot reach fit is discarded whole,
// so more overflow can mean FEWER actions, not more.
//
// What is genuinely monotone is the outcome, not the effort:
test('MR7a fit monotonicity — a box that fits at one limit still fits at a taller one', () => {
  for (const seed of SEEDS) {
    const base = makeModel(seed);
    const taller = { boxes: base.boxes.map((b) => ({ ...b, limit: b.limit + 120 })) };
    const fitsShort = new Set(planTrim(base).fits);
    const fitsTall = new Set(planTrim(taller).fits);
    for (const id of fitsShort) {
      const box = taller.boxes.find((b) => b.id === id);
      const stillOver = box.contentBottom - box.limit > TRIM_TOLERANCE;
      assert.ok(fitsTall.has(id) || !stillOver,
        `seed ${seed}: box ${id} fitted at the shorter limit but was declined at the taller one`);
    }
  }
});

test('MR7b effort monotonicity — among boxes that fit at both limits, taller costs no more', () => {
  for (const seed of SEEDS) {
    const base = makeModel(seed);
    const taller = { boxes: base.boxes.map((b) => ({ ...b, limit: b.limit + 120 })) };
    const pShort = planTrim(base);
    const pTall = planTrim(taller);
    const both = new Set(pShort.fits.filter((id) => pTall.fits.includes(id)));
    const cost = (plan, id) => plan.actions
      .filter((a) => a.boxId === id)
      .reduce((n, a) => n + (a.linesBefore - a.lines), 0);
    for (const id of both) {
      assert.ok(cost(pTall, id) <= cost(pShort, id),
        `seed ${seed}: box ${id} cost ${cost(pTall, id)} lines at the taller limit ` +
        `vs ${cost(pShort, id)} at the shorter`);
    }
  }
});

// ── MR8 · shrink only ────────────────────────────────────────────────────────
// A trim removes lines. If a "trim" ever grew a block, the pass would be a layout
// change wearing a guard's name.
test('MR8 shrink-only — every action strictly reduces its block, and never below one line', () => {
  for (const seed of SEEDS) {
    const plan = planTrim(makeModel(seed));
    for (const a of plan.actions) {
      assert.ok(a.lines >= 1, `seed ${seed}: ${a.blockId} clamped to ${a.lines} lines`);
      assert.ok(a.lines < a.linesBefore,
        `seed ${seed}: ${a.blockId} "trimmed" from ${a.linesBefore} to ${a.lines} lines`);
    }
  }
});

// ── MR9 · input-order invariance ─────────────────────────────────────────────
// The policy sorts by geometry, not by the order the measurer happened to walk
// the DOM. The first prototype picked "the block that crosses the edge" by
// document order and cut an innocent caption in a multi-column layout while the
// real offender stayed whole.
test('MR9 order invariance — shuffling the block array does not change the plan', () => {
  for (const seed of SEEDS) {
    const model = makeModel(seed);
    const rand = rng(seed ^ 0x5f3759df);
    const shuffled = { boxes: model.boxes.map((box) => ({
      ...box,
      blocks: box.blocks.slice().sort(() => rand() - 0.5),
    })) };
    assert.deepEqual(planTrim(shuffled), planTrim(model), `seed ${seed}`);
  }
});

// ── MR10 · translation invariance ────────────────────────────────────────────
// Coordinates are relative to nothing in particular. A rule that reads an
// absolute page position works in the emulator's viewport and breaks in a
// scrolled filmstrip — the class of bug that made the Playground and the Studio
// disagree about which slides overflow.
test('MR10 translation invariance — offsetting every coordinate changes nothing', () => {
  for (const seed of SEEDS) {
    const model = makeModel(seed);
    const D = 1337;
    const moved = { boxes: model.boxes.map((box) => ({
      ...box,
      limit: box.limit + D,
      contentBottom: box.contentBottom + D,
      // EVERY coordinate, `outerBottom` included. Missing one is not a translation,
      // and the relation caught exactly that when chrome was added to the corpus.
      blocks: box.blocks.map((b) => ({
        ...b, top: b.top + D, bottom: b.bottom + D, outerBottom: b.outerBottom + D,
      })),
    })) };
    const a = planTrim(model);
    const b = planTrim(moved);
    assert.deepEqual(b.actions, a.actions, `seed ${seed}`);
    assert.deepEqual(b.declines, a.declines, `seed ${seed}`);
  }
});

// ── MR11 · the record accounts for every cut ─────────────────────────────────
// RULE 6. The existing content-clipped probe is blind to what TRIM removes, so
// the record IS the alarm. A record that under-reports is worse than no record:
// `overflow:check` would bless a baseline downward on a deck that lost content.
test('MR11 record completeness — the record accounts for every action and decline', () => {
  for (const seed of SEEDS) {
    const plan = planTrim(makeModel(seed));
    const rec = trimRecord(plan);
    assert.equal(rec.trimmed, plan.actions.length, `seed ${seed}`);
    assert.equal(rec.declined, plan.declines.length, `seed ${seed}`);
    assert.equal(rec.detail.length, plan.actions.length, `seed ${seed}`);
    const lines = plan.actions.reduce((n, a) => n + (a.linesBefore - a.lines), 0);
    assert.equal(rec.linesRemoved, lines, `seed ${seed}`);
    assert.ok(rec.trimmed === 0 || rec.linesRemoved > 0,
      `seed ${seed}: reported ${rec.trimmed} trims that removed no lines`);
  }
});

// ── MR12 · a box of never-classed blocks is always declined, never half-cut ──
// The corpus finding, as a property: the blocks that actually cause overflow in
// authored decks are headings, callout chrome and code — the same list §6 rules
// never-trim. When that is the whole box, the guard must decline cleanly.
test('MR12 all-never box — declines with no actions, whatever the overflow', () => {
  for (const seed of SEEDS.slice(0, 120)) {
    const model = makeModel(seed, { role: 'heading' });
    for (const box of model.boxes) box.limit = Math.min(box.limit, box.contentBottom - 100);
    const plan = planTrim(model);
    assert.equal(plan.actions.length, 0, `seed ${seed}`);
    assert.equal(plan.fits.length, 0, `seed ${seed}`);
  }
});

// ── MR0 · the fit target is pinned, and it is not the alarm's slack ──────────
// The one assertion that cannot be satisfied by moving the goalposts. Everything
// else here compares geometry to a number; this compares the number to a literal,
// so widening `FIT_EPSILON` is a deliberate edit to this file rather than a silent
// loosening of four relations at once.
test('MR0 the fit target is a sub-pixel constant, distinct from the overflow slack', () => {
  assert.equal(FIT_EPSILON, FIT_PX,
    'FIT_EPSILON moved — if deliberate, change FIT_PX here and say why in the same commit');
  assert.ok(FIT_EPSILON < 1, 'the fit target must be sub-pixel: a visible row is not a fit');
  assert.ok(TRIM_TOLERANCE > FIT_EPSILON,
    'entry tolerance and exit target must stay distinct — conflating them shipped the shear');
});

// ── MR14 · the planner must still DO something ───────────────────────────────
// THE ARM EVERY OTHER RELATION IS BLIND TO, and a second independent review is why
// it exists. Twelve of the thirteen relations above only constrain what the planner
// does WHEN it acts; rule 5 discards a declined box's actions entirely, so any
// arithmetic slip that turns fits into declines is invisible to all of them. Three
// mutants proved it: weakening rule 4, dropping the bottom-padding reserve, and
// `Math.floor` -> `Math.ceil` on the line count. All three left the other relations
// green. Measured on this corpus, none of them SHIPS a defect — they under-trim, and
// the fit test catches what they miss — but `ceil` collapses the planner from 85
// clamps to 1, which is `guards: strict` silently doing nothing at all.
//
// So this is a CANARY, not a theorem: a floor on effectiveness over a seeded,
// committed corpus. It is deliberately well below the measured 85/80 so ordinary
// tuning does not trip it, and it fails loudly if the planner goes quiet. Changing
// the generator moves these numbers — that is expected, and re-deriving them is part
// of changing it.
test('MR14 effectiveness — the planner keeps trimming what it can trim', () => {
  let actions = 0;
  let fits = 0;
  let declines = 0;
  for (const seed of SEEDS) {
    const plan = planTrim(makeModel(seed));
    actions += plan.actions.length;
    fits += plan.fits.length;
    declines += plan.declines.length;
  }
  assert.ok(actions >= 55,
    `the planner produced only ${actions} clamps across ${SEEDS.length} seeds ` +
    `(measured baseline: 77) — it has become conservative enough to be inert`);
  assert.ok(fits >= 45,
    `only ${fits} boxes were made to fit (measured baseline: 74)`);
  // And the other direction: declines must not vanish either, or the corpus has
  // stopped exercising rule 5's refusals and MR12/MR5 are riding on nothing.
  assert.ok(declines >= 100,
    `only ${declines} boxes declined (measured baseline: 276) — the corpus no longer ` +
    `exercises the refusal path`);
});

// ── MR13 · the clamp lands inside the box ────────────────────────────────────
// MR3 only inspects boxes the planner CLAIMS fit, so an arithmetic slip that makes
// the planner under-trim shows up as a decline and slips past it — measured:
// deleting the top-padding term from the room calculation left all 14 relations
// green. This one asserts the geometry of the cut itself: the clamped text must
// END at or above the limit. Padding and borders displace text, so an omission
// here fails immediately.
test('MR13 tight clamp — a clamped block\'s text ends at or above the box limit', () => {
  let checked = 0;
  for (const seed of SEEDS) {
    const model = makeModel(seed);
    const plan = planTrim(model);
    for (const a of plan.actions) {
      const box = model.boxes.find((b) => b.id === a.boxId);
      const b = box.blocks.find((x) => x.id === a.blockId);
      const padTop = b.padTop || 0;
      // Blocks strictly above this one give back their recovered height.
      const shift = plan.actions.reduce((sum, o) => {
        if (o.blockId === a.blockId) return sum;
        const ob = box.blocks.find((x) => x.id === o.blockId);
        return ob && ob.bottom <= b.top ? sum + o.recovered : sum;
      }, 0);
      const textTop = b.top - shift + padTop;
      // The BORDER BOX, and to FIT_EPSILON. Two mutants lived in the slack this
      // assertion used to leave: `Math.floor` -> `Math.ceil` on the line count (37 of
      // 300 plans changed) and dropping the bottom-padding reserve — the second being
      // the 8px shear that shipped. A block's padding and bottom border sit below its
      // last line and are part of what must fit.
      const blockBottom = textTop + a.lines * b.lineHeight + (b.padBottom || 0);
      assert.ok(blockBottom <= box.limit + FIT_PX,
        `seed ${seed}: ${a.blockId} clamped to ${a.lines} lines ends at ${blockBottom} ` +
        `but the box limit is ${box.limit} — the clamp does not fit its own box`);
      checked++;
    }
  }
  assert.ok(checked > 0, 'anti-vacuity: no clamp was checked');
});
