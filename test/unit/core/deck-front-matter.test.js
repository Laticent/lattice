/**
 * Unit: the baked deck front matter (lib/core/deck-front-matter.js).
 *
 * Marp strips front matter, so the runtime had no way to see the deck-wide
 * registers (`color-mode:`, `class:`, `logo:`, `meta:`, …) in a rendered document
 * and recovered them by FETCHING the source `.md` beside it. `fetch` does not
 * work on `file://` — which is how a recipient double-clicking the exported HTML
 * AND marp-cli rendering the PDF both load the deck — so every one of those
 * registers was silently lost on exactly the surface the export documents. A
 * `class: dark` deck came out light.
 *
 * Baking the front matter into the document as an inert data block removes the
 * network from the path. What has to hold: the payload survives a round trip
 * byte-exact, it cannot close its own `<script>`, and reading it REMOVES it (a
 * leftover element would take a `gap` in the flex column that measures the slide).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const {
  FRONT_MATTER_TYPE, readFrontMatterBlock, frontMatterBlock, readBakedFrontMatter,
} = require('../../../lib/core/deck-front-matter');
const { withRuntimeScripts } = require('../../../lib/core/marp-bundle');

const DECK = ['---', 'marp: true', 'theme: indaco', 'color-mode: dark', 'logo: assets/mark.svg', '---', '', '# A', ''].join('\n');

describe('deck front matter — reading the source block', () => {
  test('reads the YAML between the leading fences, without them', () => {
    assert.equal(readFrontMatterBlock(DECK), 'marp: true\ntheme: indaco\ncolor-mode: dark\nlogo: assets/mark.svg');
  });

  test('CRLF sources read the same', () => {
    assert.equal(readFrontMatterBlock('---\r\na: 1\r\n---\r\n# B\r\n'), 'a: 1');
  });

  test('no front matter, or none at the very top, reads as empty', () => {
    assert.equal(readFrontMatterBlock('# A\n\n---\na: 1\n---\n'), '');
    assert.equal(readFrontMatterBlock(''), '');
    assert.equal(readFrontMatterBlock(null), '');
  });
});

describe('deck front matter — the baked block', () => {
  test('carries the YAML as a JSON payload under its own type', () => {
    const block = frontMatterBlock(DECK);
    assert.match(block, new RegExp(`^<script type="${FRONT_MATTER_TYPE}">`));
    assert.match(block, /<\/script>\n$/);
    const payload = block.replace(/^<script[^>]*>/, '').replace(/<\/script>\n$/, '');
    assert.equal(JSON.parse(payload), readFrontMatterBlock(DECK));
  });

  test('a deck with no front matter bakes nothing', () => {
    assert.equal(frontMatterBlock('# A\n'), '');
    assert.equal(frontMatterBlock('---\n\n---\n# A\n'), '', 'blank front matter is nothing to carry');
  });

  // The one character that could turn a data block into markup.
  test('a payload cannot close its own script element', () => {
    const block = frontMatterBlock('---\nmeta: "</script><img src=x onerror=alert(1)>"\n---\n# A\n');
    assert.ok(!block.slice(0, -'</script>\n'.length).includes('</script'), 'only the real closing tag is present');
    assert.match(block, /\\u003c\/script>/, 'the payload\'s `<` is escaped');
    const doc = new JSDOM(`<article><section>${block}</section></article>`).window.document;
    assert.equal(doc.querySelectorAll('img').length, 0, 'the browser parses no injected element');
    assert.match(readBakedFrontMatter(doc), /^meta: "<\/script>/, 'and it still round-trips exactly');
  });

  test('round-trips every YAML shape a deck carries', () => {
    for (const fm of [
      'a: 1',
      'meta: "Q3 — 2026 · Board"',
      "class: dark\nlogo-x: 92.5",
      'meta: |\n  line one\n  line two',
      'meta: "he said \\"hi\\""',
      'meta: "π ≤ ∞ — em—dash"',
    ]) {
      const doc = new JSDOM(`<section>${frontMatterBlock(`---\n${fm}\n---\n# A\n`)}</section>`).window.document;
      assert.equal(readBakedFrontMatter(doc), fm, `round trip failed for ${JSON.stringify(fm)}`);
    }
  });
});

describe('deck front matter — reading it back out of a document', () => {
  const docWith = (fm) => new JSDOM(
    `<article><section id="1"><h1>A</h1>${frontMatterBlock(`---\n${fm}\n---\n# A\n`)}</section></article>`,
  ).window.document;

  test('returns the YAML and REMOVES the block', () => {
    const doc = docWith('class: dark');
    assert.equal(doc.querySelectorAll('script').length, 1);
    assert.equal(readBakedFrontMatter(doc), 'class: dark');
    assert.equal(doc.querySelectorAll('script').length, 0, 'the block is out of the DOM');
    assert.equal(doc.querySelector('section').children.length, 1, 'only the real content is left');
  });

  test('a second read finds nothing — which is why the caller caches', () => {
    const doc = docWith('class: dark');
    readBakedFrontMatter(doc);
    assert.equal(readBakedFrontMatter(doc), null);
  });

  test('a document with no block, and a corrupt payload, both read as null', () => {
    assert.equal(readBakedFrontMatter(new JSDOM('<section><h1>A</h1></section>').window.document), null);
    const bad = new JSDOM(`<section><script type="${FRONT_MATTER_TYPE}">{not json</script></section>`).window.document;
    assert.equal(readBakedFrontMatter(bad), null, 'a corrupt payload is a missing one — fall back to the fetch');
    const notString = new JSDOM(`<section><script type="${FRONT_MATTER_TYPE}">{"a":1}</script></section>`).window.document;
    assert.equal(readBakedFrontMatter(notString), null);
  });

  test('survives a null / non-DOM argument', () => {
    assert.equal(readBakedFrontMatter(null), null);
    assert.equal(readBakedFrontMatter({}), null);
  });
});

describe('deck front matter — the export bundle carries it', () => {
  test('withRuntimeScripts appends the block after the runtime tags', () => {
    const out = withRuntimeScripts(DECK);
    assert.match(out, /<script src="lattice-runtime\.min\.js"><\/script>/);
    assert.match(out, new RegExp(`<script type="${FRONT_MATTER_TYPE}">.*</script>\\n$`, 's'));
    // The deck's own body and front matter are untouched — the block is additive.
    assert.ok(out.startsWith(DECK.replace(/\s*$/, '')), 'the deck source leads, unmodified');
  });

  test('a front-matter-less deck gets the scripts and no block', () => {
    const out = withRuntimeScripts('# A\n');
    assert.match(out, /lattice-runtime\.min\.js/);
    assert.ok(!out.includes(FRONT_MATTER_TYPE));
  });
});
