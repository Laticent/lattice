/**
 * Unit: the title's lede page (lib/core/carousel.js `title-lede`; owner, 2026-11-15,
 * engineering/decisions/2026-10-28-fit-everywhere-model.md §25). Rendered through the real engine, so
 * the section is the one a title emits: a flat section with its eyebrow, title and lede paragraphs.
 *
 * FALSIFIABLE: without the `atSeam` guard a title splits with no measured plan (`fit: heal`); without
 * the eyebrow test the eyebrow leaves the cover for the lede page; without `title-lede` in
 * MEMBER_CLAIM_STRATEGIES the dispatcher hoists the lede onto a closing page, so it prints twice;
 * moving only paragraphs puts a list after the lede on the cover, before it; without the `title-cover`
 * exception in auto-split.js `stripDeckChrome` the cover loses the deck's footer. The shared gates in
 * carousel.test.js (STRATEGY_CASES) hold conservation and the one closing page for a title's beats.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');
const { splitSections } = require('@laticent/markup');
const { carouselize } = require('../../../lib/core/carousel');

const titleOf = (body) => {
  const { html } = createEngine().render(`---\ntheme: indaco\n---\n\n<!-- _class: title -->\n\n${body}\n`, 'indaco');
  return splitSections(html).filter((p) => p.type === 'section')[0];
};
const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const LEDE_A = 'First lede paragraph, long enough to matter.';
const LEDE_B = 'Second lede paragraph, which follows the first.';
const two = titleOf(`# The title.\n\n\`The eyebrow\`\n\n${LEDE_A}\n\n${LEDE_B}`);

test('on a measured overflow the cover keeps eyebrow and title, and the lede page carries every lede paragraph in order', () => {
  const parts = carouselize(two.openTag, two.inner, { strategy: 'title-lede', atSeam: true });
  assert.equal(parts.length, 2, JSON.stringify(parts));
  const [cover, lede] = parts;
  assert.match(cover, /data-split-role="cover"/);
  assert.match(cover, /class="[^"]*\btitle-cover\b/);
  assert.match(cover, /<h1[^>]*>The title\.<\/h1>/);
  assert.match(cover, /The eyebrow/);
  assert.doesNotMatch(cover, /First lede|Second lede/);
  assert.match(lede, /data-split-role="body"/);
  assert.match(lede, /class="[^"]*\btitle\b[^"]*\btitle-lede\b/);
  assert.doesNotMatch(lede, /<h1|The eyebrow/);
  const text = strip(lede);
  assert.ok(text.indexOf(LEDE_A) >= 0 && text.indexOf(LEDE_A) < text.indexOf(LEDE_B), text);
});

test('every word of the slide lands on exactly one page', () => {
  const parts = carouselize(two.openTag, two.inner, { strategy: 'title-lede', atSeam: true });
  const all = strip(parts.join(' '));
  for (const phrase of ['The title.', 'The eyebrow', LEDE_A, LEDE_B]) assert.equal(all.split(phrase).length - 1, 1, phrase);
});

test('no measured plan, no split: a title that only might overflow stays whole', () => {
  assert.equal(carouselize(two.openTag, two.inner, { strategy: 'title-lede' }), null);
});

test('a title with no lede paragraph declines (nothing to move)', () => {
  const bare = titleOf('# Only a title.\n\n`Only an eyebrow`');
  assert.equal(carouselize(bare.openTag, bare.inner, { strategy: 'title-lede', atSeam: true }), null);
});

test('an eyebrow authored above the title stays on the cover too', () => {
  const above = titleOf(`\`Eyebrow first\`\n\n# The title.\n\n${LEDE_A}`);
  const [cover, lede] = carouselize(above.openTag, above.inner, { strategy: 'title-lede', atSeam: true });
  assert.match(cover, /Eyebrow first/);
  assert.doesNotMatch(lede, /Eyebrow first/);
  assert.match(strip(lede), new RegExp(LEDE_A.replace(/[.]/g, '\\.')));
});

test('a list after the lede moves with it, so the lede page keeps the authored order', () => {
  const listed = titleOf(`# The title.\n\n\`The eyebrow\`\n\n${LEDE_A}\n\n- one point\n- two point`);
  const [cover, lede] = carouselize(listed.openTag, listed.inner, { strategy: 'title-lede', atSeam: true });
  assert.doesNotMatch(cover, /one point/);
  const text = strip(lede);
  assert.ok(text.indexOf(LEDE_A) >= 0 && text.indexOf(LEDE_A) < text.indexOf('one point'), text);
});

test('an eyebrow written as raw HTML with attributes stays on the cover', () => {
  const raw = titleOf(`# The title.\n\n<p><code class="k">Raw eyebrow</code></p>\n\n${LEDE_A}`);
  const [cover, lede] = carouselize(raw.openTag, raw.inner, { strategy: 'title-lede', atSeam: true });
  assert.match(cover, /Raw eyebrow/);
  assert.doesNotMatch(lede, /Raw eyebrow/);
});

test('the cover keeps the deck footer (a title is an anchor); the lede page does not repeat it', () => {
  const ss = require('../../../lib/engine/structural-split');
  const path = require('node:path');
  const cap = ss.splitCapacityFrom(require('../../../lib/components').loadAll(path.join(__dirname, '../../../lib/components')));
  const md = `---\ntheme: indaco\nsize: square\nfooter: "Confidential"\n---\n\n<!-- _class: title -->\n\n# The title.\n\n${LEDE_A}\n\n${LEDE_B}\n`;
  const { html } = createEngine().render(md, 'indaco');
  const out = ss.structuralSplit(html, { deckSource: md, width: 1080, height: 1080, capacity: cap, plan: { 1: { atSeam: true } } }).html;
  const pages = splitSections(out.slice(out.search(/<section\b[^>]*data-lattice-slide=/))).filter((p) => p.type === 'section');
  assert.equal(pages.length, 2, pages.map((p) => p.openTag).join('\n'));
  assert.match(pages[0].inner, /<footer\b[^>]*>[^<]*Confidential/);
  assert.doesNotMatch(pages[1].inner, /Confidential/);
});
