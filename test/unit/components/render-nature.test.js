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
const { checkRenderNature, RENDER_NATURES, RENDER_BUCKETS, RENDER_NOTE_MIN } = require('../../../tools/check-ownership');
const { classify, mergeCounts, vizComponents } = require('../../../tools/check-render-nature');
const SCHEMA = require('../../../lib/components/manifest.schema.json');

const viz = () => loadAll().filter((m) => RENDER_BUCKETS.has(manifestBucket(m)));

describe('render nature — coverage across the real catalog', () => {
  test('every visualization declares a valid render + a renderNote', () => {
    const components = viz();
    assert.ok(components.length >= 14, `expected the whole visualization family, got ${components.length}`);
    for (const m of components) {
      assert.ok(RENDER_NATURES.has(m.render), `${m.name}: render is ${JSON.stringify(m.render)}`);
      assert.ok(typeof m.renderNote === 'string' && m.renderNote.trim().length >= RENDER_NOTE_MIN,
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
    // The assertion mirrors the gate EXACTLY (\bsvg\b and \bhtml\b, both
    // required). An earlier version accepted `<figcaption>`/`<ol>` as a stand-in
    // for "names the HTML side", which made it stricter than the gate in one
    // direction and looser in another — a test that can pass while the gate it
    // guards is broken.
    for (const m of viz().filter((c) => c.render === 'hybrid')) {
      assert.match(m.renderNote, /\bsvg\b/i, `${m.name}: hybrid note never says what is SVG`);
      assert.match(m.renderNote, /\bhtml\b/i, `${m.name}: hybrid note never says what is HTML`);
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
    // The one-sided cases. These are the ones an `||` in the gate waves through,
    // and the first is worse than useless — it CONTRADICTS `render: "hybrid"`.
    {
      what: 'hybrid whose note names only the SVG side',
      m: { ...base, render: 'hybrid', renderNote: 'Every visible part of this picture is drawn as SVG paths in one shared coordinate system.' },
    },
    {
      what: 'hybrid whose note names only the HTML side',
      m: { ...base, render: 'hybrid', renderNote: 'The whole board is HTML boxes that wrap and reflow like ordinary prose.' },
    },
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

  test('a vacuous note is rejected however it is phrased', () => {
    // The LENGTH FLOOR is what actually does this work — it is not possible to
    // say what forced a construction choice in under RENDER_NOTE_MIN characters,
    // and no enumerated pattern can keep up with the ways of saying nothing.
    // Every one of these cleared the gate when the floor was declared in the
    // schema but enforced nowhere.
    const vacuous = [
      'in SVG', 'It is drawn in SVG.', 'SVG only.', 'It is an SVG.',
      'The picture is HTML.', 'Rendered in HTML.', 'pure html',
      'This component is SVG', 'renders as hybrid.', 'is html', 'HTML.\n\n',
    ];
    for (const note of vacuous) {
      const errors = [];
      checkRenderNature([{ ...base, render: 'html', renderNote: note }], errors);
      assert.ok(errors.length > 0, `expected an error for note ${JSON.stringify(note)} (${note.length} chars)`);
    }
  });

  test('the length floor comes from the schema, not a re-typed constant', () => {
    assert.equal(RENDER_NOTE_MIN, SCHEMA.properties.renderNote.minLength);
    assert.ok(RENDER_NOTE_MIN > 0, 'a floor of 0 would enforce nothing');
  });

  test('a note at exactly the floor passes, one character under does not', () => {
    const at = `${'The kernel needs one shared coordinate system here. '.repeat(3)}`.slice(0, RENDER_NOTE_MIN);
    const under = at.slice(0, RENDER_NOTE_MIN - 1);
    const run = (renderNote) => { const e = []; checkRenderNature([{ ...base, render: 'svg', renderNote }], e); return e; };
    assert.deepEqual(run(at), [], 'a note at the floor must pass');
    assert.ok(run(under).length > 0, 'a note one character under the floor must fail');
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
