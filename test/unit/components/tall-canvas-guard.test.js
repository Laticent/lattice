'use strict';
/**
 * The tall portrait canvas never prints a chart's type smaller than main's fixed canvas
 * (engineering/decisions/2026-11-03-responsive-tables.md § 31, "only for the header it was measured under").
 *
 * An independent checker measured three regressions in the first spine (2026-11-11), each pinned here:
 * - a slide whose header is taller than the one the box table was measured under (a source line, an eyebrow,
 *   a long title, a venue) drew a canvas taller than its real box, and `meet` shrank every label;
 * - a keyed quadrant's key grew with the tall plane, widened the drawing to 722 units and shrank the plane's labels;
 * - the column key's cell was priced at the flat glyph average, so a name of wide glyphs ran its value into the
 *   next column.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const { JSDOM } = require('jsdom');
const { transformChartSection } = require('../../../lib/transformers/chart-frame');
const { resetRenderIds } = require('../../../lib/core/render-ids');
const { chartBoxAspect, BOX_FILL } = require('../../../lib/plugins/chart-family/shared/chart-box');

const md = new MarkdownIt({ html: true });
const doc = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
const STORY = 9 / 16;

const LINE = '- Q1 `120`\n- Q2 `180`\n- Q3 `240`\n- Q4 `310`';
const QUAD = '- Quick Wins\n  - Weekly signal digest `{2, 82}`\n  - Slack intake bot `{3, 72}`\n- Strategic Bets\n  - Scoring model v2 `{8, 88}`\n  - Decision-log API `{7, 74}`\n- Defer\n  - Per-team weighting UI `{2, 28}`';

function draw(source, cls, aspect, opts) {
  resetRenderIds('');
  const out = transformChartSection(md.render(source), cls, 'portrait', undefined, null, aspect, opts);
  assert.ok(out.transformed, `${cls} drew`);
  return doc(out.html).querySelector('svg');
}
const viewBox = (svg) => svg.getAttribute('viewBox').split(/\s+/).map(Number);

// Every kind this canvas rule reached is on the chart form kernel now (`kernel.form`, chart-family.dispatch.js), and on a
// phone page the kernel sizes its canvas from the slide's own header (`formBoxPx`): a source line, a second title line or
// a venue take their height off the box, so the chart draws shorter instead of keeping the fixed canvas. The invariant
// the rule existed for (never smaller type than the fixed canvas) is pinned below for every kind it covered.
const FIXED = 'line';

describe('the tall canvas is only for the header it was measured under', () => {
  const plainH = viewBox(draw(`## Revenue grew\n\n${LINE}`, FIXED, STORY))[3];

  test('a plain story slide takes the box-shaped canvas', () => {
    assert.ok(plainH > 300, `a one-line title gets the tall canvas (height ${plainH})`);
  });

  for (const [name, source, cls] of [
    ['a source line', `## Revenue grew\n\n${LINE}\n\nSource: finance ledger, FY26.`, FIXED],
    ['a title past one line', `## Revenue grew in every quarter of the year, and fastest in the fourth\n\n${LINE}`, FIXED],
    ['a venue', `## Revenue grew\n\n${LINE}`, `${FIXED} venue-hall`],
  ]) {
    test(`${name} takes its height off the chart's box`, () => {
      const svg = draw(source, cls, STORY);
      const [, , w, h] = viewBox(svg);
      assert.ok(svg.hasAttribute('data-form-box'), `${name}: the kernel drew it`);
      assert.equal(w, 320);
      assert.ok(h < plainH, `${name}: ${h} high, under the plain slide's ${plainH}`);
    });
  }

  test('`@callout{…}` notes do not count as a source line, but a drawing they make taller than the box takes the fixed canvas', () => {
    const src = `## Revenue grew\n\n${LINE}\n\n\`@callout{[{Peak quarter, for=Q4}]}\``;
    const [, , w, h] = viewBox(draw(src, FIXED, STORY));
    const fixed = viewBox(draw(src, FIXED, STORY, { fixedCanvas: true }));
    const tallShape = 0.88 / 0.67; // chart-box.js: BOX_FILL over the 9:16 chart box
    assert.ok(h / w <= tallShape * 1.01 || (w === fixed[2] && h === fixed[3]),
      `a noted line keeps the box's shape (${w} x ${h}) or draws as on the fixed canvas (${fixed[2]} x ${fixed[3]})`);
  });

  test('stacked lead paragraphs keep main\'s fixed canvas', () => {
    const lead = 'Revenue grew in every quarter, and fastest in the fourth, as the launch landed with the enterprise accounts.';
    const src = `## Revenue grew.\n\n${lead}\n\n${lead}\n\n${lead}\n\n${LINE}`;
    assert.deepEqual(viewBox(draw(src, FIXED, STORY)), viewBox(draw(src, FIXED, STORY, { fixedCanvas: true })));
  });

  // The invariant itself, not a proxy for it: whatever canvas the frame picks, its drawing fits the chart box at a scale
  // at least the fixed canvas's, so its labels print at least as large. Round 3's review beat a shape-only check with a
  // key that grew wider, not taller (a long series name at mobile, 21.7 to 11.9px).
  const MOBILE = 9 / 19.5;
  const SERIES = '- Q1\n  - North `60`\n  - South `40`\n- Q2\n  - North `75`\n  - South `52`\n- Q3\n  - North `90`\n  - South `70`';
  const LONG = ['2024', '2025', '2026'].map((y, i) => `- ${y}\n  - Europe mid-market and SMB \`${10 + i}\`\n  - Asia Pacific partners \`${13 + i}\`\n  - Latin America direct \`${16 + i}\`\n  - North America \`${19 + i}\``).join('\n');
  for (const [name, src, cls] of [
    ['a keyed bar', `## Revenue grew\n\n${SERIES}`, 'bar'],
    ['a noted bar', `## Revenue grew\n\n${LINE}\n\n\`@callout{[{Peak quarter, for=Q4}, {Launch, for=Q2}]}\``, 'bar'],
    ['a stacked bar with long series names', `## Revenue by region.\n\n${LONG}`, 'stacked-bar'],
    ['a keyed line with long series names', `## Revenue by region.\n\n${LONG}`, 'line'],
    ['a plain line', `## Revenue grew\n\n${LINE}`, 'line'],
  ]) {
    for (const [size, aspect] of [['story', STORY], ['mobile', MOBILE]]) {
      test(`${name} at ${size} prints at least as large as on the fixed canvas`, () => {
        const box = chartBoxAspect(aspect) / BOX_FILL;
        const scale = ([, , w, h]) => Math.min(box / w, 1 / h);
        const chosen = viewBox(draw(src, cls, aspect));
        const fixed = viewBox(draw(src, cls, aspect, { fixedCanvas: true }));
        assert.ok(scale(chosen) >= scale(fixed) * 0.999, `${chosen.join(' ')} fits the box at ${scale(chosen).toFixed(5)}, the fixed ${fixed.join(' ')} at ${scale(fixed).toFixed(5)}`);
      });
    }
  }

  test('a kind on the chart form kernel takes its box from its own header: a source line makes its canvas shorter', () => {
    const plain = draw(`## Revenue grew\n\n${LINE}`, 'line', STORY);
    const sourced = draw(`## Revenue grew\n\n${LINE}\n\nSource: finance ledger, FY26.`, 'line', STORY);
    assert.ok(plain.hasAttribute('data-form-box') && sourced.hasAttribute('data-form-box'), 'the kernel drew both');
    assert.equal(viewBox(plain)[2], 320);
    assert.ok(viewBox(sourced)[3] < viewBox(plain)[3], `${viewBox(sourced)[3]} under a source line, ${viewBox(plain)[3]} without`);
    // The box rides on the drawing, and drawing again in it reproduces the export (the fluid runtime's check).
    const [bw, bh] = sourced.getAttribute('data-form-box').split(' ').map(Number);
    const again = draw(`## .\n\n${LINE}`, 'line', STORY, { formBoxPx: [bw, bh] });
    assert.deepEqual(viewBox(again), viewBox(sourced));
  });
});

describe('a keyed quadrant on the tall plane keeps the wide plane\'s key type', () => {
  test('the cohort key does not widen the drawing', () => {
    const tall = viewBox(draw(`## Where the bets sit\n\n${QUAD}`, 'quadrant cohort', STORY));
    const fixed = viewBox(draw(`## Where the bets sit\n\n${QUAD}`, 'quadrant cohort', 0.8));
    assert.ok(tall[2] <= fixed[2] + 1, `tall ${tall[2]} wide, the 4:5 drawing ${fixed[2]}: the key did not grow`);
    const fs = (svg) => Math.min(...[...svg.querySelectorAll('text.chart-key-label')].map((t) => Number(t.getAttribute('font-size'))));
    const tallKey = fs(draw(`## Where the bets sit\n\n${QUAD}`, 'quadrant cohort', STORY));
    const fixedKey = fs(draw(`## Where the bets sit\n\n${QUAD}`, 'quadrant cohort', 0.8));
    assert.ok(Math.abs(tallKey - fixedKey) < 0.5, `key type ${tallKey} on the tall plane, ${fixedKey} on the wide one`);
  });
});

describe('the column key prices wide glyphs', () => {
  test('a name of wide glyphs keeps clear of its value', () => {
    const PIE = '- WWWWWWWW MMMM `30%`\n- MMMMMMMM WWWW `25%`\n- WWMMWWMM MMWW `20%`\n- MWMWMWMW WMWM `15%`\n- WMWMWMWM MWMW `10%`';
    const svg = draw(`## Share\n\n${PIE}`, 'piechart', 0.8);
    const labels = [...svg.querySelectorAll('text.chart-key-label')];
    assert.ok(labels.length >= 5, 'the key drew every slice');
    for (const t of labels) {
      const line = t.querySelector('tspan');
      const x = Number(line.getAttribute('x'));
      const fsz = Number(t.getAttribute('font-size'));
      const name = line.textContent;
      const value = svg.querySelector(`text.chart-key-value[data-mark-for="${t.getAttribute('data-mark-for')}"]`);
      assert.ok(value, `"${name}" has its value`);
      const valueLeft = Number(value.getAttribute('x')) - value.textContent.length * fsz * 0.6;
      // W and M paint about 0.9-1.0 of the font size in the clean face (svg-label.js GLYPH_UPPER).
      assert.ok(x + name.length * fsz * 0.9 <= valueLeft + 0.5, `"${name}" ends before its value ${value.textContent}`);
    }
  });
});
