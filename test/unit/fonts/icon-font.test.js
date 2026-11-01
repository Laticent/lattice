/**
 * The Lattice Icons font (engineering/decisions/2026-11-01-icon-font.md § 6 step 1): its codepoints never move, it
 * matches the icon drawings it was built from, and every glyph carries the metrics that put it where the SVG draws.
 *
 * The font is built by hand (`npm run icons:font`, which needs Python); these read the committed files. The bearing
 * arm is the bake-off's finding: with a left side bearing of 0, Chrome slid every icon left by its own margin, 1 px
 * framed and 3 to 4 px bare. FALSIFIABLE: a font built with a bearing of 0 fails it on every glyph with a margin.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { assignCodepoints, staleIconFont, FACES } = require('../../../tools/build-icon-font.js');
const { ICON_CODEPOINTS, ICON_FACES, ICON_FAMILY } = require('../../../lib/fonts/icon-faces.js');
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'plugins', '_icons-source', 'codepoints.json'), 'utf8'));
const ICONS = require('../../../lib/plugins/icons/icons.data.generated.js').icons;

test('a new icon takes the next slot, a removed one keeps its slot, and a returning one gets it back', () => {
  const start = { format: 1, next: 'E002', icons: { a: 'E000', b: 'E001' }, retired: {} };
  const added = assignCodepoints(start, ['a', 'b', 'c']).map;
  assert.equal(added.icons.c, 'E002');
  assert.equal(added.next, 'E003');
  const removed = assignCodepoints(added, ['a', 'c']).map;
  assert.equal(removed.retired.b, 'E001', 'a removed icon keeps its slot');
  assert.equal(assignCodepoints(removed, ['a', 'c', 'd']).map.icons.d, 'E003', 'a new icon never reuses a retired slot');
  assert.equal(assignCodepoints(removed, ['a', 'b', 'c']).map.icons.b, 'E001', 'a returning icon gets its slot back');
  assert.equal(assignCodepoints(start, ['a', 'b']).changed, false);
});

test('every curated icon has its own private-use codepoint, and none is reused', () => {
  assert.deepEqual(Object.keys(MAP.icons).sort(), Object.keys(ICONS).sort());
  const all = [...Object.values(MAP.icons), ...Object.values(MAP.retired)].map((h) => Number.parseInt(h, 16));
  assert.equal(new Set(all).size, all.length, 'a codepoint is used twice');
  for (const n of all) assert.ok(n >= 0xe000 && n <= 0xf8ff, `U+${n.toString(16)} is outside the private-use area`);
  assert.ok(all.every((n) => n < Number.parseInt(MAP.next, 16)), '`next` must be past every slot ever used');
  assert.deepEqual(ICON_CODEPOINTS, MAP.icons, 'the manifest carries the map');
});

test('the committed font matches the drawings it was built from', () => {
  assert.deepEqual(staleIconFont(), []);
  assert.equal(ICON_FAMILY, 'Lattice Icons');
  assert.deepEqual(ICON_FACES.map((f) => [f.weight, f.stroke]), FACES.map((f) => [f.weight, f.stroke]));
});

/** The tables of one sfnt, by tag. */
function tables(sfnt) {
  const v = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const out = {};
  for (let i = 0, n = v.getUint16(4); i < n; i++) {
    const r = 12 + i * 16;
    const tag = String.fromCharCode(sfnt[r], sfnt[r + 1], sfnt[r + 2], sfnt[r + 3]);
    out[tag] = new DataView(sfnt.buffer, sfnt.byteOffset + v.getUint32(r + 8), v.getUint32(r + 12));
  }
  return out;
}

/** cmap format 4: codepoint → glyph id. */
function cmapOf(t) {
  const c = t.cmap;
  const map = new Map();
  for (let i = 0, n = c.getUint16(2); i < n; i++) {
    const off = c.getUint32(4 + i * 8 + 4);
    if (c.getUint16(off) !== 4) continue;
    const segs = c.getUint16(off + 6) / 2;
    const ends = off + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
    for (let s = 0; s < segs; s++) {
      const end = c.getUint16(ends + s * 2), start = c.getUint16(starts + s * 2), delta = c.getInt16(deltas + s * 2), ro = c.getUint16(ranges + s * 2);
      for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
        const gid = ro ? c.getUint16(ranges + s * 2 + ro + (cp - start) * 2) : (cp + delta) & 0xffff;
        if (gid) map.set(cp, gid);
      }
    }
    return map;
  }
  throw new Error('no cmap format 4');
}

test('every face: one glyph per icon at its codepoint, the em the grid fills, installable, and true side bearings', async () => {
  const { default: decompress } = await import(path.join(ROOT, 'node_modules/woff2-encoder/dist/decompress.js'));
  for (const face of ICON_FACES) {
    const sfnt = new Uint8Array(await decompress(fs.readFileSync(path.join(ROOT, 'assets', 'fonts', `${face.file}.woff2`))));
    const t = tables(sfnt);
    assert.equal(t.head.getUint16(18), 1000, `${face.file}: unitsPerEm`);
    assert.equal(t.hhea.getInt16(4), 800, `${face.file}: ascender (the grid's top)`);
    assert.equal(t.hhea.getInt16(6), -200, `${face.file}: descender (the grid's foot)`);
    assert.equal(t['OS/2'].getUint16(8), 0, `${face.file}: fsType 0, installable embedding`);
    assert.equal(t['OS/2'].getUint16(4), face.weight, `${face.file}: usWeightClass`);
    const cmap = cmapOf(t);
    for (const [name, hex] of Object.entries(ICON_CODEPOINTS)) assert.ok(cmap.get(Number.parseInt(hex, 16)), `${face.file}: no glyph for ${name}`);
    // The left side bearing of every glyph is its own xMin (the bake-off's finding).
    const long = t.head.getInt16(50) === 1;
    const glyphs = t.maxp.getUint16(4), metrics = t.hhea.getUint16(34);
    const at = (gid) => (long ? t.loca.getUint32(gid * 4) : t.loca.getUint16(gid * 2) * 2);
    let checked = 0;
    for (let gid = 0; gid < glyphs; gid++) {
      if (at(gid + 1) === at(gid)) continue;
      const xMin = t.glyf.getInt16(at(gid) + 2);
      const lsb = gid < metrics ? t.hmtx.getInt16(gid * 4 + 2) : t.hmtx.getInt16(metrics * 4 + (gid - metrics) * 2);
      assert.equal(lsb, xMin, `${face.file}: glyph ${gid} has bearing ${lsb} but starts at ${xMin}`);
      checked++;
    }
    assert.equal(checked, Object.keys(ICON_CODEPOINTS).length, `${face.file}: every icon glyph has an outline`);
  }
});
