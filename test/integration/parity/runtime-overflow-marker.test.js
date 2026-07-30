/**
 * Integration: the `overflow-marker:` register, exercised through the REAL bundled
 * runtime (`dist/lattice-runtime.js`) in jsdom — the same harness shape as
 * runtime-frontmatter-refire.test.js, and for the same reason: the bootstrap IIFE
 * is not requireable, so a unit test can only reach the pure resolvers.
 *
 * That gap is exactly where the risk was. The adversarial trio on this change found
 * that every test pinned a pure function while the two pieces of actual WIRING had
 * none — and all three of the confirmed correctness findings lived in that gap:
 *
 *   1. `deckOverflowMarker`'s surface heuristic. With no explicit fallback the
 *      PRESENCE of a baked front-matter block decides the default: a block means
 *      an Export-to-Marp bundle (→ `reader`), no block means a live preview
 *      (→ `author`). Getting that backwards is the original reported defect — a
 *      delivered deck covered in "FIX ME" overlays — so it is pinned here.
 *   2. The per-section `data-lattice-overflow-marker` stamp. It is what the CSS
 *      tone rules key on; unstamped, a reader-level slide silently renders the
 *      author red ring. It is also what makes `off` survive a CONCURRENT watcher
 *      (the emulator embeds its own), which a one-shot JS sweep cannot.
 *
 * These assert the runtime's DOM decisions, not pixels — pixels are verified by
 * rendering the committed probe through real marp-cli
 * (test/fixtures/overflow-marker-probe.md; HARD RULE #23). A green run here is not
 * a claim about how the slide looks.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { frontMatterBlock } = require('../../../lib/core/deck-front-matter');

const RUNTIME_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js'),
  'utf8',
);

const SLIDE = '<section class="content"><h2>Title</h2><p>Body.</p></section>';
const deckWith = (fm) => `---\n${fm}\n---\n\n## Title\n\nBody.\n`;

/**
 * Boot the real runtime over a document, optionally carrying a baked block.
 * `fetch` is stubbed to reject so the fetch fallback can never quietly supply the
 * front matter — every answer here has to come from the baked block or the default.
 */
async function boot({ block = '', markup = SLIDE } = {}) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>${markup}${block}</body></html>`,
    { url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
  );
  dom.window.fetch = () => Promise.reject(new Error('no network in this test'));
  const el = dom.window.document.createElement('script');
  el.textContent = RUNTIME_SRC;
  dom.window.document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 300));
  return dom;
}

const levelsOn = (doc) => [...doc.querySelectorAll('section[data-lattice-slide]')]
  .map((s) => s.getAttribute('data-lattice-overflow-marker'));

describe('overflow-marker — the surface heuristic decides the default', () => {
  // The defect that started this: an Export-to-Marp bundle renders through this
  // runtime inside marp-cli's browser, and with no signal it took the AUTHORING
  // default. The baked block IS the signal — it is written by one function and
  // only ever by an export producer.
  test('a document carrying a baked block is an export → reader', async () => {
    const dom = await boot({ block: frontMatterBlock(deckWith('theme: indaco')) });
    assert.deepEqual(levelsOn(dom.window.document), ['reader']);
    dom.window.close();
  });

  test('a document with no baked block is an authoring surface → author', async () => {
    const dom = await boot();
    assert.deepEqual(levelsOn(dom.window.document), ['author']);
    dom.window.close();
  });

  test("the deck's own key overrides the surface default, both ways", async () => {
    const asAuthor = await boot({ block: frontMatterBlock(deckWith('overflow-marker: author')) });
    assert.deepEqual(levelsOn(asAuthor.window.document), ['author'], 'a bundle can ask for the author signal');
    asAuthor.window.close();

    const asOff = await boot({ block: frontMatterBlock(deckWith('overflow-marker: off')) });
    assert.deepEqual(levelsOn(asOff.window.document), ['off']);
    asOff.window.close();
  });

  // A typo must never decide what a delivered artifact shows, and it must never
  // reach the CSS: an unnormalized level would stamp `quiet`, the `[…="reader"]`
  // gate would miss, and the slide would carry the reader's label inside the
  // author's red ring.
  test('an unrecognized value falls back to a REAL level, never stamps itself', async () => {
    const dom = await boot({ block: frontMatterBlock(deckWith('overflow-marker: quiet')) });
    assert.deepEqual(levelsOn(dom.window.document), ['reader']);
    dom.window.close();
  });

  test('a nested key of the same name does not decide the artifact', async () => {
    const dom = await boot({ block: frontMatterBlock(deckWith('meta:\n  overflow-marker: off')) });
    assert.deepEqual(levelsOn(dom.window.document), ['reader'], 'the export default, not the nested value');
    dom.window.close();
  });
});

describe('overflow-marker — `off` clears what is already there and stays stamped', () => {
  // `off` returns before installing the probe, so the stamp has to happen on the
  // way out. It is the half that survives lattice-emulator.js's own inline watcher,
  // which re-adds `.overflow` on font-settle and on every resize — a race a
  // one-shot sweep loses, and the reason the suppression is also expressed in CSS.
  test('a pre-marked document is swept AND every slide is stamped off', async () => {
    const marked = '<section class="content overflow illegible">'
      + '<h2>T</h2><div class="overflow-tab">Overflows</div>'
      + '<div class="illegible-tab">Type 3px · floor 8.4px</div></section>';
    const dom = await boot({ markup: marked, block: frontMatterBlock(deckWith('overflow-marker: off')) });
    const { document } = dom.window;
    assert.deepEqual(levelsOn(document), ['off'], 'stamped, so the CSS suppression can key on it');
    assert.equal(document.querySelectorAll('.overflow, .illegible').length, 0, 'the rings are gone');
    assert.equal(document.querySelectorAll('.overflow-tab, .illegible-tab').length, 0, 'the tabs are gone');
    dom.window.close();
  });
});
