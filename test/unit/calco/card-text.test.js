/**
 * Unit: wrapping paragraphs and a card's text as one body (docs/src/lib/calco/layout.ts
 * `flowLines`, `paragraphGap`, `placeFrame`; cardtext.ts `mergeCardText`; the writers' wrap
 * and inset output). An office suite wraps where the box ends, so the box is the column.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { flowLines, paragraphGap, placeFrame, mergeCardText, writeOdp } = require('@laticent/calco');
const { ONE_PX_PNG, style, frame } = require('./_fixtures');

const run = (text) => ({ text, style: style() });
const metrics = { ascent: 1, descent: 0.26, lineGap: 0 };

describe('calco flow frames', () => {
  test('flowLines joins soft wraps with the space the browser dropped, and drops a later line\'s start spacer', () => {
    const spacer = { text: ' ', style: style({ size: 2, letterSpacing: 9 }) };
    const f = frame([[run('Three tiers —')], [spacer, run('quiet by')], [run('default')]], { flow: true });
    const [one] = flowLines(f);
    assert.equal(flowLines(f).length, 1);
    assert.equal(one.map((r) => r.text).join(''), 'Three tiers — quiet by default');
  });

  test('a frame that is not flow keeps its lines', () => {
    const f = frame([[run('a')], [run('b')]]);
    assert.equal(flowLines(f).length, 2);
  });

  test('a flow frame gets a hair of slack, not the overhang room of a pinned one', () => {
    const pinned = placeFrame(frame([[run('x')]], { w: 600 }), 1280, metrics, 28);
    const flow = placeFrame(frame([[run('x')]], { w: 600, flow: true }), 1280, metrics, 28);
    assert.ok(pinned.w - 600 >= 60, `pinned slack ${pinned.w - 600}`);
    assert.ok(flow.w - 600 > 0 && flow.w - 600 <= 6, `flow slack ${flow.w - 600}`);
  });

  test('paragraphGap is the space before the next paragraph, never negative', () => {
    const a = frame([[run('Heading')]], { y: 100, firstLineHeight: 35, lineHeight: 40 });
    const b = frame([[run('Body')]], { y: 160, firstLineHeight: 35, lineHeight: 40 });
    const exact = paragraphGap(a, metrics, 28, b, metrics, 28, 'exact');
    // Baselines sit 60px apart, the line is 40px: 20px of space.
    assert.ok(Math.abs(exact - 20) < 0.01, `exact ${exact}`);
    const tight = frame([[run('Body')]], { y: 110, firstLineHeight: 35, lineHeight: 40 });
    assert.equal(paragraphGap(a, metrics, 28, tight, metrics, 28, 'exact'), 0);
  });
});

describe('calco mergeCardText', () => {
  const card = { kind: 'box', x: 80, y: 180, w: 640, h: 400, fill: { color: '#eeeeee', alpha: 1 }, group: 0 };
  const deck = (frames) => ({ image: ONE_PX_PNG, shapes: [card], frames });
  const title = frame([[run('Heading')]], { x: 100, y: 200, w: 600, h: 40, group: 0 });
  const body = frame([[run('Body line one')], [run('line two')]], { x: 100, y: 260, w: 600, h: 80, group: 0, flow: true });

  test('a card\'s stacked paragraphs become one body in the card shape', () => {
    const out = mergeCardText(deck([title, body]));
    assert.equal(out.frames.length, 1);
    assert.equal(out.frames[0].next.length, 1);
    assert.equal(out.frames[0].flow, true);
    assert.equal(out.shapes[0].text, 0);
  });

  test('a frame on another left edge, or with a role, stays its own box', () => {
    const indented = { ...body, x: 140 };
    assert.equal(mergeCardText(deck([title, indented])).frames.length, 2);
    assert.equal(mergeCardText(deck([title, { ...body, role: 'footer' }])).frames.length, 2);
  });

  test('a card whose text is already a label is left alone', () => {
    const labelled = { ...card, text: 0 };
    const out = mergeCardText({ image: ONE_PX_PNG, shapes: [labelled], frames: [title, body] });
    assert.equal(out.frames.length, 2);
  });

  test('wrapping paragraphs that end on different edges do not merge', () => {
    const narrow = { ...body, w: 500 };
    const wide = { ...body, y: 340, w: 600 };
    assert.equal(mergeCardText(deck([title, narrow, wide])).frames.length, 3);
  });
});

describe('calco writers wrap a flow frame', () => {
  test('the .odp text box of a flow frame is one paragraph', async () => {
    const f = frame([[run('one two')], [run('three')]], { flow: true });
    const zip = await JSZip.loadAsync(Buffer.from(await writeOdp(JSZip, { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [f] }] }, 'nodebuffer')));
    const text = await zip.file('content.xml').async('string');
    assert.ok(!text.includes('<text:line-break/>'));
  });
});
