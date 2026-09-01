/**
 * Unit: the image component's text panel on a LIVE DOM
 * (lib/core/bg-image.js `wrapImageTextToDom`).
 *
 * IT DOES NOT TEST PARITY WITH THE HTML PASS, though this docblock claimed it did
 * until 2026-09-01. The file never imports `lib/engine`, so there is no second
 * render to compare against — it exercises the DOM adapter alone. The imagery row
 * is registered in `AWAITING_PROBE` in test/unit/core/marp-fidelity-render.test.js
 * for that reason: its runtime side needs a real background image and the layout
 * measurement that follows it, which jsdom does not do.
 *
 * The imagery bucket was the seventh gap the fidelity ledger recorded, and the one
 * that did NOT degrade gracefully: on a Marp render the `![bg]` fell to Marp's own
 * advanced-background machinery (photo full-bleed) and the prose sat on top of it
 * unscrimmed, so a heading over a bright area was barely legible.
 *
 * Closing it took TWO halves, and this file covers the second. The `![bg]` lift is
 * a SOURCE transform, now baked into the exported deck like the splits and the
 * glossary; the `.image-text` fold is an HTML pass the engine runs after its Tile
 * injectors, which had no live-DOM counterpart. Neither half alone is enough —
 * baking only the lift renders the photo correctly and scatters the prose.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const bgImage = require('../../../lib/core/bg-image');

const BG = '<div class="lattice-bg lattice-bg-right" style="background-image:url(\'a.jpg\')"></div>';
const PROSE = '<p><code>Offsite</code></p><h2>A lake view.</h2><p>Body prose.</p>';
const dom = (inner, cls = 'image') =>
  new JSDOM(`<article><section class="${cls}">${inner}</section></article>`).window.document;

describe('image text panel — applyToDom', () => {
  test('folds the prose into .image-text, leaving the bg panel a sibling', () => {
    const doc = dom(BG + PROSE);
    bgImage.wrapImageTextToDom(doc);
    const section = doc.querySelector('section.image');
    assert.equal(section.querySelectorAll(':scope > .image-text').length, 1);
    assert.ok(section.querySelector(':scope > .lattice-bg'), 'the bg panel stays a direct child');
    const panel = section.querySelector('.image-text');
    assert.equal(panel.querySelector('h2').textContent, 'A lake view.');
    assert.equal(panel.querySelectorAll('p').length, 2);
    assert.equal(panel.querySelector('.lattice-bg'), null, 'the bg is not folded in');
  });

  test('header and footer stay siblings — they are chrome, not slot content', () => {
    const doc = dom(`<header>h</header>${BG}${PROSE}<footer>f</footer>`);
    bgImage.wrapImageTextToDom(doc);
    const section = doc.querySelector('section.image');
    assert.ok(section.querySelector(':scope > header'), 'header stays out');
    assert.ok(section.querySelector(':scope > footer'), 'footer stays out');
    assert.equal(section.querySelector('.image-text header'), null);
    assert.equal(section.querySelector('.image-text footer'), null);
  });

  // Two keep-outs the string version never needs, because on the engine path
  // neither element exists yet when it runs. In the runtime both do.
  test('the scrim and the backdrop stay siblings, not folded into the panel', () => {
    const doc = dom(
      `<div class="backdrop" aria-hidden="true"><i class="backdrop-mask"></i></div>`
      + `${BG}<div class="image-scrim" aria-hidden="true"></div>${PROSE}`,
      'image statement finish',
    );
    bgImage.wrapImageTextToDom(doc);
    const section = doc.querySelector('section.image');
    assert.ok(section.querySelector(':scope > .backdrop'), 'backdrop stays a direct child');
    assert.ok(section.querySelector(':scope > .image-scrim'), 'scrim stays a direct child');
    assert.equal(section.querySelector('.image-text .backdrop'), null,
      'folding the backdrop in would break section.finish > .backdrop');
    assert.equal(section.querySelector('.image-text .image-scrim'), null);
  });

  test('an image-only slide is left alone — an empty panel would steal grid space', () => {
    const doc = dom(BG);
    bgImage.wrapImageTextToDom(doc);
    assert.equal(doc.querySelector('.image-text'), null);
    const whitespace = dom(`${BG}<p>   </p>`);
    bgImage.wrapImageTextToDom(whitespace);
    assert.equal(whitespace.querySelector('.image-text'), null, 'whitespace-only prose is no prose');
  });

  test('is idempotent, and leaves a non-image section alone', () => {
    const doc = dom(BG + PROSE);
    bgImage.wrapImageTextToDom(doc);
    const once = doc.querySelector('section.image').innerHTML;
    bgImage.wrapImageTextToDom(doc);
    bgImage.wrapImageTextToDom(doc);
    assert.equal(doc.querySelector('section.image').innerHTML, once);

    const content = dom(BG + PROSE, 'content');
    bgImage.wrapImageTextToDom(content);
    assert.equal(content.querySelector('.image-text'), null);
  });

  test('nodes are MOVED, not re-serialized — markup-looking prose stays text', () => {
    const doc = dom(`${BG}<h2>A &lt;script&gt;x&lt;/script&gt; title</h2><p>Body <code>c</code>.</p>`);
    bgImage.wrapImageTextToDom(doc);
    assert.equal(doc.querySelector('.image-text h2').textContent, 'A <script>x</script> title');
    assert.equal(doc.querySelectorAll('script').length, 0);
    assert.equal(doc.querySelector('.image-text code').textContent, 'c', 'real markup survives as an element');
  });

  test('survives a null / non-DOM root', () => {
    assert.doesNotThrow(() => bgImage.wrapImageTextToDom(null));
    assert.doesNotThrow(() => bgImage.wrapImageTextToDom({}));
  });
});

// Each of these was found by an independent checker on the first cut of this change.
// They are the reason the keep-out list is longer than the string version's and the
// reason the decision is stamped rather than re-made on every pass.
describe('image text panel — what later passes inject stays out', () => {
  test('the deck logo and the overflow tab are never folded in', () => {
    const doc = dom(`<img class="deck-logo" alt=""/>${BG}${PROSE}<div class="overflow-tab">Overflows</div>`);
    bgImage.wrapImageTextToDom(doc);
    const section = doc.querySelector('section.image');
    assert.ok(section.querySelector(':scope > img.deck-logo'), 'the logo stays a direct child');
    assert.ok(section.querySelector(':scope > .overflow-tab'), 'the overflow tab stays a direct child');
    // Both owners re-inject when their element is not a DIRECT child, so folding one
    // in duplicates it — that is how a prose-less slide ended up with two logos.
    assert.equal(section.querySelectorAll('.image-text img.deck-logo').length, 0);
    assert.equal(section.querySelectorAll('.image-text .overflow-tab').length, 0);
  });

  // An exported deck carries the runtime `<script src>` tags at EOF, which makes them
  // children of the LAST slide. Folded in, one becomes the panel's `:last-child` and
  // steals the `> :last-child { padding-bottom: 0 }` collapse from the real content —
  // measured as a 24px-taller panel than the engine's.
  test('script / style / template stay out, so :last-child stays the real content', () => {
    const doc = dom(`${BG}${PROSE}<script src="lattice-runtime.min.js"></script><style>a{}</style>`);
    bgImage.wrapImageTextToDom(doc);
    const panel = doc.querySelector('.image-text');
    assert.equal(panel.querySelector('script'), null);
    assert.equal(panel.querySelector('style'), null);
    assert.equal(panel.lastElementChild.tagName.toLowerCase(), 'p', 'the last child is the real prose');
  });

  // The decide-once stamp. The overflow watcher appends a `.overflow-tab` reading
  // "Overflows" AFTER the first transform pass, so a prose-LESS image slide answered
  // "no prose" on pass 1 and then found text on pass 2 — building a spurious white
  // card over the photo and duplicating the chrome it swept in.
  test('a prose-less slide stays panel-less even after a later pass adds chrome', () => {
    const doc = dom(BG);
    bgImage.wrapImageTextToDom(doc);
    assert.equal(doc.querySelector('.image-text'), null, 'pass 1: no prose, no panel');
    const section = doc.querySelector('section.image');
    const tab = doc.createElement('div');
    tab.className = 'overflow-tab';
    tab.textContent = 'Overflows';
    section.appendChild(tab);
    bgImage.wrapImageTextToDom(doc);
    assert.equal(doc.querySelector('.image-text'), null, 'pass 2: the decision is not re-made');
  });

  test('a nested section.image is not a slide and is left alone', () => {
    const doc = dom(`${BG}<p>Outer prose.</p><section class="image"><p>Inner.</p></section>`);
    bgImage.wrapImageTextToDom(doc);
    const outer = doc.querySelector('article > section.image');
    const nested = doc.querySelector('section.image section.image');
    assert.ok(outer.querySelector(':scope > .image-text'), 'the slide itself is wrapped');
    assert.equal(nested.querySelector('.image-text'), null, 'the nested one is not a slide');
    assert.equal(doc.querySelectorAll('.image-text').length, 1, 'exactly one panel');
  });

  test('a comment is not prose', () => {
    const doc = dom(`${BG}<!-- a speaker note -->`);
    bgImage.wrapImageTextToDom(doc);
    assert.equal(doc.querySelector('.image-text'), null);
  });
});

describe('bgDiv — the URL cannot leave its attribute', () => {
  test("markdown's optional title is stripped, not escaped into the URL", () => {
    const div = bgImage.bgDiv('right', 'assets/p.jpg "A caption"', undefined);
    assert.equal(div, '<div class="lattice-bg lattice-bg-right" style="background-image:url(\'assets/p.jpg\')"></div>');
  });

  test('quotes and angle brackets are percent-encoded, so no attribute is injected', () => {
    const div = bgImage.bgDiv('', 'x.jpg" onerror=alert(1) data-y="', undefined);
    const doc = new JSDOM(`<section>${div}</section>`).window.document.querySelector('.lattice-bg');
    assert.equal(doc.getAttributeNames().sort().join(','), 'class,style', 'only the two real attributes');
    assert.equal(doc.getAttribute('onerror'), null);
  });
});

describe('image text panel — the two implementations agree', () => {
  // The string pass reorders to header + bg + panel + footer; the DOM pass folds in
  // place. Sibling order carries no layout meaning here (bg / scrim / backdrop are
  // absolutely positioned, header/footer are chrome), so parity is asserted on WHAT
  // ends up inside the panel and what stays outside it.
  const parity = (inner, cls = 'image') => {
    const html = bgImage.wrapImageText(`<section class="${cls}">${inner}</section>`);
    const fromHtml = new JSDOM(`<article>${html}</article>`).window.document;
    const fromDom = dom(inner, cls);
    bgImage.wrapImageTextToDom(fromDom);
    const panelOf = (d) => d.querySelector('.image-text');
    const outsideOf = (d) => [...d.querySelector('section').children]
      .filter((el) => !el.classList.contains('image-text'))
      .map((el) => el.tagName.toLowerCase() + (el.className ? `.${el.className.split(' ')[0]}` : ''))
      .sort();
    return { fromHtml, fromDom, panelOf, outsideOf };
  };

  for (const [name, inner, cls] of [
    ['prose + bg', BG + PROSE, 'image'],
    ['prose + bg + chrome', `<header>h</header>${BG}${PROSE}<footer>f</footer>`, 'image'],
    ['image only', BG, 'image'],
    ['a full-bleed variant', BG + PROSE, 'image full'],
    ['no bg at all', PROSE, 'image'],
    // Two `![bg]` on one slide: the string pass pulled out only the FIRST, folding the
    // second into the panel — so `:has(> .lattice-bg-left)` stopped matching and the
    // composition mirror fired on one path and not the other, swapping panel and photo.
    ['two bg panels', `${BG}<div class="lattice-bg lattice-bg-left"></div>${PROSE}`, 'image'],
    // `\bimage\b` matched `image-hero`, which `section.image` does not.
    ['a class that merely CONTAINS image', PROSE, 'image-hero'],
  ]) {
    test(`same panel contents and same siblings — ${name}`, () => {
      const { fromHtml, fromDom, panelOf, outsideOf } = parity(inner, cls);
      const a = panelOf(fromHtml);
      const b = panelOf(fromDom);
      assert.equal(!!a, !!b, `both paths agree on WHETHER to wrap (${name})`);
      if (a) assert.equal(b.innerHTML.trim(), a.innerHTML.trim(), `same folded content (${name})`);
      assert.deepEqual(outsideOf(fromDom), outsideOf(fromHtml), `same siblings left outside (${name})`);
    });
  }
});
