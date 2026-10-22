/**
 * Unit: `@callout{…}` on the charts that read it (lib/components/chart/_chart-family/callout-layer.js).
 * One contract, run over every chart that has adopted callouts: the chart draws a ring and a marker on
 * each mark a note names and a numbered row in a lane; a note that names no mark is listed as not
 * drawn; past six the rest are not drawn; off hides them and their details still reach the card;
 * a slide with no callout renders as before; a chart that declines the slide keeps the paragraph.
 *
 * Adding a chart to the feature is adding a row to CHARTS: its class, a section's markup, and the two
 * marks the arms point at (a name and the `data-mark` index the chart gives it).
 *
 * Design: engineering/decisions/2026-10-20-callout-placement.md §§ 5 and 7.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const { JSDOM } = require('jsdom');
const { transformChartSection } = require('../../../lib/plugins/chart-family/chart-family.dispatch');
const { resetRenderIds } = require('../../../lib/core/render-ids');

const md = new MarkdownIt({ html: true });
const doc = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const LIST = '- Q1 `120`\n- Q2 `180`\n- Q3 `240`\n- Q4 `310`';

const STACKED = '- Q1\n  - Product `70`\n  - Services `50`\n- Q2\n  - Product `100`\n  - Services `80`\n- Q3\n  - Product `140`\n  - Services `100`\n- Q4\n  - Product `190`\n  - Services `120`';

const SERIES = '- Q1\n  - North `60`\n  - South `40`\n- Q2\n  - North `75`\n  - South `52`\n- Q3\n  - North `90`\n  - South `70`\n- Q4\n  - North `120`\n  - South `95`';

const BANDS = '- Q1 `10..20` `12`\n- Q2 `20..30` `25`\n- Q3 `30..40` `31`\n- Q4 `40..50` `18`\n- Q5 `50..60` `9`';

const EP = '- OEP\n  - `{10, $120M}`\n  - `{25, $190M}`\n  - `{50, $300M}`\n  - `{100, $410M}`\n  - `{250, $560M}`';

const WALK = '- Plan `12.0M`\n- Price `+1.4M`\n- Volume `-0.8M`\n- Mix `-0.6M`\n- FX `-0.3M`\n- Cost base `-1.9M`\n- Actual `9.8M`';

const KPIS = '- New ARR `4.2M` `5.0M`\n- Expansion ARR `3.6M` `3.0M`\n- Gross renewal `2.8M` `2.6M`\n- Services revenue `1.1M` `1.8M`\n- Partner-sourced ARR `0.9M` `1.4M`';

const DOTS = '- Atlas `{$420k, 18%}`\n- Borealis `{$310k, 24%}`\n- Cardinal `{$180k, 52%}`\n- Dovetail `{$95k, 61%}`\n- Everline `{$240k, 31%}`\n- Fathom `{$60k, 74%}`';

const SLOPE = '- Northwind\n  - 2023 `31%`\n  - 2026 `24%`\n- Kestrel Group\n  - 2023 `22%`\n  - 2026 `29%`\n- Vantage\n  - 2023 `19%`\n  - 2026 `21%`\n- Meridian Partners\n  - 2023 `17%`\n  - 2026 `16%`';

const TOWER = '- Layer 3 `$200M xs $160M`\n  - Acme Re `30%`\n  - Globex Re `25%`\n  - Helios Re `20%`\n- Layer 2 `$70M xs $90M`\n  - Acme Re `40%`\n  - Vantage Re `35%`\n  - Umbra Re `25%`\n- Layer 1 `$40M xs $50M`\n  - Globex Re `60%`\n  - Meridian Re `40%`\n- Retention `$50M`';

const PIE = '- Deck production `46%`\n- Meetings about meetings `22%`\n- Realigning on priorities `18%`\n- Stakeholder management `9%`\n- Actually deciding `5%`';

const FUNNEL = '- Visitors `12,000`\n- Signups `4,800`\n- Activated `2,160`\n- Paid `864`\n- Renewed `670`';

const MAP = '- India `48.2`\n- Nigeria `36.4`\n- Kenya `31.0`\n- Brazil `27.5`\n- Indonesia `19.3`';

const QUAD = '- Quick Wins\n  - Weekly signal digest `{2, 82}`\n  - Slack intake bot `{3, 72}`\n- Strategic Bets\n  - Scoring model v2 `{8, 88}`\n  - Decision-log API `{7, 74}`\n- Defer\n  - Per-team weighting UI `{2, 28}`';

const RADAR = '- Meridian\n  - Performance `9`\n  - Pricing `7`\n  - Support `8`\n  - Ecosystem `6`\n  - Security `9`\n- Vantage\n  - Performance `7`\n  - Pricing `8`\n  - Support `6`\n  - Ecosystem `9`\n  - Security `7`';

const GANTT = '- Framework\n  - Signal taxonomy `Q1..Q2` `done`\n  - Scoring model v2 `Q2..Q3` `live`\n  - Per-team weighting `Q3..Q4` `at-risk`\n- Adoption\n  - Pilot onboarding `Q1..Q2` `done`\n  - Org-wide rollout `Q3..Q4`\n  - GA `Q4` `milestone`';

const HUB = '- Program office\n  - Customer onboarding\n  - Core platform migration `at-risk`\n  - Data governance\n  - Vendor consolidation `blocked`\n  - Branch network\n  - Workforce reskilling';

/** @type {Array<{cls: string, body: string, a: [string, number], b: [string, number]}>} */
const CHARTS = [
  { cls: 'bar', body: LIST, a: ['Q2', 1], b: ['Q4', 3] },
  { cls: 'slope', body: SLOPE, a: ['Kestrel Group', 1], b: ['Meridian Partners', 3] },
  { cls: 'slope dumbbell', body: SLOPE, a: ['Kestrel Group', 1], b: ['Meridian Partners', 3] },
  { cls: 'piechart', body: PIE, a: ['Meetings about meetings', 1], b: ['Stakeholder management', 3] },
  { cls: 'piechart donut', body: PIE, a: ['Meetings about meetings', 1], b: ['Stakeholder management', 3] },
  { cls: 'hub-spoke', body: HUB, a: ['Core platform migration', 1], b: ['Data governance', 2] },
  { cls: 'gantt', body: GANTT, a: ['Scoring model v2', 1], b: ['GA', 5] },
  { cls: 'radar', body: RADAR, a: ['Pricing', 1], b: ['Ecosystem', 3] },
  { cls: 'quadrant', body: QUAD, a: ['Slack intake bot', 1], b: ['Decision-log API', 3] },
  { cls: 'quadrant cohort', body: QUAD, a: ['Slack intake bot', 1], b: ['Decision-log API', 3] },
  { cls: 'map', body: MAP, a: ['Nigeria', 1], b: ['Brazil', 3] },
  { cls: 'funnel', body: FUNNEL, a: ['Signups', 1], b: ['Paid', 3] },
  { cls: 'tower', body: TOWER, a: ['Layer 1', 1], b: ['Layer 3', 3] },
  { cls: 'scatter', body: DOTS, a: ['Borealis', 1], b: ['Dovetail', 3] },
  { cls: 'bullet', body: KPIS, a: ['Expansion ARR', 1], b: ['Services revenue', 3] },
  { cls: 'waterfall', body: WALK, a: ['Volume', 2], b: ['Cost base', 5] },
  { cls: 'ep-curve', body: EP, a: ['1-in-25', 1], b: ['1-in-100', 3] },
  { cls: 'histogram', body: BANDS, a: ['Q2', 1], b: ['Q4', 3] },
  { cls: 'line', body: SERIES, a: ['Q2', 1], b: ['Q4', 3] },
  { cls: 'stacked-bar', body: STACKED, a: ['Q2', 1], b: ['Q4', 3] },
];

const section = (c, extra = '') => `## Title\n\n${c.body}\n\n${extra}`;
const render = (c, extra, { cls = c.cls, orientation, aspect } = {}) => {
  resetRenderIds('');
  return transformChartSection(md.render(section(c, extra)), cls, orientation, undefined, null, aspect);
};
const two = (c) => `\`@callout{[{First note, for=${c.a[0]}}, {Second note, for=${c.b[0]}, detail="Because of the launch"}]}\``;
const lane = (d) => d.querySelector('g.legend--anchored');
/** The marks the lane's markers name, once each, in order: every callout has a marker in the lane. */
const marked = (g) => [...new Set([...g.querySelectorAll('.legend-plate')].map((p) => Number(p.getAttribute('data-mark-for'))))].sort();

for (const c of CHARTS) {
  describe(`${c.cls}: callouts`, () => {
    test('a slide with no callout draws no lane, and a callout with none to name draws none', () => {
      assert.equal(lane(doc(render(c, '').html)), null);
    });

    test('each note rings the mark it names, marks it, and sets its words in a lane', () => {
      const r = render(c, two(c));
      assert.ok(r.transformed);
      const d = doc(r.html);
      const g = lane(d);
      assert.ok(g, 'a lane');
      assert.deepEqual(marked(g), [c.a[1], c.b[1]].sort(), 'a marker for each named mark');
      assert.equal(g.querySelectorAll('text.legend-text--bare').length, 2);
      assert.match(g.textContent.replace(/\s+/g, ''), /Firstnote/, 'the note\'s words, set in the lane');
      assert.doesNotMatch(r.html, /@callout/, 'the paragraph is lifted, not printed as code');
    });

    test('a note that names no mark is not drawn, and the description says so', () => {
      const d = doc(render(c, '`@callout{[{Ghost, for=Nowhere}, {Real, for=' + c.a[0] + '}]}`').html);
      assert.deepEqual(marked(lane(d)), [c.a[1]]);
      assert.match(d.querySelector('desc').textContent, /Not drawn: "Ghost"/);
    });

    test('a callout that names no mark at all still says so in the description', () => {
      const r = render(c, '`@callout{{Ghost, for=Nowhere}}`');
      assert.match(doc(r.html).querySelector('desc').textContent, /Not drawn: "Ghost"/);
    });

    test('author text with `$` patterns cannot rewrite the figure', () => {
      const plain = render(c, '`@callout{{Ghost, for=Nowhere}}`').html;
      const tricky = render(c, "`@callout{{Ghost $' $& $1, for=Nowhere}}`").html;
      assert.equal(tricky.length - plain.length < 40, true, 'only the note\'s own words differ');
      assert.equal((tricky.match(/<\/desc>/g) || []).length, (plain.match(/<\/desc>/g) || []).length);
    });

    test('the seventh note onward is not drawn, and the description says so', () => {
      const many = Array.from({ length: 7 }, (_, i) => `{Note ${i}, for=${c.a[0]}}`).join(', ');
      const d = doc(render(c, `\`@callout{[${many}]}\``).html);
      assert.equal(lane(d).querySelectorAll('text.legend-text--bare').length, 6);
      assert.match(d.querySelector('desc').textContent, /past the 6-callout limit/);
    });

    test('a detail reaches the mark\'s hover card and the speaker note', () => {
      const r = render(c, two(c));
      assert.match(r.html, /Second note: Because of the launch/);
    });

    test('callouts switched off draw nothing and the details still reach the card', () => {
      const r = render(c, two(c), { cls: `${c.cls} callout-off` });
      const d = doc(r.html);
      assert.equal(lane(d), null);
      assert.doesNotMatch(r.html, /@callout/);
      assert.match(r.html, /Second note: Because of the launch/);
    });

    test('the same slide renders the same bytes twice', () => {
      assert.equal(render(c, two(c)).html, render(c, two(c)).html);
    });

    test('the notes move with the slide\'s shape: beside the figure at 16:9, a different layout at 9:16', () => {
      const wide = doc(render(c, two(c), { orientation: undefined, aspect: undefined }).html).querySelector('svg').getAttribute('viewBox');
      const story = doc(render(c, two(c), { orientation: 'portrait', aspect: 0.56 }).html).querySelector('svg').getAttribute('viewBox');
      assert.notEqual(wide, story);
    });

    test('a slide the chart declines keeps its callout paragraph', () => {
      const r = transformChartSection(md.render('## Title\n\nNo list here.\n\n' + two(c)), c.cls);
      assert.equal(r.transformed, false);
    });
  });
}

describe('the readers list matches the kernels', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { CALLOUT_READERS } = require('../../../lib/core/legend');
  const chartDir = path.join(__dirname, '../../../lib/components/chart');
  const adopters = fs.readdirSync(chartDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .filter((d) => {
      const f = path.join(chartDir, d.name, `${d.name}.transform.js`);
      return fs.existsSync(f) && /require\('\.\.\/_chart-family\/callout-layer'\)/.test(fs.readFileSync(f, 'utf8'));
    })
    .map((d) => d.name)
    .sort();

  test('every chart that imports the callout layer is a reader, and every reader imports it', () => {
    assert.deepEqual([...CALLOUT_READERS].sort(), adopters);
  });

  test('every reader has a row in this file\'s contract table, or is the heatmap (which has its own suite)', () => {
    const rows = new Set(CHARTS.map((c) => c.cls.split(' ')[0]));
    for (const name of CALLOUT_READERS) if (name !== 'heatmap') assert.ok(rows.has(name), `${name} has no row in CHARTS`);
  });
});

describe('radar: variants that take no callouts keep the paragraph', () => {
  const RAD = '- Meridian\n  - Performance `9`\n  - Pricing `7`\n  - Support `8`\n- Vantage\n  - Performance `7`\n  - Pricing `8`\n  - Support `6`';
  test('small-multiples leaves the callout paragraph on the slide, as before', () => {
    resetRenderIds('');
    const r = transformChartSection(md.render(`## R\n\n${RAD}\n\n\`@callout{{Strong, for=Pricing}}\``), 'radar small-multiples');
    assert.match(r.html, /@callout/);
  });
  test('a pane leaves it too', () => {
    resetRenderIds('');
    const r = transformChartSection(md.render(`## R\n\n${RAD}\n\n\`@callout{{Strong, for=Pricing}}\``), 'radar', undefined, { w: 300, h: 200 });
    assert.match(r.html, /@callout/);
  });
});
