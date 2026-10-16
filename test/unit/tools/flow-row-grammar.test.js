/**
 * The flowchart row grammar (lib/core/flowchart-row-grammar.js) reads every row the way the
 * hand-written scan it replaced did, in both of Segno's runtimes.
 *
 * THE ORACLE. Segno phase 3 replaced `splitRow`'s scan with a parser generated from the grammar,
 * so `splitRow` can no longer be the reference: it IS the grammar now. Before the swap,
 * tools/parser-bakeoff/freeze-flow-rows.mjs recorded what the old scan returned
 * (fixtures/flow-rows.frozen.json): every corpus row and every multi-segment row in full, and a
 * digest per 100 rows of two seeded fuzzes. Both runtimes are held to that record:
 *
 *   generate()  the shipped path: `splitRow` walking lib/core/flowchart-row.generated.js, on
 *               whole segment lists, so the state it carries across code and escaped spans is
 *               covered too
 *   compile()   Segno's interpreter on the same grammar, on single text rows, so an engine change
 *               that breaks the grammar fails here whichever runtime it touches
 *
 * CHANGING THE SYNTAX ON PURPOSE: re-freeze with `node tools/parser-bakeoff/freeze-flow-rows.mjs
 * --from-shipped`, which prints every row whose output changes, and put that list in the PR body.
 *
 * WHY A UNIT TEST AND NOT ONLY THE BAKE-OFF. `npm run parser:bakeoff:flow` keeps the 200,096-row
 * fuzz and the timings, and nothing runs it on a PR. This holds a 20,000-row slice on every PR.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const S = require('@laticent/segno');
const { splitRow } = require('../../../lib/core/flowchart-grammar.js');
const FROZEN = require('./fixtures/flow-rows.frozen.json');

describe('the flowchart row grammar reads rows as the scan it replaced did', async () => {
  const { makeRowGrammar, rowFromNodes, flowFuzz, segFuzz, encodeRow, FROZEN_BLOCK } = await import('../../../tools/parser-bakeoff/flow-row-grammar.mjs');
  const { flowCorpus } = await import('../../../tools/parser-bakeoff/corpus.mjs');
  const { rowSpec, arrowSpec } = makeRowGrammar(S);
  const compiled = S.compile(rowSpec);

  const text = (s) => [{ kind: 'text', value: s }];
  const shipped = (segs) => encodeRow(splitRow(segs));
  // compile()'s parts carry no spans: a single text row has none.
  const interpreted = (s) => {
    const r = compiled.parse(s);
    if (!r.ok) return { refused: r.error };
    const { parts, arrows } = rowFromNodes(s, r.node.kids);
    return encodeRow({ parts: parts.map((p) => ({ text: p, spans: [] })), arrows });
  };

  /** The first few entries where `read` disagrees with the frozen output. */
  const mismatches = (entries, read) => {
    const bad = [];
    for (const [input, want] of entries) {
      const got = read(input);
      if (JSON.stringify(got) !== JSON.stringify(want) && bad.push(`${JSON.stringify(input)}\n  frozen  ${JSON.stringify(want)}\n  grammar ${JSON.stringify(got)}`) >= 5) break;
    }
    return bad;
  };
  /** The blocks whose digest differs from the frozen one, each with its first row. */
  const digestMismatches = (inputs, digests, read) => {
    const bad = [];
    for (let b = 0; b * FROZEN_BLOCK < inputs.length; b++) {
      const h = createHash('sha256');
      for (const x of inputs.slice(b * FROZEN_BLOCK, (b + 1) * FROZEN_BLOCK)) h.update(`${JSON.stringify(read(x))}\n`);
      if (h.digest('hex').slice(0, 16) !== digests[b] && bad.push(`block ${b} (inputs ${b * FROZEN_BLOCK}–${(b + 1) * FROZEN_BLOCK - 1}), first ${JSON.stringify(inputs[b * FROZEN_BLOCK])}`) >= 5) break;
    }
    return bad;
  };

  test('the arrow alone is strict LL(1); the row needs attempt() and gets it', () => {
    assert.deepEqual(S.lint(arrowSpec), []);
    assert.deepEqual(S.lint(rowSpec), []);
  });

  // Floors, so a fixture that silently lost its rows cannot pass vacuously.
  test('every corpus row frozen before the swap', () => {
    assert.ok(FROZEN.corpus.length > 400, `only ${FROZEN.corpus.length} frozen corpus rows`);
    assert.deepEqual(mismatches(FROZEN.corpus, (s) => shipped(text(s))), [], 'generate()');
    assert.deepEqual(mismatches(FROZEN.corpus, interpreted), [], 'compile()');
  });

  test('every row whose segments carry state: code spans, escaped spans, text split around them', () => {
    assert.ok(FROZEN.segments.length > 200, `only ${FROZEN.segments.length} frozen segment rows`);
    assert.deepEqual(mismatches(FROZEN.segments, shipped), [], 'generate()');
  });

  test('20,000 fuzzed rows and every label around the 61-character cap', () => {
    const fuzz = flowFuzz(20_000);
    assert.equal(FROZEN.text.length, Math.ceil(fuzz.length / FROZEN_BLOCK));
    assert.deepEqual(digestMismatches(fuzz.map(text), FROZEN.text, shipped), [], 'generate()');
    assert.deepEqual(digestMismatches(fuzz, FROZEN.text, interpreted), [], 'compile()');
  });

  test('20,000 fuzzed segment lists, where a text run starts mid-word after an escaped span', () => {
    const fuzz = segFuzz(20_000);
    assert.equal(FROZEN.segFuzz.length, Math.ceil(fuzz.length / FROZEN_BLOCK));
    assert.deepEqual(digestMismatches(fuzz, FROZEN.segFuzz, shipped), [], 'generate()');
  });

  // The one bit splitRow carries across segments (does the next text start a word?), at each way a
  // segment can end. A fuzz reaches these rarely: an empty text run after an escaped span is what
  // the checker's plant (`if (!s) { atWordStart = true; continue; }`) slipped through. Expected
  // values are the legacy scan's, as frozen.
  test('the word-start bit across an empty segment, a trailing backslash and a closing arrow', () => {
    const t = (value) => ({ kind: 'text', value });
    const cases = [
      [[{ kind: 'literal', value: 'x' }, t(''), t('-> B')], [[['x-> B', []]], []]],
      [[{ kind: 'code', value: 'c' }, t(''), t('-> B')], [[['', ['c']], [' B', []]], [['->', '']]]],
      [[t('A \\'), t('-> B')], [[['A \\-> B', []]], []]],
      [[t('A ->'), t('-> B')], [[['A ', []], ['', []], [' B', []]], [['->', ''], ['->', '']]]],
    ];
    for (const [segs, want] of cases) assert.deepEqual(shipped(segs), want, JSON.stringify(segs));
  });

  // The corpus grows after the freeze. A new row has no frozen output, so the two runtimes are
  // held to each other: a row only one of them reads differently is an engine bug.
  test('every corpus row today reads the same in both runtimes', () => {
    const rows = [...new Set(flowCorpus())];
    assert.deepEqual(mismatches(rows.map((s) => [s, interpreted(s)]), (s) => shipped(text(s))), []);
  });
});
