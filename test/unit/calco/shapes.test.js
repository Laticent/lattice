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
const { ONE_PX_JPEG, ONE_PX_PNG, style, frame } = require('./_fixtures');

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

  test('groupShapes nests a pill\'s shapes as a group inside the card\'s group', () => {
    const sp = (name, x) => `<p:sp><p:nvSpPr><p:cNvPr id="${x}" name="${name}"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="0"/><a:ext cx="10" cy="10"/></a:xfrm></p:spPr></p:sp>`;
    const xml = `<p:spTree>${sp('calco-group-1|Card', 2)}${sp('calco-group-1|calco-sub-1|Pill', 3)}${sp('calco-group-1|calco-sub-1|Dot', 4)}${sp('calco-group-1|Other', 5)}</p:spTree>`;
    const out = groupShapes(xml);
    assert.equal(out.match(/<p:grpSp>/g).length, 2, 'the card and the pill');
    assert.match(out, /<p:grpSp>.*name="Card".*<p:grpSp>.*name="Pill".*name="Dot".*<\/p:grpSp>.*name="Other".*<\/p:grpSp>/);
    assert.doesNotMatch(out, /calco-(group|sub)-/);
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

describe('calco shapes — gradient fills', () => {
  const grad = { angle: 90, stops: [{ pos: 0, color: '#e11d48', alpha: 1 }, { pos: 0.5, color: '#facc15', alpha: 0.5 }, { pos: 1, color: '#2563eb', alpha: 0 }] };
  const gradDeck = () => ({ width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [], shapes: [{ kind: 'box', x: 100, y: 100, w: 400, h: 100, radii: [8, 8, 8, 8], fill: { color: '#facc15', alpha: 1 }, gradient: grad }] }] });

  test('pptx writes a gradFill with every stop, its alpha, and an OOXML angle; no tag is left in a name', async () => {
    const zip = await JSZip.loadAsync(await writePptx(PptxGenJS, gradDeck(), 'nodebuffer', JSZip));
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    assert.match(xml, /<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="E11D48">/);
    assert.equal(xml.match(/<a:gs /g).length, 3);
    assert.match(xml, /<a:gs pos="100000"><a:srgbClr val="2563EB"><a:alpha val="0"\/>/);
    assert.match(xml, /<a:lin ang="0" scaled="0"\/>/, 'CSS 90deg (toward the right) is OOXML 0');
    assert.doesNotMatch(xml, /calco-grad-/);
  });

  test('odp writes a named gradient with its stops, and an opacity gradient when the alpha varies', async () => {
    const zip = await JSZip.loadAsync(await writeOdp(JSZip, gradDeck(), 'nodebuffer'));
    const styles = await zip.file('styles.xml').async('string');
    const content = await zip.file('content.xml').async('string');
    assert.match(styles, /<draw:gradient [^>]*draw:angle="90deg"[^>]*>(<loext:gradient-stop [^>]*\/>){3}<\/draw:gradient>/);
    assert.match(styles, /<draw:opacity [^>]*>(<loext:opacity-stop [^>]*\/>){3}<\/draw:opacity>/);
    assert.match(content, /draw:fill="gradient" draw:fill-gradient-name="Gr1" draw:opacity-name="Op2"/);
  });
});

describe('calco shapes — pictures in paint order', () => {
  const card2 = { kind: 'box', x: 100, y: 100, w: 300, h: 140, radii: [8, 8, 8, 8], fill: { color: '#f2f5fa', alpha: 1 }, group: 0 };
  const icon = { kind: 'picture', x: 110, y: 110, w: 40, h: 40, image: ONE_PX_PNG, alt: 'An icon', group: 0 };
  const photo = { kind: 'picture', x: 500, y: 100, w: 200, h: 100, image: ONE_PX_JPEG };
  const spriteDeck = () => ({ width: 1280, height: 720, slides: [{ frames: [], shapes: [card2, icon, photo] }] });

  test('pptx: a picture is a p:pic with its alt text, inside its card\'s group; a loose one stays loose; no slide picture', async () => {
    const zip = await JSZip.loadAsync(await writePptx(PptxGenJS, spriteDeck(), 'nodebuffer', JSZip));
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    assert.equal(xml.match(/<p:pic>/g).length, 2, 'two pictures, no full-slide one');
    const group = xml.match(/<p:grpSp>[\s\S]*?<\/p:grpSp>/)[0];
    assert.match(group, /<p:pic>[\s\S]*descr="An icon"/);
    assert.match(group, /name="Shape 1\.1"/);
    assert.equal((xml.replace(group, '').match(/<p:pic>/g) || []).length, 1, 'the photo is outside the group');
    assert.doesNotMatch(xml, /calco-(group|sub)-/);
  });

  test('odp: a picture is a draw:frame with draw:image, in the card\'s draw:g, and its part is in the manifest', async () => {
    const zip = await JSZip.loadAsync(await writeOdp(JSZip, spriteDeck(), 'nodebuffer'));
    const content = await zip.file('content.xml').async('string');
    const group = content.match(/<draw:g [^>]*>[\s\S]*?<\/draw:g>/)[0];
    assert.match(group, /<draw:image xlink:href="Pictures\/slide001-2\.png"/);
    assert.match(group, /<svg:desc>An icon<\/svg:desc>/);
    assert.match(content, /Pictures\/slide001-3\.jpg|Pictures\/slide001-3\.jpeg/);
    const manifest = await zip.file('META-INF/manifest.xml').async('string');
    assert.match(manifest, /Pictures\/slide001-2\.png/);
    assert.ok(zip.file('Pictures/slide001-2.png'));
    assert.equal(zip.file('Pictures/slide001.png'), null, 'no full-slide picture');
  });
});

describe('calco shapes — a group never draws a member under a shape that is above it', () => {
  test('a card\'s picture that another shape paints over comes out after that shape, as its own group part', () => {
    const cardShape = { kind: 'box', x: 40, y: 40, w: 400, h: 200, radii: [0, 0, 0, 0], fill: { color: '#eef', alpha: 1 }, group: 0 };
    const green = { kind: 'box', x: 320, y: 120, w: 300, h: 150, radii: [0, 0, 0, 0], fill: { color: '#0a0', alpha: 1 } };
    const icon = { kind: 'picture', x: 300, y: 100, w: 60, h: 60, image: ONE_PX_PNG, group: 0 };
    const far = { kind: 'picture', x: 60, y: 60, w: 20, h: 20, image: ONE_PX_PNG, group: 0 };
    const order = drawOrder({ frames: [], shapes: [cardShape, far, green, icon] }, () => false);
    const flat = order.flatMap((o) => o.items.map((d) => d.index));
    assert.deepEqual(flat, [0, 1, 2, 3], 'paint order is kept: card and the far picture, the green box, then the icon');
    assert.equal(order[0].group, 0);
    assert.deepEqual(order[0].items.map((d) => d.index), [0, 1], 'the picture that nothing overlaps stays in the card\'s group');
    assert.equal(order[1].group, undefined);
    assert.equal(order[2].group, 0, 'the icon is a part of the card drawn where it paints');
  });

  test('once a member is held back, a later member that overlaps it is held back too', () => {
    const card = { kind: 'box', x: 0, y: 0, w: 200, h: 100, radii: [0, 0, 0, 0], fill: { color: '#eef', alpha: 1 }, group: 0 };
    const other = { kind: 'box', x: 40, y: 10, w: 10, h: 10, radii: [0, 0, 0, 0], fill: { color: '#0a0', alpha: 1 } };
    const pic = { kind: 'picture', x: 40, y: 10, w: 40, h: 10, image: ONE_PX_PNG, group: 0 };
    const above = { kind: 'box', x: 60, y: 10, w: 10, h: 10, radii: [0, 0, 0, 0], fill: { color: '#c00', alpha: 1 }, group: 0 };
    const flat = drawOrder({ frames: [], shapes: [card, other, pic, above] }, () => false).flatMap((o) => o.items.map((d) => d.index));
    assert.deepEqual(flat, [0, 1, 2, 3], 'paint order is kept: the member above the picture is not drawn before it');
  });
});

describe('calco shapes — free text that clears a picture', () => {
  test('is drawn right after the picture, ahead of a shape painted later', () => {
    const pic = { kind: 'picture', x: 0, y: 0, w: 100, h: 100, image: ONE_PX_PNG };
    const cover = { kind: 'box', x: 10, y: 10, w: 20, h: 20, radii: [0, 0, 0, 0], fill: { color: '#c00', alpha: 1 } };
    const frame = (above) => ({ x: 10, y: 10, w: 20, h: 20, firstLineHeight: 10, lineHeight: 10, align: 'left', lines: [[{ text: 'x' }]], ...(above === undefined ? {} : { above }) });
    const flat = (fr) => drawOrder({ frames: [fr], shapes: [pic, cover] }, () => false).flatMap((o) => o.items.map((d) => ('frame' in d ? 'text' : d.index)));
    assert.deepEqual(flat(frame(0)), [0, 'text', 1]);
    assert.deepEqual(flat(frame()), [0, 1, 'text'], 'without `above`, free text stays on top');
  });
});
