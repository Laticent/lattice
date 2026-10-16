/**
 * Unit: Calco's native shapes (docs/src/lib/calco/shapes.ts) and how both writers draw them.
 * Geometry: a box's path runs along the middle of its border band; a uniform radius is a
 * preset, per-corner radii a path; a rule on a rounded box wraps 45° of each corner. Order:
 * a card's group is drawn whole, a label carries its text or falls back to a group. Writers:
 * the .pptx gets presets, custom geometry and a p:grpSp per card (written by post-processing,
 * as PptxGenJS 3.12 has no group API); the .odp gets draw:rect, draw:custom-shape, draw:line
 * and draw:g. Design: engineering/decisions/2026-10-07-calco-native-shapes.md.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const PptxGenJS = require('pptxgenjs');
const { drawOrder, groupShapes, labelInsets, shapeGeometry, writeOdp, writePptx } = require('@laticent/calco');
const { ONE_PX_PNG, style, frame } = require('./_fixtures');

const card = { kind: 'box', x: 100, y: 100, w: 300, h: 160, radii: [10, 10, 10, 10], fill: { color: '#f2f5fa', alpha: 1 }, stroke: { color: '#898e95', alpha: 1, width: 1 }, group: 0 };
const accent = { kind: 'line', side: 'bottom', x: 110, y: 258.5, w: 280, h: 0, stroke: { color: '#2e608a', alpha: 1, width: 3 }, wrap: [10, 10], group: 0 };
const tag = { kind: 'box', x: 101, y: 101, w: 80, h: 24, radii: [10, 0, 7, 0], fill: { color: '#2e608a', alpha: 1 }, text: 0, group: 0 };
const tagText = frame([[{ text: 'Build', style: style({ size: 12, color: '#ffffff' }) }]], { x: 111, y: 105, w: 40, h: 16, firstLineHeight: 15, lineHeight: 16 });
const body = frame([[{ text: 'Owns the policy.', style: style({ size: 18 }) }]], { x: 120, y: 160, w: 200, h: 24, firstLineHeight: 22, lineHeight: 24, group: 0 });
const rule = { kind: 'line', side: 'bottom', x: 40, y: 500, w: 600, h: 0, stroke: { color: '#898e95', alpha: 1, width: 2 } };
const slide = () => ({ image: ONE_PX_PNG, frames: [tagText, body, frame([[{ text: 'Free text', style: style() }]], { y: 600 })], shapes: [card, accent, tag, rule] });
const deck = () => ({ width: 1280, height: 720, slides: [slide()] });

describe('calco shapes — geometry', () => {
  test('a stroked box is inset by half its stroke; one radius is a preset', () => {
    const g = shapeGeometry(card);
    assert.deepEqual([g.x, g.y, g.w, g.h], [100.5, 100.5, 299, 159]);
    assert.equal(g.preset, 'rect');
    assert.equal(g.radius, 9.5);
    assert.equal(g.closed, true);
  });

  test('per-corner radii are a closed path with an arc only where a corner is round', () => {
    const g = shapeGeometry(tag);
    assert.equal(g.preset, undefined);
    assert.equal(g.path.filter((c) => c[0] === 'C').length, 2);
    assert.deepEqual(g.path[0], ['M', 10, 0]);
    assert.deepEqual(g.path.at(-1), ['Z']);
  });

  test('a rule on a rounded box wraps 45° of each corner; a square one is a line preset', () => {
    const g = shapeGeometry(accent);
    assert.equal(g.closed, false);
    assert.equal(g.path.filter((c) => c[0] === 'C').length, 2);
    // The arcs rise from the band's middle toward the corners: the box is 8.5 · (1 - cos 45°) tall.
    assert.ok(Math.abs(g.h - 8.5 * (1 - Math.SQRT1_2)) < 0.01, `height ${g.h}`);
    assert.ok(Math.abs(g.y + g.h - 258.5) < 0.01);
    const flat = shapeGeometry(rule);
    assert.equal(flat.preset, 'line');
    assert.deepEqual([flat.x, flat.y, flat.w, flat.h], [40, 500, 600, 0]);
  });

  test('label insets: the edge the alignment grows from; null when the text pokes out', () => {
    const g = { x: 100, y: 100, w: 80, h: 24 };
    assert.deepEqual(labelInsets(g, { x: 110, y: 103, w: 50, h: 16 }, 'left'), { l: 10, t: 3, r: 0 });
    assert.deepEqual(labelInsets(g, { x: 110, y: 103, w: 50, h: 16 }, 'right'), { l: 0, t: 3, r: 20 });
    assert.deepEqual(labelInsets(g, { x: 120, y: 103, w: 40, h: 16 }, 'center'), { l: 0, t: 3, r: 0 });
    assert.deepEqual(labelInsets(g, { x: 125, y: 103, w: 40, h: 16 }, 'center'), { l: 10, t: 3, r: 0 });
    assert.equal(labelInsets(g, { x: 110, y: 98, w: 50, h: 16 }, 'left'), null);
  });
});

describe('calco shapes — draw order', () => {
  test('the card is drawn whole, shapes then text; free shapes in place; free text on top', () => {
    const order = drawOrder(slide(), () => true);
    assert.equal(order.length, 3);
    assert.equal(order[0].group, 0);
    assert.deepEqual(order[0].items.map((d) => ('frame' in d ? `text ${d.index}` : `shape ${d.index}${d.label ? ' +label' : ''}`)), ['shape 0', 'shape 1', 'shape 2 +label', 'text 1']);
    assert.equal(order[1].group, undefined);
    assert.equal(order[1].items[0].index, 3);
    assert.equal(order[2].items[0].frame.y, 600);
  });

  test('a label that cannot carry its text is drawn beside it, in its group', () => {
    const order = drawOrder(slide(), () => false);
    assert.deepEqual(order[0].items.map((d) => ('frame' in d ? `text ${d.index}` : `shape ${d.index}${d.label ? ' +label' : ''}`)), ['shape 0', 'shape 1', 'shape 2', 'text 0', 'text 1']);
    // A free label groups with its own text.
    const lone = { image: ONE_PX_PNG, frames: [tagText], shapes: [{ ...tag, group: undefined }] };
    const solo = drawOrder(lone, () => false);
    assert.equal(solo.length, 1);
    assert.equal(solo[0].group, 0);
    assert.equal(solo[0].items.length, 2);
  });
});

describe('calco shapes — pptx', () => {
  test('presets, custom geometry and a rule, the card grouped in a p:grpSp', async () => {
    const zip = await JSZip.loadAsync(await writePptx(PptxGenJS, deck(), 'nodebuffer', JSZip));
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    assert.equal(xml.match(/<p:grpSp>/g).length, 1, 'one card group');
    assert.doesNotMatch(xml, /calco-group-/, 'the tag is gone from every name');
    const group = xml.match(/<p:grpSp>[\s\S]*<\/p:grpSp>/)[0];
    assert.match(group, /prst="roundRect"/);
    assert.match(group, /<a:custGeom>/);
    assert.match(group, /<a:t>BUILD<\/a:t>|<a:t>Build<\/a:t>/, 'the label carries its word');
    assert.match(group, /Owns the policy\./);
    assert.match(group, /<a:chOff x="(\d+)" y="(\d+)"\/>/);
    const [, ox, oy] = group.match(/<a:off x="(\d+)" y="(\d+)"\/>/);
    const [, cx, cy] = group.match(/<a:chOff x="(\d+)" y="(\d+)"\/>/);
    assert.deepEqual([ox, oy], [cx, cy], 'children keep slide coordinates');
    // Outside the group: the free rule (a line preset) and the free text box.
    const outside = xml.replace(group, '');
    assert.match(outside, /prst="line"/);
    assert.match(outside, /Free text/);
    // Unique ids, the group's included.
    const ids = Array.from(xml.matchAll(/<p:cNvPr id="(\d+)"/g), (m) => m[1]);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('the label is one shape: custom geometry, fill, text and insets on the same p:sp', async () => {
    const zip = await JSZip.loadAsync(await writePptx(PptxGenJS, deck(), 'nodebuffer', JSZip));
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    const label = xml.match(/<p:sp>(?:(?!<\/p:sp>)[\s\S])*?Build(?:(?!<\/p:sp>)[\s\S])*?<\/p:sp>/)[0];
    assert.match(label, /<a:custGeom>/);
    assert.match(label, /<a:srgbClr val="2E608A"/);
    assert.match(label, /lIns="\d+"/);
    assert.match(label, /wrap="none"/);
  });

  test('groupShapes groups adjacent members only, and stays linear on a hostile slide', () => {
    const sp = (name, x) => `<p:sp><p:nvSpPr><p:cNvPr id="${x}" name="${name}"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="0"/><a:ext cx="10" cy="10"/></a:xfrm></p:spPr></p:sp>`;
    const xml = `<p:spTree>${sp('calco-group-1|A', 2)}${sp('calco-group-1|B', 3)}<p:pic/>${sp('calco-group-1|C', 4)}${sp('Free', 5)}</p:spTree>`;
    const out = groupShapes(xml);
    assert.equal(out.match(/<p:grpSp>/g).length, 2, 'a picture between members splits the group');
    assert.match(out, /<p:grpSp>.*name="A".*name="B".*<\/p:grpSp><p:pic\/><p:grpSp>.*name="C".*<\/p:grpSp>.*name="Free"/);
    // Many opening tags and no close: CodeQL's polynomial case for a regex over runs.
    const hostile = `calco-group-${'<p:sp>'.repeat(50000)}`;
    const t = Date.now();
    assert.equal(groupShapes(hostile), hostile);
    assert.ok(Date.now() - t < 500, `took ${Date.now() - t} ms`);
  });

  test('groupShapes leaves a slide without tags as it was', () => {
    const xml = '<p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Text 1"/></p:nvSpPr></p:sp></p:spTree>';
    assert.equal(groupShapes(xml), xml);
  });
});

describe('calco shapes — odp', () => {
  test('draw:rect, draw:custom-shape and draw:line, the card in a draw:g, the label holding its text', async () => {
    const zip = await JSZip.loadAsync(await writeOdp(JSZip, deck(), 'nodebuffer'));
    const xml = await zip.file('content.xml').async('string');
    const group = xml.match(/<draw:g [^>]*>[\s\S]*?<\/draw:g>/)[0];
    assert.match(group, /<draw:rect [^>]*draw:corner-radius="[\d.]+cm"/);
    assert.match(group, /<draw:custom-shape [^>]*><text:p [^>]*><text:span [^>]*>Build<\/text:span><\/text:p><draw:enhanced-geometry [^>]*draw:enhanced-path="M 1000 0 [^"]* Z N"/);
    assert.match(group, /draw:enhanced-path="M [^"]* F N"/, 'the wrapped rule is an open, unfilled path');
    assert.match(group, /Owns the policy\./);
    assert.match(xml.replace(group, ''), /<draw:line [^>]*svg:x1=/);
    assert.match(xml, /draw:fill-color="#f2f5fa"/);
    assert.match(xml, /svg:stroke-color="#898e95" svg:stroke-opacity="100%"/);
    assert.match(xml, /fo:wrap-option="no-wrap"/);
  });
});
