// Label sets — the one construct for naming the members of a set.
//
// The arms below hold the three properties the construct exists for: a chart's
// DERIVED set is the spine, an author's entries OVERRIDE it partially, and the
// two authoring forms are the same data. Everything else about a legend (where
// it sits, what the swatch paints) belongs to the component that owns the set.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseInlineSet, parseRegisterBlock, resolveLabelSet, unboundKeys,
} = require('../../../lib/core/label-set');
const { renderHtml } = require('../../../lib/core/inline-code-directives');

describe('the inline form', () => {
  test('parses the bracketed set an author writes', () => {
    assert.deepEqual(parseInlineSet('[{1, Good}, {2, Better}, {3, The Best}]'), [
      { key: '1', label: 'Good' },
      { key: '2', label: 'Better' },
      { key: '3', label: 'The Best' },
    ]);
  });

  test('only the FIRST comma splits, so a label can be prose', () => {
    // A key is never a sentence; a label often is. Splitting on every comma
    // would turn one entry into two and bind the tail to a key nobody wrote.
    assert.deepEqual(parseInlineSet('[{2, Holding, but watch it}]'),
      [{ key: '2', label: 'Holding, but watch it' }]);
  });

  test('anything that is not a set returns null, so the caller leaves it alone', () => {
    for (const t of ['', 'hello', '{1}', '[1, 2, 3]', '`code`', '[]']) {
      assert.equal(parseInlineSet(t), null, `${JSON.stringify(t)} must not parse as a set`);
    }
  });

  test('a bracketed run with no well-formed member is null, not an empty set', () => {
    // `[{oops}]` is a typo far more often than a request for a legend with no
    // rows, and returning [] would render exactly that.
    assert.equal(parseInlineSet('[{oops}]'), null);
    assert.equal(parseInlineSet('[{}]'), null);
  });
});

describe('the inline form does not collide with the pill grammar', () => {
  // `{1}` and `{Good}` are already inline pills. The set form has to be
  // distinguishable from those by the dispatcher that runs on every span of
  // every deck, or one of the two grammars silently eats the other.
  test('a set does not dispatch as a pill or a mark', () => {
    assert.equal(renderHtml('[{1, Good}, {2, Better}, {3, The Best}]'), null);
    assert.equal(renderHtml('{1, Good}'), null);
  });

  test('and the single-brace pill still does', () => {
    assert.match(renderHtml('{1}') || '', /lat-pill/);
    assert.match(renderHtml('{Good}') || '', /lat-pill/);
  });
});

describe('the register form', () => {
  test('takes the bare-scalar shorthand and the inline-flow object, like acronyms:', () => {
    assert.deepEqual(parseRegisterBlock([
      '  1: Cold',
      '  3: { label: Warm, detail: "Holding; watch the next cohort." }',
      '  5: Hot',
    ].join('\n')), [
      { key: '1', label: 'Cold' },
      { key: '3', label: 'Warm', detail: 'Holding; watch the next cohort.' },
      { key: '5', label: 'Hot' },
    ]);
  });

  test('skips blanks and comments rather than parsing them as entries', () => {
    assert.deepEqual(parseRegisterBlock('  # a note\n\n  1: Cold\n'), [{ key: '1', label: 'Cold' }]);
  });

  test('a flow object with no label is skipped, not given an empty one', () => {
    assert.deepEqual(parseRegisterBlock('  1: { detail: "no label here" }'), []);
  });
});

describe('resolving the author against the chart', () => {
  const derived = [
    { key: '1', label: '≤44' },
    { key: '2', label: '45–55' },
    { key: '3', label: '56–70' },
  ];

  test('with nothing authored, the derived set is what renders', () => {
    assert.deepEqual(resolveLabelSet(derived, []), derived);
  });

  test('naming ONE band leaves the others derived', () => {
    // The whole point of the construct: an author should not have to restate
    // four bands to rename the fifth.
    assert.deepEqual(resolveLabelSet(derived, [{ key: '2', label: 'Warm' }]), [
      { key: '1', label: '≤44' },
      { key: '2', label: 'Warm' },
      { key: '3', label: '56–70' },
    ]);
  });

  test('an authored detail rides along with the label', () => {
    const out = resolveLabelSet(derived, [{ key: '1', label: 'Cold', detail: 'Below the threshold.' }]);
    assert.equal(out[0].detail, 'Below the threshold.');
    assert.equal(out[1].detail, undefined, 'a band nobody described must carry no detail');
  });

  test('order comes from the CHART, never from the author', () => {
    // A ramp reads low to high. An author listing the bands backwards is naming
    // them, not re-ordering them.
    const out = resolveLabelSet(derived, [{ key: '3', label: 'Hot' }, { key: '1', label: 'Cold' }]);
    assert.deepEqual(out.map((e) => e.key), ['1', '2', '3']);
  });

  test('a key the chart does not carry is dropped, and reported', () => {
    // A legend row bound to no band paints no swatch, so rendering it would put
    // a key on the slide that points at nothing.
    const out = resolveLabelSet(derived, [{ key: '9', label: 'Hottest' }]);
    assert.equal(out.length, 3);
    assert.deepEqual(unboundKeys(derived, [{ key: '9', label: 'Hottest' }]), ['9']);
  });

  test('a quoted key and a bare one are the same band', () => {
    assert.equal(resolveLabelSet(derived, [{ key: ' 2 ', label: 'Warm' }])[1].label, 'Warm');
  });
});
