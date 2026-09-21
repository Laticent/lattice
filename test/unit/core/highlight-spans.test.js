const test = require('node:test');
const assert = require('node:assert/strict');
const { spansFromHighlightHtml, plainLength } = require('../../../lib/core/highlight-spans');
const engine = require('../../../lib/engine/index.js');

// The kernel that lets a non-HTML surface paint the RENDERER's tokenization —
// engineering/decisions/2026-09-21-compose-fenced-code.md § Axis A. Every offset
// below is into the ORIGINAL source string, which is the whole contract.

test('plainLength discounts exactly the five entities hljs escapes', () => {
  assert.equal(plainLength('abc'), 3);
  assert.equal(plainLength('&amp;'), 1);
  assert.equal(plainLength('&lt;div&gt;'), 5);
  assert.equal(plainLength('&quot;a&#x27;b&quot;'), 5);
  // A string that merely LOOKS like an entity is not one — hljs never emits it,
  // and discounting it would shift every offset after it.
  assert.equal(plainLength('&nbsp;'), 6);
});

test('a flat run of spans reports source offsets, not HTML offsets', () => {
  const html = '<span class="hljs-keyword">const</span> x = <span class="hljs-number">1</span>';
  assert.deepEqual(spansFromHighlightHtml(html), [
    { from: 0, to: 5, cls: 'hljs-keyword' },
    { from: 10, to: 11, cls: 'hljs-number' },
  ]);
});

test('an escaped entity before a span does not shift it', () => {
  // `a < b` is five characters; the span must start at 6, not at the HTML's 10.
  const html = 'a &lt; b <span class="hljs-keyword">if</span>';
  assert.deepEqual(spansFromHighlightHtml(html), [{ from: 6, to: 8, cls: 'hljs-keyword' }]);
});

test('nested spans are BOTH reported, outer first', () => {
  const html = '<span class="hljs-string">"a<span class="hljs-subst">b</span>"</span>';
  assert.deepEqual(spansFromHighlightHtml(html), [
    { from: 0, to: 4, cls: 'hljs-string' },
    { from: 2, to: 3, cls: 'hljs-subst' },
  ]);
});

test('a compound class attribute arrives intact', () => {
  const html = '<span class="hljs-title function_">go</span>';
  assert.deepEqual(spansFromHighlightHtml(html), [{ from: 0, to: 2, cls: 'hljs-title function_' }]);
});

test('malformed input costs a fence its color, never a throw', () => {
  assert.deepEqual(spansFromHighlightHtml(''), []);
  assert.deepEqual(spansFromHighlightHtml(null), []);
  assert.deepEqual(spansFromHighlightHtml('</span>plain'), []);
  assert.deepEqual(spansFromHighlightHtml('<span class="hljs-keyword">if'), [{ from: 0, to: 2, cls: 'hljs-keyword' }]);
  assert.deepEqual(spansFromHighlightHtml('<span class="hljs-x'), []);
});

test('an empty or zero-width span is dropped', () => {
  assert.deepEqual(spansFromHighlightHtml('<span class="hljs-keyword"></span>'), []);
  assert.deepEqual(spansFromHighlightHtml('<span>text</span>'), []);
});

// ── Against the REAL highlighter, which is the only test that proves the contract ──

test('every span the engine reports slices the right text back out', () => {
  const code = ['// a comment', 'const greeting = "hello <world>";', 'if (x > 1) { return 2; }'].join('\n');
  const spans = engine.languages.spans(code, 'javascript');
  assert.ok(spans.length > 4, `expected several tokens, got ${spans.length}`);
  // The contract in one assertion: the class says what the token is, so the text
  // the range cuts out of the ORIGINAL string had better be that token.
  const byClass = (cls) => spans.filter((s) => s.cls.includes(cls)).map((s) => code.slice(s.from, s.to));
  assert.deepEqual(byClass('hljs-comment'), ['// a comment']);
  assert.ok(byClass('hljs-string').includes('"hello <world>"'), JSON.stringify(byClass('hljs-string')));
  assert.ok(byClass('hljs-keyword').includes('const'));
  // Nothing may point outside the string, or a decoration built from it throws.
  for (const s of spans) {
    assert.ok(s.from >= 0 && s.to <= code.length && s.from < s.to, `bad range ${JSON.stringify(s)}`);
  }
});

test('an unregistered grammar yields nothing rather than throwing', () => {
  assert.deepEqual(engine.languages.spans('nuqneH', 'klingon'), []);
  assert.deepEqual(engine.languages.spans('', 'javascript'), []);
  assert.deepEqual(engine.languages.spans('x', ''), []);
});

test('a body full of the escaped characters keeps its offsets exact', () => {
  // The case the entity discount exists for: every one of hljs's five escapes in
  // one line, with a token after each.
  const code = `const s = "&<>'\\"" ; // done`;
  for (const s of engine.languages.spans(code, 'javascript')) {
    assert.ok(s.to <= code.length, `range past end: ${JSON.stringify(s)} of ${code.length}`);
  }
  const comment = engine.languages.spans(code, 'javascript').find((s) => s.cls.includes('comment'));
  assert.equal(code.slice(comment.from, comment.to), '// done');
});
