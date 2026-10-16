/**
 * tools/minify-css.js — the directive comments it lifts out of the source must be the
 * source's real comments, read by the shared walk in lib/core/css-comments.mjs.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { minifyCss } = require('../../../tools/minify-css.js');

test('a "/*" inside a string does not fuse the next directive into a garbage comment', () => {
  const css = [
    '/* @theme t */',
    'section::after { content: "/*"; }',
    '/* @size wide 1920px 1080px */',
    'a { color: red }',
    '',
  ].join('\n');
  const out = minifyCss(css);
  // The naive comment regex read `/*"; }\n/* @size … */` as ONE comment and emitted
  // it, so the head carried source code and the directive shared a block with it.
  const head = out.slice(0, out.indexOf('section'));
  assert.equal(head, '/* @theme t */\n/* @size wide 1920px 1080px */\n');
});

test('a directive written inside a string or an unquoted url() is not lifted', () => {
  const out = minifyCss('a::after { content: "/* @theme fake */" }\nb { background: url(x/*@size y*/) }\n');
  assert.ok(!out.startsWith('/*'), out);
});

test('banner first, then every directive in source order, then the body', () => {
  const out = minifyCss('/* @theme t */\n/* plain */\na { color: red }\n/* @size s 1px 1px */\n', '/* banner */');
  assert.ok(out.startsWith('/* banner */\n/* @theme t */\n/* @size s 1px 1px */\n'), out);
  assert.match(out, /a\{color:red\}/);
});
