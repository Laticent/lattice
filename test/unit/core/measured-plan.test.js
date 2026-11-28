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

describe('a split content page centers its cards unless the author chose', () => {
  const cardsCap = { 'cards-grid': { axis: 'item', hard: 2 } };
  const grid = (cls, cards) => `<section data-lattice-slide="1" class="cards-grid${cls}" data-align="${cards}"><h2>T</h2>${list(4)}</section>`;
  const stamps = (html) => [...html.matchAll(/<section\b[^>]*data-split-role="body"[^>]*>/g)].map((m) => (m[0].match(/data-align="([^"]*)"/) || [])[1]);
  test('no choice: every content page centers, whatever the component default was', () => {
    const r = splitDoc(grid('', 'spread'), cardsCap);
    assert.ok(r.changed);
    assert.ok(stamps(r.html).every((v) => v === 'middle'), stamps(r.html).join(','));
  });
  test('an author\'s choice rides every content page unchanged', () => {
    for (const choice of ['top', 'bottom', 'fill', 'spread', 'middle']) {
      const r = splitDoc(grid(` align-${choice}`, choice), cardsCap);
      assert.ok(stamps(r.html).every((v) => v === choice), `${choice}: ${stamps(r.html).join(',')}`);
    }
  });
});

test('a folded key insight lands after the stage and before the page chrome, once (§17)', () => {
  const { foldBeats } = require('../../../lib/core/split-envelope');
  const page = '<section class="list" data-split-role="body"><div class="cell-stage"><ul><li>a</li></ul></div><div class="cell-footer">F</div><div class="slide-edge"></div></section>';
  const out = foldBeats(page, ['<div class="cell-coda"><blockquote>Key</blockquote></div>']);
  const order = [...out.matchAll(/<div class="([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['cell-stage', 'cell-coda', 'cell-footer', 'slide-edge']);
  assert.equal((out.match(/cell-footer/g) || []).length, 1);
});

// A run's beats fold onto its last page in source order: the key insight, then the note. A page with no `.cell-stage`
// (split-panel's feature-cover body page at portrait) puts every cell at the same point, so folding the cells one by one
// in reverse printed the note ABOVE the insight (measured on tools/vscode-harness/decks/coda-split-widths.md at
// `size: portrait`, 2026-11-28).
const KEY = '<div class="cell-coda" data-dock="row"><blockquote><p>KEY</p></blockquote></div>';
const NOTE = '<div class="cell-coda" data-dock="row"><div class="below-note"><p>NOTE</p></div></div>';
test('folded coda cells keep source order on a page with no stage', () => {
  const { foldBeats } = require('../../../lib/core/split-envelope');
  const page = '<section class="split-panel" data-split-role="body"><div class="split-runhead">H</div><ul class="split-pts"><li>a</li></ul><div class="cell-footer">F</div></section>';
  const out = foldBeats(page, [KEY, NOTE]);
  assert.ok(out.indexOf('KEY') < out.indexOf('NOTE'), out);
  assert.equal(out.split('KEY').length - 1, 1);
  assert.equal(out.split('NOTE').length - 1, 1);
});
test('folded coda cells keep source order after a stage, too', () => {
  const { foldBeats } = require('../../../lib/core/split-envelope');
  const page = '<section class="list" data-split-role="body"><div class="cell-stage"><ul><li>a</li></ul></div><div class="cell-footer">F</div></section>';
  const out = foldBeats(page, [KEY, NOTE]);
  const order = [...out.matchAll(/KEY|NOTE|cell-stage|cell-footer/g)].map((m) => m[0]);
  assert.deepEqual(order, ['cell-stage', 'KEY', 'NOTE', 'cell-footer']);
});

test('a split content page with no align: choice resolves to middle on the runtime path too (§17)', () => {
  const { resolveAlign } = require('../../../lib/core/resolve-align');
  assert.equal(resolveAlign({ classes: ['q-and-a'], family: 'square', splitBody: true }), 'middle');
  assert.equal(resolveAlign({ classes: ['q-and-a', 'align-fill'], family: 'square', splitBody: true }), 'fill');
  assert.notEqual(resolveAlign({ classes: ['q-and-a'], family: 'square' }), null);
});
