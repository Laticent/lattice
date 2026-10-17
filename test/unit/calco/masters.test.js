/**
 * Unit: Calco's layout plan (docs/src/lib/calco/masters.ts). Which slides share a layout, and
 * which running chrome (header, footer, page number) moves from every slide to the layout.
 * Pure: no browser, no writer.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { planMasters, withoutHoisted } = require('@laticent/calco');
const { ONE_PX_PNG, style, frame } = require('./_fixtures');

const header = (text = 'Deck · Part', over = {}) => frame([[{ text, style: style({ size: 12 }) }]], { role: 'header', x: 30, y: 24, w: 400, h: 20, ...over });
const number = (n, over = {}) => frame([[{ text: String(n), style: style({ size: 12 }) }]], { role: 'number', x: 1200, y: 680, w: 50, h: 20, align: 'right', ...over });
const slide = (frames, extra = {}) => ({ image: ONE_PX_PNG, frames, ...extra });
const deck = (slides, backgrounds = [{ color: '#ffffff' }]) => ({ width: 1280, height: 720, backgrounds, slides });

describe('calco masters — planMasters', () => {
  test('chrome that two slides share goes on their layout; the digits of a page number do not matter', () => {
    const plan = planMasters(deck([slide([header(), number(1)], { background: 0 }), slide([header(), number(2)], { background: 0 })]));
    assert.equal(plan.layouts.length, 1);
    assert.deepEqual(plan.layoutOf, [0, 0]);
    assert.deepEqual([...plan.hoisted[0]], [0, 1]);
    assert.deepEqual(Object.keys(plan.layouts[0].chrome).sort(), ['header', 'number']);
  });

  test('a header that differs in text stays on its slide; one slide alone keeps its chrome', () => {
    const plan = planMasters(deck([slide([header('A')], { background: 0 }), slide([header('B')], { background: 0 })]));
    assert.equal(plan.hoisted[0].size + plan.hoisted[1].size, 0);
    const lone = planMasters(deck([slide([header()], { background: 0 })]));
    assert.equal(lone.hoisted[0].size, 0);
  });

  test('slides split into layouts by background and by the chrome they carry', () => {
    const plan = planMasters(
      deck(
        [slide([header()], { background: 0 }), slide([header()], { background: 0 }), slide([header()], { background: 1 }), slide([header()], { background: 1 }), slide([], { background: 0 })],
        [{ color: '#ffffff' }, { color: '#003d66' }],
      ),
    );
    assert.equal(plan.layouts.length, 3, 'white with header, blue with header, white without');
    assert.deepEqual(plan.layoutOf, [0, 0, 1, 1, 2]);
  });

  test('a frame that is a label, belongs to a card, has two styles or repeats on its slide is never hoisted', () => {
    const twoStyles = frame([[{ text: 'a', style: style() }, { text: 'b', style: style({ weight: 700 }) }]], { role: 'header' });
    const grouped = header('G', { group: 0 });
    const labelled = header('L');
    const s = { image: ONE_PX_PNG, background: 0, frames: [labelled], shapes: [{ kind: 'box', x: 0, y: 0, w: 10, h: 10, text: 0 }] };
    const plan = planMasters(deck([s, s, slide([twoStyles], { background: 0 }), slide([twoStyles], { background: 0 }), slide([grouped], { background: 0 }), slide([grouped], { background: 0 }), slide([header('R'), header('R')], { background: 0 }), slide([header('R'), header('R')], { background: 0 })]));
    for (const h of plan.hoisted) assert.equal(h.size, 0);
  });

  test('a slide with its own opaque picture hoists nothing: a layout paints under the picture', () => {
    const plan = planMasters(deck([slide([header()]), slide([header()])]));
    assert.equal(plan.hoisted[0].size + plan.hoisted[1].size, 0);
    assert.deepEqual(plan.layouts[0].chrome, {});
  });

  test('withoutHoisted empties the hoisted frames and keeps every index', () => {
    const s = slide([header(), number(1)], { background: 0 });
    const out = withoutHoisted(s, new Set([0]));
    assert.equal(out.frames.length, 2);
    assert.deepEqual(out.frames[0].lines, []);
    assert.equal(out.frames[1], s.frames[1]);
    assert.equal(withoutHoisted(s, new Set()), s);
  });
});
