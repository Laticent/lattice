
// An inline icon and the word after it share a line: lib/core/icon-bind.js, on both render paths (HARD RULE #1).
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { BIND_WORD } = require('../../../lib/core/icon-bind.js');
const bindElement = require('../../../lib/runtime/icon-bind.js');
const bindLength = (text) => BIND_WORD.exec(text)?.[0].length ?? 0;
const { createEngine } = require('../../../lib/engine/index.js');

test('the rule takes one space and the next word, and nothing else', () => {
  assert.equal(bindLength(' Snowflake holds'), 10);
  assert.equal(bindLength(' S3, a'), 4);
  assert.equal(bindLength(' S3'), 3);
  assert.equal(bindLength(' '), 0, 'two icons in a row: the space holds no word');
  assert.equal(bindLength('.'), 0, 'punctuation right after the icon');
  assert.equal(bindLength('  two spaces'), 0);
  assert.equal(bindLength(''), 0);
});

test('markdown-it wraps an icon and its word, and leaves a chain of icons alone', () => {
  const html = String(createEngine().render('---\nmarp: true\n---\n\nLand in `^{bucket}` S3, then `^{lock}` `^{key}`.\n').html);
  assert.match(html, /<span class="lat-icon-bind"><span class="lat-icon"[\s\S]*?<\/span> S3,<\/span> then/);
  assert.equal(html.match(/lat-icon-bind/g).length, 1, 'neither `^{lock} ` nor `^{key}.` binds');
});

test('the DOM mirror wraps the same way, once', () => {
  const { document } = new JSDOM('<p>in <span class="lat-icon"></span> Snowflake holds</p>').window;
  const icon = document.querySelector('.lat-icon');
  assert.ok(bindElement(icon));
  assert.equal(document.querySelector('p').innerHTML, 'in <span class="lat-icon-bind"><span class="lat-icon"></span> Snowflake</span> holds');
  assert.equal(bindElement(icon), null, 'an icon already bound is not wrapped twice');
});
