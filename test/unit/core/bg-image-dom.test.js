/**
 * Unit: the image component's text panel on a LIVE DOM
 * (lib/core/bg-image.js `wrapImageTextToDom`) and its parity with the HTML pass.
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
