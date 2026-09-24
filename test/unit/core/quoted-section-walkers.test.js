/**
 * Every transform that walks the rendered deck section by section reads a
 * section tag QUOTED in an HTML comment as text.
 *
 * #2329 moved five walkers onto `splitSections` (lib/core/split-sections.js).
 * These five were still on private scans and each lost a slide's transform on a
 * comment an author can type into any deck:
 *
 *   · label-set-key, logo-marks, scene and the engine's image structure used a
 *     lazy `/<section…>[\s\S]*?<\/section>/g`, so a `</section>` in a comment
 *     ENDED the slide at the comment. The rest of the slide was outside the
 *     match, and the transform never saw it.
 *   · word-cloud used its own `indexOf('<section')` depth walk, so a `<section`
 *     in a comment opened a section that never closed, and every later slide
 *     passed through untouched.
 *
 * Each arm fails on the old code (checked by reverting the caller).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const QUOTE_CLOSE = '<!-- a note quoting </section> here -->';
const QUOTE_OPEN = '<!-- a note quoting <section class="title"> here -->';

test('logo-marks: a </section> quoted before the marks still masks them', () => {
  const t = require('../../../lib/transformers/logo-marks');
  const html = `<section id="1" class="logo-wall">${QUOTE_CLOSE}`
    + '<ul><li><img src="acme.svg" alt="Acme"></li></ul></section>';
  const out = t.applyToHtml(html);
  assert.match(out, /class="logo-mark"/);
  assert.doesNotMatch(out, /<img/);
});

test('label-set-key: a </section> quoted before the grid still draws the key', () => {
  const t = require('../../../lib/transformers/label-set-key');
  const html = `<section id="1" class="obligation-matrix"><h2>Duties</h2>${QUOTE_CLOSE}`
    + '<table><tbody><tr><td>A</td><td><span class="state pass state-full"></span></td></tr></tbody></table>'
    + '</section>';
  const out = t.applyToHtml(html);
  assert.match(out, /<\/table><ul class="label-set-key/);
  const live = out.split(QUOTE_CLOSE).join('');
  assert.equal(live.match(/<\/section>/g).length, 1, 'the key landed outside the slide');
});

test('scene: a </section> quoted in the placard keeps the whole slide in the wrap', () => {
  const scene = require('../../../lib/components/imagery/scene/scene.transform');
  const html = '<section class="scene"><h2>Title</h2>'
    + '<svg viewBox="0 0 240 150"><rect width="20" height="20"/></svg>'
    + `${QUOTE_CLOSE}<p>Body</p></section>`;
  const out = scene.applyToRenderedHtml(html);
  assert.match(out, /<div class="scene-text">[\s\S]*<p>Body<\/p><\/div><\/section>$/);
});

test('word-cloud: a <section quoted on an earlier slide leaves the cloud transformed', () => {
  const { applyToRenderedHtml } = require('../../../lib/components/chart/word-cloud/word-cloud.transform');
  const html = `<section id="1" class="title"><h1>Deck</h1>${QUOTE_OPEN}</section>`
    + '<section id="2" class="word-cloud"><h2>Q1</h2><ul><li>alpha 5</li><li>beta 3</li><li>gamma 2</li></ul></section>';
  assert.match(applyToRenderedHtml(html), /<div class="word-cloud-canvas"/);
});

// The old walk wrapped `.image-text` around the truncated slide and wrote its
// `</div>` INSIDE the comment, so a browser never closed the panel.
test('engine: an image slide with a </section> quoted in its body keeps the comment whole', async () => {
  const engine = require('../../../lib/engine');
  const md = [
    '---', 'theme: indaco', '---', '',
    '<!-- _class: image -->', '',
    '![bg](photo.jpg)', '',
    '## Title', '',
    QUOTE_CLOSE, '',
    'The body after the note.', '',
  ].join('\n');
  const { html } = await engine.render(md);
  const slide = html.slice(html.indexOf('<section'), html.lastIndexOf('</section>') + 10);
  const text = slide.slice(slide.indexOf('class="image-text"'));
  assert.ok(slide.includes('class="image-text"'), 'no .image-text panel');
  assert.ok(slide.includes(QUOTE_CLOSE), 'the wrap wrote markup inside the comment');
  const live = text.split(QUOTE_CLOSE).join('');
  assert.match(live, /The body after the note\.<\/p><\/div>/, 'the body is not inside a closed .image-text');
});

// Found by the independent checker on the first cut: `splitSections` accepts a malformed
// close (`</section >`), and scene sliced a fixed `'</section>'.length` off the end, which
// cut into the body. The close is the walker's business, not the transform's.
test('scene: a malformed close tag does not cut into the slide body', () => {
  const scene = require('../../../lib/components/imagery/scene/scene.transform');
  for (const close of ['</section >', '</section foo>']) {
    const out = scene.applyToRenderedHtml('<section class="scene"><h2>Title</h2>'
      + `<svg viewBox="0 0 240 150"><rect width="20" height="20"/></svg><p>Body</p>${close}`);
    assert.match(out, /<p>Body<\/p><\/div><\/section>$/, close);
  }
});
