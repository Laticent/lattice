/**
 * deck-slides — the ONE answer to "which `<section>`s are this document's own slides?",
 * shared by every pass that walks a rendered deck (HARD RULE #1).
 *
 * WHY `section[data-lattice-slide]` IS NOT THAT ANSWER. The engine passes an author's raw
 * HTML through unescaped, so a deck that TEACHES slide markup by pasting a
 * `<section data-lattice-slide>` parses as a section NESTED inside the real slide, and an
 * unscoped query counts it as a slide of its own. Every later slide's number then shifts by
 * one. Measured on a two-slide deck whose second slide overflows: the export's OVERFLOW line
 * said "pages 1, 3".
 *
 * WHY NOT `#deck > section[…]` EITHER. A CSS id selector matches ANY element carrying that
 * id, so a deck that pastes the whole export scaffold (`<main id="deck"><section
 * data-lattice-slide=…>`) still mints the phantom slide, one wrapper deeper. So the
 * container is resolved ONCE with `querySelector`, which returns the FIRST `main#deck` in
 * document order, and the real container always encloses a pasted one. Then only ITS
 * direct children count.
 *
 * WHY `body > …` AS WELL. A slide is not always inside the container: a deck that merely
 * writes a closing main tag ends `main#deck` where it sits, and the parser hangs the
 * remaining slides beside it as body-level siblings. The two buckets are merged back into
 * document order, because the closing-tag split leaves the earlier slides inside and the
 * later ones outside.
 *
 * SELF-CONTAINED BY CONSTRUCTION: nothing is referenced from module scope, because
 * `DECK_SLIDES_SRC` is `.toString()`-injected into the emulator's `page.evaluate` passes
 * (the `PROBE_SRC` idiom in `overflow-probe.js`). The same function runs under jsdom on the
 * `--read` projection path.
 *
 * @param {Document} doc
 * @returns {Element[]} the deck's own slide sections, in document order
 */
function deckSlideSections(doc) {
  const sel = ':scope > section[data-lattice-slide]';
  const root = doc.querySelector('main#deck');
  const inDeck = root ? Array.from(root.querySelectorAll(sel)) : [];
  const atBody = doc.body ? Array.from(doc.body.querySelectorAll(sel)) : [];
  // 0x02 is DOCUMENT_POSITION_PRECEDING: `b` comes before `a`.
  // eslint-disable-next-line no-bitwise
  return inDeck.concat(atBody).sort((a, b) => (a.compareDocumentPosition(b) & 0x02 ? 1 : -1));
}

module.exports = {
  deckSlideSections,
  // Function source for verbatim injection into a page.evaluate — keeps the scope
  // single-sourced. Same idiom as overflow-probe.js's PROBE_SRC.
  DECK_SLIDES_SRC: deckSlideSections.toString(),
};
