/**
 * Speaker notes bind to RENDERED PAGES, not authored slides.
 *
 * Notes are authored per slide and injected as an `<aside class="lattice-notes">`
 * before the split runs, so the authored array is indexed by slide. Once a slide
 * paginates, that array is shorter than the page count — and `embedNotesInPdf` guards
 * on length (correctly, so it can never land a note on the wrong page), which means it
 * drops EVERY annotation in the deck. One split slide and a deck loses all its notes,
 * silently apart from one stderr line:
 *
 *     ⚠ Speaker notes: 1 slide notes but 3 PDF pages — skipping note annotations
 *
 * Survivable while splitting was opt-in. Not once it is intrinsic — every portrait
 * deck would lose its notes — which is why this is pinned rather than assumed.
 */

const test = require('node:test');
const assert = require('node:assert');

const { notesPerRenderedPage } = require('../../../lib/authoring/notes-core');

const sec = (openTag, inner) => ({ openTag, inner });
const noted = (text, slide = 1) =>
  `<aside class="lattice-notes" hidden data-slide="${slide}">${text}</aside><ol><li>x</li></ol>`;

test('notesPerRenderedPage', async (t) => {
  await t.test('an unsplit deck is unchanged — one note per page, in order', () => {
    assert.deepStrictEqual(notesPerRenderedPage([
      sec('<section data-lattice-slide="1">', noted('first')),
      sec('<section data-lattice-slide="2">', '<p>no note</p>'),
      sec('<section data-lattice-slide="3">', noted('third', 3)),
    ]), ['first', null, 'third']);
  });

  await t.test('every BODY page of a run keeps the note of the slide it came from', () => {
    // The splitter copies the source inner onto each body page, so the aside rides
    // along with the content it belongs to. Nothing is re-derived.
    assert.deepStrictEqual(notesPerRenderedPage([
      sec('<section data-split-run="1" data-split-role="body">', noted('say this')),
      sec('<section data-split-run="1" data-split-role="body">', noted('say this')),
    ]), ['say this', 'say this']);
  });

  await t.test('the COVER inherits its run\'s note — it is built fresh, so it has no aside', () => {
    // The one page with no aside of its own. A presenter on page 1 of a run wants the
    // note for that run's content, not silence.
    assert.deepStrictEqual(notesPerRenderedPage([
      sec('<section data-split-run="1" data-split-role="cover">', '<div class="split-feat-h">T</div>'),
      sec('<section data-split-run="1" data-split-role="body">', noted('say this')),
      sec('<section data-split-run="1" data-split-role="body">', noted('say this')),
    ]), ['say this', 'say this', 'say this']);
  });

  await t.test('runs do not bleed into each other, or onto unsplit slides', () => {
    assert.deepStrictEqual(notesPerRenderedPage([
      sec('<section data-split-run="1" data-split-role="cover">', '<div>A</div>'),
      sec('<section data-split-run="1" data-split-role="body">', noted('note A')),
      sec('<section data-split-run="2" data-split-role="cover">', '<div>B</div>'),
      sec('<section data-split-run="2" data-split-role="body">', noted('note B')),
      sec('<section data-lattice-slide="9">', '<p>plain, no note</p>'),
    ]), ['note A', 'note A', 'note B', 'note B', null]);
  });

  await t.test('a run whose slide had NO note stays null — nothing is invented', () => {
    assert.deepStrictEqual(notesPerRenderedPage([
      sec('<section data-split-run="1" data-split-role="cover">', '<div>T</div>'),
      sec('<section data-split-run="1" data-split-role="body">', '<ol><li>x</li></ol>'),
    ]), [null, null]);
  });

  await t.test('the injected escaping is undone, and `&amp;` last', () => {
    // The aside is written through escapeHtml, so the annotation text has to come back
    // out as the author wrote it. Order matters: unescaping `&amp;` first would let a
    // literal `&amp;lt;` collapse to `<`.
    assert.deepStrictEqual(
      notesPerRenderedPage([sec('<section data-lattice-slide="1">', noted('a &amp; b &lt;tag&gt;'))]),
      ['a & b <tag>'],
    );
    assert.deepStrictEqual(
      notesPerRenderedPage([sec('<section data-lattice-slide="1">', noted('&amp;lt; stays literal'))]),
      ['&lt; stays literal'],
    );
  });

  await t.test('the length ALWAYS matches the page count — the property the guard needs', () => {
    // The whole reason for this function. `embedNotesInPdf` refuses to annotate when
    // notes.length !== pages.length; deriving from the rendered sections makes that
    // equality hold by construction rather than by luck.
    for (const n of [1, 3, 7]) {
      const pages = Array.from({ length: n }, (_, i) =>
        sec(`<section data-split-run="1" data-split-role="${i ? 'body' : 'cover'}">`, i ? noted('x') : '<div>T</div>'));
      assert.strictEqual(notesPerRenderedPage(pages).length, n);
    }
  });

  await t.test('degenerate input does not throw', () => {
    assert.deepStrictEqual(notesPerRenderedPage([]), []);
    assert.deepStrictEqual(notesPerRenderedPage(null), []);
    assert.deepStrictEqual(notesPerRenderedPage([{}]), [null]);
  });
});
