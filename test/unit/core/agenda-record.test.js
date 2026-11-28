/**
 * The agenda fill writes its class words into a slide-metadata record's internal comment
 * (lib/core/agenda-autofill.js, record note §9 step 2), with a replacer, so a value holding `$&` or `$$` is text.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');

test('an agenda written as a record fills exactly as its directive comments do, `$&` and `$$` included', () => {
  const engine = createEngine();
  const deck = (agenda) => `---\ntheme: indaco\n---\n\n${agenda}\n\n## Agenda\n\n---\n\n<!-- @meta{layout=divider} -->\n\n# One\n\n---\n\n<!-- @meta{layout=divider} -->\n\n# Two\n`;
  const comments = engine.render(deck('<!-- @meta{layout=agenda} -->\n<!-- @meta{footer="Cost $& here $$"} -->')).html;
  const record = engine.render(deck('<!-- @meta{layout=agenda, footer="Cost $& here $$"} -->')).html;
  assert.equal(record, comments);
  assert.match(record, /class="agenda[^"]*agenda-pages/);
});
