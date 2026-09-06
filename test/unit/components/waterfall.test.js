/**
 * Unit: lib/components/chart/waterfall/waterfall.transform.js — kernel for the
 * `waterfall` chart-family member (the bridge).
 *
 * The substrate this kernel sits on (ticks, scales, the plot box, the series
 * value parser) is covered by test/unit/components/cartesian.test.js and is not
 * re-tested here. What IS here is everything the waterfall itself decides:
 *
 *   1. The AUTHORING CONTRACT — the sign rule that separates a signed step from
 *      a zero-anchored level, the two-pill marker that overrides it, and the
 *      shapes that must NOT be read as data.
 *   2. The SIGN, which this kernel reads itself because `parseValue` cannot:
 *      `-$0.9M` is a fall of 900k, not a rise of it.
 *   3. THE GEOMETRIC INVARIANT the whole chart rests on — the connector out of
 *      the last step lands exactly on the closing bar's own edge, so the picture
 *      does the arithmetic. Asserted on the EMITTED SVG, on four walks including
 *      one that crosses zero and one that closes below it.
 *   4. The palette-blindness rule (HARD RULE #3) and the accessible `<desc>`,
 *      which is the ONLY route to this data for a screen reader because
 *      `role="img"` prunes every `<text>` the chart draws.
 *   5. The CSS MIRROR: the kernel wraps its printed figures at the family's
 *      `FS.value`, and the stylesheet has to paint that same number.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseWaterfall, buildWaterfall, buildDesc, fmtSigned, MIN_BAR,
} = require('../../../lib/components/chart/waterfall/waterfall.transform');
const cart = require('../../../lib/components/chart/_chart-family/cartesian');

const STYLES = path.join(
  __dirname, '../../../lib/components/chart/waterfall/waterfall.styles.css');

// The <ul> inner HTML the dispatcher hands the kernel. A row is
// [label, value] or [label, value, marker] — the marker being the family's
// optional SECOND inline-code pill.
function ul(rows) {
  return rows.map(([label, value, marker]) =>
    `<li>${label}${value != null ? ` <code>${value}</code>` : ''}` +
    `${marker ? ` <code>${marker}</code>` : ''}</li>`).join('');
}

const PLAN_ACTUAL = [
  ['Plan', '12.0M'], ['Price', '+1.4M'], ['Volume', '-0.8M'],
  ['Mix', '-0.6M'], ['FX', '-0.3M'], ['Cost', '-1.9M'], ['Actual', '9.8M'],
];
const CROSS_ZERO = [
  ['Opening cash', '2.4M'], ['Receipts', '+3.1M'], ['Payroll', '-2.9M'],
  ['Tax settlement', '-4.2M'], ['Trough', '-1.6M', 'total'],
  ['Facility draw', '+5.0M'], ['Working capital', '-0.9M'], ['Closing cash', '2.5M'],
];
const CLOSES_NEGATIVE = [
  ['Opening', '1.0M'], ['Writedown', '-3.4M'], ['Recovery', '+0.6M'], ['Closing', '-1.8M'],
];
const HEADCOUNT = [
  ['Jan', '340'], ['Hires', '+62'], ['Attrition', '-38'], ['Reorg', '-14'], ['Dec', '350'],
];

describe('waterfall kernel', () => {
  describe('parseWaterfall — the authoring contract', () => {
    test('the SIGN decides: a signed value is a step, a bare value is a level', () => {
      const m = parseWaterfall(ul(PLAN_ACTUAL));
      assert.deepEqual(m.rows.map((r) => r.kind),
        ['total', 'step', 'step', 'step', 'step', 'step', 'total']);
      assert.deepEqual(m.rows.map((r) => r.dir),
        ['total', 'up', 'down', 'down', 'down', 'down', 'total']);
    });

    test('the first and last items are levels whatever their sign', () => {
      // A walk that closes in the red still ANCHORS its closing bar to zero —
      // otherwise a negative closing balance would float as if it were a step.
      const m = parseWaterfall(ul(CLOSES_NEGATIVE));
      const last = m.rows[m.rows.length - 1];
      assert.equal(last.kind, 'total');
      assert.equal(last.start, 0);
      assert.equal(last.end, -1800000);
    });

    test('a bare INTERIOR value is a mid-walk subtotal, anchored to zero', () => {
      const m = parseWaterfall(ul([
        ['Open', '100'], ['A', '+20'], ['H1', '120'], ['B', '-15'], ['Close', '105'],
      ]));
      assert.equal(m.rows[2].kind, 'total');
      assert.equal(m.rows[2].start, 0);
      // The walk continues from the AUTHORED subtotal, not from its own running sum.
      assert.equal(m.rows[3].start, 120);
    });

    test('a second pill overrides the sign rule in both directions', () => {
      const m = parseWaterfall(ul([
        ['Baseline', '+40', 'total'], ['Driver', '10', 'step'], ['Close', '50'],
      ]));
      assert.equal(m.rows[0].kind, 'total');
      assert.equal(m.rows[0].end, 40, 'a `total` marker anchors even a signed value');
      assert.equal(m.rows[1].kind, 'step');
      assert.equal(m.rows[1].start, 40, 'a `step` marker floats even a bare value');
      assert.equal(m.rows[1].end, 50);
    });

    test('the magnitude suffix is scale, and % is not a magnitude', () => {
      const m = parseWaterfall(ul([['Open', '800k'], ['Up', '+1.2M'], ['Close', '2.0M']]));
      assert.deepEqual(m.rows.map((r) => r.num), [800000, 1200000, 2000000]);
      const pct = parseWaterfall(ul([['Open', '12%'], ['Up', '+3%'], ['Close', '15%']]));
      assert.deepEqual(pct.rows.map((r) => r.num), [12, 3, 15]);
    });

    test('the affix is read off the SIGN-STRIPPED text, so a signed walk keeps its unit', () => {
      // `parseAffix` rejects an explicit `+`, so reading the affix off the raw
      // pill would drop the `$` from the axis the moment a step was signed.
      const m = parseWaterfall(ul([['Open', '$4.2M'], ['Up', '+$1.1M'], ['Close', '$5.3M']]));
      assert.deepEqual(m.affix, { prefix: '$', suffix: '' });
    });

    test('a currency symbol between the sign and the digits keeps the sign', () => {
      // `parseValue` scans for the first numeric run, so `-$0.9M` reads +900 000
      // to the substrate. On this chart that is not a rounding error, it is the
      // opposite number: the bar climbs and paints green.
      const m = parseWaterfall(ul([['Open', '$4.2M'], ['Churn', '-$0.9M'], ['Close', '$3.3M']]));
      assert.equal(m.rows[1].num, -900000);
      assert.equal(m.rows[1].dir, 'down');
      assert.equal(m.rows[1].end, 3300000);
    });

    test('a pasted U+2212 minus sign falls, it does not rise', () => {
      const m = parseWaterfall(ul([['Open', '100'], ['Cut', '−15'], ['Close', '85']]));
      assert.equal(m.rows[1].num, -15);
      assert.equal(m.rows[1].dir, 'down');
    });

    test('a step of exactly zero is `flat`, neither up nor down', () => {
      const m = parseWaterfall(ul([['Open', '100'], ['Net', '+0'], ['Close', '100']]));
      assert.equal(m.rows[1].dir, 'flat');
      assert.equal(fmtSigned(m.rows[1]), '0', 'and its label carries no sign');
    });

    test('a nested sublist is DETAIL, never a data point', () => {
      const m = parseWaterfall(
        '<li>Open <code>100</code></li>' +
        '<li>Price <code>+20</code><ul><li>Two rises</li><li>Held in <code>EMEA</code></li></ul></li>' +
        '<li>Close <code>120</code></li>');
      assert.equal(m.rows.length, 3, 'the sublist adds no bar');
      assert.equal(m.rows[1].num, 20);
      assert.match(m.rows[1].detail, /Two rises/);
      assert.match(m.rows[1].detail, /EMEA/, 'a pill that is not a number stays detail');
    });

    test('returns null when there is nothing to bridge', () => {
      assert.equal(parseWaterfall(''), null);
      assert.equal(parseWaterfall(ul([['Only one', '12.0M']])), null, 'one bar is a number');
      assert.equal(parseWaterfall(ul([['No value', null], ['Nor this', null]])), null);
      assert.equal(parseWaterfall(ul([['Open', 'n/a'], ['Close', 'tbd']])), null);
      assert.ok(parseWaterfall(ul([['Open', '12'], ['Close', '9']])), 'two bars is the floor');
    });

    test('an unparseable value is skipped, not plotted at zero', () => {
      const m = parseWaterfall(ul([['Open', '100'], ['Mystery', 'tbc'], ['Close', '100']]));
      assert.deepEqual(m.rows.map((r) => r.label), ['Open', 'Close']);
    });
  });

  describe('the running total', () => {
    test('each step starts where the last one ended', () => {
      const m = parseWaterfall(ul(PLAN_ACTUAL));
      for (let i = 1; i < m.rows.length; i++) {
        if (m.rows[i].kind !== 'step') continue;
        assert.equal(m.rows[i].start, m.rows[i - 1].end,
          `${m.rows[i].label} does not start where ${m.rows[i - 1].label} ended`);
      }
    });

    test('a walk that reconciles says so; one that does not is flagged', () => {
      assert.equal(parseWaterfall(ul(PLAN_ACTUAL)).reconciles, true);
      const bad = parseWaterfall(ul([
        ['Open', '100'], ['A', '+20'], ['B', '-5'], ['Close', '140'],
      ]));
      assert.equal(bad.reconciles, false);
      assert.equal(bad.arrivedAt, 115, 'and it remembers where the steps actually landed');
      assert.equal(bad.closing, 140);
    });

    test('the net change is closing minus opening', () => {
      const m = parseWaterfall(ul(PLAN_ACTUAL));
      assert.equal(m.net, -2200000);
      assert.equal(parseWaterfall(ul(HEADCOUNT)).net, 10);
    });

    test('walkMin/walkMax cover the levels VISITED, not the anchors baseline', () => {
      // The `zoom` baseline is derived from this: a total bar's base at zero is
      // a drawing convention, not a level the running total ever passed through.
      const m = parseWaterfall(ul(PLAN_ACTUAL));
      assert.equal(m.walkMin, 9800000);
      assert.equal(m.walkMax, 13400000);
      assert.equal(m.min, 0, 'while the DRAWN geometry does reach zero');
    });
  });

  describe('THE GEOMETRIC INVARIANT — the walk lands on the closing bar', () => {
    // Read the emitted SVG rather than the model: the claim is about the
    // PICTURE. A model that reconciles and a chart that draws the last
    // connector somewhere else is exactly the failure worth catching.
    function geometry(rows, ctx = {}) {
      const model = parseWaterfall(ul(rows));
      const svg = buildWaterfall(model, ctx);
      // Match each bar tag ONCE, then read its attributes off the tag. Chaining
      // several `[^<>]*` runs in one pattern backtracks polynomially on a long
      // tag (CodeQL js/polynomial-redos), and a `<rect>` here carries a dozen
      // attributes.
      const bars = [...svg.matchAll(/<(?:rect|path|line) class="waterfall-bar"[^<>]*>/g)]
        .map(([tag]) => {
          const at = (name) => (new RegExp(`\\s${name}="([-\\d.]+)"`).exec(tag) || [])[1];
          const dir = (/\sdata-s="([a-z]+)"/.exec(tag) || [])[1];
          const y = at('y');
          if (y !== undefined) return { dir, top: +y, bottom: +y + +at('height') };
          return { dir, top: +at('y1'), bottom: +at('y1') };
        });
      const connectors = [...svg.matchAll(/<line class="waterfall-connector"[^<>]*y1="([-\d.]+)"/g)]
        .map((m) => +m[1]);
      return { model, svg, bars, connectors };
    }

    for (const [name, rows] of [
      ['a plan-to-actual walk', PLAN_ACTUAL],
      ['a walk that crosses zero and comes back', CROSS_ZERO],
      ['a walk that closes below zero', CLOSES_NEGATIVE],
      ['a whole-number headcount walk', HEADCOUNT],
    ]) {
      test(`${name}: the last connector meets the closing bar's own edge`, () => {
        const { model, bars, connectors } = geometry(rows);
        assert.equal(bars.length, model.rows.length);
        assert.equal(connectors.length, model.rows.length - 1);
        const last = model.rows[model.rows.length - 1];
        const bar = bars[bars.length - 1];
        assert.equal(last.kind, 'total');
        assert.equal(model.reconciles, true, 'fixture must reconcile');
        // A positive level is drawn upward from zero, so the level it states is
        // its TOP edge; a negative one is drawn downward, so it is the BOTTOM.
        const edge = last.end >= 0 ? bar.top : bar.bottom;
        assert.ok(Math.abs(connectors[connectors.length - 1] - edge) <= 0.02,
          `connector at ${connectors[connectors.length - 1]} vs closing edge ${edge}`);
      });

      test(`${name}: every connector meets the bar it leaves`, () => {
        const { model, bars, connectors } = geometry(rows);
        model.rows.slice(0, -1).forEach((r, i) => {
          const bar = bars[i];
          // The connector carries the level this bar ENDED on.
          const edge = r.kind === 'total'
            ? (r.end >= 0 ? bar.top : bar.bottom)
            : (r.num < 0 ? bar.bottom : bar.top);
          assert.ok(Math.abs(connectors[i] - edge) <= MIN_BAR + 0.02,
            `${r.label}: connector ${connectors[i]} vs end edge ${edge}`);
        });
      });
    }

    test('a sub-visible step is floored but its BASE stays on the running total', () => {
      // The floor moves the tip, never the base — otherwise the connector into
      // the step and the step itself would disagree about where the walk was.
      const { model, bars, connectors } = geometry([
        ['Open', '12.0M'], ['Tiny', '+0.01M'], ['Cost', '-2.21M'], ['Close', '9.8M'],
      ]);
      const tiny = bars[1];
      assert.ok(tiny.bottom - tiny.top >= MIN_BAR - 0.01, 'the sliver is drawn');
      assert.ok(Math.abs(connectors[0] - tiny.bottom) <= 0.02,
        'the incoming connector lands on the step base');
      assert.equal(model.rows[1].end, 12010000);
    });

    test('`zoom` re-bases the axis on the walk and tears the anchors', () => {
      const compressed = [
        ['Open', '12.0M'], ['Price', '+0.3M'], ['Cost', '-2.5M'], ['Close', '9.8M'],
      ];
      const plain = buildWaterfall(parseWaterfall(ul(compressed)), {});
      const zoomed = buildWaterfall(parseWaterfall(ul(compressed)),
        { classTokens: ['waterfall', 'zoom'] });
      assert.doesNotMatch(plain, /data-clipped/, 'the default baseline is zero');
      assert.equal((zoomed.match(/data-clipped="1"/g) || []).length, 2,
        'both anchors are cut off and marked');
      const ticksOf = (svg) => [...svg.matchAll(/class="cart-tick"[^<>]*><tspan[^<>]*>([^<]*)/g)]
        .map((m) => m[1]);
      // `0`, not `0M`: zero carries no magnitude on a compacted axis
      // (cartesian.js axisFormatter) — `$0M` reads as a quantity of millions.
      assert.ok(ticksOf(plain).includes('0'), 'zero is on the default axis');
      assert.ok(!ticksOf(zoomed).includes('0M'), 'and off the zoomed one');
      assert.ok(ticksOf(zoomed).length <= 5, 'never more than five gridlines');
    });
  });

  describe('buildWaterfall — the emitted figure', () => {
    const svg = buildWaterfall(parseWaterfall(ul(PLAN_ACTUAL)), {});

    test('the figure class is emitted literally, matching the manifest kernel block', () => {
      assert.match(svg, /<div class="waterfall-figure">/);
      const manifest = JSON.parse(fs.readFileSync(path.join(
        __dirname, '../../../lib/components/chart/waterfall/waterfall.manifest.json'), 'utf8'));
      assert.equal(manifest.kernel.figureClass, 'waterfall-figure');
    });

    test('one scaled SVG with a viewBox and the family aspect ratio', () => {
      assert.match(svg, /<svg[^<>]*viewBox="0 0 320 180"/);
      assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
      assert.match(svg, /role="img"/);
      assert.doesNotMatch(svg, /aria-hidden/, 'the chart stays in the accessibility tree');
      const portrait = buildWaterfall(parseWaterfall(ul(PLAN_ACTUAL)), { orientation: 'portrait' });
      assert.match(portrait, /viewBox="0 0 320 300"/);
    });

    test('THE KERNEL EMITS NO COLOR — every paint decision is a token or a class', () => {
      // HARD RULE #3. `black` inside the gradient stops comes from the shared
      // `buildFillDefs` recipe and is the family's own idiom, so the assertion
      // is on what this kernel could introduce: literal colors.
      assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,8}\b/, 'no hex literal');
      assert.doesNotMatch(svg, /\b(?:rgba?|hsla?|oklch)\(/, 'no color function');
      // Every mark names a class and its semantic register, nothing else.
      assert.match(svg, /class="waterfall-bar"[^<>]*data-s="up"/);
      assert.match(svg, /class="waterfall-bar"[^<>]*data-s="down"/);
      assert.match(svg, /class="waterfall-bar"[^<>]*data-s="total"/);
    });

    test('gradient ids are document-unique, so two walks on one slide cannot collide', () => {
      const a = buildWaterfall(parseWaterfall(ul(PLAN_ACTUAL)), {});
      const b = buildWaterfall(parseWaterfall(ul(PLAN_ACTUAL)), {});
      const idsOf = (s) => [...s.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(idsOf(a).filter((id) => idsOf(b).includes(id)), []);
    });

    test('every bar carries its label and value for the reveal layer and the note', () => {
      assert.match(svg, /data-mark="0"/);
      assert.match(svg, /data-label="Plan"[^<>]*data-value="12\.0M"|data-label="Plan" data-value="12\.0M"/);
      assert.match(svg, /data-anima-role="bar"/);
    });

    test('detail rides the shared substrate: a template payload and a speaker note', () => {
      const withDetail = buildWaterfall(parseWaterfall(
        '<li>Open <code>100</code></li>' +
        '<li>Price <code>+20</code><ul><li>Two rises</li></ul></li>' +
        '<li>Close <code>120</code></li>'), {});
      assert.match(withDetail, /<template class="chart-detail" data-mark="1">/);
      assert.match(withDetail, /<!-- Price \(\+20\): Two rises -->/);
      assert.doesNotMatch(svg, /chart-detail/, 'and a walk without detail is unchanged');
    });
  });

  describe('the accessible description', () => {
    test('carries the net change AND the level each step arrived at', () => {
      // `role="img"` prunes every <text> the chart draws, so this string is the
      // only route to the data — and a waterfall exists to show how a running
      // total MOVED, not merely what the steps were worth.
      const desc = buildDesc(parseWaterfall(ul(PLAN_ACTUAL)));  // plain text
      assert.match(desc, /Bridge from Plan 12\.0M to Actual 9\.8M/);
      assert.match(desc, /net change of −2\.2M/);
      assert.match(desc, /Price \+1\.4M to 13\.4M/);
      assert.match(desc, /Cost −1\.9M to 9\.8M/);
    });

    test('speaks the axis’s magnitude unit but the data’s precision', () => {
      // An axis stepping by 5M prints whole millions; rounding every arrived-at
      // level to that would make the description useless on a walk of 0.3M
      // steps. The unit still has to match the gridlines.
      const desc = buildDesc(parseWaterfall(ul([
        ['Open', '12.0M'], ['Price', '+0.3M'], ['Cost', '-2.5M'], ['Close', '9.8M'],
      ])));
      assert.match(desc, /12\.3M/);
      assert.doesNotMatch(desc, /\dk\b/, 'and never drops to a different unit than the axis');
    });

    test('names a subtotal as a restatement, not as a step', () => {
      const desc = buildDesc(parseWaterfall(ul(CROSS_ZERO)));
      assert.match(desc, /Trough restates the total at −1\.6M/);
      assert.doesNotMatch(desc, /-\d/, 'one minus sign in the whole description');
    });

    test('says so when the steps do not reconcile with the closing figure', () => {
      const desc = buildDesc(parseWaterfall(ul([
        ['Open', '100'], ['A', '+20'], ['B', '-5'], ['Close', '140'],
      ])));
      assert.match(desc, /does not reconcile/);
    });

    test('joins with semicolons so a label containing a comma stays readable', () => {
      const desc = buildDesc(parseWaterfall(ul([
        ['Open', '100'], ['Price, net of rebate', '+20'], ['Close', '120'],
      ])));
      assert.match(desc, /Price, net of rebate \+20 to 120/);
      assert.match(desc, /; |\. /);
    });

    test('author text with &, < and > survives escaped', () => {
      const svg = buildWaterfall(parseWaterfall(ul([
        ['Ops &amp; IT', '100'], ['Cuts &lt;30 days', '-20'], ['Close', '80'],
      ])), {});
      assert.match(svg, /Ops &amp; IT/);
      // `buildSvgRoot` owns the escaping: an ampersand in a driver's name must
      // arrive escaped exactly once, not twice.
      assert.doesNotMatch(svg, /<desc>[^<]*&(?!amp;|lt;|gt;)/);
      assert.doesNotMatch(svg, /&amp;amp;/);
    });
  });

  describe('the stress cases render without throwing', () => {
    const cases = {
      'the manifest stressDoc walk': CROSS_ZERO,
      'nine bars with long driver names': [
        ['Opening balance', '340'], ['Graduate intake', '+62'],
        ['Experienced hires', '+21'], ['H1 subtotal', '423'],
        ['Voluntary attrition', '-38'], ['Performance exits', '-9'],
        ['Reorganization', '-14'], ['Contractor conversion', '+8'],
        ['Closing balance', '370'],
      ],
      'two bars and nothing between them': [['Open', '12.0M'], ['Close', '9.8M']],
      'a flat walk where every level is identical': [
        ['Open', '100'], ['A', '+0'], ['Close', '100'],
      ],
      'a walk of zeros': [['Open', '0'], ['A', '+0'], ['Close', '0']],
      'one bar of many magnitudes': [
        ['Open', '800k'], ['Jump', '+1.4M'], ['Close', '2.2M'],
      ],
    };
    for (const [name, rows] of Object.entries(cases)) {
      test(name, () => {
        const model = parseWaterfall(ul(rows));
        assert.ok(model, 'parses');
        for (const ctx of [{}, { orientation: 'portrait' }, { classTokens: ['waterfall', 'zoom'] }]) {
          const svg = buildWaterfall(model, ctx);
          assert.match(svg, /<svg[^<>]*viewBox="0 0 320 \d+"/);
          assert.doesNotMatch(svg, /NaN|Infinity|undefined/, 'no unresolved geometry');
        }
      });
    }
  });

  describe('the CSS mirror', () => {
    const css = fs.readFileSync(STYLES, 'utf8');

    test('the painted figure size matches the size the kernel wraps to', () => {
      // `buildValueLabel` takes no font size and always wraps at the family's
      // `FS.value`. If the stylesheet paints anything else, the kernel breaks
      // lines to a width the glyphs do not occupy.
      const sizes = [...css.matchAll(
        /\.waterfall-(?:delta|total-value)\s*\{[^}]*?font-size:\s*([\d.]+)px/g)]
        .map((m) => Number(m[1]));
      assert.equal(sizes.length, 2, 'both printed-figure rules declare a size');
      for (const px of sizes) assert.equal(px, cart.FS.value);
    });

    test('unlayered, anchored for the figure re-host, and no nth-child', () => {
      const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
      assert.doesNotMatch(rules, /@layer/, '@layer is inert in this bundle (cascade.md)');
      assert.doesNotMatch(rules, /nth-child/, 'the first SVG child is <defs>');
      const selectors = rules
        .split('}').map((b) => b.split('{')[0].trim()).filter(Boolean);
      for (const sel of selectors) {
        assert.ok(sel.startsWith(':is(section.waterfall, figure.chart-frame)'),
          `selector not anchored for the Read·Article re-host: ${sel}`);
      }
    });

    test('no hex literal — every color is a token (HARD RULE #3)', () => {
      assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-fA-F]{3,8}\b/);
    });

    test('the three registers are painted, and none of them by hue alone', () => {
      assert.match(css, /\[data-s="up"\][\s\S]*?--state-pass-ink/);
      assert.match(css, /\[data-s="down"\][\s\S]*?--state-fail-ink/);
      // The anchor is canvas ink, NOT --state-mute: cuoio tints that to a warm
      // taupe that reads as a decrease beside its crimson --state-fail.
      assert.match(css, /\[data-s="total"\][\s\S]*?--text-body/);
      assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /state-mute/);
    });
  });
});

describe('waterfall — defects the adversarial trio confirmed', () => {
  const walk = (rows) => parseWaterfall(ul(rows));

  test('every spelling of a negative makes a STEP, not a level', () => {
    // `($0.8M)` — what every finance system prints — used to become a
    // zero-anchored LEVEL that reset the running total, with the right figure
    // on the wrong kind of bar and nothing on the slide to say so.
    for (const form of ['-0.8M', '−0.8M', '(0.8M)', '($0.8M)', '$-0.8M', '-$0.8M']) {
      const m = walk([['Plan', '12.0M'], ['Churn', form], ['Actual', '11.2M']]);
      assert.equal(m.rows[1].kind, 'step', `${form} must be a step`);
      assert.ok(m.rows[1].num < 0, `${form} must be negative`);
    }
    assert.equal(walk([['Plan', '12.0M'], ['X', '9.8M']]).rows[1].kind, 'total',
      'a bare value is still a level');
  });

  test('a signed pill never prints a double minus', () => {
    const svg = buildWaterfall(walk([['Open', '$4.2M'], ['Churn', '$-0.9M'], ['Close', '$3.3M']]), {});
    assert.ok(!/−\$-/.test(svg), 'the sign was applied twice');
    assert.match(svg, /−\$0\.9M/);
  });

  test('EVERY total is a reconciliation point, not just the last', () => {
    // A mid-walk subtotal could restate the running total by any amount — 111
    // becomes 200 — and `reconciles` still said true, with the description
    // reading it out as a clean bridge. The `total` marker is documented FOR
    // the mid-walk subtotal, which made it an unchecked write.
    const bad = walk([['Opening', '100'], ['Wins', '+18'], ['Churn', '-7'],
      ['H1 subtotal', '200'], ['Expansion', '+5'], ['Closing', '205']]);
    assert.equal(bad.reconciles, false);
    assert.equal(bad.breaks.length, 1);
    assert.match(buildWaterfall(bad, {}), /does not reconcile/);
    const good = walk([['Plan', '12.0M'], ['Price', '+1.4M'], ['Volume', '-3.6M'], ['Actual', '9.8M']]);
    assert.equal(good.reconciles, true);
    assert.equal(good.breaks.length, 0);
  });

  test('a walk that closes on a STEP reports the level it reached', () => {
    // The head read the raw pill, so it announced "Bridge from Opening 12.0M to
    // Cost −0.8M, a net change of −0.8M" for a walk that closes at 12.6M — a
    // sentence contradicting itself on the only channel a screen reader has.
    const m = walk([['Opening', '12.0M'], ['Price', '+1.4M'], ['Cost', '-0.8M']]);
    m.rows[2].kind = 'step';
    const desc = /<desc>([^<]*)<\/desc>/.exec(buildWaterfall(walk([
      ['Opening', '12.0M'], ['Price', '+1.4M'], ['Cost', '-0.8M'], ['Close', '12.6M'],
    ]), {}))[1];
    assert.match(desc, /Bridge from Opening 12\.0M to Close 12\.6M/,
      'a level endpoint still prints the author\'s own pill');
  });

  test('a value label is never truncated into a different number', () => {
    // `$2,000,000,000` painted as `$2,000,000…` — well formed, readable, and
    // off by a factor of a thousand from the bar it names.
    const svg = buildWaterfall(walk([
      ['Open', '$1,234,567,890'], ['D1', '+$120,000,000'], ['Close', '$2,000,000,000'],
    ]), {});
    assert.ok(!svg.includes('…'), 'a figure was ellipsized');
  });

  test('`zoom` tears the edge it actually cut, on a negative walk too', () => {
    // An anchor's base is zero, and on an all-negative walk — a cost bridge,
    // net debt, a cumulative loss — zero is off the domain at the TOP. Tearing
    // the bottom ripped the edge carrying the data and drew the cut edge flat.
    const svg = buildWaterfall(walk([
      ['Opening', '-1.0M'], ['Impairment', '-1.5M'], ['Provision', '-2.5M'], ['Closing', '-5.0M'],
    ]), { classTokens: ['waterfall', 'zoom'] });
    const paths = [...svg.matchAll(/data-clipped="1" d="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(paths.length, 2, 'both anchors are clipped');
    assert.notEqual(paths[0], paths[1],
      'two anchors at different levels must not paint identical bars');
    const ys = [...svg.matchAll(/<rect[^<>]*\sy="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(ys.every((y) => y >= 0), 'nothing may escape the viewBox');
  });

  test('an entity-encoded pill is not escaped twice', () => {
    // markdown-it hands the kernel `&gt;100` for an authored `` `>100` ``, and
    // every sink downstream escapes again, so the slide printed `&gt;100`.
    const svg = buildWaterfall(parseWaterfall(
      '<li>Open <code>&gt;100</code></li><li>Close <code>80</code></li>'), {});
    assert.ok(!/&amp;gt;/.test(svg), 'the pill was escaped twice');
  });

  test('a two-bar walk does not paint two barn doors', () => {
    const svg = buildWaterfall(walk([['Open', '12.0M'], ['Close', '9.8M']]), {});
    const widths = [...svg.matchAll(/<rect[^<>]*\swidth="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(widths.every((w) => w <= 56), `a bar took ${Math.max(...widths)} units`);
  });
});
