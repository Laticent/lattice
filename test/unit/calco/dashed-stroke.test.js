/**
 * Unit: a dashed or dotted outline (a CSS `dashed` / `dotted` border the reader lifts) in both
 * writers. It is the same line with a native dash pattern, so it stays an editable line in the
 * office suite rather than a picture: PowerPoint's preset `dash` / `sysDot`, and a named
 * `draw:stroke-dash` in OpenDocument, about four widths on and three off for a dash, one and one
 * for a dot. A solid line carries no pattern.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const PptxGenJS = require('pptxgenjs');
const { writeOdp, writePptx } = require('@laticent/calco');
const { ONE_PX_PNG } = require('./_fixtures');

// A journey plumb line: a 2px dashed rule, 60px tall (the side a border-left was).
const rule = (dash) => ({ kind: 'line', x: 200, y: 100, w: 0, h: 60, stroke: { color: '#1e3a5f', alpha: 1, width: 2, ...(dash ? { dash } : {}) }, side: 'left' });
const box = (dash) => ({ kind: 'box', x: 300, y: 100, w: 40, h: 20, radii: [0, 0, 0, 0], stroke: { color: '#888888', alpha: 1, width: 1, dash } });
const deck = (...shapes) => ({ width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [], shapes }] });

describe('calco dashed and dotted strokes', () => {
  test('.pptx: a dashed line is preset `dash`, a dotted box `sysDot`, a solid line has no pattern', async () => {
    const zip = await JSZip.loadAsync(await writePptx(PptxGenJS, deck(rule('dash'), box('dot'), rule()), 'nodebuffer', JSZip));
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    const sps = xml.match(/<p:(?:sp|cxnSp)>(?:(?!<\/p:(?:sp|cxnSp)>).)*<\/p:(?:sp|cxnSp)>/gs);
    const named = (re) => sps.filter((s) => re.test(s));
    assert.equal(named(/<a:prstDash val="dash"\/>/).length, 1, 'one dashed line');
    assert.equal(named(/<a:prstDash val="sysDot"\/>/).length, 1, 'one dotted box');
    assert.equal(named(/<a:prstDash val="(?!solid)/).length, 2, 'the solid line carries no pattern');
  });

  test('.odp: a dashed line and a dotted box name a stroke-dash, each written once to styles.xml', async () => {
    const zip = await JSZip.loadAsync(await writeOdp(JSZip, deck(rule('dash'), rule('dash'), box('dot'), rule()), 'nodebuffer'));
    const content = await zip.file('content.xml').async('string');
    const styles = await zip.file('styles.xml').async('string');
    assert.match(content, /draw:stroke="dash" draw:stroke-dash="Dash"/);
    assert.match(content, /draw:stroke="dash" draw:stroke-dash="Dot"/);
    assert.match(content, /draw:stroke="solid"/, 'the solid line stays solid');
    assert.equal((styles.match(/<draw:stroke-dash draw:name="Dash"[^>]*draw:dots1-length="400%" draw:distance="300%"\/>/g) || []).length, 1, 'one Dash definition');
    assert.equal((styles.match(/<draw:stroke-dash draw:name="Dot"[^>]*draw:dots1-length="100%" draw:distance="100%"\/>/g) || []).length, 1, 'one Dot definition');
  });

  test('.odp: a deck with no dashed stroke writes no stroke-dash', async () => {
    const zip = await JSZip.loadAsync(await writeOdp(JSZip, deck(rule()), 'nodebuffer'));
    assert.doesNotMatch(await zip.file('styles.xml').async('string'), /draw:stroke-dash/);
  });
});
