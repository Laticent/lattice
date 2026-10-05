/**
 * The flowchart row grammar (tools/parser-bakeoff/flow-row-grammar.mjs) reads every row the way
 * the kernel does — `splitRow` in lib/core/flowchart-grammar.js — in both of Segno's runtimes.
 *
 * WHY THIS IS A UNIT TEST AND NOT ONLY THE BAKE-OFF. Phase 3 of the Segno note moves flowchart
 * rows onto this grammar, and it rests on `attempt()`, the one place the engine goes back. The
 * parity figures lived only in `npm run parser:bakeoff:flow`, which nothing runs, so an engine
 * change that broke the grammar would have shipped unnoticed (the #2519 follow-up's inversion
 * review). This holds the corpus and a slice of the bake-off's fuzz on every PR; the bake-off
 * keeps the full 200,096 rows and the timings.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const S = require('@laticent/segno');
const { splitRow } = require('../../../lib/core/flowchart-grammar.js');

const kernel = (s) => {
  const { parts, arrows } = splitRow([{ kind: 'text', value: s }]);
  return { parts: parts.map((p) => p.text), arrows: arrows.map(({ heavy, label, dir, mermaid }) => ({ heavy, label, dir, mermaid })) };
};

describe('the flowchart row grammar reads rows as splitRow does', async () => {
  const { makeRowGrammar, rowFromNodes, rowFromFlat, flowFuzz } = await import('../../../tools/parser-bakeoff/flow-row-grammar.mjs');
  const { flowCorpus } = await import('../../../tools/parser-bakeoff/corpus.mjs');
  const { rowSpec, arrowSpec } = makeRowGrammar(S);
  const compiled = S.compile(rowSpec);
  const mod = { exports: {} };
  new Function('module', 'exports', esbuild.transformSync(S.generate(rowSpec), { loader: 'ts', format: 'cjs' }).code)(mod, mod.exports);
  const readers = {
    'compile()': (s) => { const r = compiled.parse(s); return r.ok ? rowFromNodes(s, r.node.kids) : { refused: r.error }; },
    'generate()': (s) => { const r = mod.exports.parse(s); return r.ok ? rowFromFlat(s, r.tree) : { refused: r.error }; },
  };
  const mismatches = (rows, read) => {
    const bad = [];
    for (const s of rows) {
      const want = JSON.stringify(kernel(s));
      const got = JSON.stringify(read(s));
      if (want !== got && bad.push(`${JSON.stringify(s)}\n  kernel ${want}\n  grammar ${got}`) >= 5) break;
    }
    return bad;
  };

  test('the arrow alone is strict LL(1); the row needs attempt() and gets it', () => {
    assert.deepEqual(S.lint(arrowSpec), []);
    assert.deepEqual(S.lint(rowSpec), []);
  });

  const rows = [...new Set(flowCorpus())];
  // A floor, so a corpus that silently stopped finding rows cannot pass vacuously.
  test('every flowchart and state-chart row in the shipped decks', () => {
    assert.ok(rows.length > 300, `only ${rows.length} corpus rows found`);
    for (const [name, read] of Object.entries(readers)) assert.deepEqual(mismatches(rows, read), [], name);
  });

  test('20,000 fuzzed rows and every label around the 61-character cap', () => {
    const fuzz = flowFuzz(20_000);
    for (const [name, read] of Object.entries(readers)) assert.deepEqual(mismatches(fuzz, read), [], name);
  });
});
