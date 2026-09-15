/**
 * Unit: the chart family's label-drop diagnostic channel (#2171).
 *
 * The census next door (`chart-label-drop-census.test.js`) pins that the decks WE
 * ship never drop a name. This pins the other half — that when a deck DOES drop
 * one, the render says which name, on which chart. Its docblock is what asked for
 * this: "warning the author is real work and needs a render-time diagnostic channel
 * the family does not have".
 *
 * The two fixtures below are deliberately the census's OWN detector inputs, copied
 * verbatim rather than re-invented. They are already documented as the shapes that
 * must drop, they are already the numbers the census docblock quotes ("five long
 * names in one quadrant loses two, twenty rows on a `bar` loses ten"), and using a
 * third fixture would let this suite pass against a channel wired to a path the
 * census does not exercise.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const MarkdownIt = require('markdown-it');

const ROOT = path.join(__dirname, '..', '..', '..');
const P = (p) => path.join(ROOT, p);
const {
  noteLabelDrop, noteHiddenLabels, collectLabelDrops, encodeLabelDrops, decodeLabelDrops,
} = require(P('lib/components/chart/_chart-family/label-drops.js'));
const { transformChartSection } = require(P('lib/components/chart/_chart-family/chart-family.js'));

// Plain parser, for the census's reason: the engine's parser has the pill plugin
// installed, which eats the trailing inline code the chart kernels read values from.
const md = new MarkdownIt({ html: true });

const HOSTILE_QUADRANT = `
## Hostile.

- Strategic Bets
  - Comprehensive quarterly revenue recognition overhaul \`3, 70\`
  - Consolidated multi-region settlement reconciliation \`3.2, 72\`
  - Automated counterparty exposure attestation service \`3.4, 74\`
  - Distributed ledger provenance verification program \`3.1, 71\`
  - Enterprise-wide procurement rationalization mandate \`3.3, 73\`
- Quick Wins
- Defer
- Time Sinks
`;
const HOSTILE_BAR = `## Hostile.\n\n${
  Array.from({ length: 20 }, (_, i) => `- Business unit number ${i + 1} \`${10 + i}\``).join('\n')}`;

const dropsOn = (body, cls) => {
  const html = transformChartSection(md.render(body), cls, 'landscape').html;
  const raw = html.match(/data-label-drops="([^"]*)"/);
  const comp = html.match(/data-label-drops-component="([^"]*)"/);
  return { drops: raw ? decodeLabelDrops(raw[1]) : [], component: comp ? comp[1] : null, html };
};

describe('the render reports the labels it declined to paint', () => {
  test('a hostile quadrant names what hide-overlap dropped', () => {
    const { drops, component } = dropsOn(HOSTILE_QUADRANT, 'quadrant');
    assert.equal(component, 'quadrant');
    assert.equal(drops.length, 2, 'the census docblock measures this shape at two lost names');
    for (const d of drops) {
      assert.equal(d.reason, 'overlap');
      // The NAME, not a count. "2 labels dropped" sends the author back to count.
      assert.match(d.label, /^(Comprehensive|Consolidated|Automated|Distributed|Enterprise-wide)/);
    }
  });

  test('a twenty-row bar names what the pitch cull dropped', () => {
    const { drops, component } = dropsOn(HOSTILE_BAR, 'bar');
    assert.equal(component, 'bar');
    assert.equal(drops.length, 10, 'the census docblock measures this shape at ten lost names');
    assert.ok(drops.every((d) => d.reason === 'pitch'));
    assert.ok(drops.every((d) => /^Business unit number \d+$/.test(d.label)));
  });

  // THE ARM THAT KEEPS THE CHANNEL HONEST. A diagnostic that fires on a healthy
  // chart is one an author switches off, and every chart in the shipped corpus is
  // healthy — the census proves it. So the attribute must be ABSENT, not empty.
  test('a chart that drops nothing carries no attribute at all', () => {
    const body = '## Fine.\n\n- Alpha `2, 30`\n- Beta `7, 80`\n- Gamma `4, 55`';
    const { drops, html } = dropsOn(body, 'quadrant');
    assert.equal(drops.length, 0);
    assert.doesNotMatch(html, /data-label-drops/,
      'an empty attribute on every healthy chart is a golden-file diff on the whole corpus for nothing');
  });
});

describe('the bracket', () => {
  test('outside a bracket a note is a no-op — no other render path changes', () => {
    // The channel must cost nothing where nobody asked for it. If this ever throws
    // or accumulates, every non-CLI render is paying for a diagnostic it never reads.
    assert.doesNotThrow(() => noteLabelDrop('orphan', 'overlap'));
    const { drops } = collectLabelDrops(() => null);
    assert.deepEqual(drops, [], 'a note taken outside the bracket must not leak into the next one');
  });

  test('a nested bracket cannot steal the outer one\'s drops', () => {
    const outer = collectLabelDrops(() => {
      noteLabelDrop('outer-before', 'overlap');
      const inner = collectLabelDrops(() => noteLabelDrop('inner', 'pitch'));
      assert.deepEqual(inner.drops.map((d) => d.label), ['inner']);
      noteLabelDrop('outer-after', 'overlap');
    });
    assert.deepEqual(outer.drops.map((d) => d.label), ['outer-before', 'outer-after']);
  });

  test('an empty label is thinning, not loss', () => {
    // `line` blanks an interior category itself — the point is still plotted, so the
    // name was never going to be painted. The census hit this false positive first;
    // reporting it would put a warning on most `line` slides in the tree.
    const { drops } = collectLabelDrops(() => {
      noteLabelDrop('', 'pitch');
      noteLabelDrop('   ', 'pitch');
      noteLabelDrop(null, 'pitch');
    });
    assert.deepEqual(drops, []);
  });

  test('noteHiddenLabels reads `hidden` and returns the array untouched', () => {
    const placed = [{ svg: '<text/>', label: 'kept' }, { svg: '', hidden: true, label: 'lost' }];
    const { value, drops } = collectLabelDrops(() => noteHiddenLabels(placed));
    assert.equal(value, placed, 'the caller must be able to thread this into an existing expression');
    assert.deepEqual(drops, [{ label: 'lost', reason: 'overlap' }]);
  });
});

describe('the attribute grammar — one module, both directions', () => {
  test('round-trips a label carrying every character that would break the attribute', () => {
    // A label is AUTHOR text: it can hold the `|` this joins on, the `:` that splits
    // reason from label, and the `"` that would close the attribute outright.
    const nasty = [
      { reason: 'overlap', label: 'Revenue | Cost: "FY26" <b> & more' },
      { reason: 'pitch', label: 'Plain name' },
    ];
    const enc = encodeLabelDrops(nasty);
    assert.doesNotMatch(enc, /"/, 'an unescaped quote closes the attribute and injects markup');
    assert.deepEqual(decodeLabelDrops(enc), nasty);
  });

  test('a real transform emits an attribute a regex can lift whole', () => {
    // The end-to-end shape of the escape: the nasty label goes through the actual
    // markdown → transform → attribute path, not just the codec.
    const body = '## Hostile.\n\n- Strategic Bets\n' +
      ['Alpha | Beta: "gamma" overhaul and reconciliation program',
        'Delta | Epsilon: "zeta" overhaul and reconciliation program',
        'Eta | Theta: "iota" overhaul and reconciliation program',
        'Kappa | Lambda: "mu" overhaul and reconciliation program',
        'Nu | Xi: "omicron" overhaul and reconciliation program',
      ].map((n, i) => `  - ${n} \`${3 + i * 0.1}, ${70 + i}\``).join('\n') +
      '\n- Quick Wins\n- Defer\n- Time Sinks';
    const { drops, html } = dropsOn(body, 'quadrant');
    assert.ok(drops.length > 0, 'this shape must still drop, or the arm proves nothing');
    // Exactly one attribute, and the value ends where it should.
    assert.equal((html.match(/data-label-drops="/g) || []).length, 1);
    for (const d of drops) assert.match(d.label, /\|/, 'the pipe must survive the round trip intact');
  });

  test('an empty or absent value decodes to nothing', () => {
    assert.deepEqual(decodeLabelDrops(''), []);
    assert.deepEqual(decodeLabelDrops(undefined), []);
    assert.equal(encodeLabelDrops([]), '');
  });
});
