/**
 * Unit: a `_class:` directive belongs to ONE slide (#1329).
 *
 * The PDF path used to answer "what band is this diagram in?" by scanning the whole
 * document up to the fence and taking the last `<!-- _class: … -->` it found. `before`
 * never reset at a slide boundary, and Marp's `_class` is a SINGLE-SLIDE directive, so
 * a bare slide following a `<!-- _class: dark -->` slide got a DARK-baked diagram on a
 * light canvas: white node ink on a light chip. The fallback was asymmetric too —
 * once any `_class:` had appeared earlier in the deck, the deck default stopped being
 * consulted for every later slide, whether or not that slide declared anything.
 *
 * These are behavior tests, deliberately: the previous form of this logic lived inline
 * in a CLI that renders on require, so the only available assertion was `assert.match`
 * on its source text — which cannot fail for a semantic error.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { slideClassSpans, slideClassAt, slideIndexAt } = require('../../../lib/core/slide-class-spans');

const FM = '---\nmarp: true\ntheme: onyx\n---\n';
const deck = (body) => FM + body;

/** The `_class:` in force at each `@` marker, in order. */
function classesAtMarkers(src) {
  const { spans } = slideClassSpans(src);
  const out = [];
  for (let i = src.indexOf('@MARK'); i !== -1; i = src.indexOf('@MARK', i + 1)) {
    out.push(slideClassAt(spans, i));
  }
  return out;
}

describe('slideClassSpans — a directive belongs to its own slide', () => {
  test('#1329: a bare slide after a `_class: dark` slide inherits NOTHING', () => {
    const src = deck([
      '<!-- _class: dark -->',
      '',
      '## Dark slide',
      '',
      '@MARK',
      '',
      '---',
      '',
      '## Light slide, no directive',
      '',
      '@MARK',
      '',
    ].join('\n'));
    assert.deepEqual(classesAtMarkers(src), ['dark', ''],
      'the second slide declares no `_class:`, so it must fall back to the DECK default — '
      + 'carrying `dark` forward is #1329, and it bakes white node ink onto a light chip');
  });

  test('a directive placed AFTER the content still governs its own slide', () => {
    // Marp does not care where in the slide the comment sits, and neither may this:
    // the old scan happened to work for a leading directive and only for that.
    const src = deck(['## Heading', '', '@MARK', '', '<!-- _class: dark -->', ''].join('\n'));
    assert.deepEqual(classesAtMarkers(src), ['dark']);
  });

  test('the LAST directive on a slide wins, and does not leak to the next', () => {
    const src = deck([
      '<!-- _class: light -->',
      '<!-- _class: dark -->',
      '@MARK',
      '',
      '---',
      '',
      '@MARK',
      '',
    ].join('\n'));
    assert.deepEqual(classesAtMarkers(src), ['dark', '']);
  });

  test('every thematic-break FORM is a boundary, not just a literal `---`', () => {
    // The engine splits on markdown-it's top-level `hr` tokens. A line-regex splitter
    // sees only `---`, so `***` and `___` would silently carry a directive forward.
    for (const rule of ['---', '***', '___', '- - -', '* * *']) {
      const src = deck(['<!-- _class: dark -->', '@MARK', '', rule, '', '@MARK', ''].join('\n'));
      assert.deepEqual(classesAtMarkers(src), ['dark', ''], `\`${rule}\` must end the slide`);
    }
  });

  test('a setext underline is a HEADING, not a boundary', () => {
    // `text` over `---` is an H2 in CommonMark. Treating it as a break would split one
    // slide in two and hand the second half no directive — the opposite-sign error
    // that restores an equal slide COUNT while offsetting the mapping.
    const src = deck(['<!-- _class: dark -->', 'A heading', '---', '', '@MARK', ''].join('\n'));
    assert.deepEqual(classesAtMarkers(src), ['dark']);
  });

  test('a `---` inside a fenced block is not a boundary', () => {
    const src = deck([
      '<!-- _class: dark -->',
      '',
      '```md',
      '---',
      'not a slide break',
      '---',
      '```',
      '',
      '@MARK',
      '',
    ].join('\n'));
    assert.deepEqual(classesAtMarkers(src), ['dark'],
      'a deck that DEMONSTRATES markdown (the templates docs do) must not split inside the sample');
  });

  test('front matter is not a slide — `class:` there is not a `_class:` directive', () => {
    const src = '---\nmarp: true\nclass: dark\n---\n\n@MARK\n';
    assert.deepEqual(classesAtMarkers(src), [''],
      'the DECK register is read separately by resolveDiagramBand; picking it up here would '
      + 'make a deck-wide value look like a per-slide pin and outrank the deck default');
  });

  test('`split: headings` boundaries divide too, and a heading STARTS its slide', () => {
    // The heading is the first block of the NEW slide, unlike an `hr`, which belongs to
    // neither neighbor. Treating the two alike shifts every directive one slide over.
    const src = [
      '---', 'marp: true', 'theme: onyx', 'split: headings', '---', '',
      '## First', '', '<!-- _class: dark -->', '', '@MARK', '',
      '## Second', '', '@MARK', '',
    ].join('\n');
    assert.deepEqual(classesAtMarkers(src), ['dark', ''],
      'a heading-divided deck resolves per SUB-slide, as the engine does');
  });

  test('a deck with no directives at all reports none, on every slide', () => {
    const src = deck(['## One', '', '@MARK', '', '---', '', '## Two', '', '@MARK', ''].join('\n'));
    assert.deepEqual(classesAtMarkers(src), ['', '']);
  });

  test('spans are contiguous and gapless, so no offset falls between slides', () => {
    const src = deck(['## One', '', '---', '', '## Two', '', '---', '', '## Three', ''].join('\n'));
    const { spans } = slideClassSpans(src);
    assert.ok(spans.length >= 3);
    for (let i = 1; i < spans.length; i++) {
      assert.ok(spans[i].start >= spans[i - 1].end, 'spans must not overlap');
    }
    assert.equal(spans.at(-1).end, src.length, 'the last span must reach the end of the source');
    // Every body offset resolves to exactly one slide.
    for (let i = FM.length; i < src.length; i++) {
      assert.notEqual(slideIndexAt(spans, i), -1, `offset ${i} belongs to no slide`);
    }
  });

  test('slideIndexAt separates two slides that declare the same class', () => {
    // Grouping diagrams by slide is what makes the band per SLIDE; two slides with an
    // identical `_class:` must still be two slides, or a per-slide walk collapses.
    const src = deck([
      '<!-- _class: dark -->', '@MARK', '', '---', '', '<!-- _class: dark -->', '@MARK', '',
    ].join('\n'));
    const { spans } = slideClassSpans(src);
    const idxs = [];
    for (let i = src.indexOf('@MARK'); i !== -1; i = src.indexOf('@MARK', i + 1)) {
      idxs.push(slideIndexAt(spans, i));
    }
    assert.equal(new Set(idxs).size, 2);
  });

  test('CRLF source resolves the same as LF', () => {
    const lf = deck(['<!-- _class: dark -->', '@MARK', '', '---', '', '@MARK', ''].join('\n'));
    assert.deepEqual(classesAtMarkers(lf.replace(/\n/g, '\r\n')), ['dark', ''],
      'an offset computed off LF-only line lengths lands in the wrong span on a CRLF deck');
  });

  test('an empty or non-string source is not a crash', () => {
    for (const src of ['', null, undefined, 42]) {
      assert.doesNotThrow(() => slideClassSpans(src));
    }
    assert.equal(slideClassAt(slideClassSpans('').spans, 0), '');
  });
});
