/**
 * Unit tests for the pill-tag transformer.
 *
 * Covers both the HTML-string kernel (tagPills / applyToHtml — lib/engine,
 * serving the CLI/PDF path and the browser playground) and the DOM walk
 * (applyToDom, used by lattice-runtime.js).
 * The contract: a trailing `<code>` immediately before a
 * nested list is tagged `lat-pill`; a mid-sentence `<code>` on a row that
 * merely has a nested list is NOT.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const pillTag = require('../../../lib/transformers/pill-tag');

describe('pill-tag — HTML kernel', () => {
  test('tags a trailing code immediately before a nested list', () => {
    const out = pillTag.tagPills('<li>Renewal <code>$2.1M</code><ul><li>detail</li></ul></li>');
    assert.match(out, /<code class="lat-pill">\$2\.1M<\/code><ul>/);
  });

  test('tags through whitespace between code and the list', () => {
    const out = pillTag.tagPills('<li>Renewal <code>$2.1M</code>\n  <ol><li>detail</li></ol></li>');
    assert.match(out, /<code class="lat-pill">\$2\.1M<\/code>\s*<ol>/);
  });

  test('does NOT tag mid-sentence code on a row with a nested list', () => {
    const out = pillTag.tagPills('<li>The <code>--accent</code> token does X<ul><li>d</li></ul></li>');
    assert.doesNotMatch(out, /lat-pill/);
  });

  test('does NOT tag code not followed by a list (trailing handled by CSS :last-child)', () => {
    const out = pillTag.tagPills('<li>row text <code>meta</code></li>');
    assert.doesNotMatch(out, /lat-pill/);
  });

  test('tags only the trailing code when a row has both mid-sentence and trailing code', () => {
    const out = pillTag.tagPills('<li>see <code>--x</code> then <code>PILL</code><ul><li>d</li></ul></li>');
    assert.match(out, /<code>--x<\/code>/);              // mid-sentence untouched
    assert.match(out, /<code class="lat-pill">PILL<\/code><ul>/);
  });

  test('merges into an existing class attribute', () => {
    const out = pillTag.tagPills('<li><code class="foo">x</code><ul><li>d</li></ul></li>');
    assert.match(out, /<code class="foo lat-pill">x<\/code>/);
  });

  test('is idempotent', () => {
    const once = pillTag.tagPills('<li><code>x</code><ul><li>d</li></ul></li>');
    const twice = pillTag.tagPills(once);
    assert.equal(once, twice);
    assert.equal((twice.match(/lat-pill/g) || []).length, 1);
  });
});

describe('pill-tag — applyToDom', () => {
  const makeDoc = (html) => new JSDOM(`<!doctype html><html><body>${html}</body></html>`).window.document;

  test('tags trailing code before a nested list', () => {
    const doc = makeDoc('<ul><li>Renewal <code>$2.1M</code><ul><li>detail</li></ul></li></ul>');
    pillTag.applyToDom(doc);
    assert.ok(doc.querySelector('li > code').classList.contains('lat-pill'));
  });

  test('does NOT tag mid-sentence code on a row with a nested list', () => {
    const doc = makeDoc('<ul><li>The <code>--accent</code> token does X<ul><li>d</li></ul></li></ul>');
    pillTag.applyToDom(doc);
    assert.equal(doc.querySelector('li > code').classList.contains('lat-pill'), false);
  });

  test('does NOT tag a plain trailing code (CSS :last-child handles it)', () => {
    const doc = makeDoc('<ul><li>row <code>meta</code></li></ul>');
    pillTag.applyToDom(doc);
    assert.equal(doc.querySelector('li > code').classList.contains('lat-pill'), false);
  });

  test('is idempotent', () => {
    const doc = makeDoc('<ul><li><code>x</code><ul><li>d</li></ul></li></ul>');
    pillTag.applyToDom(doc);
    pillTag.applyToDom(doc);
    assert.ok(doc.querySelector('li > code').classList.contains('lat-pill'));
  });
});
