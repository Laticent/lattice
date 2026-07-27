/**
 * The `render` / `renderNote` contract — the declaration half.
 *
 * Two halves, matching the two gates:
 *   1. COVERAGE (static, runs in build:check): every visualization component
 *      declares a valid `render` plus a substantive `renderNote`, and no
 *      non-visualization declares either. Exercised here against the real
 *      catalog AND against synthetic manifests for each failure shape.
 *   2. CLASSIFICATION (the arithmetic the browser derivation feeds): the pure
 *      rule that turns four counts into svg / hybrid / html / empty. The browser
 *      supplies the counts; this is the part that decides what they mean, so it
 *      is unit-testable without a Chromium.
 *
 * What is NOT here, deliberately: whether each declaration is TRUE. That needs
 * the real rendered export and lives in tools/check-render-nature.js
 * (`npm run check:render-nature`) — HARD RULE #23, a unit test is not a surface.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { loadAll, manifestBucket } = require('../../../lib/components');
const { checkRenderNature, RENDER_NATURES, RENDER_BUCKETS } = require('../../../tools/check-ownership');
const { classify, mergeCounts, vizComponents } = require('../../../tools/check-render-nature');
const SCHEMA = require('../../../lib/components/manifest.schema.json');

const viz = () => loadAll().filter((m) => RENDER_BUCKETS.has(manifestBucket(m)));

describe('render nature — coverage across the real catalog', () => {
  test('every visualization declares a valid render + a renderNote', () => {
    const components = viz();
    assert.ok(components.length >= 14, `expected the whole visualization family, got ${components.length}`);
    for (const m of components) {
      assert.ok(RENDER_NATURES.has(m.render), `${m.name}: render is ${JSON.stringify(m.render)}`);
      assert.ok(typeof m.renderNote === 'string' && m.renderNote.trim().length >= 40,
        `${m.name}: renderNote must justify the value, not restate it`);
    }
  });

  test('no non-visualization declares render or renderNote', () => {
    for (const m of loadAll()) {
      if (RENDER_BUCKETS.has(manifestBucket(m))) continue;
      assert.equal(m.render, undefined, `${m.name} (bucket ${manifestBucket(m)}) declares render`);
      assert.equal(m.renderNote, undefined, `${m.name} (bucket ${manifestBucket(m)}) declares renderNote`);
    }
  });

  test('every hybrid note names both sides — the seam is the point of the value', () => {
    for (const m of viz().filter((c) => c.render === 'hybrid')) {
      assert.match(m.renderNote, /svg/i, `${m.name}: hybrid note never says what is SVG`);
      assert.match(m.renderNote, /html|<figcaption>|<ol>/i, `${m.name}: hybrid note never says what is HTML`);
    }
  });

  test('the real catalog passes checkRenderNature', () => {
    const errors = [];
    checkRenderNature(loadAll(), errors);
    assert.deepEqual(errors, [], errors.join('\n'));
  });

  test('the enum is read from the schema, not re-typed', () => {
    assert.deepEqual([...RENDER_NATURES].sort(), [...SCHEMA.properties.render.enum].sort());
  });
});

describe('render nature — checkRenderNature rejects each failure shape', () => {
  const base = { name: '__x', bucket: 'chart' };
  const cases = [
    { what: 'missing render', m: { ...base, renderNote: 'A long enough justification that says something real about the drawing.' } },
    { what: 'invalid render', m: { ...base, render: 'canvas', renderNote: 'A long enough justification that says something real about the drawing.' } },
    { what: 'missing renderNote', m: { ...base, render: 'svg' } },
    { what: 'note that only restates the enum', m: { ...base, render: 'svg', renderNote: '   renders as SVG.   ' } },
    { what: 'hybrid whose note names neither side', m: { ...base, render: 'hybrid', renderNote: 'It is built the way the kernel was easiest to write at the time.' } },
    { what: 'a non-visualization declaring render', m: { name: '__y', bucket: 'evidence', render: 'html', renderNote: 'A long enough justification that says something real about the drawing.' } },
    { what: 'a non-visualization declaring only renderNote', m: { name: '__y', bucket: 'evidence', renderNote: 'A long enough justification that says something real.' } },
  ];
  for (const { what, m } of cases) {
    test(`flags ${what}`, () => {
      const errors = [];
      checkRenderNature([m], errors);
      assert.ok(errors.length > 0, `expected an error for: ${what}`);
    });
  }

  test('accepts a well-formed declaration', () => {
    const errors = [];
    checkRenderNature([{
      ...base,
      render: 'hybrid',
      renderNote: 'The polygons are `<svg>`; the per-mini captions beneath them are HTML `<figcaption>`.',
    }], errors);
    assert.deepEqual(errors, []);
  });

  test('a note just under the substance floor is still rejected as empty', () => {
    // The EMPTY_NOTE pattern must catch the phrasings that clear minLength by
    // padding — "this component is pure html" is 30 chars of nothing.
    for (const note of ['pure html', 'This component is SVG', 'renders as hybrid.', 'is html']) {
      const errors = [];
      checkRenderNature([{ ...base, render: 'html', renderNote: note }], errors);
      assert.ok(errors.length > 0, `expected an error for note ${JSON.stringify(note)}`);
    }
  });
});

describe('render nature — the classification rule', () => {
  const counts = (o) => ({ svgChars: 0, svgGeom: 0, htmlChars: 0, htmlMarks: 0, ...o });

  test('svg text alone, or svg geometry alone, is svg', () => {
    assert.equal(classify(counts({ svgChars: 12 })), 'svg');
    assert.equal(classify(counts({ svgGeom: 3 })), 'svg');
  });

  test('html text alone, or an addressable HTML mark alone, is html', () => {
    assert.equal(classify(counts({ htmlChars: 40 })), 'html');
    // A CSS-drawn mark with no text of its own still makes the picture HTML.
    assert.equal(classify(counts({ htmlMarks: 1 })), 'html');
  });

  test('any content on both sides is hybrid — there is no threshold', () => {
    // word-cloud's real shape: 731 chars of SVG words beside a 243-char HTML key.
    assert.equal(classify(counts({ svgChars: 731, htmlChars: 243 })), 'hybrid');
    // radar's real shape: one 22-char HTML caption is enough. A threshold would
    // have rounded this to "svg" and hidden the exact seam an author needs.
    assert.equal(classify(counts({ svgChars: 913, svgGeom: 358, htmlChars: 22 })), 'hybrid');
    // journey's real shape: SVG geometry with no SVG text at all.
    assert.equal(classify(counts({ svgGeom: 166, htmlChars: 1387 })), 'hybrid');
  });

  test('nothing on either side is "empty" — a distinct verdict, never a pass', () => {
    assert.equal(classify(counts({})), 'empty');
    assert.ok(!RENDER_NATURES.has('empty'), 'empty must not be declarable');
  });

  test('mergeCounts sums both sides and the host breakdown', () => {
    const a = { svgChars: 1, svgGeom: 2, htmlChars: 3, htmlMarks: 4, sections: 1, pictures: 1, hosts: { 'svg:text': 1 } };
    const b = { svgChars: 10, svgGeom: 20, htmlChars: 30, htmlMarks: 40, sections: 1, pictures: 2, hosts: { 'svg:text': 5, 'html:span': 2 } };
    assert.deepEqual(mergeCounts(a, b), {
      svgChars: 11, svgGeom: 22, htmlChars: 33, htmlMarks: 44, sections: 2, pictures: 3,
      hosts: { 'svg:text': 6, 'html:span': 2 },
    });
  });
});

describe('render nature — the derivation can actually reach every declaration', () => {
  test('each visualization has its own gallery for the browser gate to render', () => {
    const fs = require('node:fs');
    const missing = vizComponents().filter((c) => !fs.existsSync(c.deck)).map((c) => c.name);
    assert.deepEqual(missing, [],
      `these components declare render but have no gallery to derive it from: ${missing.join(', ')}`);
  });

  test('the derivation covers exactly the components the coverage gate requires', () => {
    assert.deepEqual(
      vizComponents().map((c) => c.name).sort(),
      viz().map((m) => m.name).sort(),
    );
  });
});
