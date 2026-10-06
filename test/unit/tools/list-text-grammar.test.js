/**
 * The list-text grammar (lib/core/list-text-grammar.js) reads leading markers, matrix-grid cells
 * and `_track` exactly as the regular expressions it replaced did, in both of Segno's runtimes.
 *
 * THE ORACLE. Segno phase 3 replaced nine hand-written readers with readers that walk one
 * generated parser, so the kernels can no longer be the reference: they ARE the grammar now.
 * Before the swap, tools/parser-bakeoff/freeze-list-text.mjs recorded what the old readers
 * returned (fixtures/list-text.frozen.json), read from their frozen copy in
 * tools/segno-legacy/list-text.js: every corpus input some reader answered, in full; every near
 * miss (an input that leads with a bracket or a tag and that no reader answered); and a digest
 * per 100 inputs of a seeded 20,000-input fuzz. Both runtimes are held to that record:
 *
 *   generate()  the shipped path: the kernels in lib/core walking lib/core/list-text.generated.js
 *   compile()   Segno's interpreter on the same grammar, on the same inputs, so an engine change
 *               that breaks the grammar fails here whichever runtime it touches
 *
 * CHANGING THE SYNTAX ON PURPOSE: re-freeze with `node tools/parser-bakeoff/freeze-list-text.mjs
 * --from-shipped`, which prints every input whose output changes, and put that list in the PR body.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const S = require('@laticent/segno');
const { makeListTextGrammar } = require('../../../lib/core/list-text-grammar.js');
const FROZEN = require('./fixtures/list-text.frozen.json');

describe('the list-text grammar reads as the regular expressions it replaced did', async () => {
  const { encode, FROZEN_BLOCK, listTextCorpus, listTextFuzz, quiet, shippedReaders, READERS } = await import('../../../tools/parser-bakeoff/list-text.mjs');
  const { listTextSpec } = makeListTextGrammar(S);
  const shippedReader = shippedReaders();
  const shipped = (s) => encode(shippedReader, s);

  // compile()'s object tree, read into the same shapes as the kernels read the flat one. This is
  // a second, independent walk: a kernel that misreads the tree disagrees with it.
  const rules = Object.fromEntries(Object.keys(listTextSpec.rules).map((rule) => [rule, S.compile({ ...listTextSpec, start: rule })]));
  const kids = (s, rule) => {
    const r = rules[rule].parse(s);
    return r.ok ? r.node.kids : null;
  };
  const find = (ks, kind) => ks.find((k) => k.kind === kind);
  const lead = (rule, shape) => (s) => {
    const ks = kids(String(s), rule);
    if (!ks) return null;
    return [s[find(ks, 'mark').from], shape(String(s), ks)];
  };
  const tidy = (s) => s.replace(/\s+/g, ' ').trim();
  const interpretedReader = {
    line: lead('line', (s, ks) => s.slice(find(ks, 'rest').from)),
    lead: lead('lead', (s, ks) => find(ks, 'rest').from),
    cell: lead('cell', (s, ks) => s.slice(find(ks, 'rest').from)),
    roadmap: lead('tagged', (s, ks) => {
      const tag = find(ks, 'tag');
      return (tag ? s.slice(tag.from, tag.to) : '') + s.slice(find(ks, 'rest').from);
    }),
    bare: (s) => kids(s, 'bare') !== null,
    grid: (s) => {
      const t = String(s ?? '').trim();
      const ks = kids(t, 'grid');
      if (!ks) return null;
      const shape = { x: 'cell-filled', '-': 'cell-outlined', ' ': 'cell-empty' }[t[find(ks, 'mark').from]];
      return { shape, label: shape === 'cell-filled' ? t.slice(find(ks, 'rest').from) : '', stateLabel: { 'cell-filled': '', 'cell-outlined': 'reachable', 'cell-empty': 'not applicable' }[shape] };
    },
    track: (s) => {
      const labels = [];
      let current = -1;
      for (const item of kids(s, 'track')) {
        const open = find(item.kids, 'open');
        const shut = item.kids.filter((k) => k.kind === 'shut').at(-1);
        const marked = !!open && !!shut && shut.to === item.to;
        const label = tidy(marked ? s.slice(open.to, shut.kids.at(-1).from) : s.slice(item.from, item.to));
        if (!label) continue;
        if (marked && current === -1) current = labels.length;
        labels.push(label);
      }
      return { labels, current };
    },
    spokenGrid: (s) => {
      const t = String(s ?? '').trim();
      const ks = kids(t, 'grid');
      if (!ks) return null;
      const mark = t[find(ks, 'mark').from];
      return [mark, mark === 'x' ? t.slice(find(ks, 'rest').from) : ''];
    },
    unbracket: (s) => {
      const ks = kids(s, 'any');
      return ks ? s.slice(find(ks, 'rest').from) : s;
    },
  };
  const interpreted = (s) => encode(interpretedReader, s);

  /** The first few entries where `read` disagrees with the frozen output. */
  const mismatches = (entries, read) => {
    const bad = [];
    for (const [input, want] of entries) {
      const got = read(input);
      if (JSON.stringify(got) !== JSON.stringify(want) && bad.push(`${JSON.stringify(input)}\n  frozen  ${JSON.stringify(want)}\n  grammar ${JSON.stringify(got)}`) >= 5) break;
    }
    return bad;
  };
  const digestMismatches = (inputs, digests, read) => {
    const bad = [];
    for (let b = 0; b * FROZEN_BLOCK < inputs.length; b++) {
      const h = createHash('sha256');
      for (const x of inputs.slice(b * FROZEN_BLOCK, (b + 1) * FROZEN_BLOCK)) h.update(`${JSON.stringify(read(x))}\n`);
      if (h.digest('hex').slice(0, 16) !== digests[b] && bad.push(`block ${b} (inputs ${b * FROZEN_BLOCK}–${(b + 1) * FROZEN_BLOCK - 1}), first ${JSON.stringify(inputs[b * FROZEN_BLOCK])}`) >= 5) break;
    }
    return bad;
  };

  test('the grammar is LL(1) where it is not marked greedy, and the checker has nothing to say', () => {
    assert.deepEqual(S.lint(listTextSpec), []);
  });

  // Floors, so a fixture that silently lost its inputs cannot pass vacuously; and per reader, so
  // a reader the corpus never exercises is a visible gap rather than a silent pass.
  test('the frozen corpus exercises every reader', () => {
    assert.ok(FROZEN.corpus.length > 500, `only ${FROZEN.corpus.length} answered corpus inputs`);
    assert.ok(FROZEN.quiet.length > 1000, `only ${FROZEN.quiet.length} near misses`);
    READERS.forEach((name, i) => {
      const read = (s, x) => (name === 'track' ? x.current >= 0 : name === 'unbracket' ? x !== s : x !== null && x !== false);
      const hits = FROZEN.corpus.filter(([s, out]) => read(s, out[i])).length;
      assert.ok(hits >= 5, `${name}: only ${hits} corpus inputs it answers`);
    });
  });

  test('every corpus input frozen before the swap', () => {
    assert.deepEqual(mismatches(FROZEN.corpus, shipped), [], 'generate()');
    assert.deepEqual(mismatches(FROZEN.corpus, interpreted), [], 'compile()');
  });

  test('every near miss stays unread: no marker, no cell, one plain label', () => {
    const entries = FROZEN.quiet.map((s) => [s, quiet(s)]);
    assert.deepEqual(mismatches(entries, shipped), [], 'generate()');
    assert.deepEqual(mismatches(entries, interpreted), [], 'compile()');
  });

  test('20,000 fuzzed inputs, and every matrix-grid gap from 0 to 12', () => {
    const fuzz = listTextFuzz(20_000);
    assert.equal(FROZEN.fuzz.length, Math.ceil(fuzz.length / FROZEN_BLOCK));
    assert.deepEqual(digestMismatches(fuzz, FROZEN.fuzz, shipped), [], 'generate()');
    assert.deepEqual(digestMismatches(fuzz, FROZEN.fuzz, interpreted), [], 'compile()');
  });

  // The decisions a regular expression made implicitly, pinned by hand with the legacy answers.
  // A fuzz reaches each one, but a failing digest names a block, and these name the rule.
  // Both runtimes: two planted defects (`bare` without `[X]`, an empty tag) reach no corpus or fuzz
  // input, so this block is the only thing that catches them on either side.
  for (const [side, r] of [['generate()', shippedReader], ['compile()', interpretedReader]]) test(`the edges, ${side}: line breaks, Unicode spaces, the gap of 8, \`[X]\`, and a closing bracket mid-label`, () => {
    assert.deepEqual(r.line('[x]\nSenior'), ['x', 'Senior'], 'a break in the gap is whitespace');
    assert.equal(r.line('[x] Senior\nmore'), null, 'a break in the text is not one line');
    assert.equal(r.line('[x] Senior more'), null, 'U+2028 breaks a line as `.` did');
    assert.deepEqual(r.lead('[x] ﻿Senior\nmore'), ['x', 5], 'no-break space and U+FEFF are whitespace');
    assert.deepEqual(r.cell('<b class="k">[-] Half'), ['-', 'Half']);
    assert.equal(r.cell(' <b>[-] Half'), null, 'narration cells take no leading space');
    assert.deepEqual(r.roadmap('  <strong> [!] Q3'), ['!', '<strong> Q3']);
    assert.equal(r.roadmap('<>[x] Q3'), null, 'a tag needs a name');
    assert.equal(r.bare('[X]'), true);
    assert.equal(r.line('[X] Senior'), null, '`[X]` is a checked box, not a marker');
    assert.deepEqual(r.grid(`[x]${' '.repeat(8)}Owner`), { shape: 'cell-filled', label: 'Owner', stateLabel: '' });
    assert.deepEqual(r.grid(`[x]${' '.repeat(9)}Owner`), { shape: 'cell-filled', label: ' Owner', stateLabel: '' });
    assert.equal(r.grid('[!] Owner'), null, 'matrix-grid has three markers');
    assert.deepEqual(r.track('Cost [net] | [Pay]back] | [ ] | [Risk ] ]'), { labels: ['Cost [net]', 'Pay]back', 'Risk ]'], current: 1 });
    assert.deepEqual(r.track('[a] b | [c]'), { labels: ['[a] b', 'c'], current: 1 });
    assert.deepEqual(r.track(''), { labels: [], current: -1 });
  });

  // The corpus grows after the freeze. A new input has no frozen output, so the two runtimes are
  // held to each other: an input only one of them reads differently is an engine or walk bug.
  test('every corpus input today reads the same in both runtimes', () => {
    const inputs = listTextCorpus();
    assert.deepEqual(mismatches(inputs.map((s) => [s, interpreted(s)]), shipped), []);
  });
});
