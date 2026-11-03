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
      // Slide 2 always fails with no depth (a sideways overflow); 10% less room still packs 2 + 1.
      verify: async () => ({ 2: 0 }),
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
    const run = await measuredSplit({ facts: tall, pack, packer: 'greedy', split: async () => { splits++; return { planned: ['1'] }; }, verify: async () => ({ 1: 30 }) });
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
