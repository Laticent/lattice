const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseTopLevelLis, extractFirstList } = require('../../../lib/core/html-lists');

test('parseTopLevelLis returns top-level items, not nested ones', () => {
  const inner = '<li>alpha<ul><li>nested</li></ul></li><li>beta</li>';
  assert.deepEqual(parseTopLevelLis(inner), ['alpha<ul><li>nested</li></ul>', 'beta']);
});

test('parseTopLevelLis tolerates attributes on li/ul/ol', () => {
  const inner = '<li class="x">a<ol start="2"><li>n</li></ol></li><li data-y>b</li>';
  const items = parseTopLevelLis(inner);
  assert.equal(items.length, 2);
  assert.match(items[0], /^a<ol start="2">/);
});

test('parseTopLevelLis on empty / list-free input returns []', () => {
  assert.deepEqual(parseTopLevelLis(''), []);
  assert.deepEqual(parseTopLevelLis('<p>no list here</p>'), []);
});

test('parseTopLevelLis does not confuse a nested </li> for the outer close', () => {
  const inner = '<li>outer<ul><li>in1</li><li>in2</li></ul>tail</li>';
  assert.deepEqual(parseTopLevelLis(inner), ['outer<ul><li>in1</li><li>in2</li></ul>tail']);
});

test('extractFirstList finds the first ul and survives nesting', () => {
  const src = '<p>x</p><ul><li>a<ul><li>b</li></ul></li></ul><ul><li>second</li></ul>';
  const r = extractFirstList(src);
  assert.ok(r);
  assert.equal(r.inner, '<li>a<ul><li>b</li></ul></li>');
  assert.equal(src.slice(r.start, r.end), '<ul><li>a<ul><li>b</li></ul></li></ul>');
});

test('extractFirstList matches <ol> and attribute-carrying opens', () => {
  const src = '<ol start="3" class="steps"><li>one</li></ol>';
  const r = extractFirstList(src);
  assert.ok(r);
  assert.equal(r.inner, '<li>one</li>');
});

test('extractFirstList returns null when no list exists or the list is unterminated', () => {
  assert.equal(extractFirstList('<p>prose</p>'), null);
  assert.equal(extractFirstList('<ul><li>never closed'), null);
});

test('extractFirstList does not match <ulx>-style prefix-confusable tags', () => {
  assert.equal(extractFirstList('<ulx><li>a</li></ulx>'), null);
});
