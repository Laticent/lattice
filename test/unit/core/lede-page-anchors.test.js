/**
 * Unit: every anchor's lede page (lib/core/carousel.js `lede-page`; owner, 2026-11-16, "lede page, all";
 * engineering/decisions/2026-10-28-fit-everywhere-model.md §25). The title's split (`title-lede`, 2026-11-15) made
 * general: a closing, a topic or a divider whose text the MEASURED plan sees overflow keeps its eyebrow and heading
 * on a cover, and the rest takes a page after it on the same canvas. Rendered through the real engine.
 *
 *   CLOSING   eyebrow and `h2` stay; the message moves; the classes name both pages
 *   TOPIC     a source line AFTER the heading is content, so it moves with the claim (only a code-only paragraph
 *             before the heading is the eyebrow; a title's eyebrow may follow its `#`, so title keeps that reading)
 *   OTHERWISE a plain closing reaches `lede-page` through `split.otherwise`; an `index` closing keeps cover-paginate
 *   NO-PLAN   with no measured overflow (`atSeam`) nothing splits
 *   TITLE     a title splits exactly as before (byte-identical to `title-lede`)
 *
 * FALSIFIABLE: without the h2 fallback CLOSING declines; keeping the source's berths on the cover gives it two sets; with the title's eyebrow reading for every anchor TOPIC
 * leaves the source line on the cover; without the `otherwise` branch OTHERWISE declines.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');
const { splitSections } = require('@laticent/markup');
const { carouselize } = require('../../../lib/core/carousel');
const { loadAll } = require('../../../lib/components');

const slideOf = (cls, body) => {
  const { html } = createEngine().render(`---\ntheme: indaco\n---\n\n<!-- _class: ${cls} -->\n\n${body}\n`, 'indaco');
  return splitSections(html).filter((p) => p.type === 'section')[0];
};
const recipeOf = (name) => loadAll().find((m) => m.name === name).split;
const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('CLOSING: the eyebrow and heading keep the cover, and the message takes the page after it', () => {
  const s = slideOf('closing', '`What is still owed`\n\n## One entry left.\n\nThe message, which is long.\n\nIts second paragraph.');
  const parts = carouselize(s.openTag, s.inner, { strategy: 'lede-page', atSeam: true }, 1, 'closing');
  assert.equal(parts.length, 2, JSON.stringify(parts));
  const [cover, lede] = parts;
  assert.match(cover, /class="[^"]*\bclosing-cover lede-cover\b/);
  assert.match(cover, /What is still owed/);
  assert.match(cover, /<h2[^>]*>One entry left\.<\/h2>/);
  assert.doesNotMatch(cover, /The message/);
  assert.match(lede, /data-split-role="body"/);
  assert.match(lede, /class="[^"]*\bclosing\b[^"]*\bclosing-lede lede-page\b/);
  const text = strip(lede);
  assert.ok(text.indexOf('The message') < text.indexOf('Its second paragraph'), 'in order');
  // The engine's berths leave both pages: the berth pass gives each its own set after the split. Left on the cover
  // they stopped ending it once the split rail followed, and the pass added a second set (checker, 2026-11-16).
  assert.match(s.inner, /data-lattice-berth/, 'the rendered slide carries berths, or this proves nothing');
  assert.doesNotMatch(cover, /data-lattice-berth/);
  assert.doesNotMatch(lede, /data-lattice-berth/);
});

test('TOPIC: a source line after the heading moves with the claim; the eyebrow before it stays', () => {
  const s = slideOf('topic fact', '`Section 02`\n\n## The renewal curve\n\nFour points of retention is $2.1m.\n\n`Sensitivity run 14 Oct`');
  const [cover, lede] = carouselize(s.openTag, s.inner, { strategy: 'lede-page', atSeam: true }, 1, 'topic');
  assert.match(cover, /Section 02/);
  assert.doesNotMatch(cover, /Sensitivity run|Four points/);
  assert.match(lede, /Four points[\s\S]*Sensitivity run/);
});

test('OTHERWISE: a plain closing takes lede-page, an index closing keeps cover-paginate', () => {
  const recipe = recipeOf('closing');
  assert.equal(recipe.otherwise.strategy, 'lede-page');
  const plain = slideOf('closing', '## One entry left.\n\nThe message, which is long.');
  const parts = carouselize(plain.openTag, plain.inner, { ...recipe, atSeam: true }, 1, 'closing');
  assert.ok(parts && parts.length === 2 && /closing-lede lede-page/.test(parts[1]), JSON.stringify(parts));
  const index = slideOf('closing index', '## See also.\n\n- One\n  - First.\n- Two\n  - Second.\n- Three\n  - Third.');
  const idx = carouselize(index.openTag, index.inner, recipe, 1, 'closing');
  assert.ok(!idx || !idx.some((p) => /lede-page/.test(p)), 'an index closing never takes the lede page');
});

test('NO-PLAN: with no measured overflow, no anchor splits', () => {
  const s = slideOf('divider', '## Part two.\n\nA paragraph.');
  assert.equal(carouselize(s.openTag, s.inner, { strategy: 'lede-page' }, 1, 'divider'), null);
});

test('TITLE: a title splits byte for byte as it did under title-lede', () => {
  const s = slideOf('title', '# The title.\n\n`The eyebrow`\n\nFirst lede.\n\nSecond lede.');
  const a = carouselize(s.openTag, s.inner, { strategy: 'title-lede', atSeam: true });
  const b = carouselize(s.openTag, s.inner, { strategy: 'lede-page', atSeam: true }, 1, 'title');
  assert.deepEqual(b, a);
  assert.match(a[0], /The eyebrow/, 'a title\'s eyebrow written after its heading stays on the cover');
});
