/**
 * `renameClassDirectives` (lib/packages/rename.js) renames a package component's class token in its gallery. A gallery
 * written in slide records (`<!-- @meta{layout=kpi} -->`, engineering/decisions/2026-10-17-meta-record.md §15) must be
 * renamed as one written in comments, and only in the fields that hold classes.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renameClassDirectives } = require('../../../lib/packages/rename.js');

test('renames a whole class token in a comment and in a record, nothing else', () => {
  const md = [
    '<!-- _class: kpi dark -->',
    '<!-- class: kpi -->',
    '<!-- @meta{layout=kpi, class="kpi-row kpi", footer=kpi} -->',
    '<!-- @meta{variant="kpi"} -->',
    'Prose about kpi stays.',
  ].join('\n');
  assert.equal(renameClassDirectives(md, 'kpi', 'acme-kpi'), [
    '<!-- _class: acme-kpi dark -->',
    '<!-- class: acme-kpi -->',
    '<!-- @meta{layout=acme-kpi, class="kpi-row acme-kpi", footer=kpi} -->',
    '<!-- @meta{variant="acme-kpi"} -->',
    'Prose about kpi stays.',
  ].join('\n'));
});

test('a class-shaped word inside another field\'s quoted text is text', () => {
  const md = '<!-- @meta{layout=kpi, footer="see class=kpi, layout=kpi here"} -->';
  assert.equal(renameClassDirectives(md, 'kpi', 'x'), '<!-- @meta{layout=x, footer="see class=kpi, layout=kpi here"} -->');
});

test('a token that only shares a prefix is left alone', () => {
  assert.equal(renameClassDirectives('<!-- @meta{layout=kpi-row} -->', 'kpi', 'x'), '<!-- @meta{layout=kpi-row} -->');
});
