/**
 * Unit: the diagram render kernel drives, and the paths only supply capabilities.
 *
 * `renderDiagrams` (lib/core/render-diagrams.js) is the inversion #1332 step 4 asked
 * for. The point is not that the walk is shared — it is that neither path can decide
 * a palette any more, so the two cannot answer differently. These tests exercise the
 * kernel as BEHAVIOR against fake ports, which is the whole reason it is pure: the
 * previous arrangement could only be asserted as source text on a CLI, and three of
 * the four #1326 fixes passed a green suite while broken.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { renderDiagrams } = require('../../../lib/core/render-diagrams');
const { MERMAID_VAR_MAP } = require('../../../lib/core/mermaid-theme-map');

/** A reader whose answer depends on the SCOPE — the one thing the two paths differ in. */
const scopedReader = (scope, name) => `${scope}:${name}`;

/**
 * How many `readToken` calls ONE full theme build makes. Measured rather than
 * hard-coded: several map entries read `--bg`, so counting a single token name is a
 * multiple of the build count, not the build count.
 */
const READS_PER_BUILD = (() => {
  let n = 0;
  renderDiagrams([{ scope: 'light', diagrams: ['a'] }], {
    readToken: (scope, name) => { n++; return scopedReader(scope, name); },
    renderOne: () => null,
  });
  return n;
})();

/** A deck of `[bandOfSlide1, bandOfSlide2, …]`, one diagram per slide. */
const deckOf = (...bands) => bands.map((scope, i) => ({ scope, diagrams: [`d${i + 1}`] }));

describe('renderDiagrams — the kernel resolves, the ports supply', () => {
  test('each slide is rendered with the palette ITS OWN scope resolves', () => {
    const seen = [];
    renderDiagrams(deckOf('light', 'dark', 'print'), {
      readToken: scopedReader,
      renderOne: (d, themeVars, meta) => seen.push([d, meta.scope, themeVars.background]),
    });
    assert.deepEqual(seen, [
      ['d1', 'light', 'light:bg'],
      ['d2', 'dark', 'dark:bg'],
      ['d3', 'print', 'print:bg'],
    ]);
  });

  test('results come back in DOCUMENT order, one per diagram', () => {
    const deck = [
      { scope: 'light', diagrams: ['a', 'b'] },
      { scope: 'dark', diagrams: ['c'] },
      { scope: 'light', diagrams: ['d'] },
    ];
    const out = renderDiagrams(deck, { readToken: scopedReader, renderOne: (d) => d.toUpperCase() });
    assert.deepEqual(out, ['A', 'B', 'C', 'D'],
      'the PDF path splices results back by index, so any reordering misplaces a diagram');
  });

  test('meta locates the diagram — slide, position within the slide, and overall index', () => {
    const deck = [
      { scope: 'light', diagrams: ['a', 'b'] },
      { scope: 'dark', diagrams: ['c'] },
    ];
    const metas = [];
    renderDiagrams(deck, { readToken: scopedReader, renderOne: (_d, _t, meta) => metas.push(meta) });
    assert.deepEqual(metas.map((m) => [m.slideIndex, m.diagramIndex, m.index]), [
      [0, 0, 0], [0, 1, 1], [1, 0, 2],
    ]);
  });

  test('the palette is built ONCE per distinct scope key, not once per slide', () => {
    // The whole reason a key exists. Rebuilding 166 variables per slide is what makes
    // per-slide config too expensive for a preview that re-renders on a 150 ms debounce.
    let reads = 0;
    const deck = [
      { scope: 'light', diagrams: ['a'] },
      { scope: 'light', diagrams: ['b'] },
      { scope: 'dark', diagrams: ['c'] },
      { scope: 'light', diagrams: ['d'] },
    ];
    renderDiagrams(deck, {
      readToken: (scope, name) => { reads++; return scopedReader(scope, name); },
      renderOne: () => null,
    });
    assert.equal(reads, READS_PER_BUILD * 2,
      'two distinct scopes means two theme builds, whatever the slide count — four builds here '
      + 'would be the per-slide rebuild that makes per-slide config too slow for a live preview');
  });

  test('a slide with no diagrams costs no palette at all', () => {
    const read = [];
    renderDiagrams([
      { scope: 'dark', diagrams: [] },
      { scope: 'print' },
      { scope: 'light', diagrams: ['a'] },
    ], {
      readToken: (scope, name) => { read.push(scope); return scopedReader(scope, name); },
      renderOne: () => null,
    });
    assert.deepEqual([...new Set(read)], ['light'],
      'building a band nothing renders in also prints its palette-gap warnings on the PDF path');
  });

  test('beginRun fires once per RUN of consecutive same-palette diagrams', () => {
    // The preview needs the boundary because `mermaid.initialize` is global. Runs are
    // consecutive rather than globally grouped, so document order is preserved — a
    // deck alternating bands pays one config merge per transition, never a rebuild.
    const runs = [];
    renderDiagrams([
      { scope: 'light', diagrams: ['a'] },
      { scope: 'light', diagrams: ['b'] },
      { scope: 'dark', diagrams: ['c'] },
      { scope: 'light', diagrams: ['d'] },
    ], {
      readToken: scopedReader,
      renderOne: () => null,
      beginRun: ({ scopeKey, themeVars }) => runs.push([scopeKey, themeVars.background]),
    });
    assert.deepEqual(runs, [['light', 'light:bg'], ['dark', 'dark:bg'], ['light', 'light:bg']]);
  });

  test('every renderOne of a run is called BEFORE anything beginRun scheduled can settle', () => {
    // This is what lets the preview collect a run's renders without being told how
    // many to expect: the kernel walks synchronously, so the thunk list a beginRun
    // opened is complete by the time its microtask runs. If the kernel ever awaited
    // between diagrams, the preview would configure for band B and then flush band A's
    // leftovers against it.
    const order = [];
    const done = [];
    renderDiagrams(deckOf('light', 'dark'), {
      readToken: scopedReader,
      renderOne: (d) => { order.push(`render:${d}`); return d; },
      beginRun: ({ scopeKey }) => {
        order.push(`begin:${scopeKey}`);
        done.push(Promise.resolve().then(() => order.push(`flush:${scopeKey}`)));
      },
    });
    assert.deepEqual(order, ['begin:light', 'render:d1', 'begin:dark', 'render:d2'],
      'the whole walk must complete synchronously');
    return Promise.all(done).then(() => {
      assert.deepEqual(order.slice(-2), ['flush:light', 'flush:dark']);
    });
  });

  test('scopeKey names the palette; a scope that is not a string still keys correctly', () => {
    // The preview hands in DOM sections, whose identity is a class signature rather
    // than their own string form. Without an explicit key, two different sections
    // would both stringify to the same thing and collapse into one palette — which is
    // precisely the deck-wide bake #1332 step 3 removed, restored by accident.
    const s1 = { cls: 'content' };
    const s2 = { cls: 'content dark' };
    const s3 = { cls: 'content' };
    let reads = 0;
    const keys = [];
    renderDiagrams([
      { scope: s1, diagrams: ['a'] },
      { scope: s2, diagrams: ['b'] },
      { scope: s3, diagrams: ['c'] },
    ], {
      scopeKey: (s) => s.cls,
      readToken: (s, name) => { reads++; return `${s.cls}:${name}`; },
      renderOne: (_d, _t, meta) => keys.push(meta.scopeKey),
      beginRun: () => {},
    });
    assert.deepEqual(keys, ['content', 'content dark', 'content']);
    assert.equal(reads, READS_PER_BUILD * 2,
      'two distinct signatures, two builds — the third slide reuses the first');
  });

  test('a promise from renderOne is passed through, so an async path stays async', () => {
    // The emulator renders synchronously at module-evaluation time and cannot await;
    // the preview is async. The kernel is neither — it collects whatever it is given.
    const out = renderDiagrams(deckOf('light'), {
      readToken: scopedReader,
      renderOne: () => Promise.resolve('svg'),
    });
    assert.ok(out[0] instanceof Promise);
    return out[0].then((v) => assert.equal(v, 'svg'));
  });

  test('the palette it builds is THE shared map, not a private one', () => {
    const original = MERMAID_VAR_MAP.nodeBorder;
    try {
      MERMAID_VAR_MAP.nodeBorder = { literal: '#SENTINEL' };
      const out = renderDiagrams(deckOf('light'), {
        readToken: scopedReader,
        renderOne: (_d, themeVars) => themeVars.nodeBorder,
      });
      assert.equal(out[0], '#SENTINEL');
    } finally {
      MERMAID_VAR_MAP.nodeBorder = original;
    }
  });

  test('a missing port is a loud error, not a silently unpainted deck', () => {
    assert.throws(() => renderDiagrams(deckOf('light'), { renderOne: () => null }), /readToken/);
    assert.throws(() => renderDiagrams(deckOf('light'), { readToken: scopedReader }), /renderOne/);
  });

  test('an empty or malformed deck renders nothing rather than throwing', () => {
    for (const deck of [[], null, undefined, [null], [{}]]) {
      assert.deepEqual(
        renderDiagrams(deck, { readToken: scopedReader, renderOne: () => 'x' }),
        [],
        `a ${JSON.stringify(deck)} deck must be a no-op — a deck with no diagrams is the common case`,
      );
    }
  });
});
