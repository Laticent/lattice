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
 * byte-exact, it cannot close its own `<script>`, reading it REMOVES it (so a
 * consumed snapshot doesn't linger where something may copy or serialize it), and
 * a re-export REPLACES the block rather than stacking a staler one beside it.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const {
  FRONT_MATTER_TYPE, BLOCK_NOTE, readFrontMatterBlock, frontMatterBlock,
  withoutFrontMatterBlock, withoutLocalAssetRefs, readBakedFrontMatter,
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
    // The note leads, so the file says the block is generated where an editor is
    // looking — the snapshot OVERRIDES the front matter it was copied from.
    assert.ok(block.startsWith(`${BLOCK_NOTE}\n`), 'the generated-file note leads');
    assert.match(BLOCK_NOTE, /re-export/, 'and it says what to do about it');
    assert.match(block, new RegExp(`<script type="${FRONT_MATTER_TYPE}">`));
    assert.match(block, /<\/script>\n$/);
    // Read the payload through a real HTML parser rather than by stripping the
    // tags with a regex: what matters is what a BROWSER sees in that element, and
    // a tag-shaped regex answers a different question (CodeQL is right to flag
    // the pattern, even in a test — it is never the tool for this job).
    const el = new JSDOM(`<section>${block}</section>`).window.document.querySelector('script');
    assert.equal(el.getAttribute('type'), FRONT_MATTER_TYPE);
    assert.equal(JSON.parse(el.textContent), readFrontMatterBlock(DECK));
  });

  test('a deck with no front matter bakes nothing', () => {
    assert.equal(frontMatterBlock('# A\n'), '');
    assert.equal(frontMatterBlock('---\n\n---\n# A\n'), '', 'blank front matter is nothing to carry');
  });

  // The one character that could turn a data block into markup.
  test('a payload cannot close its own script element', () => {
    const block = frontMatterBlock('---\nmeta: "</script><img src=x onerror=alert(1)>"\n---\n# A\n');
    // Case-insensitively: `frontMatterBlock` escapes EVERY `<`, so `</SCRIPT>`
    // cannot close the element either.
    const beforeTheRealClose = block.slice(0, -'</script>\n'.length).toLowerCase();
    assert.ok(!beforeTheRealClose.includes('</script'), 'only the real closing tag is present');
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

describe('deck front matter — the snapshot cannot go stale in duplicate', () => {
  // Re-exporting a bundle's own deck is ordinary (edit what a recipient sent back,
  // re-export). It used to stack a SECOND block, and the reader took the FIRST —
  // so a re-export was read through the stalest snapshot in the file.
  test('re-baking replaces the block rather than stacking a second', () => {
    const once = withRuntimeScripts(DECK);
    const twice = withRuntimeScripts(once);
    assert.equal(once, twice, 'the second bake is byte-identical');
    assert.equal((twice.match(new RegExp(FRONT_MATTER_TYPE, 'g')) || []).length, 1);
    // …and the runtime tags too, which were also duplicating.
    assert.equal((twice.match(/lattice-runtime\.min\.js/g) || []).length, 1);
  });

  test('a deck whose front matter CHANGED re-bakes to the new value', () => {
    const first = withRuntimeScripts(DECK);
    const edited = first.replace('color-mode: dark', 'color-mode: light');
    const doc = new JSDOM(`<section>${withRuntimeScripts(edited)}</section>`).window.document;
    const fm = readBakedFrontMatter(doc);
    assert.match(fm, /color-mode: light/);
    assert.doesNotMatch(fm, /color-mode: dark/, 'no trace of the previous snapshot');
  });

  test('when a document somehow holds two blocks, the LAST wins and both go', () => {
    const doc = new JSDOM(
      `<section>${frontMatterBlock('---\nclass: dark\n---\n# A\n')}`
      + `${frontMatterBlock('---\nclass: light\n---\n# A\n')}</section>`,
    ).window.document;
    assert.equal(readBakedFrontMatter(doc), 'class: light', 'the newest snapshot is the one to trust');
    assert.equal(doc.querySelectorAll('script').length, 0, 'neither is left behind');
  });

  test('withoutFrontMatterBlock strips the block and its note, and nothing else', () => {
    const deck = `${DECK.replace(/\s*$/, '')}\n`;
    assert.equal(withoutFrontMatterBlock(`${deck}${frontMatterBlock(DECK)}`), deck);
    assert.equal(withoutFrontMatterBlock(deck), deck, 'a deck with no block is untouched');
  });
});

describe('deck front matter — a producer that cannot carry local files', () => {
  // The in-browser producer has no filesystem, so it cannot copy a deck's local
  // images into the bundle. Baking a relative `logo:` would render a broken image
  // where the register previously just never fired.
  test('localAssets:false drops a relative logo, keeps a remote or data one', () => {
    const payload = (src, opts) => {
      const doc = new JSDOM(`<section>${frontMatterBlock(src, opts)}</section>`).window.document;
      return readBakedFrontMatter(doc) || '';
    };
    const local = '---\nclass: dark\nlogo: brand/mark.svg\n---\n# A\n';
    assert.match(payload(local), /logo: brand\/mark\.svg/, 'the CLI keeps it — it copies the file');
    assert.doesNotMatch(payload(local, { localAssets: false }), /logo:/);
    assert.match(payload(local, { localAssets: false }), /class: dark/, 'other keys survive');
    for (const remote of ['https://x.test/m.svg', 'data:image/svg+xml,<svg/>', '//x.test/m.svg', '/abs/m.svg']) {
      const src = `---\nlogo: ${remote}\n---\n# A\n`;
      assert.ok(payload(src, { localAssets: false }).includes(`logo: ${remote}`), `kept: ${remote}`);
    }
  });

  test('withoutLocalAssetRefs leaves a front matter with no asset key alone', () => {
    assert.equal(withoutLocalAssetRefs('class: dark'), 'class: dark');
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
