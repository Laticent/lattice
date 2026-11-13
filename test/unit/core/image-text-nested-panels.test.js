/**
 * THE `image` SLIDE'S TEXT PANEL LIFTS ONLY THE SLIDE'S OWN PHOTO PANELS (followups.d/3126-p1).
 *
 * `wrapImageText` (lib/core/bg-image.js) moves each `.lattice-bg` panel to section level and folds the rest of the slide into
 * `.image-text`. It used to collect every `<div class="lattice-bg…` with a regex, so an author's raw panel inside a quote, a
 * list item or a plugin's drawing was lifted too and drew as the slide's photo. Now only a panel at section level, or the
 * image plugin's own panel (a record, or Markdown's picture as its shortcut), is lifted. The DOM mirror
 * (`wrapImageTextToDom`) moves only direct children, and these tests hold both paths to the same answer. Marp's `![bg]`,
 * whose panel the engine used to hoist out of a quote, a list item or a heading, is not read since 2026-11-13; those cases
 * left with it.
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
// The slide's photo as a record: the shortcut stands down on a slide that already holds a raw `.lattice-bg` (lib/core/placed-picture.mjs rule 5).
const PHOTO = '`@image{https://x.test/photo.jpg, title="Photo"}`';

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

  // A record is the slide's photo wherever markdown lets it sit: the image plugin's own panel carries a marker an author cannot
  // write. Each of these lost its photo when the lift first became "top level or a paragraph" (the checker on followups.d/3126-p1).
  for (const [name, body] of [
    ['a record alone in a quote', '> `@image{https://x.test/photo.jpg, title="Photo"}`'],
    ['a record alone in a list item', '- `@image{https://x.test/photo.jpg, title="Photo"}`'],
  ]) {
    test(`${name} is still the slide's photo`, () => {
      const section = children(render(body));
      const panels = [...section.querySelectorAll('.lattice-bg')];
      assert.equal(panels.length, 1, 'one panel');
      assert.equal(panels[0].parentElement, section, 'and it sits at section level, where the layout places it');
    });
  }

  // A slide the pane carve splits keeps its pictures where they stood, as on main: a hoisted panel landed in the pane host
  // beside the panes as an unstyled box that took height (the card grader on #3132 measured the list pane 16px off).
  test('a pane slide hoists no panel into its host', () => {
    const html = e.render('---\ntheme: indaco\n---\n\n<!-- _class: image -->\n\n## Image slide\n\n<!-- _pane: content -->\n![A](https://x.test/a.jpg)\n\n<!-- _pane: list -->\n- a point\n![B](https://x.test/b.jpg)\n').html;
    const section = children(firstSection(html));
    assert.ok(section.classList.contains('lat-pane-host'), 'the slide is a pane host');
    assert.equal(section.querySelectorAll(':scope > .cell-stage > .lattice-bg, :scope > .lattice-bg').length, 0, 'no panel beside the panes');
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
