/**
 * Unit: lib/components/chart/_chart-family/cartesian.js — the shared plot
 * substrate for the Cartesian chart members (bar, stacked-bar, line,
 * waterfall, scatter, slope, bullet).
 *
 * This kernel's blast radius is seven components, so the arms here are written
 * against the things a member would otherwise get silently wrong:
 *
 *   1. Ticks — the nice-number ladder, hostile domains, and the float-drift
 *      the generator exists to avoid (a step of 0.1 accumulated by addition
 *      prints `0.30000000000000004`).
 *   2. Value parsing — the magnitude suffix is SCALE, not decoration, and `%`
 *      is deliberately not a magnitude.
 *   3. Formatting — the axis speaks the author's own affix, and never emits a
 *      doubled magnitude (`$4MM`).
 *   4. The series DSL — the detail-vs-data rule, which is what keeps a detail
 *      bullet ending in inline code from being plotted at zero.
 *   5. Scales and the plot box.
 *   6. The emitted chrome carries NO color (HARD RULE #3) and the class
 *      vocabulary the family stylesheet paints.
 *   7. The CSS MIRROR: the `FS` table here and the `font-size` values in
 *      chart-family.css § Cartesian chrome must agree exactly. Silent drift
 *      wraps text to a width the glyphs do not occupy.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../../../lib/components/chart/_chart-family/cartesian');

const FAMILY_CSS = path.join(
  __dirname, '..', '..', '..',
  'lib/components/chart/_chart-family/chart-family.css',
);

/** Build the <ul> inner HTML the dispatcher hands a kernel. */
function ul(items) {
  return items.map((i) => `<li>${i}</li>`).join('');
}

describe('cartesian — ticks', () => {
  test('picks a nice step off the 1/2/2.5/5/10 ladder', () => {
    assert.equal(C.niceStep(0.9), 1);
    assert.equal(C.niceStep(1.7), 2);
    assert.equal(C.niceStep(2.3), 2.5);
    assert.equal(C.niceStep(4), 5);
    assert.equal(C.niceStep(7), 10);
    assert.equal(C.niceStep(230), 250);
  });

  test('covers the data and lands near the requested tick count', () => {
    const t = C.niceTicks(0, 4.7);
    assert.ok(t.max >= 4.7, 'domain must cover the data');
    assert.equal(t.min, 0);
    assert.ok(t.ticks.length >= 3 && t.ticks.length <= 6);
    assert.equal(t.ticks[0], t.min);
    assert.equal(t.ticks[t.ticks.length - 1], t.max);
  });

  test('includeZero pulls the domain to zero; false lets the data fill the box', () => {
    assert.equal(C.niceTicks(60, 75, { includeZero: true }).min, 0);
    assert.ok(C.niceTicks(60, 75, { includeZero: false }).min > 0);
  });

  test('an all-negative series keeps zero as the TOP of the domain', () => {
    const t = C.niceTicks(-40, -10);
    assert.equal(t.max, 0);
    assert.ok(t.min <= -40);
  });

  test('a flat series still gets a readable axis rather than a zero-height plot', () => {
    const zero = C.niceTicks(0, 0);
    assert.ok(zero.max > zero.min, 'a domain of 0..0 must be widened');
    const flat = C.niceTicks(7, 7);
    assert.ok(flat.max > flat.min);
    assert.ok(flat.ticks.length >= 2);
  });

  test('ticks are free of binary-float drift', () => {
    // Accumulated by repeated addition this prints 0.30000000000000004.
    for (const t of C.niceTicks(0, 0.5).ticks) {
      assert.equal(String(t).length <= 6, true, `tick ${t} carries float noise`);
    }
    for (const t of C.niceTicks(0, 9).ticks) assert.equal(t, Math.round(t * 1e6) / 1e6);
  });

  test('a hostile domain never produces an unbounded tick set', () => {
    for (const [lo, hi] of [
      [0, 1e12], [-1e9, 1e9], [0.0001, 0.0003], [-1e-9, 1e-9], [1e-6, 1e6],
    ]) {
      const t = C.niceTicks(lo, hi);
      assert.ok(t.ticks.length > 0 && t.ticks.length < 60,
        `[${lo},${hi}] produced ${t.ticks.length} ticks`);
      assert.ok(t.ticks.every(Number.isFinite));
    }
  });

  test('non-finite input degrades to a usable axis instead of NaN', () => {
    for (const [lo, hi] of [[NaN, NaN], [undefined, undefined], [Infinity, 10]]) {
      const t = C.niceTicks(lo, hi);
      assert.ok(t.ticks.every(Number.isFinite), `[${lo},${hi}] leaked a non-finite tick`);
      assert.ok(t.ticks.length > 0);
    }
  });
});

describe('cartesian — value parsing', () => {
  test('the magnitude suffix is applied, because an axis has to mix magnitudes', () => {
    assert.equal(C.parseValue('1.2M'), 1200000);
    assert.equal(C.parseValue('12k'), 12000);
    assert.equal(C.parseValue('800K'), 800000);
    assert.equal(C.parseValue('3B'), 3e9);
    assert.equal(C.parseValue('2bn'), 2e9);
  });

  test('% is NOT a magnitude', () => {
    assert.equal(C.parseValue('12%'), 12);
    assert.equal(C.parseValue('99.5%'), 99.5);
  });

  test('commas, currency and signs are tolerated', () => {
    assert.equal(C.parseValue('$1,200'), 1200);
    assert.equal(C.parseValue('-3.5'), -3.5);
    assert.equal(C.parseValue('  42  '), 42);
  });

  test('a non-numeric pill is NaN, not zero — zero would be plotted as data', () => {
    assert.ok(Number.isNaN(C.parseValue('EMEA')));
    assert.ok(Number.isNaN(C.parseValue('')));
    assert.ok(Number.isNaN(C.parseValue(null)));
  });
});

describe('cartesian — tick formatting', () => {
  test('compacts only when the step is also large, so 0..1500 stays whole', () => {
    assert.equal(C.formatTick(1000, { step: 500 }), '1000');
    assert.equal(C.formatTick(1500000, { step: 500000 }), '1.5M');
    assert.equal(C.formatTick(20000, { step: 10000 }), '20k');
  });

  test('every tick on one axis compacts to the SAME unit', () => {
    // A mixed axis (0 · 500k · 1M · 1.5M) is a visible defect — a reader
    // re-scales their eye at every gridline. The unit is a property of the
    // AXIS, chosen once from its widest tick.
    for (const hi of [1.4e6, 9.5e3, 1.1e9, 1500]) {
      const { ticks, step } = C.niceTicks(0, hi);
      const fmt = C.axisFormatter({ ticks, step });
      const units = ticks.map((t) => fmt(t).replace(/[\d.,-]/g, ''));
      assert.equal(new Set(units).size, 1,
        `mixed units on the 0..${hi} axis: ${ticks.map(fmt).join(' · ')}`);
    }
  });

  test('speaks the author\'s own affix', () => {
    assert.equal(C.formatTick(4000000, { step: 1000000, prefix: '$' }), '$4M');
    assert.equal(C.formatTick(50, { step: 25, suffix: '%' }), '50%');
  });

  test('never doubles the magnitude letter', () => {
    // A series authored as `$1.2M` yields suffix 'M'; an axis that ALSO
    // compacts to millions must not print `$4MM`.
    const affix = C.affixOf(['$1.2M', '$3.4M', '$5.6M']);
    assert.equal(affix.suffix, '', 'a magnitude letter must not survive as an affix');
    const { ticks, step } = C.niceTicks(0, C.parseValue('$5.6M'));
    const fmt = C.axisFormatter({ ticks, step, affix });
    for (const t of ticks) {
      assert.ok(!/MM|kk|BB/.test(fmt(t)), `doubled magnitude in tick "${fmt(t)}"`);
    }
    assert.equal(fmt(4000000), '$4M');
  });

  test('a real unit is NOT a magnitude and survives onto the axis', () => {
    // `kg` is a unit; `k` is a magnitude. Getting this backwards either eats
    // the unit or multiplies the number by a thousand.
    assert.equal(C.parseValue('12kg'), 12);
    assert.equal(C.affixOf(['12kg', '18kg']).suffix, 'kg');
    assert.equal(C.affixOf(['12%', '18%']).suffix, '%');
  });

  test('a mixed-unit series adopts no affix, which is the honest read', () => {
    assert.deepEqual(C.affixOf(['$4M', '12%']), { prefix: '', suffix: '' });
  });
});

describe('cartesian — the series DSL', () => {
  test('parses the flat shape', () => {
    const m = C.parseSeries(ul(['Alpha <code>12</code>', 'Beta <code>7</code>']));
    assert.equal(m.flat, true);
    assert.deepEqual(m.groups.map((g) => g.label), ['Alpha', 'Beta']);
    assert.deepEqual(m.groups.map((g) => g.num), [12, 7]);
    assert.equal(m.min, 7);
    assert.equal(m.max, 12);
  });

  test('parses the nested multi-series shape and keeps authored series order', () => {
    const m = C.parseSeries(
      '<li>Q1<ul><li>Product <code>2.4</code></li><li>Services <code>1.8</code></li></ul></li>' +
      '<li>Q2<ul><li>Product <code>3.0</code></li><li>Services <code>2.2</code></li></ul></li>');
    assert.equal(m.flat, false);
    assert.deepEqual(m.series, ['Product', 'Services']);
    assert.deepEqual(m.groups.map((g) => g.label), ['Q1', 'Q2']);
    assert.deepEqual(m.groups[0].points.map((p) => p.num), [2.4, 1.8]);
  });

  test('a nested bullet with no pill is DETAIL, not a data point at zero', () => {
    const m = C.parseSeries(
      '<li>Q1<ul><li>Product <code>2.4</code></li><li>Closed two weeks early</li></ul></li>');
    assert.deepEqual(m.groups[0].points.map((p) => p.series), ['Product']);
    assert.deepEqual(m.groups[0].detail, ['Closed two weeks early']);
  });

  test('a nested bullet whose pill is NOT a number is DETAIL — the rule that matters', () => {
    // This is the case a presence-only test gets wrong: the bullet ends in
    // inline code, but the code is a region, not a measurement.
    const m = C.parseSeries(
      '<li>Q1<ul><li>Revenue <code>2.4</code></li><li>Best quarter in <code>EMEA</code></li></ul></li>');
    assert.deepEqual(m.groups[0].points.map((p) => p.series), ['Revenue']);
    assert.equal(m.groups[0].detail.length, 1);
    assert.match(m.groups[0].detail[0], /EMEA/);
  });

  test('returns null when there is nothing to draw — the pass-through signal', () => {
    assert.equal(C.parseSeries(''), null);
    assert.equal(C.parseSeries(ul(['Just a label'])), null);
  });

  test('reports series past the cap rather than truncating in silence', () => {
    const inner = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
      .map((s, i) => `<li>${s.toUpperCase()} <code>${i + 1}</code></li>`).join('');
    const m = C.parseSeries(`<li>Q1<ul>${inner}</ul></li>`);
    assert.equal(m.series.length, 6);
    assert.deepEqual(m.seriesOverflow, ['G']);
  });

  test('carries the authored group total alongside nested points', () => {
    const m = C.parseSeries(
      '<li>Q1 <code>4.2</code><ul><li>Product <code>2.4</code></li><li>Services <code>1.8</code></li></ul></li>');
    assert.equal(m.groups[0].total, 4.2);
    assert.deepEqual(m.groups[0].points.map((p) => p.num), [2.4, 1.8]);
  });
});

describe('cartesian — scales and the plot box', () => {
  test('linearScale maps the domain onto the range, inverted for a value axis', () => {
    const p = C.plotBox({});
    const s = C.linearScale([0, 100], [p.y1, p.y0]);
    assert.equal(s(0), p.y1, 'zero sits on the baseline');
    assert.equal(s(100), p.y0, 'the maximum sits at the top');
    assert.equal(s(50), (p.y0 + p.y1) / 2);
  });

  test('a zero-span domain pins to the range midpoint instead of dividing by zero', () => {
    const s = C.linearScale([5, 5], [100, 0]);
    assert.equal(s(5), 50);
    assert.ok(Number.isFinite(s(9)));
  });

  test('bandScale centers each band in its slot and never returns a negative width', () => {
    const b = C.bandScale(4, [0, 100]);
    assert.ok(b.width > 0 && b.width < b.step);
    for (let i = 0; i < 4; i++) {
      assert.ok(b.start(i) >= 0 && b.start(i) + b.width <= 100, `band ${i} escapes the range`);
      assert.ok(Math.abs(b.center(i) - (b.start(i) + b.width / 2)) < 1e-9);
    }
    for (const n of [0, 1]) {
      const one = C.bandScale(n, [0, 100]);
      assert.ok(Number.isFinite(one.width) && one.width >= 0);
      assert.ok(Number.isFinite(one.center(0)));
    }
  });

  test('the plot box respects gutter overrides and stays inside the viewBox', () => {
    const p = C.plotBox({ view: C.VIEW.landscape, gutter: { left: 44 } });
    assert.equal(p.x0, 44);
    assert.equal(p.x1, C.VIEW.landscape.w - C.GUTTER.right);
    assert.ok(p.w > 0 && p.h > 0);
  });

  test('portrait gets its own taller viewBox; square keeps landscape', () => {
    assert.deepEqual(C.viewFor('portrait'), C.VIEW.portrait);
    assert.deepEqual(C.viewFor('square'), C.VIEW.landscape);
    assert.deepEqual(C.viewFor(undefined), C.VIEW.landscape);
    assert.ok(C.VIEW.portrait.h > C.VIEW.landscape.h);
  });
});

describe('cartesian — the emitted chrome', () => {
  const plot = C.plotBox({});
  const { ticks, step } = C.niceTicks(0, 100);
  const scale = C.linearScale([0, 100], [plot.y1, plot.y0]);

  test('emits the family class vocabulary the stylesheet paints', () => {
    const grid = C.buildGrid({ plot, ticks, scale });
    assert.match(grid, /class="cart-grid"/);
    assert.match(grid, /class="cart-zero"/, 'zero must be its own class, not a styled gridline');
    assert.match(C.buildAxisRule({ plot }), /class="cart-axis"/);
    assert.match(C.buildValueTicks({ plot, ticks, scale, step }), /class="cart-tick"/);
    assert.match(C.buildAxisTitle('Cost', { x: 100, y: 10 }), /class="cart-axis-title"/);
  });

  test('emits NO color — palette lives in CSS (HARD RULE #3)', () => {
    const out = [
      C.buildGrid({ plot, ticks, scale }),
      C.buildAxisRule({ plot }),
      C.buildValueTicks({ plot, ticks, scale, step }),
      C.buildCategoryLabels({ plot, labels: ['Q1', 'Q2'], center: (i) => 100 + i * 60, width: 50 }),
      C.buildValueLabel('4.2', { x: 10, y: 10 }),
      C.buildAxisTitle('Cost', { x: 100, y: 10 }),
    ].join('');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(out), 'a hex literal reached the emitted SVG');
    assert.ok(!/\b(?:rgb|hsl|oklch)\(/.test(out), 'a color function reached the emitted SVG');
    assert.ok(!/\bfill\s*[:=]\s*"?(?!none)[a-z]/.test(out), 'a named fill reached the emitted SVG');
  });

  test('the fill defs name TOKENS, never a color, and are document-unique', () => {
    const a = C.buildFillDefs({ slots: [1, 2] });
    const b = C.buildFillDefs({ slots: [1, 2] });
    assert.match(a.defs, /var\(--chart-cat-1-hue\)/);
    assert.match(a.defs, /var\(--chart-fill-top-l\)/);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(a.defs));
    assert.notEqual(a.id(1), b.id(1),
      'two charts on one slide would silently paint with each other\'s stops');
    assert.match(a.url(1), /^url\(#.+\)$/);

    const s = C.buildFillDefs({ kind: 'state', slots: ['pass', 'fail'] });
    assert.match(s.defs, /var\(--state-pass-hue\)/);
  });

  test('category labels are culled rather than overprinted when they cannot fit', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Business unit ${i}`);
    const out = C.buildCategoryLabels({
      plot, labels: many, center: (i) => plot.x0 + i * 4, width: 40,
    });
    const drawn = (out.match(/class="cart-cat"/g) || []).length;
    assert.ok(drawn > 0, 'culling must not remove every label');
    assert.ok(drawn < many.length, 'colliding labels must be culled, not overprinted');
  });
});

describe('cartesian — the CSS mirror', () => {
  // The kernel breaks lines and culls ticks against `FS`; the stylesheet paints
  // the font sizes. A silent drift wraps text to a width the glyphs do not
  // occupy, which is invisible until a label clips.
  const css = fs.readFileSync(FAMILY_CSS, 'utf8');

  const PAIRS = [
    ['cart-tick', 'tick'],
    ['cart-cat', 'cat'],
    ['cart-value', 'value'],
    ['cart-series', 'series'],
    ['cart-axis-title', 'axisTitle'],
  ];

  for (const [cls, key] of PAIRS) {
    test(`.${cls} font-size matches FS.${key}`, () => {
      const rule = css.match(
        new RegExp(`\\.chart-frame\\s+\\.${cls}\\s*\\{([^}]*)\\}`));
      assert.ok(rule, `no .${cls} rule in chart-family.css`);
      const fontSize = rule[1].match(/font-size:\s*([\d.]+)px/);
      assert.ok(fontSize, `.${cls} declares no px font-size`);
      assert.equal(Number(fontSize[1]), C.FS[key],
        `.${cls} paints ${fontSize[1]}px but the kernel wraps to FS.${key} = ${C.FS[key]}`);
    });
  }

  test('the Cartesian chrome block is unlayered and hex-free', () => {
    // Start AFTER the section's own header comment and strip every remaining
    // comment: the block's prose explains why `@layer` is not used and why a
    // hex would be wrong, so a naive scan fails on the explanation rather than
    // on a rule. The ownership gates strip comments for the same reason.
    const marker = css.indexOf('CARTESIAN CHROME');
    assert.ok(marker > 0, 'the Cartesian chrome block is missing');
    const block = css
      .slice(css.indexOf('*/', marker) + 2)
      .replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(block.includes('.cart-grid'), 'the Cartesian chrome rules are missing');
    assert.ok(!/@layer/.test(block), '@layer is inert here and loses the cascade (#26)');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), 'a hex literal in layout CSS (#3)');
    assert.ok(!/(^|[;{\s])margin(-[a-z]+)?\s*:\s*(?!0\s*;)/.test(block),
      'no margin in engine layout CSS (#20)');
  });
});
