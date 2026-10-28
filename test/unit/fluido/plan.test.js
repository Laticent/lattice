// @laticent/fluido's public contract, through its built CommonJS entry (the one Lattice's lib/
// requires). What the split EMITS for real decks is pinned by test/oracle/split-pages.json
// (`npm run split:golden:check`); this file pins the decision order the kernels delegate to.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fluido = require('@laticent/fluido');

const { planSlide, paginates, rescueRuns, fitsCap, MAX_PAGES, ONE_PER_PAGE } = fluido;
const SEAM = { enrolled: true, seam: 'item', members: 4 };
const READER = { strategy: 'cover-rows', shapeReader: true };
const VETO = { strategy: 'redline-blocks', shapeReader: false };

test('the size gate: every family paginates except wide', () => {
  assert.deepEqual(['wide', 'square', 'tall', 'strip'].map(paginates), [false, true, true, true]);
});

test('an opt-out wins over every other fact', () => {
  for (const optOut of ['specimen', 'report']) {
    assert.deepEqual(planSlide({ ...SEAM, optOut, recipe: READER }), { kind: 'whole', reason: 'opt-out' });
  }
});

test('a slide with no declared seam stays whole, whatever its markup holds', () => {
  assert.deepEqual(planSlide({ enrolled: false, seam: 'item', members: 9 }), { kind: 'whole', reason: 'not-enrolled' });
});

test('a recipe is tried first, and only a re-split skips it', () => {
  assert.deepEqual(planSlide({ ...SEAM, recipe: READER }), { kind: 'recipe', strategy: 'cover-rows' });
  assert.equal(planSlide({ ...SEAM, recipe: READER, reSplit: true }).kind, 'paginate');
});

test('a declining shape reader yields to the derived seam; a declining veto keeps the slide whole', () => {
  assert.deepEqual(planSlide({ ...SEAM, recipe: READER, recipeDeclined: true }), { kind: 'paginate', seam: 'item', perPage: 1, envelope: true });
  assert.deepEqual(planSlide({ ...SEAM, recipe: VETO, recipeDeclined: true }), { kind: 'whole', reason: 'recipe-veto' });
});

test('no seam, or a single member, stays whole: there is no smaller cut to make', () => {
  assert.deepEqual(planSlide({ enrolled: true, seam: null, members: 5 }), { kind: 'whole', reason: 'no-seam' });
  assert.deepEqual(planSlide({ enrolled: true, seam: 'row', members: 1 }), { kind: 'whole', reason: 'one-member' });
});

test('one element per page; a first cut opens and closes the run, a re-split is a bare partition', () => {
  assert.equal(ONE_PER_PAGE, 1);
  assert.deepEqual(planSlide(SEAM), { kind: 'paginate', seam: 'item', perPage: 1, envelope: true });
  assert.deepEqual(planSlide({ ...SEAM, reSplit: true }), { kind: 'paginate', seam: 'item', perPage: 1, envelope: false });
});

test('the page cap is checked on the run the host built, at exactly MAX_PAGES', () => {
  assert.equal(MAX_PAGES, 64);
  assert.equal(fitsCap(MAX_PAGES), true);
  assert.equal(fitsCap(MAX_PAGES + 1), false);
  assert.equal(fitsCap(0), true);
  assert.equal(fitsCap(-1), false);
  assert.equal(fitsCap(2.5), false);
  // planSlide does not estimate the count: a cover and a closing page exist only when the slide
  // has a heading and a trailer, which the host knows and Fluido does not.
  assert.equal(planSlide({ enrolled: true, seam: 'row', members: 1000 }).kind, 'paginate');
});

test('readSeam is read only when the decision gets that far', () => {
  let reads = 0;
  const read = () => { reads += 1; return { seam: 'item', members: 4 }; };
  for (const facts of [
    { optOut: 'report', enrolled: true },
    { enrolled: false },
    { enrolled: true, recipe: READER },
    { enrolled: true, recipe: VETO, recipeDeclined: true },
  ]) planSlide(facts, read);
  assert.equal(reads, 0, 'an opt-out, no seam, a recipe to try and a veto never read the seam');
  assert.equal(planSlide({ enrolled: true, recipe: READER, recipeDeclined: true }, read).kind, 'paginate');
  assert.equal(reads, 1);
  // Facts given up front win over the reader.
  assert.deepEqual(planSlide({ enrolled: true, seam: null }, read), { kind: 'whole', reason: 'no-seam' });
  assert.equal(reads, 1);
});

test('the budget rescue cuts runs of at most `budget` units, and only past the budget', () => {
  assert.deepEqual(rescueRuns(34, 12), [{ from: 0, to: 12 }, { from: 12, to: 24 }, { from: 24, to: 34 }]);
  assert.equal(rescueRuns(12, 12), null, 'a member that fits its budget is not cut');
  assert.equal(rescueRuns(5, 0), null, 'no budget, no rescue');
  assert.equal(rescueRuns(-1, 4), null);
  assert.equal(rescueRuns(2.5, 1), null);
  assert.equal(rescueRuns(MAX_PAGES * 3 + 1, 3).length, MAX_PAGES + 1, 'the cap is the host\'s, on the built run');
});

test('the same facts always give the same move', () => {
  const facts = { ...SEAM, recipe: READER, recipeDeclined: true };
  assert.deepEqual(planSlide(facts), planSlide(structuredClone(facts)));
});

test('the ESM entry exports the same API as the CJS one', async () => {
  const pkg = path.dirname(require.resolve('@laticent/fluido/package.json'));
  const esm = await import(pathToFileURL(path.join(pkg, 'dist', 'index.mjs')).href);
  assert.deepEqual(Object.keys(esm).sort(), Object.keys(fluido).sort());
  assert.deepEqual(esm.planSlide(SEAM), planSlide(SEAM));
});
