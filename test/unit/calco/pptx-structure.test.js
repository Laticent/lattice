/**
 * Unit: the package Calco's native PPTX writer builds is whole (engineering/decisions/2026-11-13-native-pptx-writer.md
 * §How it is proven, 1). For every parity deck, editable and picture-per-slide:
 *
 *   - every XML part, relationship part and `[Content_Types].xml` is well-formed;
 *   - every part has a content type (every XML part its own override, not the generic `xml` default), and every
 *     content-type override names a part that exists;
 *   - every relationship points at a part that exists, and every part is reached from the package root (nothing
 *     dangles, nothing is unlisted);
 *   - relationship ids are unique per part, and shape ids are unique per slide, layout, master and notes page;
 *   - the slide, layout, master, notes, theme and presentation parts pass the ISO/IEC 29500 schema
 *     (test/conformance/office/office-conformance.js `checkPptxSchema`).
 *
 * Each check has an ARM THAT FAILS: a package broken in the one way that check owns, which it must flag.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { writePptx } = require('@laticent/calco');
const { writePptx: writePicturePptx } = require('../../../lib/export/pptx-export');
const { parseXml } = require('../../helpers/pptx-readback');
const { checkPptxSchema } = require('../../conformance/office/office-conformance');
const { parityDecks } = require('./_parity-decks');

/** Every structural finding in a package, as plain strings. An empty list is a whole package. */
async function structure(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const found = [];
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const has = new Set(names);
  const docs = new Map();
  for (const n of names) {
    if (!/\.(xml|rels)$/.test(n)) continue;
    try {
      docs.set(n, parseXml(await zip.file(n).async('string'), n));
    } catch (e) {
      found.push(`malformed: ${n}: ${e.message.slice(0, 80)}`);
    }
  }
  const types = docs.get('[Content_Types].xml');
  if (!types) return [...found, 'no [Content_Types].xml'];
  const defaults = new Set([...types.getElementsByTagName('Default')].map((d) => d.getAttribute('Extension').toLowerCase()));
  const overrides = new Set([...types.getElementsByTagName('Override')].map((o) => o.getAttribute('PartName').slice(1)));
  for (const o of overrides) if (!has.has(o)) found.push(`override for a missing part: ${o}`);
  for (const n of names) {
    if (n === '[Content_Types].xml') continue;
    // An XML part needs a type of its own: the `xml` default (application/xml) tells PowerPoint nothing about what it is.
    if (n.endsWith('.xml') ? !overrides.has(n) : !overrides.has(n) && !defaults.has(n.split('.').pop().toLowerCase())) found.push(`no content type: ${n}`);
  }
  // Walk the relationships from the package root.
  const reached = new Set(['[Content_Types].xml']);
  const queue = [''];
  while (queue.length) {
    const partName = queue.shift();
    const dir = partName.includes('/') ? partName.slice(0, partName.lastIndexOf('/')) : '';
    const relsName = partName ? `${dir ? `${dir}/` : ''}_rels/${partName.slice(dir ? dir.length + 1 : 0)}.rels` : '_rels/.rels';
    if (!has.has(relsName)) continue;
    reached.add(relsName);
    const rels = docs.get(relsName);
    if (!rels) continue;
    const ids = new Set();
    for (const r of [...rels.getElementsByTagName('Relationship')]) {
      const id = r.getAttribute('Id');
      if (ids.has(id)) found.push(`repeated relationship id ${id} in ${relsName}`);
      ids.add(id);
      if (r.getAttribute('TargetMode') === 'External') continue;
      const segs = dir ? dir.split('/') : [];
      for (const seg of r.getAttribute('Target').split('/')) {
        if (seg === '..') segs.pop();
        else if (seg !== '.') segs.push(seg);
      }
      const target = r.getAttribute('Target').startsWith('/') ? r.getAttribute('Target').slice(1) : segs.join('/');
      if (!has.has(target)) found.push(`dangling relationship ${relsName} ${id} → ${target}`);
      else if (!reached.has(target)) {
        reached.add(target);
        queue.push(target);
      }
    }
  }
  for (const n of names) if (!reached.has(n)) found.push(`unlisted part: ${n}`);
  // Shape ids, per part that holds a shape tree.
  for (const [n, doc] of docs) {
    if (!/^ppt\/(slides|slideLayouts|slideMasters|notesSlides|notesMasters)\/[^/]+\.xml$/.test(n)) continue;
    const ids = [...doc.getElementsByTagName('p:cNvPr')].map((c) => c.getAttribute('id'));
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) found.push(`repeated shape id ${dup[0]} in ${n}`);
  }
  return found;
}

async function packages() {
  const decks = await parityDecks();
  const out = {};
  for (const [name, deck] of Object.entries(decks.editable)) out[name] = await writePptx(JSZip, deck, 'nodebuffer');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'calco-structure-'));
  for (const [name, d] of Object.entries(decks.pictures)) {
    const file = path.join(tmp, `${name}.pptx`);
    await writePicturePptx(file, d.pngs, d.meta, d.notes, d.descriptions);
    out[`cli-${name}`] = fs.readFileSync(file);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}

describe('calco pptx — package structure', () => {
  let all;
  const get = async () => (all ||= await packages());

  test('every parity deck is a whole package', async () => {
    for (const [name, bytes] of Object.entries(await get())) assert.deepEqual(await structure(bytes), [], name);
  });

  test('a hand-built deck with out-of-range numbers, odd colors and markup in a group still passes', async () => {
    // What Calco's reader never hands over, but a caller of the public API can: each value is coerced or clamped.
    const { ONE_PX_PNG, style, frame } = require('./_fixtures');
    const wild = style({ size: 8000, letterSpacing: 9000, color: '#abc', alpha: -0.5, highlight: 'rgb(1,2,3)' });
    const deck = {
      width: 1280,
      height: 722,
      title: 'lone \uD800 surrogate',
      slides: [
        {
          image: ONE_PX_PNG,
          notes: 'half \uDC00 pair',
          frames: [frame([[{ text: 'Big', style: wild }]], { lineHeight: -5, group: '"><p:evil x="' }), frame([[{ text: 'NaN', style: style({ size: Number.NaN }) }]], { x: Number.NaN })],
          shapes: [
            { kind: 'box', x: 10, y: 10, w: 100, h: 50, radii: [0, 0, 0, 0], fill: { color: '#aabbcc80', alpha: 2 }, stroke: { color: 'red', alpha: 1, width: 3000 }, shadow: { color: '#000000', alpha: 1, x: 1, y: 1, blur: -5 }, group: '"><p:evil x="' },
            { kind: 'box', x: 200, y: 10, w: 100, h: 50, radii: [0, 0, 0, 0], fill: { color: '#336699', alpha: 1 }, gradient: { angle: 90, stops: [{ pos: -1, color: '#000000', alpha: 1 }, { pos: 1.5, color: '#ffffff', alpha: 1 }] } },
          ],
        },
      ],
    };
    const bytes = await writePptx(JSZip, deck, 'nodebuffer');
    assert.deepEqual(await structure(bytes), []);
    assert.deepEqual(await checkPptxSchema(bytes), []);
    const xml = await (await JSZip.loadAsync(bytes)).file('ppt/slides/slide1.xml').async('string');
    assert.doesNotMatch(xml, /<p:evil/, 'a group value is an attribute, never an element');
    assert.doesNotMatch(xml, /="-?NaN"/, 'no attribute is NaN');
    assert.doesNotMatch(xml, /\uFFFD/, 'no replacement character from a lone surrogate');
  });

  test('every parity deck passes the ISO/IEC 29500 schema', async () => {
    for (const [name, bytes] of Object.entries(await get())) assert.deepEqual(await checkPptxSchema(bytes), [], name);
  });

  describe('arms that fail', () => {
    const broken = async (fn) => {
      const zip = await JSZip.loadAsync((await get()).rich);
      await fn(zip, async (n) => zip.file(n).async('string'));
      return structure(await zip.generateAsync({ type: 'nodebuffer' }));
    };
    test('a malformed part', async () => {
      assert.match((await broken(async (z, t) => z.file('ppt/slides/slide2.xml', (await t('ppt/slides/slide2.xml')).replace('</p:sld>', '')))).join(), /malformed: ppt\/slides\/slide2\.xml/);
    });
    test('a dangling relationship', async () => {
      assert.match((await broken(async (z) => z.remove('ppt/notesSlides/notesSlide3.xml'))).join(), /dangling relationship .*notesSlide3\.xml/);
    });
    test('an unlisted part, and one with no content type', async () => {
      const found = (await broken(async (z) => z.file('ppt/stray.bin', 'x'))).join();
      assert.match(found, /unlisted part: ppt\/stray\.bin/);
      assert.match(found, /no content type: ppt\/stray\.bin/);
    });
    test('an XML part typed only by the generic xml default', async () => {
      const found = await broken(async (z, t) => z.file('[Content_Types].xml', (await t('[Content_Types].xml')).replace(/<Override PartName="\/ppt\/notesSlides\/notesSlide1\.xml"[^>]*\/>/, '')));
      assert.match(found.join(), /no content type: ppt\/notesSlides\/notesSlide1\.xml/);
    });
    test('the schema check: a shape whose outline comes before its fill', async () => {
      const zip = await JSZip.loadAsync((await get()).rich);
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      zip.file('ppt/slides/slide1.xml', xml.replace(/(<a:solidFill><a:srgbClr val="F2F5FA"\/><\/a:solidFill>)(<a:ln [^>]*>[\s\S]*?<\/a:ln>)/, '$2$1'));
      const found = await checkPptxSchema(await zip.generateAsync({ type: 'nodebuffer' }));
      assert.ok(found.some((f) => f.kind === 'schema' && f.part === 'ppt/slides/slide1.xml'), JSON.stringify(found));
    });
    test('an override for a part that is not there', async () => {
      assert.match((await broken(async (z, t) => z.file('[Content_Types].xml', (await t('[Content_Types].xml')).replace('</Types>', '<Override PartName="/ppt/gone.xml" ContentType="application/xml"/></Types>')))).join(), /override for a missing part: ppt\/gone\.xml/);
    });
    test('a repeated shape id and a repeated relationship id', async () => {
      const found = (
        await broken(async (z, t) => {
          z.file('ppt/slides/slide1.xml', (await t('ppt/slides/slide1.xml')).replace('<p:cNvPr id="3"', '<p:cNvPr id="2"'));
          z.file('ppt/slides/_rels/slide1.xml.rels', (await t('ppt/slides/_rels/slide1.xml.rels')).replace('Id="rId2"', 'Id="rId1"'));
        })
      ).join();
      assert.match(found, /repeated shape id 2 in ppt\/slides\/slide1\.xml/);
      assert.match(found, /repeated relationship id rId1/);
    });
  });
});
