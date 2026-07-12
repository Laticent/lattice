const test = require('node:test');
const assert = require('node:assert/strict');
const { splitSourceToSections } = require('../../../lib/core/section-source-split.js');

// splitSourceToSections recovers each rendered section's source Markdown aligned to the
// engine's `hr`-token split (#902 Gap 1). The parity suite pins alignment against the
// REAL engine render; these pin the grouping contract in isolation — the edge cases a
// `---`-only line splitter gets wrong.

test('splits on a plain top-level --- break', () => {
  const blocks = splitSourceToSections('---\nsplit: rule\n---\n\nOne\n\n---\n\nTwo');
  assert.deepEqual(blocks, ['One', 'Two']);
});

test('front matter is stripped, not treated as a slide', () => {
  const blocks = splitSourceToSections('---\nmarp: true\nsplit: rule\n---\n\nBody');
  assert.deepEqual(blocks, ['Body']);
});

test('splits on `***` and `___` thematic breaks, not just ---', () => {
  const blocks = splitSourceToSections('---\nsplit: rule\n---\n\nA\n\n***\n\nB\n\n___\n\nC');
  assert.deepEqual(blocks, ['A', 'B', 'C']);
});

test('a setext underline (text over ---) is an H2 heading, NOT a break', () => {
  // "Title" underlined by --- is a single heading slide, not two slides.
  const blocks = splitSourceToSections('---\nsplit: rule\n---\n\nTitle\n---\n\nBody under the same slide');
  assert.equal(blocks.length, 1);
  assert.ok(blocks[0].includes('Title'));
  assert.ok(blocks[0].includes('Body under the same slide'));
});

test('an empty middle section is preserved (index alignment must not shift)', () => {
  const blocks = splitSourceToSections('---\nsplit: rule\n---\n\nA\n\n---\n\n---\n\nC');
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0], 'A');
  assert.equal(blocks[1], ''); // the empty section, kept
  assert.equal(blocks[2], 'C');
});

test('a leading --- (empty first group) is dropped, matching splitOnHr', () => {
  const blocks = splitSourceToSections('---\nsplit: rule\n---\n\n---\n\nFirst real slide');
  assert.deepEqual(blocks, ['First real slide']);
});

test('does not split on a --- inside a fenced code block', () => {
  const blocks = splitSourceToSections('---\nsplit: rule\n---\n\nBefore\n\n```\n---\n```\n\nAfter');
  assert.equal(blocks.length, 1);
  assert.ok(blocks[0].includes('Before'));
  assert.ok(blocks[0].includes('After'));
});

test('materializes headings-mode boundaries (no explicit ---)', () => {
  const blocks = splitSourceToSections('---\nmarp: true\n---\n\n# One\n\nlead\n\n## Two\n\nmore');
  assert.equal(blocks.length, 2);
  assert.ok(blocks[0].includes('# One'));
  assert.ok(blocks[1].includes('## Two'));
});
