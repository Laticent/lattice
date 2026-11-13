/**
 * Chart text follows the venue (lib/transformers/chart-text-venue.js, followups 3098).
 *
 * Pins the math: the per-venue label floor from engineering/typography.md §7 (8 arcminutes of x-height at the back
 * row), the growth that clears it, the factor a slide's own title, eyebrow, subtitle and source line set, and the
 * canvas a kernel draws on. Pins the wiring: the venue lifts this module reads match the CSS, a laptop chart is
 * byte-identical (factor 1), and a hall chart draws on a canvas that many times smaller with its labels the same
 * size in it. The measured px per kind on a real page are pinned by
 * test/integration/components/chart-text-venue.test.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  arcminutes, labelFloorPx, chartTextGrowth, chartTextScale, chartTextCanvas, boxHeight, keepsEveryLabel,
  LABEL_ARCMIN, SMALLEST_LAPTOP_PX,
} = require('../../../lib/transformers/chart-text-venue');
const { VENUE_SCALE, VENUE_META_LIFT, VENUE_COMPACT_LIFT, VENUE_BACK_ROW, VENUE_NAMES } = require('../../../lib/core/resolve-venue');
const cart = require('../../../lib/plugins/chart-family/shared/cartesian');
const engine = require('../../../lib/engine');

const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.modifiers.css'), 'utf8');
const VENUES = ['huddle', 'conference', 'hall'];
const REF = { title: 38, eyebrow: true, subtitle: 0, caption: false };

test('the lifts this module reads are the ones the venue CSS sets', () => {
  for (const v of VENUES) {
    const rule = css.match(new RegExp(`section\\.venue-${v}\\s*\\{([^}]*)\\}`))[1];
    const read = (prop) => { const m = rule.match(new RegExp(`--${prop}:\\s*([\\d.]+)`)); return m ? Number(m[1]) : 1; };
    assert.equal(VENUE_META_LIFT[v], read('venue-meta-lift'), `${v} meta lift`);
    assert.equal(VENUE_COMPACT_LIFT[v], read('venue-compact-lift'), `${v} compact lift`);
  }
  assert.deepEqual(Object.keys(VENUE_BACK_ROW), VENUE_NAMES);
});

test('the label floor is 8 arcminutes of x-height at each venue back row', () => {
  const want = { laptop: 10.05, huddle: 15.08, conference: 20.10, hall: 26.81 };
  for (const v of VENUE_NAMES) {
    assert.equal(Number(labelFloorPx(v).toFixed(2)), want[v], v);
    assert.ok(Math.abs(arcminutes(labelFloorPx(v), VENUE_BACK_ROW[v]) - LABEL_ARCMIN) < 1e-9, v);
  }
});

test('chart text grows at least as the meta role does, and enough to take the smallest laptop label to the floor', () => {
  assert.equal(chartTextGrowth('laptop'), 1);
  let prev = 1;
  for (const v of VENUES) {
    const g = chartTextGrowth(v);
    assert.ok(g >= VENUE_SCALE[v] * VENUE_META_LIFT[v], `${v} tracks the meta role`);
    assert.ok(SMALLEST_LAPTOP_PX * g >= labelFloorPx(v), `${v} clears the floor`);
    assert.ok(g > prev, `${v} grows past the venue before it`);
    prev = g;
  }
});

test('laptop is exactly 1 whatever the slide carries, so a laptop chart is byte-identical', () => {
  for (const chrome of [null, REF, { title: 90, subtitle: 120, caption: true }]) {
    assert.equal(chartTextScale(['bar'], chrome), 1);
    assert.equal(chartTextCanvas(1, { chrome }), undefined);
  }
});

test('the factor gives back the box the venue takes: a 7-unit label prints growth times its laptop size', () => {
  const slides = [REF, { title: 84, eyebrow: true }, { title: 20, subtitle: 70 }, { title: 30, caption: true }];
  for (const v of VENUES) {
    for (const chrome of slides) {
      const k = chartTextScale([`venue-${v}`], chrome);
      const laptopPx = 7 * (boxHeight('laptop', chrome) / 180);
      const venuePx = 7 * (boxHeight(v, chrome) / (180 / k));
      // Under the cap the label prints exactly `growth` times its laptop size; at the cap, as large as a 72-unit
      // canvas allows, which is still larger than at laptop.
      if (k < 2.5) assert.ok(Math.abs(venuePx / laptopPx - chartTextGrowth(v)) < 0.02, `${v} ${JSON.stringify(chrome)}`);
      else assert.ok(venuePx > laptopPx, `${v} ${JSON.stringify(chrome)} still grows at the cap`);
      assert.ok(k <= 2.5, `${v} ${JSON.stringify(chrome)}: a canvas no shorter than the 72-unit pane floor`);
    }
    // More chrome around the chart, a shorter box, a larger factor (until the cap).
    assert.ok(chartTextScale([`venue-${v}`], { ...REF, subtitle: 70 }) >= chartTextScale([`venue-${v}`], REF), v);
    assert.ok(chartTextScale([`venue-${v}`], { ...REF, subtitle: 70 }) > chartTextScale([`venue-${v}`], REF) || chartTextScale([`venue-${v}`], REF) === 2.5, v);
  }
  // A pane, whose canvas the engine measured, takes the growth alone.
  assert.equal(chartTextScale(['venue-hall'], null), chartTextGrowth('hall'));
});

test('the canvas gives up the height the venue takes and spans 80% of the box, never less than the laptop width', () => {
  const k = chartTextScale(['venue-hall'], REF);
  const c = chartTextCanvas(k, { classTokens: ['venue-hall'], chrome: REF });
  const h = 180 / k;
  const box = (0.9 * 1280) / (boxHeight('hall', REF) / h);
  const laptopW = 320 / chartTextGrowth('hall');
  const r = (n) => Math.round(n * 10) / 10;
  assert.equal(c.h, r(h));
  assert.equal(c.w, r(Math.max(laptopW, 0.8 * box)));
  assert.equal(c.wide, r(Math.max(laptopW, box)));
  assert.ok(c.w > 320 / k, 'wider than a 16:9 canvas, so a column chart does not letterbox into half the box');
  // A pane divides its own canvas; a portrait deck divides the portrait view.
  assert.deepEqual(chartTextCanvas(2, { paneView: { w: 200, h: 100 } }), { w: 100, h: 50 });
  assert.deepEqual(chartTextCanvas(2, { orientation: 'portrait', chrome: REF }), { w: 160, h: 150 });
});

test('viewFor draws on the venue canvas and returns the shared view untouched at laptop', () => {
  assert.equal(cart.viewFor(undefined, undefined, 1), cart.VIEW.landscape);
  assert.equal(cart.viewFor(undefined, undefined, 1, { w: 100, h: 50 }), cart.VIEW.landscape);
  assert.deepEqual(cart.viewFor(undefined, undefined, 2), { w: 160, h: 90 });
  assert.deepEqual(cart.viewFor(undefined, undefined, 2, { w: 156.1, h: 65.9 }), { w: 156, h: 66 });
  // A pane keeps its floor, so the gutters still fit round a sliver of a plot.
  assert.deepEqual(cart.viewFor(undefined, { w: 200, h: 100 }, 2, { w: 100, h: 50 }), { w: 140, h: 72 });
});

test('a bar chart at hall draws on the venue canvas with its labels the same size in it, and keeps every category', () => {
  const deck = (venue) => [
    '---', 'theme: indaco', venue ? `venue: ${venue}` : '', '---', '',
    '<!-- _class: bar -->', '', '`Revenue · FY26`', '', '## Growth is concentrated in two regions.', '',
    '- North America `$4.2M`', '- EMEA `$3.1M`', '- APAC `$1.8M`', '- LATAM `$0.6M`', '',
  ].join('\n');
  const viewBox = (html) => html.match(/class="cart-svg bar-svg" viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
  const laptop = engine.render(deck(null)).html;
  assert.equal(engine.render(deck('laptop')).html, laptop, 'venue: laptop is the default drawing');
  assert.deepEqual(viewBox(laptop), [320, 180]);
  const hall = engine.render(deck('hall')).html;
  const [w, h] = viewBox(hall);
  const k = chartTextScale(['venue-hall'], REF);
  const canvas = chartTextCanvas(k, { classTokens: ['venue-hall'], chrome: REF });
  assert.equal(h, Math.round(canvas.h));
  assert.equal(w, Math.round(canvas.w));
  for (const name of ['North America', 'EMEA', 'APAC', 'LATAM']) assert.ok(hall.includes(`data-label="${name}"`), name);
  // The labels stay their FS size in the smaller canvas: the stylesheet's font sizes are untouched.
  assert.equal(cart.FS.cat, 7.5);
});

test('the guard refuses a venue drawing that cuts a name, drops a label or prints a smaller unit', () => {
  const at = { venue: 'hall', chrome: REF };
  const base = { html: '<svg viewBox="0 0 320 180"><text>North America</text><text>EMEA</text></svg>', drops: '' };
  const ok = { html: '<svg viewBox="0 0 190 66"><text>North America</text><text>EMEA</text></svg>', drops: '' };
  assert.ok(keepsEveryLabel(base, ok, at), 'a smaller canvas with every name whole passes');
  assert.ok(!keepsEveryLabel(base, { ...ok, html: ok.html.replace('North America', 'North…') }, at), 'a name cut to "…"');
  assert.ok(!keepsEveryLabel(base, { ...ok, html: ok.html.replace('<text>EMEA</text>', '') }, at), 'a label dropped');
  assert.ok(!keepsEveryLabel(base, { ...ok, drops: 'gap-cull:EMEA' }, at), 'a label-drop record');
  assert.ok(!keepsEveryLabel(base, { ...ok, html: ok.html.replace('0 0 190 66', '0 0 900 66') }, at), 'width binds: a smaller unit');
});

test('the guard holds "nothing smaller" in a box TALLER than modeled, not only at the modeled height', () => {
  // The checker's repro: scatter at hall with a one-line subtitle. The model put the chart box at about 147 px; the real box
  // was 298. A wide candidate (818 x 130) beats the 320 x 180 drawing at 147 px, but in the real box the width binds and
  // every label printed 15% smaller (10.8 -> 9.2 px). The guard must refuse it.
  const at = { venue: 'hall', chrome: { title: 60, subtitle: 56, eyebrow: true } };
  const base = { html: '<svg viewBox="0 0 320 180"><text>Jira</text></svg>', drops: '' };
  const wide = { html: '<svg viewBox="0 0 818 130"><text>Jira</text></svg>', drops: '' };
  assert.ok(boxHeight('hall', at.chrome) < 200, 'the model under-states this box (the premise of the repro)');
  assert.ok(!keepsEveryLabel(base, wide, at), 'a candidate that loses anywhere up to the bare box is refused');
});

test('a slide that is not landscape 16:9 takes no venue factor: its chart text prints at the same size at every venue', () => {
  const slide = ['<!-- _class: bar -->', '', '## Growth is concentrated in two regions.', '',
    '- North America `$4.2M`', '- EMEA `$3.1M`', '- APAC `$1.8M`', ''];
  const deck = (size, venue) => ['---', 'theme: indaco', `size: ${size}`, venue ? `venue: ${venue}` : '', '---', '', ...slide].join('\n');
  // A 4:3 slide keeps today's drawing.
  const vb = (html) => html.match(/class="cart-svg bar-svg" viewBox="([^"]+)"/)[1];
  assert.equal(vb(engine.render(deck('standard', 'hall')).html), vb(engine.render(deck('standard', null)).html), 'standard');
  // A phone page draws on the chart form kernel, whose box is shorter at a venue (the title and eyebrow above it grow,
  // chart-family.dispatch.js `formBoxPx`): the canvas gets shorter, and every role prints at the same size.
  const roles = (html) => html.match(/class="cart-svg bar-svg"[^>]*style="([^"]+)"|style="([^"]+)"[^>]*class="cart-svg bar-svg"/).slice(1).find(Boolean);
  for (const size of ['portrait', 'square']) {
    assert.equal(roles(engine.render(deck(size, 'hall')).html), roles(engine.render(deck(size, null)).html), size);
  }
});
