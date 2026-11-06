/**
 * Unit: lib/core/rawtext-close.mjs — a RAWTEXT end tag with whitespace before `>`
 * (`</style >`) closes the block, so it cannot swallow the next slide separator (#2052).
 *
 * Held on all three parsers that decide where a slide begins: the engine's render, the
 * boundary parser (`slideBoundaries`), and the Segno deck model. A fix in one of them would
 * leave the editor's rail and the export disagreeing about the slide count.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const { createEngine } = require('../../../lib/engine');
const { slideBoundaries } = require('../../../lib/core/slide-boundaries.mjs');
const { bodyModel } = require('../../../lib/core/deck-model.mjs');
const { tolerateRawtextClose } = require('../../../lib/core/rawtext-close.mjs');

const engine = createEngine();
const sections = (md) => (engine.render(md, {}).html.match(/<section\b/g) || []).length;

// The issue's repro shape: three slides, the middle one closing its block with a space.
const deck = (open, close) => `# One\n\n---\n\n# Two\n\n${open}\nbody\n${close}\n\n---\n\n# Three\n\nAfter.\n`;

const CASES = [
  ['style', '<style>', '</style >'],
  ['pre', '<pre>', '</pre >'],
  ['textarea', '<textarea>', '</textarea >'],
  ['script', '<script type="text/plain">', '</script >'],
  ['tab and upper case', '<STYLE>', '</STYLE\t>'],
];

describe('rawtext-close: `</name >` ends a RAWTEXT block before a slide separator (#2052)', () => {
  for (const [name, open, close] of CASES) {
    test(`${name}: the engine renders three slides`, () => {
      assert.equal(sections(deck(open, close)), 3);
    });
    test(`${name}: slideBoundaries and the deck model agree on two separators`, () => {
      const body = deck(open, close);
      assert.equal(slideBoundaries(body).lines.length, 2);
      assert.equal(bodyModel(body).slides.length, 3);
    });
  }

  test('the issue repro (lens tags, front matter) renders three slides', () => {
    const md = '---\nmarp: true\ntheme: indaco\n---\n<!-- _lens: brief -->\n\n# Board summary\n\n---\n\n# Withheld internal slide\n\n<style>\nsection { color: red; }\n</style >\n\n---\n<!-- _lens: brief -->\n\n# The ask\n\nApprove the budget.\n';
    assert.equal(sections(md), 3);
  });

  test('an UNCLOSED block still runs to the end, as upstream does', () => {
    // The divergence is the close tag only: a block with no close at all keeps the spec's
    // behavior, so a half-typed `<style>` does not start inventing slides either.
    assert.equal(sections(deck('<style>', 'still css')), 2);
  });

  test('a non-HTML space (NBSP) before `>` is NOT a close, because a browser does not skip it', () => {
    // The HTML tokenizer skips tab, LF, FF and space after an end tag's name, and nothing else. A rule that closed on
    // `</style\u00a0>` would split a slide the browser still holds inside its `<style>`.
    assert.equal(sections(deck('<style>', '</style\u00a0>')), 2);
  });

  test('the plugin fence reader the host hands a bake sees a fence after a `</style >` block, as the engine renders it', () => {
    // Plugins are handed the fences the ENGINE parses (lib/core/plugin-fences.mjs, through the boundary parser),
    // so a fence after a `</style >` block reaches the Mermaid bake rather than vanishing into the raw block.
    const { pluginFences } = require('../../../lib/core/plugin-fences.mjs');
    const grammar = { fences: { mermaid: {} } };
    const src = '<style>\na{}\n</style >\n\n- item\n\n  ```mermaid\n  graph TD\n  A-->B\n  ```\n';
    assert.equal(pluginFences(src, grammar).length, 1);
    assert.equal(pluginFences(src.replace('</style >', '</style\u00a0>'), grammar).length, 0, 'an NBSP is not a close, so the block runs on');
  });

  test('the tokens match upstream for every close upstream already accepts', () => {
    const plain = new MarkdownIt('commonmark', { html: true });
    const ours = tolerateRawtextClose(new MarkdownIt('commonmark', { html: true }));
    for (const src of ['<style>\na{}\n</style>\n\n---\n', 'para\n<pre>\nx\n</pre>\nafter\n', '  <script>x</script>\n- item\n', '<div>\nx\n</div>\n',
      // markdown-it 14.3: an outdented BLANK line inside a list item does not end a condition-1 block.
      '- <style>\n  a{}\n\n  b{}\n  </style>\n- next\n', '- <pre>\n  line a\n\n  line b\n  </pre>\n', '1. x\n   <textarea>\n   a\n\n   b\n   </textarea>\n', '- <script>\n  a\n\n</script>\n']) {
      const shape = (md) => md.parse(src, {}).map((t) => [t.type, t.map && t.map.join(','), t.content]);
      assert.deepEqual(shape(ours), shape(plain), src);
    }
  });
});
