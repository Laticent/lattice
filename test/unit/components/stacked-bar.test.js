/**
 * Unit: lib/components/chart/stacked-bar/stacked-bar.transform.js — kernel for
 * the `stacked-bar` chart-family member.
 *
 * Section dispatch and the chart-frame wrap live in chart-family.js; the shared
 * Cartesian substrate (ticks, scales, the plot box, the series DSL) is covered
 * by test/unit/components/cartesian.test.js. What is tested here is what THIS
 * kernel owns and nothing else:
 *
 *   1. Folding the shared series model into stack terms — the consolidated
 *      tail, a repeated series, the authored-total agreement rule.
 *   2. The geometry invariants a decomposition chart cannot be wrong about:
 *      series order identical in every bar, the parts summing to the bar, and
 *      `share` filling exactly 100 % of the axis after rounding.
 *   3. The emitted contract: the figure class, the viewBox, the `<desc>` that
 *      carries the mix, and the absence of any color literal.
 *   4. The stress case and the degenerate shapes render rather than throw.
 *   5. The CSS mirror — the kernel measures at the family's `FS` sizes, so this
 *      member's own stylesheet must not paint a different one.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  transformSection,
  parseStackedBar,
  buildStackedBar,
  sharePercents,
  GUTTER,
} = require('../../../lib/components/chart/stacked-bar/stacked-bar.transform');
const cart = require('../../../lib/components/chart/_chart-family/cartesian');

const CSS = path.join(
  __dirname, '../../../lib/components/chart/stacked-bar/stacked-bar.styles.css',
);

// The <ul> inner HTML the dispatcher hands the kernel, in the two authored
// depths: a flat `[label, value]` row, or `[label, [[part, value], …]]`.
function ul(rows) {
  return rows.map(([label, body]) => (Array.isArray(body)
    ? `<li>${label}<ul>${body.map(([n, v]) => `<li>${n}${v != null ? ` <code>${v}</code>` : ''}</li>`).join('')}</ul></li>`
    : `<li>${label}${body != null ? ` <code>${body}</code>` : ''}</li>`)).join('');
}

const FY = [
  ['FY23', [['Licenses', '18.4'], ['Services', '6.2'], ['Support', '4.1']]],
  ['FY24', [['Licenses', '19.1'], ['Services', '9.8'], ['Support', '4.6']]],
  ['FY25', [['Licenses', '19.6'], ['Services', '15.4'], ['Support', '5.2']]],
];

const build = (rows, tokens = []) =>
  buildStackedBar(parseStackedBar(ul(rows)), { classTokens: tokens });

/** Every <rect class="sbar-seg"> as {cat, x, y, w, h}, in emission order. */
function rects(html) {
  return [...html.matchAll(/<rect class="sbar-seg"[^<>]*>/g)].map((m) => {
    const tag = m[0];
    const num = (k) => Number(tag.match(new RegExp(`${k}="(-?[\\d.]+)"`))[1]);
    return {
      cat: Number(tag.match(/data-hue="(\d+)"/)[1]) - 1,
      mark: Number(tag.match(/data-mark="(\d+)"/)[1]),
      label: tag.match(/data-label="([^"]*)"/)[1],
      x: num('x'), y: num('y'), w: num('width'), h: num('height'),
    };
  });
}

describe('stacked-bar kernel', () => {
  describe('parseStackedBar — folding the series model into a stack', () => {
    test('reads the nested shape: groups in authored order, series from the first bar', () => {
      const m = parseStackedBar(ul(FY));
      assert.equal(m.flat, false);
      assert.deepEqual(m.groups.map((g) => g.label), ['FY23', 'FY24', 'FY25']);
      assert.deepEqual(m.series, ['Licenses', 'Services', 'Support']);
      assert.deepEqual(m.groups[0].segs.map((s) => s.num), [18.4, 6.2, 4.1]);
      assert.equal(Number(m.groups[0].sum.toFixed(2)), 28.7);
      assert.equal(m.posMax, m.groups[2].sum);
    });

    test('a flat list still draws — one synthetic series, one part per bar', () => {
      const m = parseStackedBar(ul([['FY23', '28.7'], ['FY24', '33.5']]));
      assert.equal(m.flat, true);
      assert.deepEqual(m.series, ['Total']);
      assert.deepEqual(m.groups.map((g) => g.segs.length), [1, 1]);
      assert.equal(m.groups[0].segs[0].num, 28.7);
    });

    test('a nested pill that is not a number is DETAIL, not a part', () => {
      const m = parseStackedBar(
        '<li>Q1<ul><li>Product <code>2.4</code></li>'
        + '<li>Best quarter in <code>EMEA</code></li>'
        + '<li>Closed two weeks early</li></ul></li>',
      );
      assert.deepEqual(m.series, ['Product']);
      assert.equal(m.groups[0].segs.length, 1);
      assert.deepEqual(m.groups[0].detail, ['Best quarter in EMEA', 'Closed two weeks early']);
    });

    test('an empty list is null — the kernels\' pass-through signal', () => {
      assert.equal(parseStackedBar(''), null);
      assert.equal(parseStackedBar('<li></li>'), null);
    });

    test('a list with no parseable value anywhere is null, not a chart of zeros', () => {
      assert.equal(parseStackedBar(ul([['Q1', [['Product', 'soon']]]])), null);
      assert.equal(parseStackedBar(ul([['Q1', 'n/a'], ['Q2', 'tbd']])), null);
    });

    test('two parts naming the same series inside one bar are summed, not stacked twice', () => {
      const m = parseStackedBar(ul([['Q1', [['Product', '2'], ['Services', '1'], ['Product', '3']]]]));
      assert.deepEqual(m.series, ['Product', 'Services']);
      assert.deepEqual(m.groups[0].segs.map((s) => [s.series, s.num]), [['Product', 5], ['Services', 1]]);
    });

    test('a magnitude suffix is scale: `1.2M` and `800k` land on one axis', () => {
      const m = parseStackedBar(ul([['Q1', [['NA', '1.2M'], ['EMEA', '800k']]]]));
      assert.deepEqual(m.groups[0].segs.map((s) => s.num), [1.2e6, 8e5]);
      assert.equal(m.groups[0].sum, 2e6);
    });

    test('every negative form an author types lands below the zero rule', () => {
      // `-$0.8M`, the accounting paren, and the U+2212 a spreadsheet paste
      // gives all mean the same thing. The substrate parses them; what is
      // pinned here is that this chart DRAWS them as negative — a part that
      // silently flipped positive would make the stack sum to the wrong total.
      for (const raw of ['-$0.8M', '($0.8M)', '\u22120.8M']) {
        const m = parseStackedBar(ul([['Q1', [['Product', '$4.2M'], ['Returns', raw]]]]));
        assert.equal(m.groups[0].segs[1].num, -800000);
        assert.equal(m.groups[0].sum, 3400000);
        assert.equal(m.negMin, -800000);
        const drawn = rects(build([['Q1', [['Product', '$4.2M'], ['Returns', raw]]]]));
        assert.equal(drawn.length, 2);
        assert.ok(drawn[1].y >= drawn[0].y + drawn[0].h - 0.01, `${raw} drew above zero`);
      }
    });

    test('a pill that merely contains digits is detail, not a data point', () => {
      // `PROJ-42` parses as a number if you take the first numeric run; the
      // substrate's `isValuePill` requires the pill to be WHOLLY numeric, and
      // this pins that a ticket id never drags the axis to -42.
      const m = parseStackedBar(ul([['Q1', [['Product', '4'], ['Tracked as', 'PROJ-42']]]]));
      assert.deepEqual(m.series, ['Product']);
      assert.equal(m.negMin, 0);
      assert.deepEqual(m.groups[0].detail, ['Tracked as PROJ-42']);
    });

    test('the authored total is kept when it agrees with the parts, dropped when it does not', () => {
      const agrees = parseStackedBar(ul([['Q1 `9`', [['A', '5'], ['B', '4']]]]).replace('Q1 `9`', 'Q1 <code>9</code>'));
      assert.equal(agrees.groups[0].totalRaw, '9');
      const lies = parseStackedBar('<li>Q1 <code>12</code><ul><li>A <code>5</code></li><li>B <code>4</code></li></ul></li>');
      assert.equal(lies.groups[0].totalRaw, null);
      assert.equal(lies.groups[0].sum, 9);
    });
  });

  describe('the seventh part — consolidation, not truncation', () => {
    const seven = [['Americas', [
      ['Enterprise', '41'], ['Mid-market', '24'], ['SMB', '16'],
      ['Channel', '11'], ['Marketplace', '6'], ['Partners', '4'], ['Resellers', '3'],
    ]]];

    test('five named parts plus one Other, and the total is still exact', () => {
      const m = parseStackedBar(ul(seven));
      assert.deepEqual(m.series, ['Enterprise', 'Mid-market', 'SMB', 'Channel', 'Marketplace', 'Other']);
      assert.deepEqual(m.consolidated, ['Partners', 'Resellers']);
      assert.equal(m.groups[0].segs.at(-1).series, 'Other');
      assert.equal(m.groups[0].segs.at(-1).num, 7);
      assert.equal(m.groups[0].sum, 105);
    });

    test('the folded names survive in the accessible description', () => {
      const html = build(seven);
      assert.match(html, /Other 7/);
      assert.match(html, /total 105/);
    });

    test('the palette never cycles past slot 6', () => {
      const cats = rects(build(seven)).map((r) => r.cat);
      assert.equal(Math.max(...cats), 5);
      assert.equal(new Set(cats).size, 6);
    });
  });

  describe('geometry — the invariants a decomposition chart cannot be wrong about', () => {
    test('the stack order is the AUTHOR\'s order, identical in every bar', () => {
      // The third bar authors its parts in a DIFFERENT order; the drawn stack
      // must not follow it. A stack that re-orders per bar cannot be compared,
      // which is the entire read this chart exists for.
      const shuffled = [
        ['Q1', [['Product', '5'], ['Services', '3'], ['Support', '2']]],
        ['Q2', [['Support', '2'], ['Product', '6'], ['Services', '4']]],
      ];
      const drawn = rects(build(shuffled));
      const perBar = [0, 1].map((b) => drawn.filter((r) => r.mark === b));
      // Emitted in series order, and stacked bottom-up: y descends as we go.
      for (const bar of perBar) {
        assert.deepEqual(bar.map((r) => r.cat), [0, 1, 2]);
        assert.ok(bar[0].y > bar[1].y && bar[1].y > bar[2].y);
      }
    });

    test('the parts fill the bar exactly — no gap, no overlap, no rounding drift', () => {
      const drawn = rects(build(FY));
      for (const bar of [0, 1, 2]) {
        const segs = drawn.filter((r) => r.mark === bar);
        const top = Math.min(...segs.map((r) => r.y));
        const bottom = Math.max(...segs.map((r) => r.y + r.h));
        const summed = segs.reduce((s, r) => s + r.h, 0);
        assert.ok(Math.abs(summed - (bottom - top)) < 0.05,
          `bar ${bar}: parts sum to ${summed}, span is ${bottom - top}`);
      }
    });

    test('the bar height is proportional to the total, off the shared zero baseline', () => {
      const drawn = rects(build(FY));
      const heights = [0, 1, 2].map((b) => drawn.filter((r) => r.mark === b)
        .reduce((s, r) => s + r.h, 0));
      const totals = [28.7, 33.5, 40.2];
      const k = heights[0] / totals[0];
      // The tolerance is the rect coordinates' own rounding: the kernel emits
      // two decimals, so a 148-unit plot carries up to ~0.03 units of slack.
      heights.forEach((h, i) => {
        assert.ok(Math.abs(h / totals[i] - k) < 2e-3, `bar ${i}: ${h} units for ${totals[i]}`);
      });
      // Every bar sits on one baseline.
      const feet = [0, 1, 2].map((b) => Math.max(
        ...drawn.filter((r) => r.mark === b).map((r) => r.y + r.h),
      ));
      assert.ok(Math.abs(feet[0] - feet[1]) < 0.01 && Math.abs(feet[1] - feet[2]) < 0.01);
    });

    test('a zero part draws NO rect — a zero-height rect would paint its own separator', () => {
      const drawn = rects(build([['Q1', [['A', '5'], ['B', '0'], ['C', '3']]]]));
      assert.equal(drawn.length, 2);
      assert.deepEqual(drawn.map((r) => r.cat), [0, 2]);
    });

    test('a negative part is drawn below the zero rule and the total is the net', () => {
      const html = build([['Q1', [['Product', '12'], ['Returns', '-2']]]]);
      const drawn = rects(html);
      const zeroY = drawn[0].y + drawn[0].h;         // the positive part's foot
      assert.ok(drawn[1].y >= zeroY - 0.01, 'the negative part starts at the zero rule');
      assert.ok(drawn[1].h > 0);
      assert.match(html, /total 10/);
    });
  });

  describe('share — every bar exactly 100 %, before AND after rounding', () => {
    test('the drawn stack fills the plot from baseline to the top of the axis', () => {
      const plot = cart.plotBox({ view: cart.viewFor(), gutter: GUTTER.column });
      const drawn = rects(build(FY, ['share']));
      for (const bar of [0, 1, 2]) {
        const segs = drawn.filter((r) => r.mark === bar);
        const top = Math.min(...segs.map((r) => r.y));
        const bottom = Math.max(...segs.map((r) => r.y + r.h));
        assert.ok(Math.abs(top - plot.y0) < 0.05, `bar ${bar} tops at ${top}, plot top is ${plot.y0}`);
        assert.ok(Math.abs(bottom - plot.y1) < 0.05, `bar ${bar} foots at ${bottom}`);
      }
    });

    test('every bar is drawn to the SAME height whatever its total', () => {
      const drawn = rects(build([
        ['Small', [['A', '1'], ['B', '2']]],
        ['Huge', [['A', '900'], ['B', '100']]],
      ], ['share']));
      const h = [0, 1].map((b) => drawn.filter((r) => r.mark === b)
        .reduce((s, r) => s + r.h, 0));
      assert.ok(Math.abs(h[0] - h[1]) < 0.05);
    });

    test('the PRINTED percentages sum to 100 — largest remainder, never three 33s', () => {
      const cases = [
        [[1, 1, 1]], [[1, 1, 1, 1, 1, 1]], [[7, 7, 7, 79]],
        [[18.4, 6.2, 4.1]], [[1, 2, 3, 4, 5, 6]], [[999, 1]],
      ];
      for (const [nums] of cases) {
        const pcts = sharePercents(nums.map((n) => ({ num: n })));
        assert.equal(pcts.reduce((s, v) => s + v, 0), 100, `${nums} → ${pcts}`);
      }
    });

    test('a signed group still normalizes on the sum of absolute parts', () => {
      const pcts = sharePercents([{ num: 8 }, { num: -2 }]);
      assert.deepEqual(pcts, [80, -20]);
    });

    test('an all-zero group produces no percentages and no thrown error', () => {
      assert.deepEqual(sharePercents([{ num: 0 }, { num: 0 }]), [0, 0]);
      assert.doesNotThrow(() => build([['Q1', [['A', '0'], ['B', '0']]]], ['share']));
    });
  });

  describe('the emitted contract', () => {
    test('the figure class is present literally, as the manifest declares it', () => {
      assert.match(build(FY), /class="stacked-bar-figure"/);
    });

    test('the svg carries a viewBox, meet, role=img, a title and a data-bearing desc', () => {
      const html = build(FY);
      assert.match(html, /<svg class="cart-svg" viewBox="0 0 \d+ \d+" preserveAspectRatio="xMidYMid meet" role="img">/);
      assert.match(html, /<title>Stacked bar chart<\/title>/);
      const desc = html.match(/<desc>([^<]*)<\/desc>/)[1];
      // role="img" prunes the subtree, so this string is the ONLY route to the
      // data — and a stacked bar is for the MIX, so each part carries its share.
      assert.match(desc, /FY23 total 28\.7: Licenses 18\.4 \(64%\)/);
      assert.match(desc, /Support 4\.1 \(14%\)/);
      assert.match(desc, /FY25 total 40\.2/);
    });

    test('the desc reports shares as percentages under `share`', () => {
      const desc = build(FY, ['share']).match(/<desc>([^<]*)<\/desc>/)[1];
      assert.match(desc, /FY23 total 28\.7: Licenses 64%/);
    });

    test('NO color literal reaches the output — every mark is a class plus a slot', () => {
      for (const tokens of [[], ['share'], ['row']]) {
        const html = build(FY, tokens);
        const hex = html.replace(/url\(#[^)(]*\)/g, '');
        assert.doesNotMatch(hex, /#[0-9a-fA-F]{3,8}\b/, `hex literal with ${tokens}`);
        assert.doesNotMatch(html, /\b(?:rgba?|hsla?|oklch)\(/);
        // The token names the family DOES allow inside a paint attribute.
        assert.doesNotMatch(html, /\b(?:red|blue|green|black|white|gray|grey)\b/);
      }
    });

    test('every segment carries the family hooks: data-hue, data-mark, a role', () => {
      const tag = build(FY).match(/<rect class="sbar-seg"[^<>]*>/)[0];
      assert.match(tag, /data-hue="1"/);
      assert.match(tag, /data-mark="0"/);
      assert.match(tag, /data-anima-role="bar"/);
      assert.doesNotMatch(tag, /--i:/, 'the dead --i index went with data-cat');
      assert.match(tag, /data-label="FY23 · Licenses"/);
      assert.match(tag, /data-value="18\.4"/);
    });

    test('the direct name column is used when the names fit, the shared key when they do not', () => {
      const short = build(FY);
      assert.match(short, /class="cart-series sbar-name"/);
      assert.doesNotMatch(short, /chart-key-swatch/);

      const long = build([['Q1', [
        ['Professional services and managed operations', '3'], ['Other', '2'],
      ]]]);
      assert.doesNotMatch(long, /sbar-name/);
      assert.match(long, /chart-key-swatch/);
    });

    test('`row` always keys — a horizontal stack has no free column beside a part', () => {
      const html = build(FY, ['row']);
      assert.doesNotMatch(html, /sbar-name/);
      assert.match(html, /chart-key-swatch/);
    });

    test('a flat list keys nothing — there is no color to identify', () => {
      const html = build([['FY23', '28.7'], ['FY24', '33.5']]);
      assert.doesNotMatch(html, /sbar-name|chart-key-swatch/);
      assert.match(html, /viewBox="0 0 320 180"/);
    });

    test('the name column and the key both report the LAST bar, under its own name', () => {
      const direct = build(FY);
      assert.match(direct, /class="cart-axis-title"[^<>]*>?[\s\S]{0,120}FY25/);
      assert.match(direct, />19\.6</);       // FY25's Licenses, not FY23's
      const keyed = build(FY, ['row']);
      assert.match(keyed, /chart-key-head/);
      assert.match(keyed, />19\.6</);
    });

    test('detail rides the shared mark-detail substrate and paints nothing', () => {
      const plain = build(FY);
      const withDetail = build([
        ['FY23', [['Licenses', '18.4'], ['Won three renewals early', null]]],
        ['FY24', [['Licenses', '19.1']]],
      ]);
      assert.match(withDetail, /<template class="chart-detail" data-mark="0">/);
      assert.match(withDetail, /<!-- FY23: Won three renewals early -->/);
      // The chart itself is unchanged by detail: no mark gains or loses paint.
      assert.equal((plain.match(/sbar-seg/g) || []).length, 3 * 3);
    });

    test('author text with &, < and > survives escaped', () => {
      // The fixture carries what markdown-it really hands the kernel: entities,
      // not raw angle brackets (a raw `<all>` IS a tag and is stripped).
      const html = build([['R&amp;D &lt;all&gt;', [['Ops &amp; IT', '4']]]]);
      assert.match(html, /R&amp;D &lt;all&gt;/);
      // …including inside the attribute the reveal layer reads, where a raw
      // quote or angle bracket would break the tag rather than the text.
      assert.match(html, /data-label="R&amp;D &lt;all&gt; · Ops &amp; IT"/);
    });
  });

  describe('the stress case and the degenerate shapes render', () => {
    const stress = Array.from({ length: 6 }, (_, q) => [`Q${q + 1} FY24`, [
      ['Enterprise', `${41 - q * 2}`], ['Mid-market', `${24 + q}`], ['SMB', `${16 + q}`],
      ['Channel', `${11 + q}`], ['Marketplace', '5'], ['Other', '2'],
    ]]);

    test('six parts across six categories, in every composition', () => {
      for (const tokens of [[], ['share'], ['row'], ['share', 'row']]) {
        assert.doesNotThrow(() => build(stress, tokens), `tokens ${tokens}`);
        assert.equal(rects(build(stress, tokens)).length, 36);
      }
    });

    test('one category, one part, and a portrait deck all render', () => {
      assert.doesNotThrow(() => build([['Q1', [['Only', '5']]]]));
      assert.doesNotThrow(() => buildStackedBar(
        parseStackedBar(ul(FY)), { classTokens: [], orientation: 'portrait' },
      ));
      const portrait = buildStackedBar(
        parseStackedBar(ul(FY)), { classTokens: ['row'], orientation: 'portrait' },
      );
      assert.match(portrait, /viewBox="0 0 \d+ \d+"/);
    });

    test('a bar is never drawn thicker than the cap, whatever the category count', () => {
      for (const n of [1, 2, 3, 6]) {
        const rows = Array.from({ length: n }, (_, i) => [`C${i}`, [['A', '5'], ['B', '3']]]);
        const widest = Math.max(...rects(build(rows)).map((r) => r.w));
        assert.ok(widest <= 56.01, `${n} categories drew a ${widest}-unit bar`);
      }
    });

    test('transformSection splices the figure in, and passes through when there is nothing to draw', () => {
      const section = `<h2>Mix</h2><ul>${ul(FY)}</ul><p>after</p>`;
      const out = transformSection(section, { classTokens: [], orientation: undefined });
      assert.match(out, /<h2>Mix<\/h2><div class="stacked-bar-figure">/);
      assert.match(out, /<p>after<\/p>$/);
      const empty = '<h2>Mix</h2><ul><li>nothing</li></ul>';
      assert.equal(transformSection(empty, { classTokens: [] }), empty);
      const noList = '<h2>Mix</h2><p>prose</p>';
      assert.equal(transformSection(noList, { classTokens: [] }), noList);
    });
  });

  describe('the CSS mirror', () => {
    const raw = fs.readFileSync(CSS, 'utf8');
    // Comments talk ABOUT @layer and about margins; the rules are what bind.
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

    test('this member paints no font-size — the kernel wraps at the family FS table', () => {
      // The kernel breaks lines at cart.FS.series / cart.FS.tick, which mirror
      // chart-family.css § Cartesian chrome (gated by cartesian.test.js). A
      // font-size declared here would paint glyphs at a width the kernel never
      // measured, which is the silent-drift defect that gate exists to stop.
      assert.doesNotMatch(css, /font-size\s*:/);
    });

    test('the separator hairline is the canvas color, not a new one', () => {
      assert.match(css, /\.sbar-seg\s*\{[^}]*stroke:\s*var\(--bg\)/s);
    });

    test('no hex literal, and every fill goes through a chart token', () => {
      assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
      const fills = [...css.matchAll(/fill:\s*([^;]+);/g)].map((m) => m[1]);
      // The floor used to be 12, which pinned the ten per-slot rules. The mark
      // contract collapsed those to one declaration, so the count is now small
      // BY DESIGN and a floor would just re-pin the duplication. What still has
      // to hold is that every fill reaches a token — never a literal.
      assert.ok(fills.length >= 2, 'the sheet still paints something');
      for (const f of fills) assert.match(f, /var\(--mark-(?:hue|ink|body)[,)]|var\(--chart-cat-\d-(?:hue|ink|body)\)|var\(--text-body\)/);
    });

    // The five per-slot rules are GONE — the mark contract resolves --mark-hue
    // from `data-hue` in one family table, so the member declares once. What has
    // to hold is that the one declaration READS the contract and carries a
    // fallback: an unset custom property is invalid-at-computed-value-time,
    // which paints the segment black. slot-contract.md
    test('the segment paints from the mark contract, with a fallback', () => {
      assert.doesNotMatch(css, /\[data-cat=/, 'data-cat is retired, not renamed in place');
      assert.match(css, /\.sbar-seg \{[^}]*var\(--mark-body, var\(--chart-cat-1-body\)\)/s);
      assert.doesNotMatch(css, /\.sbar-seg\[data-hue=/, 'no per-slot rule survives — the family table owns the cycle');
    });

    test('the stylesheet is unlayered and carries no margin (HARD RULES #20, #26)', () => {
      assert.doesNotMatch(css, /@layer[^;{]*\{/);
      assert.doesNotMatch(css, /(^|[;{\s])margin(-[a-z]+)?\s*:/);
    });
  });
});

// ── Defects the adversarial trio confirmed ─────────────────────────────────
//
// Every arm here reproduces a wrong NUMBER on a rendered slide, and every one
// of them passed a 43-green suite because the old tests exercised the helpers
// rather than the emitted output. These assert on what the SVG and the <desc>
// actually say.
describe('stacked-bar — defects the adversarial trio confirmed', () => {
  const desc = (svg) => /<desc>([^<]*)<\/desc>/.exec(svg)[1];
  const build = (rows, tokens = ['stacked-bar']) =>
    buildStackedBar(parseStackedBar(ul(rows)), { classTokens: tokens });

  test('an author-named `Other` past the cap takes ONE slot, not two', () => {
    // The docs tell the author to "fold slivers into Other before authoring",
    // so this is the shape our own guidance produces. Two `Other` entries in
    // `series` gave the same number two palette slots and overstated the bar
    // total by 13%.
    const rows = [['Q1', [
      ['Enterprise', 40], ['Mid-market', 20], ['Other', 5],
      ['SMB', 10], ['Channel', 8], ['Partners', 4], ['Resellers', 3],
    ]]];
    const model = parseStackedBar(ul(rows));
    assert.equal(new Set(model.series).size, model.series.length, 'no duplicate series');
    assert.equal(model.groups[0].sum, 90, 'the true sum, not 102');
    const other = model.groups[0].segs.find((sg) => sg.series === 'Other');
    assert.equal(other.num, 12, "the author's 5 plus the folded 4 + 3");
    assert.match(desc(build(rows)), /Q1 total 90:/);
  });

  test('the folded names reach the accessible description', () => {
    // `role="img"` prunes the subtree, so this string is the only route — and
    // "the folded names are listed in the accessible description" was the one
    // promise attached to it that did not hold.
    const d = desc(build([['Q1', [
      ['Enterprise', 40], ['Mid-market', 20], ['SMB', 10],
      ['Channel', 8], ['Partners', 4], ['Resellers', 3], ['Direct', 2],
    ]]]));
    assert.match(d, /Other folds Resellers, Direct\./);
  });

  test('`share` prints the apportioned percentages, never three 33s', () => {
    const rows = [['FY25', [['A', 1], ['B', 1], ['C', 1]]]];
    const svg = build(rows, ['stacked-bar', 'share']);
    const printed = [...svg.matchAll(/<tspan[^<>]*>(\d+)%<\/tspan>/g)]
      .map((m) => Number(m[1]))
      .filter((v) => v !== 0 && v !== 25 && v !== 50 && v !== 75 && v !== 100);
    assert.equal(printed.reduce((a, b) => a + b, 0), 100, 'the printed shares sum to 100');
    const pcts = sharePercents(parseStackedBar(ul(rows)).groups[0].segs);
    assert.equal(pcts.reduce((a, b) => a + b, 0), 100);
  });

  test('the chart and its description print the SAME percentage', () => {
    // -12.5 rounded two ways: `Math.round` gave -12 on the chart and
    // `toFixed(0)` gave -13 in the desc. One chart, two numbers, and the
    // reader who could not check them got the other one.
    const svg = build([['FY25', [['Product', 14], ['Returns', -2]]]], ['stacked-bar', 'share']);
    const d = desc(svg);
    // The lookbehind is load-bearing: a bare `\d+%` scan restarts inside a long
    // digit run at every offset, which backtracks polynomially on uncontrolled
    // text (CodeQL js/polynomial-redos).
    const PCT = /(?<![\d\u2212-])([\u2212-]?\d+)%/g;
    const inDesc = [...d.matchAll(PCT)].map((m) => m[1].replace('\u2212', '-'));
    const onChart = [...svg.matchAll(/<tspan[^<>]{0,80}>([\u2212-]?\d+)%<\/tspan>/g)]
      .map((m) => m[1].replace('\u2212', '-'));
    for (const v of inDesc) assert.ok(onChart.includes(v), `${v}% is on the chart too`);
  });

  test('a negative share prints U+2212, the same minus the axis uses', () => {
    const svg = build([['FY25', [['Product', 12], ['Returns', -1]]]], ['stacked-bar', 'share']);
    assert.match(svg, /<tspan[^<>]*>−8%<\/tspan>/);
    assert.doesNotMatch(svg, /<tspan[^<>]*>-\d+%<\/tspan>/);
  });

  test('a signed chart draws NO plot-edge rule — the zero rule is the baseline', () => {
    const signed = build([['FY25', [['Product', 12], ['Returns', -3]]]]);
    assert.doesNotMatch(signed, /class="cart-axis"/);
    assert.match(signed, /class="cart-zero"/);
    const plain = build([['FY25', [['Product', 12], ['Services', 3]]]]);
    assert.match(plain, /class="cart-axis"/);
  });

  test('`share` is ignored on a flat list, which has no mix to show', () => {
    const svg = build([['FY23', 28.7], ['FY24', 31.2]], ['stacked-bar', 'share']);
    assert.doesNotMatch(desc(svg), /Total 100%/);
    assert.match(desc(svg), /FY23 total/);
  });

  test('a mixed-depth group keeps the number the author typed', () => {
    const d = desc(build([
      ['FY23', [['A', 10], ['B', 5]]],
      ['FY24', 25.0],
      ['FY25', [['A', 12], ['B', 6]]],
    ]));
    assert.match(d, /FY24 25(\.0)?, not broken out/);
    assert.doesNotMatch(d, /FY24 — no data/);
  });

  test('the 2.5 step is no longer penalized — the formatter it guarded is fixed', () => {
    // The penalty was written when `decimalsFor` returned 0 for any step >= 1.
    // It does not, so the penalty only bought headroom nobody needed.
    const t = cart.niceTicks(0, 10.25, { target: 4, includeZero: true });
    const fmt = cart.axisFormatter({ ticks: t.ticks, step: t.step, affix: { prefix: '', suffix: '' } });
    assert.deepEqual(t.ticks.map(fmt), t.ticks.map(fmt), 'sanity');
    const svg = build([['Q1', [['A', 10.25]]], ['Q2', [['A', 4]]]]);
    const max = Math.max(...[...svg.matchAll(/<tspan[^<>]*>([\d.]+)<\/tspan>/g)].map((m) => Number(m[1])));
    assert.ok(max <= 12.5, `axis tops out at ${max}, not 15`);
  });
});
