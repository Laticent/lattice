/**
 * THE `image` SLIDE'S TEXT PANEL LIFTS ONLY THE SLIDE'S OWN PHOTO PANELS (followups.d/3126-p1).
 *
 * `wrapImageText` (lib/core/bg-image.js) moves each `.lattice-bg` panel to section level and folds the rest of the slide into
 * `.image-text`. It used to collect every `<div class="lattice-bg…` with a regex, so an author's raw panel inside a quote, a
 * list item or a plugin's drawing was lifted too and drew as the slide's photo. Now only a panel at section level, or inside
 * nothing but a paragraph (where the engine writes a `![bg]` that sits in prose), is lifted. The DOM mirror
 * (`wrapImageTextToDom`) moves only direct children, and these tests hold both paths to the same answer.
 *
 * Every deck here is rendered by the real engine (`engine.render`), the HTML the CLI, the Studio and the Playground draw.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const engine = require('../../../lib/engine');
const bg = require('../../../lib/core/bg-image');

const e = engine.createEngine();
const firstSection = (html) => html.match(/<section\b[\s\S]*?<\/section>/)[0];
const render = (body) => firstSection(e.render(`---\ntheme: indaco\n---\n\n<!-- _class: image -->\n## Title\n\n${body}\n`).html);
const RAW = `<div class="lattice-bg" style="background-image:url('https://x.test/quoted.jpg')"></div>`;
const PHOTO = '![bg right](https://x.test/photo.jpg)';

/** The section's direct children, by tag and first class, read in a DOM. */
function children(sectionHtml) {
  const { document } = new JSDOM(`<body>${sectionHtml}</body>`).window;
  return document.querySelector('section');
}

describe('wrapImageText lifts only the slide\'s own panels', () => {
  test('a quoted raw panel stays inside its quote, and the slide\'s photo is still lifted', () => {
    const section = children(render(`> quoted ${RAW}\n\n${PHOTO}`));
    const lifted = [...section.querySelectorAll(':scope > .lattice-bg')].map((d) => d.getAttribute('style'));
    assert.equal(lifted.length, 1, 'only the slide\'s photo sits at section level');
    assert.match(lifted[0], /photo\.jpg/);
    const quoted = section.querySelector('.image-text blockquote .lattice-bg');
    assert.ok(quoted, 'the quoted panel is still inside the quote, inside the text panel');
    assert.match(quoted.getAttribute('style'), /quoted\.jpg/);
  });

  test('a raw panel in a list item stays in the list item', () => {
    const section = children(render(`- an item ${RAW}\n\n${PHOTO}`));
    assert.equal(section.querySelectorAll(':scope > .lattice-bg').length, 1);
    assert.ok(section.querySelector('.image-text li .lattice-bg'), 'the panel stays in its list item');
  });

  test('a panel inside a plugin\'s drawing stays in the drawing', () => {
    const html = `<section class="image"><h2>T</h2><div data-lattice-plugin="x">${RAW}</div><p>Words.</p></section>`;
    const section = children(bg.wrapImageText(html));
    assert.equal(section.querySelectorAll(':scope > .lattice-bg').length, 0, 'nothing is lifted');
    assert.ok(section.querySelector('.image-text [data-lattice-plugin] .lattice-bg'));
  });

  test('a `![bg]` written inside a paragraph of the slide\'s own text is still the slide\'s photo', () => {
    const section = children(render(`Some words\n${PHOTO}\n\nMore words.`));
    assert.equal(section.querySelectorAll(':scope > .lattice-bg').length, 1, 'the photo is lifted out of its paragraph');
    assert.equal(section.querySelectorAll('.image-text .lattice-bg').length, 0, 'and nothing is left in the text panel');
  });

  test('a quoted copy of the slide\'s own panel stays put: panels come out by position, not by text', () => {
    const own = `<div class="lattice-bg lattice-bg-right" style="background-image:url('https://x.test/photo.jpg')"></div>`;
    const html = `<section class="image"><h2>T</h2><blockquote>${own}</blockquote>${own}<p>Words.</p></section>`;
    const section = children(bg.wrapImageText(html));
    assert.equal(section.querySelectorAll(':scope > .lattice-bg').length, 1);
    assert.equal(section.querySelectorAll('.image-text blockquote .lattice-bg').length, 1, 'the quoted copy is untouched');
  });

  test('the DOM mirror agrees: a quoted panel is not lifted', () => {
    const html = `<section class="image"><h2>T</h2><blockquote><p>quoted</p>${RAW}</blockquote><p>Words.</p></section>`;
    const dom = new JSDOM(`<body>${html}</body>`);
    bg.wrapImageTextToDom(dom.window.document);
    const viaDom = dom.window.document.querySelector('section');
    const viaString = children(bg.wrapImageText(html));
    for (const section of [viaDom, viaString]) {
      assert.equal(section.querySelectorAll(':scope > .lattice-bg').length, 0);
      assert.ok(section.querySelector('.image-text blockquote .lattice-bg'));
    }
  });
});
