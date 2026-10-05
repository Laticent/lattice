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
	// jetbrains-400.woff2 is VARIABLE (wght 100-800), so a working pin must change the drawing;
	// "or the areas match" would pass a pin that did nothing (the checker's catch).
	assert.ok(pinned, 'a heavier pin draws a different M');
	assert.ok(area(heavy) > area(light), 'and the heavier M covers more');
});

test('writer: one page per slide, real text, vector shapes and clickable links', async () => {
	const subset = await subsetMod.createFontSubsetter(WASM);
	const ttf = await subset(FONT, 'Hello', { wght: 400 });
	const fonts = new Map([['k', { ttf }]]);
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

test('writer: the synthetic slant is per word, not per font (upright and italic share a face)', async () => {
	const zlib = require('node:zlib');
	const subset = await subsetMod.createFontSubsetter(WASM);
	const ttf = await subset(FONT, 'Upright Slanted', { wght: 400 });
	const fonts = new Map([['k', { ttf }]]);
	const word = (t, x, synthItalic) => ({ t, fontKey: 'k', x, top: 100, w: 90, h: 24, size: 20, ls: 0, color: [0, 0, 0, 1], op: 1, synthItalic });
	// The upright word comes FIRST: a slant decided per font would take its answer from it.
	const slide = { w: 1280, h: 720, words: [word('Upright', 100, false), word('Slanted', 300, true)], shapes: [], links: [] };
	const { bytes } = await write.writeDeckPdf({ slides: [slide], fonts });
	const doc = await pdfLib.PDFDocument.load(bytes);
	const contents = doc.getPage(0).node.Contents();
	const streams = contents instanceof pdfLib.PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
	const ops = streams.map((st) => zlib.inflateSync(Buffer.from(st.getContents())).toString('latin1')).join('\n');
	// pdf-lib writes a slanted run's text matrix with tan(14.04°) = 0.25 in the c slot.
	const matrices = [...ops.matchAll(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) [-\d.]+ [-\d.]+ Tm/g)].map((m) => Number(m[3]));
	assert.equal(matrices.length, 2, `two text runs, got:\n${ops.slice(0, 400)}`);
	assert.deepEqual(matrices.map((c) => Math.abs(c) > 0.2), [false, true], 'only the italic word is slanted');
});

test('font subset: a requested feature survives (tabular figures stay tabular), ligatures do not', async () => {
	const subset = await subsetMod.createFontSubsetter(WASM);
	const outfit = fs.readFileSync(path.join(ROOT, 'assets/fonts/outfit-500.woff2'));
	const advances = (fk, feats) => fk.layout('1110', feats).glyphs.map((g) => g.advanceWidth);
	const tab = fontkit.create(await subset(outfit, '1110', { wght: 500 }, ['tnum']));
	const t = advances(tab, { tnum: true });
	assert.ok(t.every((a) => a === t[0]), `tnum keeps every figure one width: ${t}`);
	const prop = fontkit.create(await subset(outfit, '1110', { wght: 500 }, []));
	const p = advances(prop, {});
	assert.ok(p[0] !== p[3], `without tnum the figures are proportional: ${p}`);
	// No ligature glyph: "fi" stays two glyphs, so its text copies out as "fi".
	const lig = fontkit.create(await subset(outfit, 'first', { wght: 500 }, []));
	assert.equal(lig.layout('fi').glyphs.length, 2);
});

test('path data: every SVG spelling reaches pdf-lib as finite numbers, and a broken path is caught', () => {
	const { normalizePath, pathIsDrawable } = write;
	// KaTeX's tall delimiters break a line after a comma before a negative number; pdf-lib
	// read the rest of the path as NaN and a viewer stopped drawing the whole page.
	assert.equal(normalizePath('M1,2\n-3,4'), 'M 1 2 -3 4');
	assert.equal(normalizePath('M1.5.5L2-3'), 'M 1.5 .5 L 2 -3');
	assert.equal(normalizePath('M1e2,3e-1z'), 'M 1e2 3e-1 z');
	// An arc's two flags may run together with the next number.
	assert.equal(normalizePath('M0 0a1 1 0 011 1'), 'M 0 0 a 1 1 0 0 1 1 1');
	assert.ok(pathIsDrawable('M863,9c0,-2,-2,-5,-6,-9c-21.3,163.3,-33.3,349,\n-36,557 l0,1884z'));
	assert.equal(pathIsDrawable('M0 0L1'), false, 'a truncated path is refused, not written');
	// pdf-lib reads an UPPERCASE exponent's sign as a new number; lowercased, it parses.
	assert.ok(pathIsDrawable('M1E-5 0L1 1'));
	// A collapsed or non-finite matrix cannot be inverted to restore the graphics state.
	assert.equal(write.matrixIsDrawable([0, 0, 0, 0, 5, 5]), false);
	assert.equal(write.matrixIsDrawable([1, 0, 0, NaN, 0, 0]), false);
	assert.ok(write.matrixIsDrawable([2, 0, 0, 2, 10, 10]));
});

// JPEG halves color resolution at every quality, so a 1 px rule on a dark field lost its color in
// the photo. The camera offers PNG and JPEG and the writer keeps the smaller: lossless on a flat
// slide, JPEG where PNG would be the bigger file (a photograph).
test('smallestPhoto: the smaller encoding wins; a single shot passes through', () => {
	const png = { bytes: new Uint8Array(10), type: 'png' };
	const jpeg = { bytes: new Uint8Array(20), type: 'jpeg' };
	assert.equal(compose.smallestPhoto([png, jpeg]), png);
	assert.equal(compose.smallestPhoto([{ ...png, bytes: new Uint8Array(30) }, jpeg]), jpeg);
	assert.equal(compose.smallestPhoto(jpeg), jpeg, 'a camera that returns one shot keeps it');
	assert.equal(compose.smallestPhoto([png, { ...jpeg, bytes: new Uint8Array(10) }]), png, 'a tie keeps the first, lossless');
});

// A PNG header with the given size, padded to `bytes` long: all pngIsFlat reads is IHDR and length.
function fakePng(w, h, bytes) {
	const b = new Uint8Array(bytes);
	b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
	new DataView(b.buffer).setUint32(16, w);
	new DataView(b.buffer).setUint32(20, h);
	return b;
}

test('pngIsFlat: at or under FLAT_PNG_BYTES_PER_PX is flat; a busier photo is not', () => {
	const px = 1280 * 720;
	const limit = Math.floor(px * compose.FLAT_PNG_BYTES_PER_PX);
	assert.equal(compose.pngIsFlat(fakePng(1280, 720, limit)), true);
	assert.equal(compose.pngIsFlat(fakePng(1280, 720, limit + 1)), false);
	assert.equal(compose.pngIsFlat(fakePng(3840, 2160, limit + 1)), true, 'the same bytes over 9x the pixels are flat');
	assert.equal(compose.pngIsFlat(new Uint8Array(10)), false, 'too short to carry IHDR');
});

test('canvasCamera: a busy slide is captured once and encoded twice', async () => {
	let captures = 0;
	const canvas = { toDataURL: (mime) => `data:${mime};base64,${Buffer.from(mime).toString('base64')}` };
	const camera = compose.canvasCamera(async () => { captures++; return canvas; });
	const section = {};
	const png = await camera(section, { scale: 1, type: 'png' });
	const jpeg = await camera(section, { scale: 1, type: 'jpeg' });
	assert.equal(captures, 1);
	assert.equal(png.type, 'png');
	assert.equal(jpeg.type, 'jpeg');
	assert.equal(Buffer.from(jpeg.bytes).toString(), 'image/jpeg');
	await camera({}, { scale: 1, type: 'png' });
	assert.equal(captures, 2, 'another slide is captured afresh');
	await camera(section, { scale: 1, type: 'png' });
	await camera(section, { scale: 1, type: 'jpeg' });
	await camera(section, { scale: 1, type: 'jpeg' });
	assert.equal(captures, 4, 'a PNG ask always captures; its capture serves one JPEG ask and is dropped');
});

test('makeHtmlToImageCamera: the pre-#2503 `{ toJpeg }` signature still returns a JPEG', async () => {
	const camera = compose.makeHtmlToImageCamera({ toJpeg: async () => `data:image/jpeg;base64,${Buffer.from('jpeg!').toString('base64')}` });
	const shot = await camera({}, { scale: 1, type: 'png' });
	assert.equal(shot.type, 'jpeg');
	assert.equal(Buffer.from(shot.bytes).toString(), 'jpeg!');
});

// Chrome's screenshot is an 8-bit RGB, non-interlaced PNG: its IDAT stream IS a PDF FlateDecode
// image under /Predictor 15, so the writer embeds it without decoding (embedPng decoded and
// deflated a 4K photo again in JavaScript, ~0.45 s a slide). Anything else takes embedPng.
test('rgbPngXObject: an RGB PNG embeds as its own IDAT stream; alpha and palette PNGs do not', async () => {
	const zlib = require('node:zlib');
	const chunk = (type, data) => {
		const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
		const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) : 0);
		return Buffer.concat([len, body, crc]);
	};
	const png = (colorType, channels) => {
		const ihdr = Buffer.alloc(13);
		ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = colorType;
		const raw = Buffer.from([0, ...Array(2 * channels).fill(200)]);
		return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
	};
	const doc = await pdfLib.PDFDocument.create();
	const ref = write.rgbPngXObject(doc, png(2, 3));
	assert.ok(ref, 'RGB is embedded directly');
	const dict = doc.context.lookup(ref).dict;
	assert.equal(String(dict.get(pdfLib.PDFName.of('Filter'))), '/FlateDecode');
	assert.equal(String(dict.get(pdfLib.PDFName.of('ColorSpace'))), '/DeviceRGB');
	assert.equal(write.rgbPngXObject(doc, png(6, 4)), null, 'RGBA takes embedPng');
	assert.equal(write.rgbPngXObject(doc, png(3, 1)), null, 'a palette PNG takes embedPng');
	assert.equal(write.rgbPngXObject(doc, new Uint8Array(40)), null, 'not a PNG');
});
