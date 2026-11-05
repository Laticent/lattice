/**
 * `isValidUrlToken` (lib/core/css-ref-reader.js) as a scan, held to the regex it replaced, frozen below.
 *
 * The regex read a token one character at a time through an alternation. V8 runs that in linear time, but
 * JavaScriptCore gives up on a token of about a megabyte and answers false, so in Safari a photo written inline
 * as a `data:` URL read as a bad url: the picture camera did not draw it at its size (an export picture 55%
 * over its budget in `export-photo-size.spec.ts`, webkit-tablet) and the player export did not embed it. The scan
 * gives the regex's answer on every input below, and answers at any length.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { isValidUrlToken } = require('../../../lib/core/css-ref-reader.js');

// biome-ignore lint/suspicious/noControlCharactersInRegex: frozen copy of the regex the scan replaced
const VALID_URL = /^[^(]*\([\t\n\f\r ]*(?:"(?:[^"\\\n\r\f]|\\[\s\S])*"|'(?:[^'\\\n\r\f]|\\[\s\S])*'|(?:[^"'()\\\t\n\f\r \x00-\x08\x0b\x0e-\x1f\x7f]|\\(?=([0-9a-fA-F]{1,6}))\1(?:\r\n|[\t\n\f\r ])?|\\[^\n\r\f0-9a-fA-F])*)[\t\n\f\r ]*\)?$/;

describe('isValidUrlToken: the scan against the regex it replaced', () => {
  test('hand cases', () => {
    const cases = [
      'url(a.png)', 'url( a.png )', 'url("a b.png")', "url('a')", 'url("a" b)', 'url(a b)', 'url(a"b)', 'url(a(b)',
      'url(k\\29 .png)', 'url(\\41\r\nb)', 'url(\\41\r\rb)', 'url(\\)', 'url(\\\n)', 'url("a\\\nb")', 'url("a\nb")',
      'url(a\u0001)', 'url(a\u007f)', 'url(a b)', 'u\\72l(x.png)', 'url(', 'url()', 'url("a', 'url("a\\', 'url(a',
      'url(\\1234567)', 'url(\\abcdefg)', 'url("x")  ', 'url(x) )', 'noparen', 'url(\\ a)', 'url(\t"x"\t)',
    ];
    for (const c of cases) assert.equal(isValidUrlToken(c), VALID_URL.test(c), JSON.stringify(c));
  });

  test('fuzz: 20,000 tokens from a small alphabet that hits every branch', () => {
    const alphabet = ['a', 'Z', '0', 'f', 'g', ' ', '\t', '\n', '\r', '\f', '"', "'", '(', ')', '\\', '\u0001', '\u007f', ' ', ':', '/'];
    let seed = 7;
    const rnd = (n) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % n;
    };
    for (let k = 0; k < 20_000; k++) {
      let body = '';
      const len = rnd(14);
      for (let i = 0; i < len; i++) body += alphabet[rnd(alphabet.length)];
      const t = `url(${body}`;
      assert.equal(isValidUrlToken(t), VALID_URL.test(t), JSON.stringify(t));
    }
  });

  test('a token of several megabytes is read, quoted or bare', () => {
    const body = 'A'.repeat(4 * 1024 * 1024);
    assert.equal(isValidUrlToken(`url("data:image/jpeg;base64,${body}")`), true);
    assert.equal(isValidUrlToken(`url(data:image/jpeg;base64,${body})`), true);
    assert.equal(isValidUrlToken(`url(data:image/jpeg;base64,${body} x)`), false);
  });
});
