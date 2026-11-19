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

  test('a header whose text differs in one look stays on its slides and is a placeholder in that look; one slide alone hoists its chrome', () => {
    // Per-section headers share one layout (grouped by look, not text) instead of a layout per slide.
    const plan = planMasters(deck([slide([header('A')], { background: 0 }), slide([header('B')], { background: 0 })]));
    assert.equal(plan.layouts.length, 1, 'one look, one layout');
    assert.equal(plan.hoisted[0].size + plan.hoisted[1].size, 0, 'each slide keeps its own text');
    assert.equal(lineText(plan.layouts[0].vary.header), 'A', 'the layout offers a header placeholder in that look');
    assert.equal(plan.layouts[0].chrome.header, undefined);
    // A one-off look (a dark divider in a light deck) carries its own chrome, so a slide added on it has it too.
    const lone = planMasters(deck([slide([header()], { background: 0 })]));
    assert.equal(lone.hoisted[0].size, 1);
  });

  test('every layout is named after its look and carries that look\'s chrome; chrome that does not show on its ground stays on the slide', () => {
    const dark = (over = {}) => header('Deck · Part', { ...over });
    const lightInk = (text) => frame([[{ text, style: style({ size: 12, color: '#ffffff' }) }]], { role: 'footer', x: 30, y: 690, w: 400, h: 20 });
    const plan = planMasters(
      deck(
        [
          slide([lightInk('Acme')], { background: 1, look: 'title' }),
          slide([dark(), number(2)], { background: 0, look: 'content' }),
          slide([dark(), number(3)], { background: 0, look: 'content' }),
          slide([lightInk('Acme')], { background: 1, look: 'divider' }),
          // White ink on a white ground: it sits on something the slide's own picture paints, so it is not the layout's.
          slide([lightInk('Acme')], { background: 0, look: 'divider' }),
          slide([lightInk('Acme')], { background: 1, look: 'closing' }),
        ],
        [{ color: '#ffffff' }, { color: '#003d66' }],
      ),
    );
    assert.deepEqual(plan.layouts.map((l) => [l.name, l.kind]), [['Title', 'title'], ['Content', 'content'], ['Divider', 'title'], ['Divider 2', 'title'], ['Closing', 'title']]);
    assert.equal(lineText(plan.layouts[2].chrome.footer), 'Acme', 'the dark divider carries its own light footer');
    assert.equal(plan.hoisted[3].size, 1);
    assert.equal(plan.hoisted[4].size, 0, 'white on white stays on the slide');
    assert.deepEqual(plan.layouts[3].chrome, {});
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

  test('slides with their own opaque picture share one layout per look; the master takes only chrome that reads on white', () => {
    const own = planMasters(deck([slide([], { look: 'content' }), slide([], { look: 'content' }), slide([], { look: 'divider' })], []));
    assert.equal(own.layouts.length, 2, 'one per look, not one per slide');
    // Three navy slides with a pale header outnumber two white slides with a dark one; the master still takes the dark one.
    const pale = (n) => frame([[{ text: 'Deck', style: style({ size: 12, color: '#91a7c2' }) }]], { role: 'header', x: 30, y: 24, w: 400, h: 20 });
    const plan = planMasters(
      deck(
        [slide([pale()], { background: 1, look: 'divider' }), slide([pale()], { background: 1, look: 'divider' }), slide([pale()], { background: 1, look: 'divider' }), slide([header()], { background: 0, look: 'content' }), slide([header()], { background: 0, look: 'content' })],
        [{ color: '#ffffff' }, { color: '#003d66' }],
      ),
    );
    assert.equal(plan.master.chrome.header.lines[0][0].style.color, '#112233', 'the dark header, though fewer slides show it');
    assert.equal(plan.layouts[plan.layoutOf[0]].fromMaster, false, 'the navy layout draws its own pale header');
    assert.equal(lineText(plan.layouts[plan.layoutOf[0]].chrome.header), 'Deck');
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
