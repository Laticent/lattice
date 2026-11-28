/**
 * Every text block a topic slide draws on its dark band reads light.
 *
 * `topic` names its topic with `##` and styles that heading in display ink. A `#` heading was
 * not styled at all, so it took the canvas's dark heading ink and drew dark on the dark band
 * in a light-mode PDF and PPTX (found on PR 3362, the same family of defect as the paragraphs
 * and blockquotes after the lede, fixed in that PR). Both rules are pinned here.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'lib/components/anchor/topic/topic.styles.css'),
  'utf8',
);

test('topic: a stray `#` heading takes the display ink and the dark scheme pin', () => {
  assert.match(css, /section\.topic > h1\s*\{\s*color-scheme:\s*dark;\s*color:\s*var\(--text-display\);/);
});

test('topic: paragraphs and blockquotes after the lede take the on-dark ink', () => {
  assert.match(css, /section\.topic > :is\(p, blockquote\)\s*\{\s*color:\s*var\(--on-dark-secondary\);/);
});
