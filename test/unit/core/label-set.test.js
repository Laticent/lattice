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

describe('the marker literal as a key', () => {
  // The four state markers are the vocabulary an author already types in a
  // cell, so they are what a label set addresses a member BY. That works only
  // because the brackets protect the space: `tidy` collapses whitespace and
  // trims, so a bare ` ` key would come out empty and be dropped, taking the
  // "not met / exempt / planned" row with it. This arm is the pin.
  test('[ ] survives the whitespace tidy because the brackets hold it', () => {
    assert.deepEqual(
      parseInlineSet('[{[x], Applies}, {[-], Partial}, {[ ], Exempt}, {[/], Out of scope}]'),
      [
        { key: '[x]', label: 'Applies' },
        { key: '[-]', label: 'Partial' },
        { key: '[ ]', label: 'Exempt' },
        { key: '[/]', label: 'Out of scope' },
      ],
    );
  });

  test('a BARE space key is still dropped — which is why the brackets are the spelling', () => {
    // Stated as a test rather than a comment: if this ever starts working, the
    // bracket spelling stops being load-bearing and the docs are wrong.
    assert.equal(parseInlineSet('[{ , Exempt}]'), null);
  });

  test('padding around a bracketed key does not change which member it names', () => {
    assert.deepEqual(parseInlineSet('[{ [x] , Applies }]'), [{ key: '[x]', label: 'Applies' }]);
  });
});

describe('lifting the set out of a section', () => {
  const { liftLabelSet } = require('../../../lib/core/lift-label-set');

  test('takes the set and removes only its paragraph', () => {
    const html = '<p><code>[{1, Cold}, {5, Hot}]</code></p><table>x</table>';
    const out = liftLabelSet(html);
    assert.deepEqual(out.set, [{ key: '1', label: 'Cold' }, { key: '5', label: 'Hot' }]);
    assert.equal(out.html, '<table>x</table>');
  });

  test('EVERY one-code paragraph is a candidate, not just the first', () => {
    // The bug this function exists to keep fixed: a slide carries an eyebrow in
    // exactly the label set's shape and it sets ABOVE the set. Testing only the
    // first match found the eyebrow, failed to parse it, and gave up — so the
    // set rendered as a subtitle and the key never appeared.
    const html = '<p><code>Retention · 2026 cohorts</code></p>'
      + '<p><code>[{1, Cold}]</code></p><table>x</table>';
    const out = liftLabelSet(html);
    assert.deepEqual(out.set, [{ key: '1', label: 'Cold' }]);
    assert.equal(out.html, '<p><code>Retention · 2026 cohorts</code></p><table>x</table>',
      'the eyebrow must survive untouched');
  });

  test('a section with no set is returned unchanged', () => {
    // The pass-through is load-bearing, not defensive: matrix-grid discriminates
    // its axis eyebrow by holding TWO code spans, so a ONE-code paragraph there
    // is an ordinary eyebrow that must survive this scan.
    const html = '<p><code>just an eyebrow</code></p><table>x</table>';
    const out = liftLabelSet(html);
    assert.equal(out.set, null);
    assert.equal(out.html, html);
  });

  test('two charts on one slide each get their own scan', () => {
    // A module-level /g regex carries lastIndex between calls, so the second
    // chart would start wherever the first stopped. The regex is per-call.
    const html = '<p><code>[{1, A}]</code></p>';
    assert.deepEqual(liftLabelSet(html).set, [{ key: '1', label: 'A' }]);
    assert.deepEqual(liftLabelSet(html).set, [{ key: '1', label: 'A' }]);
  });

  test('entities in the span are decoded before parsing', () => {
    // markdown-it writes `&amp;`; a label reading "R&D" must not arrive as "R&amp;D".
    assert.deepEqual(liftLabelSet('<p><code>[{1, R&amp;D}]</code></p>').set,
      [{ key: '1', label: 'R&D' }]);
  });
});

describe('the declared catalog — one source for the render and the lint', () => {
  const { labelSetFor, derivedFrom } = require('../../../lib/core/label-set');

  test('a component that declares no set answers null, never a guess', () => {
    // The honest answer is what stops the lint inventing a vocabulary for a
    // component that never had one.
    assert.equal(labelSetFor('quote'), null);
    assert.equal(labelSetFor(''), null);
    assert.equal(labelSetFor(undefined), null);
    assert.deepEqual(derivedFrom('quote', ['[x]']), []);
  });

  test('derivedFrom keeps DECLARATION order, not the order keys were seen', () => {
    const set = labelSetFor('roadmap');
    assert.ok(set, 'roadmap must declare a label set');
    const order = set.members.map((m) => m.key);
    const shuffled = [...order].reverse();
    assert.deepEqual(derivedFrom('roadmap', shuffled).map((m) => m.key), order,
      'the declaration order is a lifecycle; reading order must not depend on the data');
  });

  test('derivedFrom returns only the members actually present', () => {
    const set = labelSetFor('roadmap');
    const first = set.members[0].key;
    assert.deepEqual(derivedFrom('roadmap', [first]).map((m) => m.key), [first]);
    assert.deepEqual(derivedFrom('roadmap', []), [],
      'no member present means no key at all');
  });
});
