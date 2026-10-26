/**
 * Unit: wrapping paragraphs and a card's text as one body (docs/src/lib/calco/layout.ts
 * `flowLines`, `paragraphGap`, `placeFrame`; cardtext.ts `mergeCardText`; the writers' wrap
 * and inset output). An office suite wraps where the box ends, so the box is the column.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const PptxGenJS = require('pptxgenjs');
const { flowLines, labelInsets, paragraphGap, placeFrame, mergeCardText, writeOdp, writePptx } = require('@laticent/calco');
const { ONE_PX_PNG, style, frame } = require('./_fixtures');
const { checkPptxSchema, checkOdp } = require('../../conformance/office/office-conformance');

const run = (text) => ({ text, style: style() });
const metrics = { ascent: 1, descent: 0.26, lineGap: 0 };

describe('calco flow frames', () => {
  test('flowLines joins soft wraps with the space the browser dropped, drawn without the run\'s underline or highlight', () => {
    const chip = style({ underline: true, strike: true, highlight: '#ffee00' });
    const f = frame([[run('Three tiers —'), { text: 'quiet', style: chip }], [run('by')], [run('default')]], { flow: true });
    const [one] = flowLines(f);
    assert.equal(flowLines(f).length, 1);
    assert.equal(one.map((r) => r.text).join(''), 'Three tiers —quiet by default');
    const space = one.find((r) => r.text === ' ' && r.style.underline === false);
    assert.ok(space, 'the join space after the chip carries no underline');
    assert.equal(space.style.highlight, undefined);
    assert.equal(space.style.strike, false);
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

  test('a <br> heading (several lines, not flow) keeps its own box instead of joining into one line', () => {
    const br = frame([[run('First line')], [run('Second line')]], { x: 100, y: 200, w: 600, h: 80, group: 0 });
    const out = mergeCardText(deck([br, { ...body, y: 300 }]));
    assert.equal(out.frames.length, 2);
    assert.equal(out.frames[0].next, undefined);
  });

  test('a one-line heading wider than the body\'s column is not squeezed into it', () => {
    const narrowBody = { ...body, w: 300, y: 260 };
    const wideHead = { ...title, w: 560 };
    const out = mergeCardText(deck([wideHead, narrowBody]));
    assert.equal(out.frames.length, 2, 'the heading stays its own box');
  });

  test('a shadow with no opaque fill stays unmerged, an opaque one merges', () => {
    const shadow = { x: 0, y: 4, blur: 8, color: '#000000', alpha: 0.3 };
    const stroked = { ...card, fill: undefined, stroke: { color: '#999999', alpha: 1, width: 1 }, shadow };
    assert.equal(mergeCardText({ image: ONE_PX_PNG, shapes: [stroked], frames: [title, body] }).frames.length, 2);
    const translucent = { ...card, fill: { color: '#eeeeee', alpha: 0.5 }, shadow };
    assert.equal(mergeCardText({ image: ONE_PX_PNG, shapes: [translucent], frames: [title, body] }).frames.length, 2);
    const opaque = { ...card, shadow };
    assert.equal(mergeCardText({ image: ONE_PX_PNG, shapes: [opaque], frames: [title, body] }).frames.length, 1);
  });

  test('an unmerged frame between the paragraphs, or a later shape over one, leaves the card alone', () => {
    const list = frame([[run('indented item')]], { x: 140, y: 230, w: 300, h: 20, group: 0 });
    assert.equal(mergeCardText(deck([title, list, body])).frames.length, 3);
    const above = { kind: 'box', x: 100, y: 255, w: 200, h: 30, fill: { color: '#ffffff', alpha: 1 }, group: 0 };
    assert.equal(mergeCardText({ image: ONE_PX_PNG, shapes: [card, above], frames: [title, body] }).frames.length, 2);
  });
});

describe('calco wrapping label insets', () => {
  test('a wrapping label whose column runs a hair past the card keeps a zero far inset, not a refusal', () => {
    const geom = { x: 80, y: 180, w: 640, h: 200 };
    const placed = { x: 100, y: 200, w: 621, h: 40 };
    assert.deepEqual(labelInsets(geom, placed, 'left', true), { l: 20, t: 20, r: 0 });
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

describe('calco .pptx card body', () => {
  test('a card is one wrapping shape whose insets are the padding less the roundRect\'s own text inset', async () => {
    const card = { kind: 'box', x: 100, y: 100, w: 600, h: 200, radii: [16, 16, 16, 16], fill: { color: '#eeeeee', alpha: 1 }, group: 0 };
    const head = frame([[run('Heading')]], { x: 140, y: 140, w: 520, h: 40, group: 0 });
    const body = frame([[run('Body one')], [run('two')]], { x: 140, y: 200, w: 520, h: 80, group: 0, flow: true });
    const deck = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, shapes: [card], frames: [head, body] }] };
    const zip = await JSZip.loadAsync(await writePptx(PptxGenJS, deck, 'nodebuffer'));
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    assert.equal((xml.match(/<a:p>/g) || []).length, 2, 'heading, then the body as ONE wrapping paragraph');
    assert.match(xml, /prst="roundRect"/);
    assert.match(xml, /wrap="square"/);
    // 40px of padding is 30pt; the preset's own inset is 16px * (1 - cos 45) = 4.69px = 3.52pt.
    const lIns = Number(xml.match(/lIns="(\d+)"/)[1]) / 12700;
    assert.ok(Math.abs(lIns - (30 - 3.52)) < 0.1, `lIns ${lIns}pt`);
  });
});

describe('calco wrapping output conforms', () => {
  // A deck that uses every new path: a merged card (round and per-corner radii), a wrapping title,
  // a centered balanced paragraph, a card with a mixed-style body line, and a pinned code frame.
  const round = { kind: 'box', x: 100, y: 200, w: 600, h: 260, radii: [16, 16, 16, 16], fill: { color: '#eeeeee', alpha: 1 }, stroke: { color: '#999999', alpha: 1, width: 1 }, group: 0 };
  const uneven = { kind: 'box', x: 760, y: 200, w: 420, h: 260, radii: [16, 0, 16, 0], fill: { color: '#eeeeee', alpha: 1 }, group: 1 };
  const bold = style({ weight: 700 });
  const frames = [
    frame([[run('A title that wraps')], [run('onto a second line')]], { x: 100, y: 60, w: 700, role: 'title', flow: true }),
    frame([[{ text: 'Heading', style: bold }]], { x: 140, y: 230, w: 520, h: 40, group: 0 }),
    frame([[run('A body that wraps '), { text: 'with a bold run', style: bold }], [run('onto a second line')]], { x: 140, y: 290, w: 520, h: 80, group: 0, flow: true }),
    frame([[{ text: 'Uneven', style: bold }]], { x: 790, y: 230, w: 340, h: 40, group: 1 }),
    frame([[run('Body of the uneven card')]], { x: 790, y: 290, w: 340, h: 40, group: 1 }),
    frame([[run('Centered and balanced')], [run('over two lines')]], { x: 340, y: 500, w: 600, align: 'center', flow: true }),
    frame([[run('const a = 1;')], [], [run('const b = 2;')]], { x: 100, y: 600, w: 600 }),
  ];
  const deck = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, shapes: [round, uneven], frames }] };

  test('the .pptx passes the ISO 29500 schema and the unique-shape-id rule', async () => {
    const bytes = await writePptx(PptxGenJS, deck, 'nodebuffer', JSZip);
    assert.deepEqual(await checkPptxSchema(bytes), []);
  });

  test('the .odp passes the package-structure checks', async () => {
    const bytes = await writeOdp(JSZip, deck, 'nodebuffer');
    assert.deepEqual(await checkOdp(bytes), []);
  });

  test('the check can fail: a text body with its children out of order is reported', async () => {
    const zip = await JSZip.loadAsync(await writePptx(PptxGenJS, deck, 'nodebuffer', JSZip));
    const part = 'ppt/slides/slide1.xml';
    const xml = await zip.file(part).async('string');
    // An attribute the schema does not define on `a:bodyPr`.
    const broken = xml.replace(/<a:bodyPr([^>]*)>(.*?)<\/a:bodyPr>/, '<a:bodyPr$1 notAnAttribute="1">$2</a:bodyPr>');
    assert.notEqual(broken, xml);
    zip.file(part, broken);
    const findings = await checkPptxSchema(await zip.generateAsync({ type: 'nodebuffer' }));
    assert.ok(findings.some((f) => f.kind === 'schema' && f.part === part), JSON.stringify(findings));
  });
});
