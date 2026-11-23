/**
 * The gallery generators write `@meta` records (record note §15, slice C), and the dark pass still darkens every slide.
 *
 * Two promises:
 *   1. every slide a generator adds (title, anti-patterns, see-also) and every footer it injects is a record, never an old
 *      `<!-- _class: … -->` / `<!-- _footer: … -->` comment;
 *   2. `injectDark` adds `dark` to a record's class as it does to a comment's, and never to a record that sets no class
 *      (a class there would override the sample's own comment). The failing arm: HEAD's comment-only `injectDark` left
 *      the record slides light, which the render shows.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { injectDark } = require('../../../tools/build-galleries.js');
const { galleryPlan } = require('../../../tools/build-component-docs.js');
const { loadAll } = require('../../../lib/components');
const { createEngine } = require('../../../lib/engine');

test('every slide setting a generator writes is a record', () => {
  let checked = 0;
  for (const m of loadAll()) {
    for (const s of galleryPlan(m)) {
      // A sample keeps its own first line (`<!-- _class: … -->`) until the corpus sweep; everything else is the generator's.
      const own = s.md.replace(/^<!--\s*_class:[^\n]*-->\n/, '');
      assert.doesNotMatch(own, /<!--\s*_(?:class|footer)\s*:/, `${m.name} ${s.kind}: a generator line in the old form`);
      checked++;
    }
  }
  assert.ok(checked > 400, `checked ${checked} slides`);
});

test('injectDark darkens a record slide and leaves a footer-only record alone', () => {
  assert.equal(injectDark('<!-- @meta{layout=title, class=silent} -->'), '<!-- @meta{layout=title, class=silent dark} -->');
  assert.equal(injectDark('<!-- @meta{layout=kpi} -->'), '<!-- @meta{layout=kpi, class=dark} -->');
  assert.equal(injectDark('<!-- @meta{layout=kpi, class=dark} -->'), '<!-- @meta{layout=kpi, class=dark} -->');
  assert.equal(injectDark('<!-- _class: quote -->\n<!-- @meta{footer=Q3} -->'), '<!-- _class: quote dark -->\n<!-- @meta{footer=Q3} -->');
});

test('the failing arm: a comment-only dark pass leaves a record slide light', () => {
  const engine = createEngine();
  const deck = '---\ntheme: indaco\n---\n\n<!-- @meta{layout=title, class=silent} -->\n\n# T\n';
  const commentOnly = (md) => md.replace(/<!--\s*_class:\s*([^>]+?)\s*-->/g, (w, c) => `<!-- _class: ${c} dark -->`);
  const lit = engine.render(commentOnly(deck)).html;
  const dark = engine.render(injectDark(deck)).html;
  assert.doesNotMatch(lit, /class="[^"]*\bdark\b/);
  assert.match(dark, /class="[^"]*\bdark\b/);
});

test('injectDark leaves a class comment quoted in the slide text alone', () => {
  // The failing arm: the old regex added `dark` to every `<!-- _class: … -->` in the file, so a dark gallery showed the
  // author's quoted example as `<!-- _class: kpi dark -->` (design/design-system.gallery.md, examples/slide-class-forms.md).
  const md = '<!-- _class: content -->\n\n## Names\n\n- `<!-- _class: kpi -->` names a layout.\n';
  assert.equal(injectDark(md), '<!-- _class: content dark -->\n\n## Names\n\n- `<!-- _class: kpi -->` names a layout.\n');
});
