// The bracketed list — one tokenizer for every set an author types inline.
//
// The arms below hold the properties the module exists for: a member is
// positional, a quote protects a comma, arity belongs to the CALLER, a
// non-list passes through untouched, and nothing backtracks.
//
// What is deliberately NOT tested here: what the parts MEAN. `{Effort, 0..10}`
// and `{[x], Enacted}` are the same shape, and which one a span IS depends on
// where it sits relative to the chart body. That is the position rule's job.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { parseBracketList, tidy, unquote } = require('../../../lib/core/bracket-list');
const { parseInlineSet } = require('../../../lib/core/label-set');

describe('axis forms — a positional list', () => {
  test('bare members need no quotes', () => {
    assert.deepEqual(parseBracketList('[Effort, Reach]'), [['Effort'], ['Reach']]);
  });

  test('double and single quotes both work, and are optional', () => {
    const want = [['Wider reach'], ['Deeper cognition']];
    assert.deepEqual(parseBracketList('["Wider reach", "Deeper cognition"]'), want);
    assert.deepEqual(parseBracketList("['Wider reach', 'Deeper cognition']"), want);
    assert.deepEqual(parseBracketList('[Wider reach, Deeper cognition]'), want);
  });

  test('a braced member carries the axis range beside its name', () => {
    assert.deepEqual(parseBracketList('[{Effort, 0..10}, {Reach, 0..100}]', { maxParts: 3 }), [
      ['Effort', '0..10'],
      ['Reach', '0..100'],
    ]);
  });

  test('a third part is the threshold, per axis rather than in a trailing blob', () => {
    assert.deepEqual(parseBracketList('[{Effort, 0..10, 5}, {Reach, 0..100, 50}]', { maxParts: 3 }), [
      ['Effort', '0..10', '5'],
      ['Reach', '0..100', '50'],
    ]);
  });

  test('members may mix bare and braced — pin one axis, derive the other', () => {
    assert.deepEqual(parseBracketList('[{Effort, 0..10}, Reach]', { maxParts: 3 }), [
      ['Effort', '0..10'],
      ['Reach'],
    ]);
  });

  test('a third member is legitimate — scatter names its bubble measure', () => {
    assert.deepEqual(parseBracketList('[Annual cost, Teams adopting, Seats]'), [
      ['Annual cost'], ['Teams adopting'], ['Seats'],
    ]);
  });
});

describe('quotes protect commas, which is why they exist', () => {
  test('a quoted comma is text, so this is TWO axes and not three', () => {
    assert.deepEqual(parseBracketList('["Cost, excluding tax", "Value"]'), [
      ['Cost, excluding tax'], ['Value'],
    ]);
  });

  test('the same string unquoted really is three members — the author chose', () => {
    assert.deepEqual(parseBracketList('[Cost, excluding tax, Value]'), [
      ['Cost'], ['excluding tax'], ['Value'],
    ]);
  });

  test('a quoted comma inside a BRACED member is protected too', () => {
    assert.deepEqual(parseBracketList('[{"Cost, net", 0..10}]', { maxParts: 3 }), [
      ['Cost, net', '0..10'],
    ]);
  });
});

describe('a non-list passes through untouched', () => {
  // Load-bearing, not defensive: every chart scans code spans that are
  // ordinary eyebrows, and returning null is what leaves them alone.
  for (const span of [
    'Retention · 2026 cohorts',
    'Effort 0–10 → Reach 0–100',
    '{LABEL}:shape:c4',
    'npm run build',
    '',
    '   ',
    '[',
    ']',
  ]) {
    test(`null for ${JSON.stringify(span)}`, () => {
      assert.equal(parseBracketList(span), null);
    });
  }

  test('a bracketed run with nothing well-formed is null, not an empty list', () => {
    // `[]` rendering as "an axis with no name" would read as an engine fault.
    assert.equal(parseBracketList('[]'), null);
    assert.equal(parseBracketList('[ , ]'), null);
    assert.equal(parseBracketList('[{}]'), null);
  });
});

describe('whitespace reads the way it renders', () => {
  test('an internal run collapses to one space', () => {
    assert.deepEqual(parseBracketList('[  Wide   reach , Deep  ]'), [['Wide reach'], ['Deep']]);
  });

  test('tidy collapses runs and trims edges', () => {
    assert.equal(tidy('Wide   reach'), 'Wide reach');
    assert.equal(tidy('  a  b  '), 'a b');
    assert.equal(tidy('a\t\tb'), 'a b');
    assert.equal(tidy('   '), '');
    assert.equal(tidy('one two'), 'one two');
  });

  test('unquote strips ONE balanced pair, and leaves unbalanced text alone', () => {
    assert.equal(unquote('"a"'), 'a');
    assert.equal(unquote("'a'"), 'a');
    assert.equal(unquote('"a'), '"a');
    assert.equal(unquote("it's fine"), "it's fine");
  });
});

describe('arity belongs to the caller', () => {
  test('capped at two, the remaining commas are prose — a LABEL', () => {
    assert.deepEqual(parseBracketList('[{1, Good, better, best}]', { maxParts: 2 }), [
      ['1', 'Good, better, best'],
    ]);
  });

  test('uncapped, every comma splits — an AXIS', () => {
    assert.deepEqual(parseBracketList('[{1, Good, better, best}]'), [
      ['1', 'Good', 'better', 'best'],
    ]);
  });

  // The property that lets ONE tokenizer serve both authorities: capped at two
  // it reproduces the label-set grammar exactly, on the real shipped strings.
  test('capped at two it agrees with parseInlineSet, member for member', () => {
    for (const src of [
      '[{1, Good}, {2, Better}, {3, The Best}]',
      '[{1, Good, better, best}]',
      '[{[x], Enacted}, {[-], In committee}]',
      '[{[ ], Not started}]',
      '[{1, Holding; watch, then act}]',
    ]) {
      const mine = parseBracketList(src, { maxParts: 2 })
        .filter((m) => m.length > 1)
        .map((m) => ({ key: m[0], label: m[1] }));
      assert.deepEqual(mine, parseInlineSet(src), src);
    }
  });
});

describe('nothing backtracks', () => {
  // The shape `label-set.js` was bitten by — a brace run of spaces with no
  // comma — took 10.9s at 3000 characters through an ambiguous regex. A single
  // left-to-right pass cannot have that failure mode, and the arm below is the
  // standing proof rather than a comment claiming it.
  test('a 20k-character brace run resolves immediately', () => {
    const evil = `[{${' '.repeat(20000)}}]`;
    const t0 = process.hrtime.bigint();
    assert.equal(parseBracketList(evil), null);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 50, `expected well under 50ms, took ${ms.toFixed(1)}ms`);
  });

  test('cost stays linear in input length', () => {
    const run = (n) => {
      const src = `[{${' '.repeat(n)}}]`;
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < 200; i++) parseBracketList(src);
      return Number(process.hrtime.bigint() - t0) / 200;
    };
    run(4000); // warm
    // Quadrupling the input must not square the time. Generous bound: the
    // point is to catch a super-linear REGRESSION, not to gate on wall clock.
    assert.ok(run(4000) * 8 > run(16000), 'growth should be ~linear, not quadratic');
  });
});
