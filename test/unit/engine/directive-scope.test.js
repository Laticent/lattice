/**
 * Unit: how far a slide's header, footer and pagination reach — the rule pinned.
 *
 * The owner's ruling (2026-10-20, audit §11r): Lattice is not Marp. Front matter sets the header,
 * footer and pagination for every slide. On a slide, BOTH spellings set that slide only: the
 * underscore form (`<!-- _header: L -->`) and the plain form (`<!-- header: H -->`). A plain comment
 * no longer carries onto later slides, Marp's rule. A slide that should drop the deck's chrome uses
 * `_class: no-header`, `no-footer` or `no-paginate` (lib/base/base.variants.css).
 *
 * The keys are declared once, as `scope: "slide"` in lib/plugins/meta/meta.manifest.json, and read
 * through `SLIDE_ONLY_KEYS` (lib/core/meta-keys.mjs) by the engine, the meta record's walk and the
 * slice prelude. Every other plain directive (`class:`, `backgroundColor:`) still carries forward.
 *
 * Measured: the 309 example and baseline decks hold no plain `header:`, `footer:` or `paginate:`
 * comment, so the change moves no deck we ship; it changes what an author's deck renders.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { render } = require('../../../lib/engine');
const { scanMetaSource } = require('../../../lib/core/meta-record.mjs');

/** `data-<name>` of each top-level section, '-' where it is absent. */
function attrs(markdown, name) {
  const html = String(render(markdown, {}).html || '');
  return [...html.matchAll(/<section\b[^>]*>/g)].map((m) => new RegExp(`\\sdata-${name}="([^"]*)"`).exec(m[0])?.[1] ?? '-');
}

const five = (slide2, slide4) => `# One\n\n---\n\n${slide2}\n\n# Two\n\n---\n\n# Three\n\n---\n\n${slide4}\n\n# Four\n\n---\n\n# Five\n`;

test('a plain header on slide 2 stays on slide 2, as an underscore header does', () => {
  assert.deepEqual(attrs(five('<!-- header: H -->', '<!-- _header: L -->'), 'header'), ['-', 'H', '-', 'L', '-']);
});

test('an underscore header alone reaches no other slide', () => {
  assert.deepEqual(attrs(five('<!-- _header: L -->', ''), 'header'), ['-', 'L', '-', '-', '-']);
});

test('two plain headers each set their own slide', () => {
  assert.deepEqual(attrs(five('<!-- header: H -->', '<!-- header: K -->'), 'header'), ['-', 'H', '-', 'K', '-']);
});

test('footers follow the same rule', () => {
  assert.deepEqual(attrs(five('<!-- footer: F -->', '<!-- _footer: G -->'), 'footer'), ['-', 'F', '-', 'G', '-']);
});

test('pagination follows the same rule', () => {
  assert.deepEqual(attrs(five('<!-- paginate: true -->', ''), 'paginate'), ['-', 'true', '-', '-', '-']);
});

test('front matter sets every slide, and a slide overrides it for itself only, in either spelling', () => {
  const md = `---\nheader: D\n---\n\n${five('<!-- _header: L -->', '<!-- header: K -->')}`;
  assert.deepEqual(attrs(md, 'header'), ['D', 'L', 'D', 'K', 'D']);
});

test('a plain directive that is not slide-only still carries forward (Marp\'s rule, kept)', () => {
  assert.deepEqual(attrs(five('<!-- backgroundColor: red -->', ''), 'background-color'), ['-', 'red', 'red', 'red', 'red']);
});

test('the meta record resolves a plain header to its own slide, as the engine does', () => {
  const { slides } = scanMetaSource(five('<!-- header: H -->', ''));
  assert.deepEqual(slides.map((s) => s.resolved.get('header')?.value ?? '-'), ['-', 'H', '-', '-', '-']);
});
