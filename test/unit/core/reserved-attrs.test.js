/**
 * Unit: lib/core/reserved-attrs.mjs — author HTML may not carry the attributes the split and Fluid
 * stamp as their own (engineering/decisions/2026-10-27-fluid-layout-library.md §5.2, §11, §12).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { neutralizeReservedAttrs } = require('../../../lib/core/reserved-attrs.mjs');
const { createEngine } = require('../../../lib/engine');

const RESERVED = /data-(?:split|fluid)-/i;
const engine = createEngine();
const render = (body) => engine.render(`---\ntheme: indaco\n---\n\n${body}\n`, 'indaco', { preview: true }).html;
// The engine's own section stamps are not author HTML; look only inside the slide bodies.
const authored = (html) => html.replace(/<section\b[^>]*>/g, '<section>');

test('renames the prefix and keeps every other attribute', () => {
  const out = neutralizeReservedAttrs('<div data-split-role="body" class="x" DATA-Fluid-Budget=0 id=y>a</div>');
  assert.doesNotMatch(out, RESERVED);
  assert.equal(out, '<div data-x-split-role="body" class="x" data-x-fluid-Budget=0 id=y>a</div>');
});

test('input without a reserved prefix comes back as the same string', () => {
  const s = '<div class="a" data-splitter="ok"><span id=b>x</span></div>';
  assert.equal(neutralizeReservedAttrs(s), s);
});

// The five shapes that broke a per-token tag parser, each confirmed live in Chromium by the
// independent check. The browser carries comment, rawtext and quote state across tokens, which is
// why the rewrite does not parse at all.
const BYPASSES = {
  'empty comment <!-->': '<!--><div data-split-role="cover">x</div>',
  'empty comment <!--->': '<!---><div data-split-role="cover">x</div>',
  '--!> comment close': '<!-- a --!><div data-split-role="cover">x</div> -->',
  '<!-- inside <textarea>': '<textarea><!--</textarea><div data-split-role="cover">x</div>-->',
  '<!-- inside <style>': '<style><!--</style><div data-fluid-budget="0">x</div>-->',
  '<!-- inside <script>': '<script><!--</script><div data-split-role="cover">x</div>-->',
  '<!-- inside <title>': '<title><!--</title><div data-split-role="cover">x</div>-->',
  'a quote opened in one token and closed in the next': `</section><section title="\n\n<span title='"data-split-role=cover x'>y</span>`,
};

for (const [name, body] of Object.entries(BYPASSES)) {
  test(`the engine leaves no reserved name: ${name}`, () => {
    assert.doesNotMatch(neutralizeReservedAttrs(body), RESERVED);
    assert.doesNotMatch(authored(render(body)), RESERVED);
  });
}

test('the engine neutralizes raw HTML blocks and inline tags, and the rest of the tag survives', () => {
  const html = render('<div data-split-role="body" data-fluid-budget="0" class="k">hi <span data-split-label="<b>x</b>">y</span></div>');
  assert.doesNotMatch(authored(html), RESERVED);
  assert.match(html, /class="k"/);
});

test('code is escaped, so a fence that mentions the names is untouched text', () => {
  const html = render('```html\n<div data-split-role="cover">x</div>\n```');
  assert.match(html, /data-split-role/, 'a fence shows the author what they typed');
  assert.doesNotMatch(html, /<div data-split-role/);
});
