/**
 * Unit: `orderedListStart` (lib/integrations/markdown-it/plugins.js) — an ordered list the
 * author starts past 1 carries `--lat-split-offset: start - 1` on its own `<ol>`, which every
 * counter layout's `counter-reset` reads, so a continued list (the Studio's one-click split)
 * keeps its numbers: STEP 04, not STEP 01.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { render } = require('../../../lib/engine');

const html = (md) => String(render(`---\nmarp: true\n---\n\n${md}`).html);

test('a list starting at 4 carries offset 3 on its own <ol>', () => {
  const out = html('<!-- _class: list-steps -->\n\n## H.\n\n4. A\n   - x\n5. B\n   - y\n');
  assert.match(out, /<ol start="4" style="--lat-split-offset:3;">/);
});

test('a list starting at 1 is untouched', () => {
  const out = html('<!-- _class: list-steps -->\n\n## H.\n\n1. A\n2. B\n');
  assert.doesNotMatch(out, /--lat-split-offset/);
});

test('the offset stays on its list — a sibling list keeps its own count', () => {
  const out = html('## H.\n\n3. A\n4. B\n\nText.\n\n1. C\n2. D\n');
  const ols = out.match(/<ol[^>]*>/g);
  assert.deepEqual(ols, ['<ol start="3" style="--lat-split-offset:2;">', '<ol>']);
});

test('the counter layouts all read the offset the plugin writes', () => {
  const fs = require('node:fs');
  const css = fs.readFileSync(require.resolve('../../../lib/components/progression/list-steps/list-steps.styles.css'), 'utf8');
  assert.match(css, /counter-reset:\s*step-counter var\(--lat-split-offset, 0\)/);
});

test('a split run continues from the author\'s start, and its counter offset follows', () => {
  const { partitionAxis } = require('../../../lib/core/collections');
  const items = [4, 5, 6, 7].map((n) => `<li>Step ${n}</li>`).join('');
  const pages = partitionAxis(`<h2>H.</h2><ol start="4" style="--lat-split-offset:3;">${items}</ol>`, 'item', 2);
  assert.equal(pages.length, 2);
  assert.match(pages[0], /<ol start="4" style="--lat-split-offset:3;">/);
  assert.match(pages[1], /<ol style="--lat-split-offset:5;" start="6">/);
});

test('a list the author did not start keeps the old renumbering', () => {
  const { partitionAxis } = require('../../../lib/core/collections');
  const items = [1, 2, 3, 4].map((n) => `<li>Step ${n}</li>`).join('');
  const pages = partitionAxis(`<h2>H.</h2><ol>${items}</ol>`, 'item', 2);
  assert.match(pages[1], /<ol start="3">/);
});
