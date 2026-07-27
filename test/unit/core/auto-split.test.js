/**
 * Unit: lib/core/auto-split.js — the build-time slide auto-splitter.
 *
 * Drives the partitionAxis kernel from each component's capacity contract: a slide
 * past `capacity.hard` on a splittable axis is re-emitted as several; everything
 * else passes through byte-identical (so a non-overflowing deck's export is
 * unchanged). The Fit Ladder's SPLIT move applied (the-fit-spine.md §3).
 *
 * §8 rule 10 moved the CUT: the pre-render static pass is DEFER-ONLY now, and every partition
 * (and every cover) comes from the MEASURED pass, which reads the really-rendered DOM. The shape
 * these tests pin is unchanged — so they drive the pass that produces it, through `measuredSplit`
 * below, and `autoSplitDeck`'s own contract (count, defer, emit nothing) has its own block.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { autoSplitDeck, resplitDoc, capacityForClass, applyRails } = require('../../../lib/core/auto-split');

const sec = (cls, inner) => `<section class="${cls}">${inner}</section>`;
const docSec = (n, cls, inner) => `<section data-lattice-slide="${n}" class="${cls}">${inner}</section>`;
const list = (n) => `<ul>${Array.from({ length: n }, (_, i) => `<li>item ${i + 1}</li>`).join('')}</ul>`;
const cap = { cards: { axis: 'item', hard: 4 }, redline: { axis: 'col', hard: 2 } };
const nums = (html) => [...html.matchAll(/data-lattice-slide="(\d+)"/g)].map((m) => Number(m[1]));
// The measured pass, in the static pass's old return shape, so a test that pins the CUT reads the
// same as it did before rule 10. `ratio: 3` is the measured overflow factor: the cut is
// `min(authored target, ratio-implied)` balanced, which for these fixtures lands on the same page
// count the static pass produced from the authored target alone.
// The fixtures are authored without a slide number (the static pass never needed one); the
// measured pass keys on `data-lattice-slide`, so stamp it.
const docify = (html) => html.replace(/^<section /, '<section data-lattice-slide="1" ');
const measuredSplit = (html, capacity, { slide = 1, ratio = 3 } = {}) => {
  const r = resplitDoc(html, [{ slide, ratio }], capacity);
  return { html: r.html, splits: r.changed };
};

describe('core: the measured pass makes the cut (rule 10 retired the static one)', () => {
  test('splits an over-capacity slide into the envelope: cover → body pages', () => {
    const html = sec('cards', `<h2>T</h2>${list(9)}`); // hard 4, no sweet → chunk 4 → 3 body pages
    const { html: out, splits } = measuredSplit(docify(html), cap);
    assert.equal(splits, 1);
    assert.equal((out.match(/<section/g) || []).length, 4); // cover + 3 bodies (§0a)
    assert.equal((out.match(/lat-split-cover/g) || []).length, 1); // exactly ONE cover
    assert.match(out, /split-feat-h">T</); // the title hoists onto the cover
    assert.equal((out.match(/<h2>/g) || []).length, 3); // heading still on every BODY page
    assert.equal((out.match(/lat-cont/g) || []).length, 2); // (cont.) on bodies 2 & 3 only
    assert.match(out, /<h2>T<\/h2>/); // first body keeps the plain title
  });

  test('a TITLE-LESS slide has no masthead to cover with → bare partition, as before', () => {
    const html = sec('cards', list(9));
    const { html: out, splits } = measuredSplit(docify(html), cap);
    assert.equal(splits, 1);
    assert.equal((out.match(/<section/g) || []).length, 3); // no cover slide
    assert.equal((out.match(/lat-split-cover/g) || []).length, 0);
  });

  test('splits into SWEET-sized chunks, not the hard max', () => {
    const capSweet = { wide: { axis: 'item', sweet: 3, soft: 5, hard: 8 } };
    const html = sec('wide', list(10)); // 10 > hard 8 → split, chunk by sweet 3 → 4 slides
    // ratio 4 so the measured cut is governed by the authored target (sweet 3), not the ratio.
    assert.equal((measuredSplit(docify(html), capSweet, { ratio: 4 }).html.match(/<section/g) || []).length, 4);
  });

  test('only the slides the caller says OVERFLOWED are cut', () => {
    // The measured pass keys on MEASUREMENT, not on capacity: "at capacity" is the static pass's
    // question, and it now answers it by deferring rather than cutting (see the block below).
    const html = docify(sec('cards', `<h2>T</h2>${list(4)}`));
    const { html: out, changed } = resplitDoc(html, [], cap);
    assert.equal(changed, 0);
    assert.equal(out, html, 'a deck with no measured overflow is byte-identical');
  });

  test('a non-splittable axis (col read-across) is left for the ring, never split', () => {
    // MULTI-ROW on purpose. With a single row this passed for the wrong reason — the
    // `count <= 1` guard fired and the read-across branch was never reached, so the test
    // would have stayed green through the whole rule-1 migration while the guard it names
    // was gone. Three rows make the `col` veto the only thing that can stop the cut.
    const rows = '<tr><td>a</td><td>b</td><td>c</td></tr>'.repeat(3);
    const html = sec('redline', `<table><tbody>${rows}</tbody></table>`);
    const { html: out, splits } = measuredSplit(docify(html), cap); // 3 cols > hard 2, but col → null
    assert.equal(splits, 0);
    assert.equal(out, docify(html));
  });

  test('a DERIVED row axis never overrules a declared col: the manifest says there is no seam', () => {
    // §8 rule 1 replaces a MISSING or mis-shaped axis; it must not route around a component
    // that declared read-across. A read-across table renders as a plain `<table>`, so bare
    // derivation hands back `row` and cuts between the rows the layout exists to be read across.
    const rows = '<tr><td>a</td><td>b</td></tr>'.repeat(6);
    const html = docify(sec('redline', `<h2>T</h2><table><tbody>${rows}</tbody></table>`));
    assert.equal(resplitDoc(html, [{ slide: 1, ratio: 3 }], cap).changed, 0);
  });

  test('a decorative viewBox figure above the collection does not veto the split', () => {
    // The mirror-image failure: `figure` has no seam, so taking the FIRST container by position
    // made a small inline chart caption refuse a perfectly splittable list — the slide clipped.
    const html = docify(sec('cards', `<h2>T</h2><svg viewBox="0 0 10 10"></svg>${list(9)}`));
    const { html: out, changed } = resplitDoc(html, [{ slide: 1, ratio: 3 }], cap);
    assert.equal(changed, 1);
    assert.ok((out.match(/<section/g) || []).length > 1, 'the list is cut despite the leading figure');
  });

  test('a slide with no capacity entry passes through', () => {
    const html = sec('quote', '<blockquote>x</blockquote>');
    assert.equal(measuredSplit(docify(html), cap).splits, 0);
  });

  test('preserves gaps and the section openTag/attributes across copies', () => {
    const html = `\n<section data-lattice-slide="1" class="cards" data-x="1">${list(6)}</section>\n`;
    const { html: out } = measuredSplit(html, cap, { ratio: 2 }); // 6 items over 2 pages
    // Assert the ATTRIBUTES survived, not a byte-exact tag: the kernel also stamps
    // `data-split-run` and `data-split-role` (§8 rule 9), so pinning the literal string
    // would make every future kernel attribute a test failure rather than a real signal.
    const tags = out.match(/<section[^>]*>/g) || [];
    assert.equal(tags.length, 2);
    for (const t of tags) {
      assert.match(t, /\sclass="cards"/);
      assert.match(t, /\sdata-x="1"/);
      assert.match(t, /\sdata-split-role="body"/);
    }
    assert.match(out, /^\n/); // leading gap preserved
    assert.match(out, /\n$/); // trailing gap preserved
  });

  test('no content lost: every member survives across the split', () => {
    const html = sec('cards', list(10));
    const { html: out } = measuredSplit(docify(html), cap); // 10/4 → 4+4+2
    assert.equal((out.match(/<li>/g) || []).length, 10);
    assert.equal((out.match(/<section/g) || []).length, 3);
  });

  test('continuation copies drop the engine id — the split never duplicates ids', () => {
    const html = `<section class="cards" id="2">${list(6)}</section>`; // 6 items over 2 pages
    const { html: out } = measuredSplit(docify(html), cap, { ratio: 2 });
    assert.equal((out.match(/<section/g) || []).length, 2);
    assert.equal((out.match(/id="2"/g) || []).length, 1); // only the first copy keeps it
    const tags = out.match(/<section[^>]*>/g) || [];
    assert.equal(tags.length, 2);
    for (const t of tags) {                                  // both run-tagged + role-stamped
      assert.match(t, /\sdata-split-run="2"/);
      assert.match(t, /\sdata-split-role="body"/);
      assert.match(t, /\sclass="cards"/);
    }
    assert.match(tags[0], /\sid="2"/);                        // first keeps the engine id
    assert.doesNotMatch(tags[1], /\sid="/);                   // continuation drops it
  });

  test('capacityForClass: first capacity-bearing token wins; modifiers carry none', () => {
    assert.deepEqual(capacityForClass('cards compact', cap), { axis: 'item', hard: 4 });
    assert.equal(capacityForClass('quote big', cap), null);
    assert.equal(capacityForClass('', cap), null);
  });
});

describe('core: resplitDoc (measured pass)', () => {
  test('splits a measured-overflowing slide by its ratio and renumbers, regardless of count', () => {
    // 8 cards but ratio only 1.9 — count alone (<= no static trigger here) wouldn't matter;
    // the measured ratio drives a 2-way split. The 2nd quote slide is untouched.
    const doc = docSec(1, 'cards', `<h2>T</h2>${list(8)}`) + docSec(2, 'quote', '<p>x</p>');
    const { html, changed } = resplitDoc(doc, [{ slide: 1, ratio: 1.9 }], cap);
    assert.equal(changed, 1);
    assert.deepEqual(nums(html), [1, 2, 3, 4]); // cards → cover + 1,2 ; quote → 4
    assert.equal((html.match(/lat-split-cover/g) || []).length, 1);
    assert.equal((html.match(/lat-cont/g) || []).length, 1); // continuation marked
  });

  test('a steeper ratio yields more pieces (ratio 2.8 → 3 slides)', () => {
    const { html, changed } = resplitDoc(docSec(1, 'cards', list(9)), [{ slide: 1, ratio: 2.8 }], cap);
    assert.equal(changed, 1);
    assert.equal((html.match(/<section/g) || []).length, 3); // 9 / ceil(2.8) → 3 each
  });

  test('a slide NOT in the measured-overflow list is untouched', () => {
    assert.equal(resplitDoc(docSec(1, 'cards', list(8)), [{ slide: 2, ratio: 2 }], cap).changed, 0);
  });

  test('a non-splittable (col read-across) overflow is left for the ring', () => {
    // Multi-row for the same reason as the block above: one row is stopped by the count guard,
    // not by the read-across veto, so it would pass with the veto deleted.
    const rows = '<tr><td>a</td><td>b</td></tr>'.repeat(4);
    const doc = docSec(1, 'redline', `<table><tbody>${rows}</tbody></table>`);
    assert.equal(resplitDoc(doc, [{ slide: 1, ratio: 2 }], cap).changed, 0);
  });

  test('renumbers every section after a mid-deck split', () => {
    const doc = docSec(1, 'quote', '<p>a</p>') + docSec(2, 'cards', list(8)) + docSec(3, 'quote', '<p>b</p>');
    const { html } = resplitDoc(doc, [{ slide: 2, ratio: 1.9 }], cap);
    assert.deepEqual(nums(html), [1, 2, 3, 4]); // quote, cards×2, quote
  });

  test('re-paginates the page-number badge so split copies do not repeat the original', () => {
    // Two paginated slides; the second (cards) splits in two. The baked pagination
    // (1, 2) must become 1, 2, 3 across the now-three pages — not 1, 2, 2.
    const pg = (n, cls, inner) => `<section data-lattice-slide="${n}" data-lattice-pagination="${n}" data-lattice-pagination-total="2" class="${cls}">${inner}</section>`;
    const doc = pg(1, 'quote', '<p>a</p>') + pg(2, 'cards', list(8));
    const { html } = resplitDoc(doc, [{ slide: 2, ratio: 1.9 }], cap);
    const pages = [...html.matchAll(/data-lattice-pagination="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(pages, [1, 2, 3]); // monotonic — no repeated badge
    assert.ok([...html.matchAll(/data-lattice-pagination-total="(\d+)"/g)].every((m) => m[1] === '3'));
  });

  // The engine numbers a slide by its ABSOLUTE position and totals the WHOLE deck
  // (lib/engine/slides.js §3: "Count EVERY slide… A `_paginate: false` slide is still
  // counted (its number is hidden), so the next paginated slide reads its true
  // position, not one less"). The re-paginate after a split has to agree, or every
  // page following a hidden slide reads one low — including pages the split never
  // touched. This test used to assert the opposite (`[1, 2]`), pinning a divergence
  // from the engine that predated the envelope.
  test('a paginate:false slide is not numbered but STILL advances the counter', () => {
    const doc =
      '<section data-lattice-slide="1" class="title"><h1>cover</h1></section>' +
      `<section data-lattice-slide="2" data-lattice-pagination="2" data-lattice-pagination-total="2" class="cards">${list(8)}</section>`;
    const { html } = resplitDoc(doc, [{ slide: 2, ratio: 1.9 }], cap);
    const pages = [...html.matchAll(/data-lattice-pagination="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(pages, [2, 3]); // the hidden title holds position 1
    assert.ok([...html.matchAll(/data-lattice-pagination-total="(\d+)"/g)].every((m) => m[1] === '3'));
  });

  test('a SECOND measured pass re-splitting an already-"(cont.)" body page does not double the marker', () => {
    // A page a first pass already split (lat-split-native, heading already carries the
    // marker) that STILL overflows on re-measure. `emitParts` must not stack a second
    // "(cont.)" onto the piece that inherits the already-marked heading.
    const already = '<h2>T <span class="lat-cont">(cont.)</span></h2>' + list(8);
    const doc = docSec(1, 'cards lat-split-native', already);
    const { html, changed } = resplitDoc(doc, [{ slide: 1, ratio: 1.9 }], cap);
    assert.equal(changed, 1);
    assert.equal((html.match(/<section/g) || []).length, 2);
    for (const heading of html.match(/<h2>.*?<\/h2>/g) || []) {
      assert.equal((heading.match(/class="lat-cont"/g) || []).length, 1,
        `expected exactly one (cont.) marker per heading, got: ${heading}`);
    }
  });

  test('a split does not shift the numbers of slides AFTER it', () => {
    // Hidden, hidden, splitting, trailing — the trailing slide's number must be its
    // real position in the grown deck (5), and the total the whole deck's count.
    const hidden = (n, cls) => `<section data-lattice-slide="${n}" class="${cls}"><p>x</p></section>`;
    const paged = (n, cls, inner) => `<section data-lattice-slide="${n}" data-lattice-pagination="${n}" data-lattice-pagination-total="4" class="${cls}">${inner}</section>`;
    const doc = hidden(1, 'title') + hidden(2, 'content') + paged(3, 'cards', `<h2>T</h2>${list(8)}`) + paged(4, 'content', '<p>after</p>');
    const { html } = resplitDoc(doc, [{ slide: 3, ratio: 1.9 }], cap);
    const pages = [...html.matchAll(/data-lattice-pagination="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(pages, [3, 4, 5, 6]); // cover 3, bodies 4-5, trailing 6
    assert.ok([...html.matchAll(/data-lattice-pagination-total="(\d+)"/g)].every((m) => m[1] === '6'));
  });
});

describe('core: applyRails', () => {
  const railOf = (sectionHtml) => {
    const m = sectionHtml.match(/<nav class="lat-split-rail"[\s\S]*?<\/nav>/);
    if (!m) return null;
    return { total: (m[0].match(/<span/g) || []).length, on: (m[0].match(/seg on/g) || []).length };
  };
  const run = (id, n, cls = 'x') => Array.from({ length: n }, () => `<section data-lattice-slide="0" data-split-run="${id}" class="${cls}"><p>p</p></section>`).join('');

  test('stamps a k-of-N rail across each run, lit through the current page', () => {
    const html = run('a', 3) + run('b', 2);
    const out = applyRails(html);
    const secs = out.match(/<section[\s\S]*?<\/section>/g);
    assert.deepEqual(secs.map(railOf), [
      { total: 3, on: 1 }, { total: 3, on: 2 }, { total: 3, on: 3 },
      { total: 2, on: 1 }, { total: 2, on: 2 },
    ]);
  });

  test('a lone section (run of one) and an untagged section get no rail', () => {
    const html = run('solo', 1) + '<section data-lattice-slide="0" class="plain"><p>p</p></section>';
    const out = applyRails(html);
    assert.equal((out.match(/lat-split-rail/g) || []).length, 0);
  });

  test('idempotent — re-applying strips the prior rails and re-stamps the same result', () => {
    const html = run('a', 4);
    const once = applyRails(html);
    assert.equal(applyRails(once), once);
  });

  test('whitespace gaps between members do not break a run', () => {
    const html = run('a', 2).replace('</section><section', '</section>\n  <section');
    const out = applyRails(html);
    assert.deepEqual((out.match(/<section[\s\S]*?<\/section>/g)).map(railOf), [{ total: 2, on: 1 }, { total: 2, on: 2 }]);
  });

  test('ignores literal <section> text in a leading head prefix (CSS/comments)', () => {
    const head = '<style>section.state{color:red}</style>';
    const html = head + run('a', 2);
    const out = applyRails(html);
    assert.ok(out.startsWith(head)); // prefix untouched
    assert.equal((out.match(/lat-split-rail/g) || []).length, 2);
  });

  test('sets --lat-split-offset on cover-paginate body pages so a counter can continue', () => {
    const cover = '<section data-lattice-slide="0" data-split-run="r" class="lat-split-cover" style="--x:1;"><p>c</p></section>';
    const body = (n) => `<section data-lattice-slide="0" data-split-run="r" class="q-and-a lat-split-native" style="--x:1;"><ul>${'<li>q</li>'.repeat(n)}</ul></section>`;
    const out = applyRails(cover + body(2) + body(1) + body(3));
    // first body starts at 0 (no offset stamped); next two carry the cumulative item count
    assert.deepEqual([...out.matchAll(/--lat-split-offset:(\d+)/g)].map((m) => Number(m[1])), [2, 3]);
    // the cover (not lat-split-native) is never given an offset
    assert.ok(!/--lat-split-offset/.test(out.match(/<section[^>]*lat-split-cover[^>]*>/)[0]));
  });
});

// ── §8 rule 10 — the static pass DEFERS, it never cuts ──────────────────────────
describe('core: autoSplitDeck — defer-only (§8 rule 10)', () => {
  test('an over-capacity slide is NAMED, not divided — the bytes are untouched', () => {
    const html = docify(sec('cards', `<h2>T</h2>${list(9)}`)); // 9 > hard 4
    const r = autoSplitDeck(html, cap);
    assert.equal(r.html, html, 'the pre-render pass must emit no partition');
    assert.equal(r.splits, 0);
    assert.deepEqual(r.deferred, [1], 'it hands slide 1 to the measured loop');
  });

  test('a slide AT capacity is not even deferred', () => {
    const r = autoSplitDeck(docify(sec('cards', `<h2>T</h2>${list(4)}`)), cap);
    assert.deepEqual(r.deferred, []);
  });

  test('deferred slides are numbered by ORDINAL position, not `data-lattice-slide`', () => {
    // This pass runs BEFORE the emulator stamps that attribute (it stamps it from this pass's
    // output), so reading it here yielded 0 for every slide — caught on a real render.
    const html = sec('quote', '<blockquote>x</blockquote>') + sec('cards', list(9)) + sec('cards', list(9));
    assert.deepEqual(autoSplitDeck(html, cap).deferred, [2, 3]);
  });

  test('a carousel-recipe layout is the measured pass\'s business, never deferred here', () => {
    const withRecipe = { cards: { axis: 'item', hard: 4, split: { strategy: 'cover-paginate' } } };
    assert.deepEqual(autoSplitDeck(docify(sec('cards', list(9))), withRecipe).deferred, []);
  });

  test('the axis is the RENDERED one (rule 1): a table counts rows, whatever the manifest says', () => {
    // `capacity.axis: 'item'` is an AUTHORING-shape claim — glossary authors a list and renders a
    // table. The count must follow the DOM, or the estimate counts a collection that isn't there.
    const asTable = docify(sec('cards', '<table><tbody>' + Array.from({ length: 9 }, (_, i) => `<tr><td>${i}</td></tr>`).join('') + '</tbody></table>'));
    assert.deepEqual(autoSplitDeck(asTable, cap).deferred, [1], 'nine rows read as nine members');
    const noCollection = docify(sec('cards', '<p>prose only</p>'));
    assert.deepEqual(autoSplitDeck(noCollection, cap).deferred, []);
  });
});
