/**
 * `empty-section` (lib/authoring/lint-core.js `findEmptySections`): two dividers in a row leave the
 * first section with no slide, so its rail mark never lights and the reader's first rail can say
 * `2 / 4`. A lint WARNING since 2026-11-08 (engineering/decisions/2026-11-08-anchor-chrome.md); it
 * was a review-tier suggestion, which `lint:deck --all` skipped.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { findEmptySections, lintTextWith } = require('../../../lib/authoring/lint-core.js');
const { buildVocab } = require('../../../lib/authoring/lint');
const { loadAll } = require('../../../lib/components');

const vocab = buildVocab(loadAll(path.join(__dirname, '../../../lib/components')));

const deck = (...slides) => `---\ntheme: indaco\n---\n\n${slides.join('\n\n---\n\n')}\n`;

test('a divider straight after a divider warns, on the second one', () => {
  const f = findEmptySections(deck('<!-- _class: divider numbered -->\n## One', '<!-- _class: divider light -->\n## Two', '## A slide\n\nBody.'));
  assert.equal(f.length, 1);
  assert.equal(f[0].slide, 2);
  assert.equal(f[0].rule, 'empty-section');
  assert.equal(f[0].severity, 'warning');
});

test('a slide between the two dividers clears it', () => {
  assert.equal(findEmptySections(deck('<!-- _class: divider -->\n## One', '## A slide\n\nBody.', '<!-- _class: divider -->\n## Two')).length, 0);
});

test('three dividers in a row warn twice', () => {
  const f = findEmptySections(deck('<!-- _class: divider -->\n## A', '<!-- _class: divider -->\n## B', '<!-- _class: divider dark -->\n## C'));
  assert.deepEqual(f.map((x) => x.slide), [2, 3]);
});

test('the full lint reports it', () => {
  const src = deck('<!-- _class: divider -->\n## One', '<!-- _class: divider -->\n## Two', '## A slide\n\nBody.');
  assert.ok(lintTextWith(src, vocab).some((x) => x.rule === 'empty-section' && x.severity === 'warning'));
});
