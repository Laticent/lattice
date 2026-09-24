/**
 * The `data-prose` mark (#2308): a paragraph that is prose with inline code in it is marked, so
 * the `:has(> code:only-child)` eyebrow/subtitle rules — which cannot see text nodes — stop
 * matching an ordinary sentence. Pinned on the engine path, on the DOM mirror, and through the
 * CSS itself, where the guard has to leave a real code-only paragraph exactly as it was.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const { isProse, applyToDom, PROSE_ATTR } = require('../../../lib/core/prose-code');
const { render } = require('../../../lib/engine');

const ROOT = path.join(__dirname, '..', '..', '..');
const deck = (body) => `---\ntheme: indaco\n---\n\n<!-- _class: content -->\n\n${body}\n`;
const marked = (html) => {
  const doc = new JSDOM(html).window.document;
  return [...doc.querySelectorAll('section p, section li')].map((el) => [el.textContent.replace(/\s+/g, ' ').trim(), el.hasAttribute(PROSE_ATTR)]);
};

describe('core: prose-code — the predicate', () => {
  test('code AND non-whitespace text is prose; either alone is not', () => {
    assert.equal(isProse([{ code: false, text: 'The ' }, { code: true }, { code: false, text: ' clears.' }]), true);
    assert.equal(isProse([{ code: true }]), false);
    assert.equal(isProse([{ code: false, text: '  ' }, { code: true }, { code: false, text: '\n' }]), false);
    assert.equal(isProse([{ code: false, text: 'just words' }]), false);
  });
});

describe('core: prose-code — the engine marks exactly the mixed paragraphs', () => {
  const html = render(deck([
    '`Eyebrow only code`', '',
    '## Heading', '',
    '`Subtitle only code`', '',
    'The `background:` shorthand clears every longhand.', '',
    'An *emphasis* beside `code`.', '',
    'The `x` <!-- a note --> commented sentence.', '',
    '- A tight item with `code` inside',
    '- `only code`',
  ].join('\n'))).html;
  const rows = Object.fromEntries(marked(html));

  test('a sentence holding one code span is marked', () => {
    assert.equal(rows['The background: shorthand clears every longhand.'], true);
    assert.equal(rows['A tight item with code inside'], true, 'a tight list item carries it on the <li>');
    assert.equal(rows['The x commented sentence.'], true, 'a comment is not an element — the runtime mirror agrees');
  });

  test('a code-only eyebrow, subtitle or item is NOT — they must keep matching', () => {
    for (const k of ['Eyebrow only code', 'Subtitle only code', 'only code']) assert.equal(rows[k], false, k);
  });

  test('a paragraph with another element is left alone — `code:only-child` cannot match it anyway', () => {
    assert.equal(rows['An emphasis beside code.'], false);
  });
});

describe('core: prose-code — the DOM mirror agrees with the engine', () => {
  test('marks the same shapes on marp-core-shaped markup, idempotently', () => {
    const doc = new JSDOM(`<section><p><code>eyebrow</code></p><h2>H</h2><p>The <code>x</code> sentence.</p><p>The <code>x</code> <!-- c --> y</p>
      <ul><li>tight <code>y</code></li><li><code>only</code></li><li>parent <code>z</code><ul><li><code>n</code></li></ul></li></ul></section>`).window.document;
    applyToDom(doc);
    applyToDom(doc);
    const got = [...doc.querySelectorAll('p, li')].map((el) => el.hasAttribute(PROSE_ATTR));
    assert.deepEqual(got, [false, true, true, true, false, true, false]);
  });
});

describe('css: the guard changes what matches, never how strongly', () => {
  // Comments stripped: prose ABOUT the selector is not a rule carrying it.
  const css = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  test('every `:has(> code:only-child)` in the bundle carries the zero-specificity guard', () => {
    const bare = (css.match(/:has\(\s*>\s*code:only-child\s*\)(?!:not\(:where\(\[data-prose\]\)\))/g) || []);
    assert.deepEqual(bare, [], 'a new rule keyed on a code-only paragraph must carry :not(:where([data-prose]))');
    assert.ok((css.match(/data-prose/g) || []).length >= 90, 'the guard vanished from the bundle — the census is not measuring anything');
  });

  test('in a browser-free matcher, the subtitle rule skips prose and keeps a real subtitle', () => {
    const doc = new JSDOM('<section><h2>H</h2><p data-prose="">The <code>x</code> one.</p></section><section><h2>H</h2><p><code>real</code></p></section>').window.document;
    const sel = 'section h2 + p:has(> code:only-child):not(:where([data-prose]))';
    const [prose, real] = doc.querySelectorAll('p');
    assert.equal(prose.matches(sel), false);
    assert.equal(real.matches(sel), true);
  });
});
