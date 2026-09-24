const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { deckSlideSections, DECK_SLIDES_SRC } = require('../../../lib/core/deck-slides');

const ids = (doc, fn = deckSlideSections) => fn(doc).map((s) => s.getAttribute('data-lattice-slide'));
const doc = (body) => new JSDOM(`<!doctype html><body>${body}</body>`).window.document;

test('a pasted scaffold inside a slide is not a slide', () => {
  const d = doc('<main id="deck"><section data-lattice-slide="1"><main id="deck">' +
    '<section data-lattice-slide="X"></section></main></section><section data-lattice-slide="2"></section></main>');
  assert.deepEqual(ids(d), ['1', '2']);
});

test('slides the parser hung beside the container keep document order', () => {
  // An author-written closing main tag ends main#deck early; later slides land at body level.
  const d = doc('<main id="deck"><section data-lattice-slide="1"></section></main><section data-lattice-slide="2"></section>');
  assert.deepEqual(ids(d), ['1', '2']);
});

test('a document with no container reads body-level slides', () => {
  assert.deepEqual(ids(doc('<section data-lattice-slide="1"></section><section data-lattice-slide="2"></section>')), ['1', '2']);
});

test('the injected source is the same function', () => {
  const d = doc('<main id="deck"><section data-lattice-slide="1"><section data-lattice-slide="X"></section></section></main>');
  assert.deepEqual(ids(d, new Function(`return (${DECK_SLIDES_SRC})`)()), ['1']);
});
