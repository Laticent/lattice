// The measured split's decisions (lib/core/fit-measure.js: planFromFacts, measuredSplit,
// nextMemory), shared by the CLI and the preview. Pure: facts in, a plan out. The memory rules are
// the owner's §11 pick (engineering/decisions/2026-10-28-fit-everywhere-model.md §11, §16).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { planFromFacts, measuredSplit, nextMemory, sizesStillFit, REJOIN_SPARE } = require('../../../lib/core/fit-measure');
const { pack } = require('@laticent/fluido');

const over = (slide, heights, capacity, gap = 0) => ({ slide, over: true, members: { heights, gap }, capacity });
const fits = (slide, extra = {}) => ({ slide, over: false, ...extra });

describe('planFromFacts, stateless', () => {
  test('a slide that fits stays whole; one that overflows packs', () => {
    const plan = planFromFacts([fits('1'), over('2', [300, 300, 300], 700)], {}, pack, 'knuth-plass');
    assert.equal(plan['1'], 'whole');
    assert.deepEqual(plan['2'], [2, 1]);
  });
  test('an overflowing slide with no members, or no packing, is left to today\'s split', () => {
    const plan = planFromFacts([{ slide: '1', over: true, members: null }, over('2', [900], 700)], {}, pack, 'greedy');
    assert.ok(!Object.hasOwn(plan, '1'));
    assert.ok(!Object.hasOwn(plan, '2'));
  });
});

describe('planFromFacts, with memory (§11)', () => {
  test('no entry margin: a slide remembered whole splits as soon as it overflows', () => {
    const plan = planFromFacts([over('1', [300, 300, 300], 700)], {}, pack, 'knuth-plass', { 1: { split: false } });
    assert.deepEqual(plan['1'], [2, 1]);
  });
  test('rejoin only with 30% spare: a split slide that now fits narrowly stays split on its pages', () => {
    const memory = { 1: { split: true, sizes: [2, 1] } };
    const narrow = fits('1', { share: 0.8, members: { heights: [200, 200, 200], gap: 0 }, capacity: 700 });
    assert.deepEqual(planFromFacts([narrow], {}, pack, 'knuth-plass', memory)['1'], [2, 1]);
    const roomy = fits('1', { share: 1 - REJOIN_SPARE - 0.01, members: { heights: [100, 100, 100], gap: 0 }, capacity: 700 });
    assert.equal(planFromFacts([roomy], {}, pack, 'knuth-plass', memory)['1'], 'whole');
  });
  test('a fitting slide with no share to read rejoins at once, as the stateless plan does', () => {
    const memory = { 1: { split: true, sizes: [2, 1] } };
    assert.equal(planFromFacts([fits('1', { share: null })], {}, pack, 'knuth-plass', memory)['1'], 'whole');
  });
  test('members a page are kept while they still fit, even where a fresh pack would differ', () => {
    // Fresh Knuth–Plass packs these four as 2 + 2; the remembered 3 + 1 still fits, so it stays.
    const f = over('1', [200, 200, 200, 200], 700);
    assert.deepEqual(planFromFacts([f], {}, pack, 'knuth-plass')['1'], [2, 2]);
    assert.deepEqual(planFromFacts([f], {}, pack, 'knuth-plass', { 1: { split: true, sizes: [3, 1] } })['1'], [3, 1]);
  });
  test('a member added or a page that no longer fits packs afresh', () => {
    const memory = { 1: { split: true, sizes: [3, 1] } };
    assert.deepEqual(planFromFacts([over('1', [200, 200, 200, 200, 200], 700)], {}, pack, 'knuth-plass', memory)['1'], pack({ heights: [200, 200, 200, 200, 200], gap: 0, capacity: 700 }, 'knuth-plass'));
    assert.deepEqual(planFromFacts([over('1', [300, 300, 200, 200], 700)], {}, pack, 'knuth-plass', memory)['1'], pack({ heights: [300, 300, 200, 200], gap: 0, capacity: 700 }, 'knuth-plass'));
  });
  test('nextMemory keeps each measured slide\'s decision as plain JSON', () => {
    const facts = [fits('1'), over('2', [300, 300, 300], 700), { slide: '3', over: true, members: null }];
    const plan = { 1: 'whole', 2: [2, 1] };
    assert.deepEqual(nextMemory(facts, plan), { 1: { split: false }, 2: { split: true, sizes: [2, 1] } });
    assert.deepEqual(JSON.parse(JSON.stringify(nextMemory(facts, plan))), nextMemory(facts, plan));
  });
});

describe('measuredSplit: the verify loop', () => {
  const facts = [over('1', [300, 300, 300, 300], 700), over('2', [300, 300, 300], 700)];
  // A COVER that overflows is answered with a lede page, not a tighter room (owner, 2026-11-13): verify
  // reports it as `N:cover`, the next split carries `ledePage` for that slide, and it is tried once.
  test('a cover that overflows re-splits that slide once with its lede on a page of its own', async () => {
    const plans = [];
    let n = 0;
    const run = await measuredSplit({
      facts, pack, packer: 'greedy',
      split: async (plan) => { plans.push(plan); return { planned: ['1', '2'] }; },
      verify: async () => (n++ === 0 ? { '2:cover': 40 } : {}),
    });
    assert.equal(plans.length, 2);
    assert.equal(plans[0]['2']?.ledePage, undefined, 'the first split carries no lede page');
    assert.equal(plans[1]['2'].ledePage, true);
    assert.deepEqual(plans[1]['2'].sizes, plans[0]['2'], 'the pages of points are unchanged');
    assert.equal(plans[1]['1']?.ledePage, undefined, 'only the slide whose cover overflowed');
    assert.equal(run.rounds, 2);
  });
  test('a cover still too full after its lede moved is not retried', async () => {
    const plans = [];
    const run = await measuredSplit({
      facts, pack, packer: 'greedy',
      split: async (plan) => { plans.push(plan); return { planned: ['1', '2'] }; },
      verify: async () => ({ '2:cover': 40 }),
    });
    assert.equal(plans.length, 2, 'one lede round, then the loop stops');
    assert.equal(run.rounds, 2);
  });
  test('one round when every body page fits', async () => {
    let splits = 0;
    const run = await measuredSplit({ facts, pack, packer: 'greedy', split: async (plan) => { splits++; return { planned: Object.keys(plan) }; }, verify: async () => ({}) });
    assert.equal(run.rounds, 1);
    assert.equal(splits, 1);
    assert.equal(run.fellBack, 0);
  });
  test('a page that overflows by a known depth tightens its room and replans', async () => {
    // Fresh packs leave a tenth of the room spare (HEADROOM); the fixture's numbers account for it.
    const seen = [];
    let n = 0;
    const run = await measuredSplit({
      facts, pack, packer: 'greedy',
      split: async (plan) => { seen.push(JSON.stringify(plan['1'])); return { planned: ['1', '2'] }; },
      verify: async () => (n++ === 0 ? { 1: 150 } : {}),
    });
    assert.deepEqual(seen, ['[2,2]', '[1,1,1,1]']);
    assert.equal(run.rounds, 2);
    assert.equal(run.fellBack, 0);
  });
  test('a slide a tighter room cannot help goes back on today\'s split at once, and stays back', async () => {
    const plans = [];
    const run = await measuredSplit({
      facts, pack, packer: 'greedy',
      split: async (plan) => { plans.push(plan); return { planned: Object.keys(plan).filter((k) => Array.isArray(plan[k])) }; },
      // Slide 2 fails with no depth (a sideways overflow) on every measured plan; 10% less room still
      // packs 2 + 1. Today's split (no entry for slide 2) passes.
      verify: async () => (Array.isArray(plans.at(-1)['2']) ? { 2: 0 } : {}),
    });
    assert.equal(run.fellBack, 1);
    assert.ok(run.rounds <= 4, `${run.rounds} rounds`);
    assert.ok(!Object.hasOwn(plans.at(-1), '2'), 'slide 2 is back on today\'s split');
    assert.ok(Array.isArray(plans.at(-1)['1']), 'slide 1 keeps its plan');
  });
  test('a slide whose split never read the plan is not tightened', async () => {
    let splits = 0;
    await measuredSplit({ facts, pack, packer: 'greedy', split: async () => { splits++; return { planned: [] }; }, verify: async () => ({ 1: 40 }) });
    assert.equal(splits, 1);
  });
  test('at most three verify rounds', async () => {
    let splits = 0;
    const tall = [over('1', Array.from({ length: 12 }, () => 100), 700)];
    let last = null;
    // Every measured plan overflows by 30px; today's split (no entry for slide 1) fits.
    const run = await measuredSplit({ facts: tall, pack, packer: 'greedy', split: async (plan) => { splits++; last = plan; return { planned: ['1'] }; }, verify: async () => (Array.isArray(last?.['1']) ? { 1: 30 } : {}) });
    assert.ok(splits <= 4, `${splits} splits`);
    assert.equal(run.fellBack, 1);
  });
});

test('sizesStillFit checks every page and the member count', () => {
  assert.equal(sizesStillFit([2, 1], [300, 300, 300], 0, 700), true);
  assert.equal(sizesStillFit([3], [300, 300, 300], 0, 700), false);
  assert.equal(sizesStillFit([2, 2], [300, 300, 300], 0, 700), false);
  assert.equal(sizesStillFit([2, 1], [300, 300, 300], 120, 700), false);
});

describe('a remembered split keeps its page count while it can', () => {
  const { packInto } = require('../../../lib/core/fit-measure');
  test('packInto finds a packing in exactly k pages, or none', () => {
    assert.deepEqual(packInto([300, 300, 300, 300], 0, 700, 2), [2, 2]);
    assert.equal(packInto([300, 300, 300, 300], 0, 500, 2), null);
    assert.equal(packInto([300], 0, 700, 2), null);
  });
  test('a page that stops fitting repacks into the same page count when it can', () => {
    // Remembered 3 + 1; the members grew, so 3 no longer fit. Two pages still can (2 + 2).
    const memory = { 1: { split: true, sizes: [3, 1] } };
    assert.deepEqual(planFromFacts([over('1', [240, 240, 240, 240], 700)], {}, pack, 'knuth-plass', memory)['1'], [2, 2]);
  });
});

test('an item added or removed packs afresh, never into the remembered page count', () => {
  // Remembered three pages of one; a fourth item arrives. Fresh Knuth–Plass packs 2 + 2.
  const memory = { 1: { split: true, sizes: [1, 1, 1] } };
  const f = over('1', [300, 300, 300, 300], 700);
  assert.deepEqual(planFromFacts([f], {}, pack, 'knuth-plass', memory)['1'], planFromFacts([f], {}, pack, 'knuth-plass')['1']);
});

describe('the trailing beats ride the last body page when they fit', () => {
  const { sizesOf } = require('../../../lib/core/fit-measure');
  test('room under the last member folds the coda; no room keeps the closing page', () => {
    const roomy = { ...over('1', [300, 300, 300], 700), coda: 120 };
    const tight = { ...over('1', [300, 300, 300], 700), coda: 450 };
    const a = planFromFacts([roomy], {}, pack, 'knuth-plass')['1'];
    assert.deepEqual(a, { sizes: [2, 1], foldCoda: true });
    assert.deepEqual(planFromFacts([tight], {}, pack, 'knuth-plass')['1'], [2, 1]);
    assert.deepEqual(sizesOf(a), [2, 1]);
    assert.deepEqual(nextMemory([roomy], { 1: a }), { 1: { split: true, sizes: [2, 1] } });
  });
});

test('the fold pass folds what the host names, and undoes a fold that overflows', async () => {
  const facts = [over('1', [300, 300, 300, 300], 700), { slide: '2', over: true, members: null }];
  const plans = [];
  const run = await measuredSplit({
    facts, pack, packer: 'greedy',
    split: async (plan) => { plans.push(JSON.parse(JSON.stringify(plan))); return { planned: Object.keys(plan) }; },
    // Slide 1's folded last page overflows; slide 2 (a recipe slide, no sizes) folds cleanly.
    verify: async () => (plans.length === 2 ? { 1: 20 } : {}),
    foldable: async () => ['1', '2'],
  });
  assert.deepEqual(plans[1]['2'], { foldCoda: true });
  assert.ok(plans[1]['1'].foldCoda, 'slide 1 was tried folded');
  assert.ok(Array.isArray(run.plan['1']), 'and its fold was undone');
  assert.deepEqual(run.plan['2'], { foldCoda: true });
});

test('the measure and the verify release every hold first, so every surface measures the narrow form (§17)', () => {
  const { JSDOM } = require('jsdom');
  const { measureFit, overflowBySlide } = require('../../../lib/core/fit-measure');
  const dom = new JSDOM('<section data-lattice-slide="1"><div class="cell-stage"><ul class="lat-reflow-held"><li>a</li></ul></div></section>');
  const prior = global.document;
  global.document = dom.window.document;
  try {
    const verdict = () => ({ fits: () => ({ ok: true, px: 0 }) });
    const slides = (d) => [...d.querySelectorAll('section')];
    overflowBySlide(verdict, {}, slides);
    assert.equal(dom.window.document.querySelectorAll('.lat-reflow-held').length, 0, 'verify released the hold');
    dom.window.document.querySelector('ul').classList.add('lat-reflow-held');
    try { measureFit(verdict, {}, slides, []); } catch { /* jsdom has no layout; the release runs first */ }
    assert.equal(dom.window.document.querySelectorAll('.lat-reflow-held').length, 0, 'measure released the hold');
  } finally {
    global.document = prior;
  }
});

test('a slide whose pages fail on today\'s split too keeps its first measured plan, the fewest pages (§17)', async () => {
  const facts = [over('1', [300, 300, 300, 300], 700)];
  const plans = [];
  const run = await measuredSplit({
    facts, pack, packer: 'greedy',
    split: async (plan) => { plans.push(JSON.parse(JSON.stringify(plan))); return { planned: Object.keys(plan) }; },
    // Every page of slide 1 fails, measured or not: a layout that crams at this box.
    verify: async () => ({ 1: 0 }),
  });
  assert.deepEqual(run.plan['1'], plans[0]['1'], 'back on its first plan');
  assert.equal(run.fellBack, 0);
});

test('the first plan comes back only when it failed no worse than today\'s split (checker, 2026-11-05)', async () => {
  const facts = () => [over('1', [300, 300, 300, 300], 700)];
  const runWith = async (measured, today) => {
    let last = null;
    return measuredSplit({
      facts: facts(), pack, packer: 'greedy',
      split: async (plan) => { last = plan; return { planned: Object.keys(plan) }; },
      verify: async () => (last?.['1'] ? measured : today),
    });
  };
  // The measured plan crams (0, no depth) and today's split only overflows by 5px: today's stays.
  const crammed = await runWith({ 1: 0 }, { 1: 5 });
  assert.equal(crammed.plan['1'], undefined, 'a crammed first plan is not kept over a shallow overflow');
  assert.equal(crammed.fellBack, 1);
  // The measured plan overflows by 3px and today's split by 9px: the first plan, the fewer pages, comes back.
  const shallower = await runWith({ 1: 3 }, { 1: 9 });
  assert.deepEqual(shallower.plan['1'], [2, 2]);
  assert.equal(shallower.fellBack, 0);
});

describe('planFromFacts, members side by side (§17; checker, 2026-11-05)', () => {
  // Two columns: six members make three rows, each as tall as its taller member.
  const grid = (heights, capacity, extra = {}) => ({ slide: '1', over: true, members: { heights, gap: 10, columns: 2, rowGap: 10 }, capacity, ...extra });

  test('packs by rows, not by stacking every member', () => {
    // Rows of 200, 200, 200: two rows (410) fit a 480 room under its margin, so 4 + 2 members, two pages.
    const plan = planFromFacts([grid([200, 150, 200, 120, 200, 100], 480)], {}, pack, 'greedy');
    assert.deepEqual(plan['1'], [4, 2]);
  });

  test('remembers the pages while every page\'s rows still fit', () => {
    const mem = { 1: { split: true, sizes: [2, 4] } };
    // As remembered: page 1 one row (200), page 2 two rows (200 + 10 + 200). Both fit 480.
    const plan = planFromFacts([grid([200, 150, 200, 120, 200, 100], 480)], {}, pack, 'greedy', mem);
    assert.deepEqual(plan['1'], [2, 4]);
  });

  test('folds the closing beats onto the last page by its rows, not by a stack of its members', () => {
    // The last page holds 2 members in one row of 200: a coda of 200 folds into a 480 room (410).
    // Summed as a stack (200 + 10 + 100 = 310, + 200 = 510) it would not have.
    const plan = planFromFacts([grid([200, 150, 200, 120, 200, 100], 480, { coda: 200 })], {}, pack, 'greedy');
    assert.deepEqual(plan['1'], { sizes: [4, 2], foldCoda: true });
  });

  test('a grid whose pages still fail is packed again as a column, from the whole room', async () => {
    const facts = [grid([200, 150, 200, 120, 200, 100], 480)];
    const plans = [];
    let round = 0;
    const run = await measuredSplit({
      facts, pack, packer: 'greedy',
      split: async (plan) => { plans.push(JSON.parse(JSON.stringify(plan))); return { planned: Object.keys(plan) }; },
      // The row packing fails once; the column packing that follows fits.
      verify: async () => (round++ === 0 ? { 1: 40 } : {}),
    });
    assert.deepEqual(plans[0]['1'], [4, 2], 'first by rows');
    // As a column of 200, 150, 200, 120, 200, 100 with gaps of 10 in a 480 room: 2, 2, 2.
    assert.deepEqual(run.plan['1'], [2, 2, 2], 'then as a column');
    assert.equal(run.fellBack, 0);
  });
});
