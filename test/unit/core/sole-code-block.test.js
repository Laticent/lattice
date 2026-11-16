/**
 * Unit: `soleCodeBlock` (lib/core/split-envelope.js) names a `content` slide whose body is one code block, with any
 * trailing beats after it, which auto-split hands to the `code-cards` strategy (owner, 2026-11-16; §25). Rendered
 * through the real engine:
 *   ONE      a heading and one fenced block: true
 *   NOTE     one block and a trailing note or key insight: still true (the beats leave for the closing page)
 *   PROSE    a paragraph before the block, or two blocks: false (the block axis keeps those seams)
 *
 * FALSIFIABLE: counting every block, NOTE reads false; skipping the tag test, PROSE's paragraph-only slide reads true.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');
const { splitSections } = require('@laticent/markup');
const { soleCodeBlock } = require('../../../lib/core/split-envelope');

const inner = (body) => {
  const { html } = createEngine().render(`---\ntheme: indaco\n---\n\n${body}\n`, 'indaco');
  return splitSections(html).filter((p) => p.type === 'section')[0].inner;
};
const FENCE = '```js\nconst a = 1;\nconst b = 2;\n```';

test('ONE: a heading and one fenced block', () => {
  assert.equal(soleCodeBlock(inner(`## Title.\n\n${FENCE}`)), true);
});

test('NOTE: a trailing note or key insight does not count', () => {
  assert.equal(soleCodeBlock(inner(`## Title.\n\n${FENCE}\n\nA note under the block.`)), true);
  assert.equal(soleCodeBlock(inner(`## Title.\n\n${FENCE}\n\n> A key insight.`)), true);
});

test('PROSE: a paragraph before the block, two blocks, or no block at all', () => {
  assert.equal(soleCodeBlock(inner(`## Title.\n\nA lead paragraph.\n\n${FENCE}`)), false);
  assert.equal(soleCodeBlock(inner(`## Title.\n\n${FENCE}\n\n${FENCE}`)), false);
  assert.equal(soleCodeBlock(inner('## Title.\n\nOnly prose.')), false);
});
