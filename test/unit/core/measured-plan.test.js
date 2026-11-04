// The MEASURED plan through the real builders (2026-10-28-fit-everywhere-model.md §16): `splitDoc`
// takes `{ plan }`, keyed by deck slide number, and builds exactly the pages it names. A plan is
// trusted only when it places every member once; a stale plan leaves the slide on today's split.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { splitDoc } = require('../../../lib/core/auto-split');
const { groupSizes } = require('../../../lib/core/collections');

const list = (n) => `<ul>${Array.from({ length: n }, (_, i) => `<li>item ${i + 1}</li>`).join('')}</ul>`;
const cap = { cards: { axis: 'item', hard: 4 } };
const deck = (n) => `<section data-lattice-slide="1" class="cards"><h2>T</h2>${list(n)}</section>`;
const pages = (html) => html.split(/(?=<section\b)/).filter((p) => p.startsWith('<section'));
const bodies = (html) => pages(html).filter((p) => /lat-split-native/.test(p));
const items = (page) => (page.match(/<li>/g) || []).length;

describe('measured plan: the builders build what the plan names', () => {
  test('page sizes from the plan, in order, with nothing lost', () => {
    const r = splitDoc(deck(7), cap, { plan: { 1: [3, 2, 2] } });
    assert.equal(r.changed, 1);
    assert.deepEqual(bodies(r.html).map(items), [3, 2, 2]);
    assert.equal(items(r.html), 7);
    assert.equal((r.html.match(/lat-split-cover/g) || []).length, 1, 'one cover');
  });

  test('"whole" keeps a slide that fits whole', () => {
    const r = splitDoc(deck(7), cap, { plan: { 1: 'whole' } });
    assert.equal(r.changed, 0);
    assert.equal(pages(r.html).length, 1);
  });

  test('a one-page plan still gets its cover: the slide overflowed whole', () => {
    const r = splitDoc(deck(4), cap, { plan: { 1: [4] } });
    assert.equal(r.changed, 1);
    assert.deepEqual(bodies(r.html).map(items), [4]);
    assert.equal((r.html.match(/lat-split-cover/g) || []).length, 1);
  });

  test('a stale plan (sizes that do not place every member) falls back to one member a page', () => {
    for (const stale of [[3, 3], [2, 2, 2, 2], [0, 7], [7.5]]) {
      const r = splitDoc(deck(7), cap, { plan: { 1: stale } });
      assert.deepEqual(bodies(r.html).map(items), [1, 1, 1, 1, 1, 1, 1], `plan ${stale}`);
    }
  });

  test('a slide the plan does not name splits as it always has', () => {
    const r = splitDoc(deck(3), cap, { plan: { 2: [3] } });
    assert.deepEqual(bodies(r.html).map(items), [1, 1, 1]);
  });

  test('no plan is byte-identical to today', () => {
    assert.equal(splitDoc(deck(5), cap, { plan: null }).html, splitDoc(deck(5), cap).html);
  });
});

describe('groupSizes: the shared pacing rule', () => {
  test('a ceiling spreads evenly, as before', () => assert.deepEqual(groupSizes(7, 3), [3, 2, 2]));
  test('a plan that places every member is taken as is', () => assert.deepEqual(groupSizes(5, [1, 4]), [1, 4]));
  test('any other plan is refused', () => {
    for (const bad of [[], [2, 2], [3, 3], [5, 0], [2.5, 2.5]]) assert.equal(groupSizes(5, bad), null, String(bad));
  });
});

describe('splitDoc reports which slides the plan set', () => {
  test('a slide built from its plan is named; an unplanned or refused one is not', () => {
    assert.deepEqual(splitDoc(deck(7), cap, { plan: { 1: [3, 2, 2] } }).planned, ['1']);
    assert.deepEqual(splitDoc(deck(7), cap, { plan: { 1: [3, 3] } }).planned, [], 'a refused plan builds today\'s pages');
    assert.deepEqual(splitDoc(deck(7), cap, { plan: { 1: 'whole' } }).planned, []);
    assert.deepEqual(splitDoc(deck(7), cap).planned, []);
    const plan = { 1: [3, 2, 2] };
    splitDoc(deck(7), cap, { plan });
    assert.deepEqual(plan, { 1: [3, 2, 2] }, 'the plan is read, never written');
  });
});

test('plan "whole" keeps every slide whole: the stamped, unsplit deck a browser host measures', () => {
  const r = splitDoc(deck(7), cap, { plan: 'whole' });
  assert.equal(r.changed, 0);
  assert.equal(pages(r.html).length, 1);
  assert.deepEqual(r.planned, []);
});

test('a folded plan puts the key insight on the last body page and emits no closing page', () => {
  const withInsight = `<section data-lattice-slide="1" class="cards"><h2>T</h2>${list(5)}<blockquote><p>The point.</p></blockquote></section>`;
  const unfolded = splitDoc(withInsight, cap, { plan: { 1: [3, 2] } });
  const folded = splitDoc(withInsight, cap, { plan: { 1: { sizes: [3, 2], foldCoda: true } } });
  assert.equal((unfolded.html.match(/The point\./g) || []).length, 1);
  assert.equal((folded.html.match(/The point\./g) || []).length, 1, 'the insight appears once');
  assert.ok(pages(folded.html).length === pages(unfolded.html).length - 1, 'one page fewer: no closing page');
  const lastBody = bodies(folded.html).at(-1);
  assert.match(lastBody, /The point\./, 'it closes the last body page');
  assert.equal(items(folded.html), 5);
});
