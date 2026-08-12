/**
 * Unit: lib/core/fit-berth.js — the overflow marker's chrome, emitted with the
 * slide instead of conjured by a watcher.
 *
 * Two adapters that must agree (HARD RULE #1), and one property that is the
 * whole point of the change: after either adapter runs, NOTHING has to create a
 * node to draw a marker. The suite asserts the agreement directly rather than
 * testing each adapter against its own hand-written expectation — that is the
 * shape of drift this file exists to prevent.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { BERTHS, applyToHtml, applyToDocHtml, applyToDom, berth, BERTH_SRC } = require('../../../lib/core/fit-berth');

const SLIDE = '<article class="lattice"><section class="content" data-lattice-slide><h2>A</h2></section></article>';
const docOf = (html) => new JSDOM(html).window.document;
// Qualified on the ATTRIBUTE, like every other consumer. Filtering on the class
// alone would count an author's own `<div class="overflow-tab">` as a berth —
// exactly the conflation `data-lattice-berth` exists to end, so a helper that made
// it would quietly weaken every assertion built on it.
const berthsIn = (section) => [...section.children]
  .filter((el) => BERTHS.includes(el.className) && el.hasAttribute('data-lattice-berth'))
  .map((el) => el.className);

describe('applyToHtml — the engine path', () => {
  test('berths every slide', () => {
    const out = applyToHtml(SLIDE);
    const s = docOf(out).querySelector('section');
    assert.deepEqual(berthsIn(s), BERTHS);
  });

  test('the berth is a DIRECT CHILD of the section, and LAST', () => {
    // Both halves are load-bearing. Every reveal rule is `section.x > .y`, so a
    // berth one level down is invisible; and a berth that is not last would be
    // swept into `.cell-stage` by the Form composition — inside the very box it
    // reports on.
    const s = docOf(applyToHtml(SLIDE)).querySelector('section');
    assert.equal(s.lastElementChild.className, BERTHS[BERTHS.length - 1]);
    for (const cls of BERTHS) {
      assert.equal(s.querySelectorAll(`:scope > .${cls}`).length, 1, `${cls} is a direct child`);
    }
  });

  test('every berth is EMPTY — a berth is not a marker', () => {
    const s = docOf(applyToHtml(SLIDE)).querySelector('section');
    for (const cls of BERTHS) {
      assert.equal(s.querySelector(`.${cls}`).textContent, '', `${cls} ships empty`);
    }
  });

  test('is idempotent — a second pass adds nothing', () => {
    const once = applyToHtml(SLIDE);
    assert.equal(applyToHtml(once), once);
  });

  test('berths every slide in a multi-slide deck', () => {
    const deck = `<article class="lattice">${'<section data-lattice-slide><h2>x</h2></section>'.repeat(4)}</article>`;
    const doc = docOf(applyToHtml(deck));
    for (const s of doc.querySelectorAll('section')) assert.deepEqual(berthsIn(s), BERTHS);
  });

  test('leaves a document with no sections alone', () => {
    assert.equal(applyToHtml('<p>no slides here</p>'), '<p>no slides here</p>');
  });

  test('passes a non-string through untouched', () => {
    assert.equal(applyToHtml(null), null);
    assert.equal(applyToHtml(undefined), undefined);
  });
});

describe('applyToDom — the runtime path', () => {
  test('produces the SAME berth as the string adapter', () => {
    // The agreement itself, asserted rather than assumed: a `--fluid` export runs
    // markup from one and a watcher from the other.
    const fromHtml = docOf(applyToHtml(SLIDE)).querySelector('section');
    const domDoc = docOf(SLIDE);
    applyToDom(domDoc);
    assert.deepEqual(berthsIn(domDoc.querySelector('section')), berthsIn(fromHtml));
  });

  test('is idempotent', () => {
    const doc = docOf(SLIDE);
    applyToDom(doc);
    applyToDom(doc);
    assert.deepEqual(berthsIn(doc.querySelector('section')), BERTHS);
  });

  test('does not berth a document already berthed by the engine', () => {
    const doc = docOf(applyToHtml(SLIDE));
    applyToDom(doc);
    assert.deepEqual(berthsIn(doc.querySelector('section')), BERTHS);
  });

  test('survives a null / non-DOM root', () => {
    assert.doesNotThrow(() => applyToDom(null));
    assert.doesNotThrow(() => applyToDom({}));
  });
});

describe('berth() — reaching a berth the watcher no longer owns', () => {
  test('finds the berth the markup carries', () => {
    const s = docOf(applyToHtml(SLIDE)).querySelector('section');
    assert.equal(berth(s, 'overflow-tab'), s.querySelector('.overflow-tab'));
  });

  test('MINTS one on a document that was never berthed', () => {
    // The miss branch should be unreachable — but a marker that goes silent
    // because a transform did not run is the exact failure this register exists
    // to prevent (#1299). It creates rather than returning null.
    const s = docOf(SLIDE).querySelector('section');
    const t = berth(s, 'overflow-tab');
    assert.ok(t, 'minted');
    assert.equal(t.className, 'overflow-tab');
    assert.equal(s.querySelector(':scope > .overflow-tab'), t, 'and it is a direct child');
  });

  test('mints AT MOST once — a second call returns the same element', () => {
    const s = docOf(SLIDE).querySelector('section');
    assert.equal(berth(s, 'overflow-tab'), berth(s, 'overflow-tab'));
    assert.equal(s.querySelectorAll('.overflow-tab').length, 1);
  });

  test('survives a null / non-element', () => {
    assert.equal(berth(null, 'overflow-tab'), null);
    assert.equal(berth({}, 'overflow-tab'), null);
  });

  test('the INJECTED source is the same function, not a re-typed copy', () => {
    // The emulator's inline watcher gets this by `.toString()`; if the two ever
    // diverge, a --fluid export grows a second marker beside the runtime's.
    const injected = new Function(`return (${BERTH_SRC})`)();
    const a = docOf(SLIDE).querySelector('section');
    const b = docOf(SLIDE).querySelector('section');
    assert.equal(injected(a, 'overflow-tab').outerHTML, berth(b, 'overflow-tab').outerHTML);
  });
});

describe('applyToDocHtml — an assembled document, not a run of slides', () => {
  // The export calls this after auto-split converges. An assembled document
  // carries embedded chrome whose comments mention `<section …>` as PROSE, and
  // those substrings derail the depth-aware walker — it never balances a close and
  // bails, returning nothing. That is not hypothetical: `splitSections` on a real
  // exported sidecar found zero sections. So the head prefix is sliced off first,
  // mirroring what `resplitDoc` already does for the identical hazard.
  const DOC = '<!doctype html><html><head><style>/* a <section …> mentioned in prose */</style>'
    + '<script>/* and again: <section class="x"> */</script></head><body>'
    + '<section data-lattice-slide="1" class="content"><h2>A</h2></section>'
    + '<section data-lattice-slide="2" class="content"><h2>B</h2></section>'
    + '</body></html>';

  test('berths every slide of a document whose head mentions <section> in prose', () => {
    const out = applyToDocHtml(DOC);
    const doc = docOf(out);
    const slides = [...doc.querySelectorAll('section[data-lattice-slide]')];
    assert.equal(slides.length, 2);
    for (const s of slides) assert.deepEqual(berthsIn(s), BERTHS);
  });

  test('leaves the head prefix byte-identical', () => {
    const out = applyToDocHtml(DOC);
    const head = DOC.slice(0, DOC.indexOf('<section data-lattice-slide'));
    assert.ok(out.startsWith(head), 'the sliced prefix must be re-emitted unchanged');
  });

  test('is idempotent, and a no-op on a document with no slides', () => {
    const once = applyToDocHtml(DOC);
    assert.equal(applyToDocHtml(once), once);
    assert.equal(applyToDocHtml('<html><body><p>nothing</p></body></html>'),
      '<html><body><p>nothing</p></body></html>');
    assert.equal(applyToDocHtml(null), null);
  });
});

describe('an author cannot collide with the berth, in either direction', () => {
  // `lib/engine/index.js` sets `html: true`, so an author can type
  // `<div class="overflow-tab">CONFIDENTIAL</div>` straight into their markdown.
  // These three class names became engine-emitted contract markup in this change,
  // which turned that from a curiosity into two live defects — both found by the
  // HARD RULE #25 red team on real engine renders. `data-lattice-berth` is what
  // tells the two apart.
  const AUTHOR = '<div class="overflow-tab">CONFIDENTIAL — internal only</div>';

  test('an author div carrying the class does not suppress the slide\'s berths', () => {
    // The idempotency test used to be `inner.includes('class="overflow-tab"')` —
    // a substring search over the whole slide — so ONE author div anywhere meant
    // the slide got NO berths at all: every register silent there, and the string
    // path out of sync with the DOM path (HARD RULE #1).
    const out = applyToHtml(`<article><section data-lattice-slide><h2>A</h2>${AUTHOR}</section></article>`);
    const s = docOf(out).querySelector('section');
    assert.deepEqual(berthsIn(s), BERTHS, 'all three berths still emitted');
  });

  test('berth() does not adopt the author element, and never writes over its text', () => {
    const doc = docOf(`<article><section data-lattice-slide><h2>A</h2>${AUTHOR}</section></article>`);
    const s = doc.querySelector('section');
    const mine = berth(s, 'overflow-tab');
    assert.ok(mine.hasAttribute('data-lattice-berth'), 'minted its own, attribute-marked');
    assert.notEqual(mine, s.querySelector('.overflow-tab:not([data-lattice-berth])'));
    assert.equal(
      s.querySelector('.overflow-tab:not([data-lattice-berth])').textContent,
      'CONFIDENTIAL — internal only',
      "the author's own content is untouched",
    );
  });

  test('every emitted berth carries the attribute — it is what makes it identifiable', () => {
    const s = docOf(applyToHtml(SLIDE)).querySelector('section');
    for (const cls of BERTHS) {
      assert.ok(s.querySelector(`:scope > .${cls}`).hasAttribute('data-lattice-berth'), cls);
    }
  });

  test('the idempotency test is anchored to the END, not a substring anywhere', () => {
    // Author content that merely LOOKS like a berth must not read as "already ran".
    const withDecoy = `<article><section data-lattice-slide><h2>A</h2>${AUTHOR}</section></article>`;
    const once = applyToHtml(withDecoy);
    assert.equal(applyToHtml(once), once, 'still idempotent on its own output');
    assert.notEqual(once, withDecoy, 'and the decoy did not stop the first pass');
  });
});
