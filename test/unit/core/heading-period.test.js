/**
 * Unit: the heading-period switch (lib/core/heading-period.js), shared by the engine's markdown-it
 * plugins and the runtime's Marp mirror.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { headingPeriodOf, withHeadingPeriod } = require('../../../lib/core/heading-period');
const { createEngine } = require('../../../lib/engine');

test('the switch precedence picks add, strip or leave', () => {
  assert.equal(headingPeriodOf(['content']), null);
  assert.equal(headingPeriodOf(['content', 'no-period']), false);
  assert.equal(headingPeriodOf(['content', 'no-period', 'with-period']), true, 'with- beats a deck-wide no-');
  assert.equal(headingPeriodOf(['silent']), null, 'silent does not cover the period');
});

test('the text rule: strip a trailing period, add one only where no terminal punctuation is', () => {
  assert.equal(withHeadingPeriod('Done.', false), 'Done');
  assert.equal(withHeadingPeriod('Done', true), 'Done.');
  assert.equal(withHeadingPeriod('Why?', true), 'Why?');
  assert.equal(withHeadingPeriod('Note:', true), 'Note:');
  assert.equal(withHeadingPeriod('Done.', true), 'Done.', 'idempotent');
  assert.equal(withHeadingPeriod('Done.', null), 'Done.');
  assert.equal(withHeadingPeriod('To be continued...', false), 'To be continued...', 'an ellipsis is not a period');
  const once = withHeadingPeriod('Done.', false);
  assert.equal(withHeadingPeriod(once, false), once, 'the strip is idempotent');
});

test('the engine honors a deck-wide class: no-period, and one slide\'s with-period beats it', () => {
  // Before 2026-11-04 the period rules ran BEFORE the deck class reached the slide, so the deck-wide
  // spelling the docs teach stripped nothing.
  const html = createEngine().render([
    '---', 'theme: indaco', 'class: no-period', '---', '',
    '<!-- _class: content -->', '', '## Stripped.', '', '### Sub *head.*', '',
    '---', '', '<!-- _class: content with-period -->', '', '## Added',
  ].join('\n')).html;
  const heads = [...new JSDOM(html).window.document.querySelectorAll('h2, h3')].map((h) => h.textContent);
  assert.deepEqual(heads, ['Stripped', 'Sub head', 'Added.']);
});
