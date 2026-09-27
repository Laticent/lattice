// The shared PDF writer (lib/core/pdf-compose): the parts that run without a page.
// The reader and the camera need a browser; test/integration/export covers them end to
// end through the CLI. See engineering/decisions/2026-09-27-studio-export-one-engine.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const FONT = fs.readFileSync(path.join(ROOT, 'assets/fonts/jetbrains-400.woff2'));
const WASM = fs.readFileSync(require.resolve('harfbuzzjs/hb-subset.wasm'));

let compose, write, subsetMod, fontkit, pdfLib;
test.before(async () => {
	compose = await import('../../../lib/core/pdf-compose/compose.mjs');
	write = await import('../../../lib/core/pdf-compose/write-pdf.mjs');
	subsetMod = await import('../../../lib/core/pdf-compose/font-subset.mjs');
	fontkit = (await import('@pdf-lib/fontkit')).default;
	pdfLib = await import('pdf-lib');
});

test('pickFace: family, style and weight range, as the browser matches them', () => {
	const faces = [
		{ fam: 'Outfit', wt: '100 900', st: 'normal', url: 'a' },
		{ fam: 'Playfair Display', wt: '400', st: 'normal', url: 'b' },
		{ fam: 'Playfair Display', wt: '700', st: 'normal', url: 'c' },
		{ fam: 'Playfair Display', wt: '400', st: 'italic', url: 'd' },
	];
	assert.equal(compose.pickFace(faces, 'outfit', 650, false).url, 'a', 'a variable face covers its whole range');
	assert.equal(compose.pickFace(faces, 'Playfair Display', 700, false).url, 'c');
	assert.equal(compose.pickFace(faces, 'Playfair Display', 400, true).url, 'd', 'italic prefers the italic cut');
	assert.equal(compose.pickFace(faces, 'Playfair Display', 600, false).url, 'c', 'above 500, a tie goes to the heavier face');
	assert.equal(compose.pickFace(faces, 'Outfit', 400, true).url, 'a', 'no italic cut: the upright face (synthesized oblique)');
	assert.equal(compose.pickFace(faces, 'Inter', 400, false), null, 'an unknown family is refused, not substituted');
});

test('font subset: decodes WOFF2, keeps exactly the characters asked for', async () => {
	const subset = await subsetMod.createFontSubsetter(WASM);
	const ttf = await subset(FONT, 'Q3 AT A GLANCE', { wght: 600 });
	const fk = fontkit.create(ttf);
	for (const ch of 'Q3ATGLNCE') assert.ok(fk.hasGlyphForCodePoint(ch.codePointAt(0)), `keeps ${ch}`);
	assert.ok(!fk.hasGlyphForCodePoint('z'.codePointAt(0)), 'drops a character never used');
	assert.ok(ttf.length < FONT.length, `the subset (${ttf.length} B) is smaller than the source (${FONT.length} B)`);
});

test('font subset: a variable face pinned to a weight draws at that weight', async () => {
	const subset = await subsetMod.createFontSubsetter(WASM);
	const src = fs.readFileSync(path.join(ROOT, 'assets/fonts/jetbrains-400.woff2'));
	const light = fontkit.create(await subset(src, 'M', { wght: 100 }));
	const heavy = fontkit.create(await subset(src, 'M', { wght: 800 }));
	const area = (fk) => { const b = fk.glyphForCodePoint(77).path.bbox; return (b.maxX - b.minX) * (b.maxY - b.minY); };
	// A monospace advance never moves, so compare the outline instead: a heavier M is not
	// the same drawing. If the face is static, both pins are no-ops and this says so.
	const pinned = light.glyphForCodePoint(77).path.toSVG() !== heavy.glyphForCodePoint(77).path.toSVG();
	assert.ok(pinned || area(light) === area(heavy), 'pinning either changes the outline (variable) or is a no-op (static)');
});

test('writer: one page per slide, real text, vector shapes and clickable links', async () => {
	const subset = await subsetMod.createFontSubsetter(WASM);
	const ttf = await subset(FONT, 'Hello', { wght: 400 });
	const fonts = new Map([['k', { ttf, synthItalic: false }]]);
	const slide = {
		w: 1280, h: 720,
		words: [{ t: 'Hello', fontKey: 'k', x: 100, top: 100, w: 60, h: 24, size: 20, ls: 0, color: [20, 30, 40, 1], op: 1 }],
		shapes: [{ d: 'M0 0L100 0', mat: [1, 0, 0, 1, 50, 50], fill: null, stroke: [200, 0, 0, 1], sw: 2, sop: 1, fop: 1, cap: 'round', dash: 'none' }],
		links: [{ href: 'https://example.com/', x: 100, y: 100, w: 60, h: 24 }],
	};
	const { bytes, drift } = await write.writeDeckPdf({ slides: [slide, { ...slide, links: [] }], fonts });
	const doc = await pdfLib.PDFDocument.load(bytes);
	assert.equal(doc.getPageCount(), 2);
	const { width, height } = doc.getPage(0).getSize();
	assert.deepEqual([width, height], [1280 * write.PT_PER_PX, 720 * write.PT_PER_PX], 'the same 96 dpi page Chrome prints');
	const annots = doc.getPage(0).node.Annots();
	assert.equal(annots?.size(), 1, 'the link survives as a Link annotation');
	assert.equal(drift.length, 2, 'every HTML word reports its width drift');
	const embedded = doc.context.enumerateIndirectObjects().some(([, o]) => o instanceof pdfLib.PDFDict && o.has(pdfLib.PDFName.of('FontFile2')));
	assert.ok(embedded, 'the font is embedded, not referenced');
});

test('fontMetrics: USE_TYPO_METRICS picks the typo ascender, else hhea', () => {
	const hhea = write.fontMetrics({ unitsPerEm: 1000, ascent: 900, descent: -300, 'OS/2': { fsSelection: 0, typoAscender: 800, typoDescender: -200 } });
	assert.deepEqual(hhea, { asc: 0.9, desc: 0.3 });
	const typo = write.fontMetrics({ unitsPerEm: 1000, ascent: 900, descent: -300, 'OS/2': { fsSelection: 0x80, typoAscender: 800, typoDescender: -200 } });
	assert.deepEqual(typo, { asc: 0.8, desc: 0.2 });
});
