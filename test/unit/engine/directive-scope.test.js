/**
 * Unit: how far a slide's header, footer and pagination reach — the rule pinned.
 *
 * Front matter sets them for every slide. On a slide, the underscore form (`_header:`) is a SPOT
 * directive and applies to that slide only; the plain form (`header:`) is a GLOBAL directive and
 * carries onto every later slide until another one replaces it. That second half is Marp's rule,
 * and the engine keeps it for the bridge: the @meta record decision maps a plain directive to an
 * explicit `carry` record and makes a record scope to its own slide by default
 * (engineering/decisions/2026-10-17-meta-record.md §4.3), so the carry is the legacy form's
 * meaning, kept on purpose, and the new form is where scoping lives.
 *
 * Measured: the 309 example and baseline decks hold no plain `header:`, `footer:` or `paginate:`
 * comment, so this rule decides nothing in a deck we ship; it decides what an author's deck
 * renders. Whether to change it is the owner's call (followups.d/2789-p4); this pins today's
 * answer so a change is deliberate.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { render } = require('../../../lib/engine');

/** `data-<name>` of each top-level section, '-' where it is absent. */
function attrs(markdown, name) {
  const html = String(render(markdown, {}).html || '');
  return [...html.matchAll(/<section\b[^>]*>/g)].map((m) => new RegExp(`\\sdata-${name}="([^"]*)"`).exec(m[0])?.[1] ?? '-');
}

const five = (slide2, slide4) => `# One\n\n---\n\n${slide2}\n\n# Two\n\n---\n\n# Three\n\n---\n\n${slide4}\n\n# Four\n\n---\n\n# Five\n`;

test('a plain header on slide 2 carries onto every later slide; an underscore header stays on its own', () => {
  assert.deepEqual(attrs(five('<!-- header: H -->', '<!-- _header: L -->'), 'header'), ['-', 'H', 'H', 'L', 'H']);
});

test('an underscore header alone reaches no other slide', () => {
  assert.deepEqual(attrs(five('<!-- _header: L -->', ''), 'header'), ['-', 'L', '-', '-', '-']);
});

test('a later plain header replaces the carried one from its slide on', () => {
  assert.deepEqual(attrs(five('<!-- header: H -->', '<!-- header: K -->'), 'header'), ['-', 'H', 'H', 'K', 'K']);
});

test('footers follow the same rule', () => {
  assert.deepEqual(attrs(five('<!-- footer: F -->', '<!-- _footer: G -->'), 'footer'), ['-', 'F', 'F', 'G', 'F']);
});

test('front matter sets every slide, and a slide overrides it the same two ways', () => {
  const md = `---\nheader: D\n---\n\n${five('<!-- _header: L -->', '<!-- header: K -->')}`;
  assert.deepEqual(attrs(md, 'header'), ['D', 'L', 'D', 'K', 'K']);
});
