/**
 * Unit: `_focusSteps` progressive expansion (lib/integrations/markdown-it/
 * plugins.js `focusSteps`). One authored slide carrying
 * `<!-- _focusSteps: A | B | C -->` expands into N rendered slides, each with
 * `<!-- _focus: <step> -->`. Asserted through lib/engine — the canonical render
 * path (emulator CLI + playground). Design:
 * engineering/decisions/2026-06-16-focus-highlighting.md §4.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const latticeEngine = require('../../../lib/engine');

const engine = latticeEngine.createEngine();
const html = (md) => engine.render(md).html;
const sections = (h) => h.split(/(?=<section[\s>])/).filter((s) => /^<section[\s>]/.test(s));

const DECK = `---\ntheme: indaco\npaginate: true\n---\n\n<!-- _class: cards-grid -->\n<!-- _focusSteps: item 1 | item 2 | item 3 -->\n<!-- _footer: "Walk" -->\n\n## Four components.\n\n- A\n  - a\n- B\n  - b\n- C\n  - c\n`;

describe('_focusSteps expansion', () => {
  test('expands one slide into one slide per step', () => {
    const secs = sections(html(DECK));
    assert.equal(secs.length, 3);
  });

  test('each rendered slide carries the step focus, in order', () => {
    const secs = sections(html(DECK));
    const focuses = secs.map((s) => (s.match(/data-focus="([^"]*)"/) || [])[1]);
    assert.deepEqual(focuses, ['item 1', 'item 2', 'item 3']);
  });

  test('every copy keeps the slide\'s other directives (class + footer)', () => {
    for (const s of sections(html(DECK))) {
      assert.match(s, /class="[^"]*cards-grid/);
      assert.match(s, /<footer>Walk<\/footer>/);
    }
  });

  test('pagination numbers the expanded slides sequentially', () => {
    const pages = sections(html(DECK)).map((s) => (s.match(/data-lattice-pagination="(\d+)"/) || [])[1]);
    assert.deepEqual(pages, ['1', '2', '3']);
  });

  // #1387: `focusSteps` grouped on `t.type === 'hr'` with no `level === 0` guard,
  // unlike `splitOnHr` — so a `---` nested inside a blockquote or a list item, which
  // markdown-it emits as a NESTED `hr` token, counted as a slide boundary. The walk
  // then expanded a phantom slide and every section-indexing consumer downstream
  // (pagination, the PPTX one-image-per-slide path, the source-side band
  // reconstruction) inherited the off-by-one. Both grouping sites share
  // lib/core/slide-rule.js now.
  const NESTED = (block) => ['---', 'theme: indaco', 'split: rule', '---', '',
    '<!-- _class: content -->', '<!-- _focusSteps: item 1 | item 2 -->', '', '# A', '',
    block, '', '---', '', '# B', ''].join('\n');

  test('a `---` nested in a blockquote is a rule INSIDE the slide, not a boundary', () => {
    assert.equal(sections(html(NESTED('> q\n>\n> ---\n>\n> more'))).length, 3);
  });

  test('…and a `---` nested in a list item likewise', () => {
    assert.equal(sections(html(NESTED('- one\n\n  ---\n\n- two'))).length, 3);
  });

  test('the nested rule still RENDERS — the guard skips the split, not the token', () => {
    assert.match(html(NESTED('> q\n>\n> ---\n>\n> more')), /<hr\s*\/?>/);
  });

  test('a deck without _focusSteps is untouched', () => {
    const plain = '---\ntheme: indaco\n---\n\n## One\n\n- a\n\n---\n\n## Two\n\n- b\n';
    assert.equal(sections(html(plain)).length, 2);
  });

  test('the focus resolver then tags the target on each expanded slide', () => {
    // item 2 → the 2nd top-level <li> on slide 2 is .lat-focus
    const slide2 = sections(html(DECK))[1];
    assert.match(slide2, /<li class="lat-focus"/);
    assert.match(slide2, /data-focus-axis="item"/);
  });
});
