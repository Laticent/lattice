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
const lineText = (f) => f.lines[0].map((r) => r.text).join('');
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

  test('a page number that is not the slide position (a split run prints "2.2") or is highlighted is never hoisted; a letter-spaced one is', () => {
    const split = (text) => frame([[{ text, style: style({ size: 12 }) }]], { role: 'number', x: 1200, y: 680, w: 50, h: 20 });
    const styled = (n, over) => frame([[{ text: String(n), style: style({ size: 12, ...over }) }]], { role: 'number', x: 1200, y: 680, w: 50, h: 20 });
    const a = planMasters(deck([slide([split('1')], { background: 0 }), slide([split('2.2')], { background: 0 }), slide([split('3')], { background: 0 })]));
    assert.equal(a.hoisted[1].size, 0, 'the split-run number stays literal text');
    assert.equal(a.hoisted[0].size + a.hoisted[2].size, 2, 'numbers that equal their position still hoist');
    // Lattice's own page number is letter-spaced and translucent: the layout's list style carries both.
    const b = planMasters(deck([slide([styled(1, { letterSpacing: 1, alpha: 0.9 })], { background: 0 }), slide([styled(2, { letterSpacing: 1, alpha: 0.9 })], { background: 0 })]));
    assert.equal(b.hoisted[0].size + b.hoisted[1].size, 2, 'a letter-spaced, translucent number hoists');
    const c = planMasters(deck([slide([styled(1, { highlight: '#ffff00' })], { background: 0 }), slide([styled(2, { highlight: '#ffff00' })], { background: 0 })]));
    assert.equal(c.hoisted[0].size + c.hoisted[1].size, 0, 'a highlight has no place in a list style');
  });

  test('chrome is shared across backgrounds: a header on a background no other slide paints still hoists, and goes on the master', () => {
    const plan = planMasters(
      deck(
        [slide([header(), number(1)], { background: 0 }), slide([header(), number(2)], { background: 1 }), slide([header(), number(3)], { background: 2 })],
        [{ color: '#ffffff' }, { color: '#f0f0f0' }, { color: '#e0e0e0' }],
      ),
    );
    assert.equal(plan.layouts.length, 3, 'one layout per background');
    for (const h of plan.hoisted) assert.equal(h.size, 2, 'every slide hoists its header and number');
    assert.deepEqual(Object.keys(plan.master.chrome).sort(), ['header', 'number']);
    for (const l of plan.layouts) assert.equal(l.fromMaster, true, 'each layout shows the master\'s chrome');
  });

  test('a layout with other chrome, or none, does not show the master\'s; the opening look with none is the title look', () => {
    const plan = planMasters(
      deck(
        [slide([], { background: 1 }), slide([header(), number(2)], { background: 0 }), slide([header(), number(3)], { background: 0 }), slide([header('Other'), number(4)], { background: 2 }), slide([header('Other'), number(5)], { background: 2 }), slide([header(), number(6)], { background: 0 })],
        [{ color: '#ffffff' }, { color: '#003d66' }, { color: '#f0f0f0' }],
      ),
    );
    assert.deepEqual(plan.layouts.map((l) => [l.kind, l.name, l.fromMaster]), [['title', 'Title', false], ['content', 'Content', true], ['content', 'Content 2', false]]);
    assert.equal(lineText(plan.master.chrome.header), 'Deck · Part', 'the master carries the header most slides show');
    assert.equal(lineText(plan.layouts[2].chrome.header), 'Other');
  });

  test('a layout whose slides show no page number still shows the master\'s header; a header a pixel taller is the same header', () => {
    const plan = planMasters(
      deck(
        [slide([header(), number(1)], { background: 0 }), slide([header(), number(2)], { background: 0 }), slide([header('Deck · Part', { h: 21, y: 24.2 })], { background: 1 })],
        [{ color: '#ffffff' }, { color: '#f0f0f0' }],
      ),
    );
    assert.equal(plan.hoisted[2].size, 1, 'the one-off slide\'s header hoists');
    assert.equal(plan.layouts[plan.layoutOf[2]].fromMaster, true);
    assert.deepEqual(Object.keys(plan.layouts[plan.layoutOf[2]].chrome), ['header'], 'its layout shows the header and no number');
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
