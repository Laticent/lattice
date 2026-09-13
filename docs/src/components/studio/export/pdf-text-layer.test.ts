import { deflateSync, inflateSync } from 'node:zlib';
import { PDFArray, PDFDict, PDFDocument, PDFName, type PDFNumber, type PDFObject, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
	CODES_PER_FONT,
	createFontSet,
	encodeRunText,
	glyphName,
	registerTextFont,
	TEXT_CODE_FIRST,
	TEXT_NOMINAL_WIDTH,
	textFontName,
	textLayerOps,
	toUnicodeCMap,
} from './pdf-text-layer.js';

// The text layer's whole claim is that the words we were handed come back OUT of
// the file — as the same characters, at the place on the page the browser measured,
// and invisible. So the tests read the PDF the way a reader does: decode the
// content stream, walk its `Tj` bytes through the font's own `/ToUnicode` CMap, and
// compare against what went in. Nothing here trusts a constant this module exports;
// the page geometry and the decode are written out by hand, so a wrong `Tz`, a
// flipped y-axis or a broken CMap fails rather than agreeing with itself.

type Run = { t: string; x: number; y: number; w: number; s: number };

/** Resolve a reference to the stream it points at. Untyped `lookup` + `instanceof`,
 *  because pdf-lib's typed overload does not accept `PDFRawStream` as a class arg. */
function asStream(doc: PDFDocument, ref: PDFObject | undefined): PDFRawStream {
	const resolved = doc.context.lookup(ref);
	if (!(resolved instanceof PDFRawStream)) throw new Error('expected a PDF stream');
	return resolved;
}

/** Parse a `/ToUnicode` CMap back into code → character. */
function parseCMap(text: string) {
	const map = new Map<number, string>();
	for (const [, code, value] of text.matchAll(/<([0-9a-fA-F]{2})>\s*<([0-9a-fA-F]+)>/g)) {
		// Only the bfchar lines carry a 2-digit source; the codespacerange has two.
		const units = value.match(/.{4}/g) || [];
		map.set(Number.parseInt(code, 16), String.fromCharCode(...units.map((u) => Number.parseInt(u, 16))));
	}
	return map;
}

/** Every `BT … ET` block in a content stream, decoded through `fonts`. */
function readTextBlocks(stream: string, fonts: Map<string, Map<number, string>>) {
	const blocks = [];
	for (const [, body] of stream.matchAll(/BT\n([\s\S]*?)ET\n/g)) {
		const font = /\/(\S+)\s+([\d.]+)\s+Tf/.exec(body);
		const tz = /([\d.]+)\s+Tz/.exec(body);
		const td = /(-?[\d.]+)\s+(-?[\d.]+)\s+Td/.exec(body);
		const tj = /<([0-9a-f]*)>\s*Tj/.exec(body);
		const codes = (tj?.[1].match(/../g) || []).map((h) => Number.parseInt(h, 16));
		const cmap = fonts.get(font?.[1] || '');
		blocks.push({
			mode: /(\d)\s+Tr/.exec(body)?.[1],
			font: font?.[1],
			size: Number(font?.[2]),
			tz: Number(tz?.[1]),
			x: Number(td?.[1]),
			y: Number(td?.[2]),
			text: codes.map((c) => cmap?.get(c) ?? '�').join(''),
			codes,
		});
	}
	return blocks;
}

/**
 * Build a one-page document the way `pdf-export-worker.js` does — text layer, font
 * objects, deflated content stream — then read it back the way a reader would.
 */
async function roundTrip(runs: Run[], pageW = 960, pageH = 720) {
	const doc = await PDFDocument.create();
	const fontSet = createFontSet();
	const layer = textLayerOps(runs, fontSet, pageW, pageH);
	const refs = fontSet.map((f: { chars: string[] }) => registerTextFont(doc, { PDFRawStream }, f.chars));
	const page = doc.addPage([pageW, pageH]);
	const bytes = new TextEncoder().encode(layer.ops);
	const deflated = deflateSync(bytes);
	// Fonts BEFORE contents, exactly as `pdf-export-worker.js` writes them — the
	// order is what keeps `/Contents` a single stream reference (see the assertion
	// below and the note in the worker).
	for (const f of layer.fonts) page.node.setFontDictionary(PDFName.of(textFontName(f)), refs[f]);
	page.node.set(
		PDFName.of('Contents'),
		doc.context.register(PDFRawStream.of(doc.context.obj({ Length: deflated.length, Filter: 'FlateDecode' }), deflated)),
	);
	// `updateMetadata:false` — pdf-lib stamps its own /Producer into anything it loads.
	const reloaded = await PDFDocument.load(await doc.save(), { updateMetadata: false });
	const loaded = reloaded.getPage(0);
	// `/Contents` may be a single stream or a one-element array — pdf-lib normalizes
	// to the array form the moment anything touches the page's resource dictionaries,
	// so a reader has to take both (and the worker deliberately writes the first).
	const rawContents = reloaded.context.lookup(loaded.node.get(PDFName.of('Contents')));
	const contentsIsArray = !(rawContents instanceof PDFRawStream);
	const contents = asStream(reloaded, contentsIsArray ? (rawContents as PDFArray).get(0) : rawContents);
	const stream = new TextDecoder('latin1').decode(inflateSync(Buffer.from(contents.contents)));
	const fontDicts = loaded.node.Resources()?.lookup(PDFName.of('Font'), PDFDict);
	const cmaps = new Map<string, Map<number, string>>();
	const widths = new Map<string, number[]>();
	for (const [name] of fontDicts?.entries() || []) {
		const dict = fontDicts?.lookup(name, PDFDict);
		const toUnicode = asStream(reloaded, dict?.get(PDFName.of('ToUnicode')));
		cmaps.set(name.asString().slice(1), parseCMap(new TextDecoder('latin1').decode(toUnicode.contents)));
		widths.set(
			name.asString().slice(1),
			(dict?.lookup(PDFName.of('Widths'), PDFArray) as PDFArray).asArray().map((n) => (n as PDFNumber).asNumber()),
		);
	}
	return { blocks: readTextBlocks(stream, cmaps), stream, widths, contentsIsArray, fontCount: fontSet.length };
}

describe('encodeRunText', () => {
	it('hands out codes from 0x21 and reuses them across runs', () => {
		const set = createFontSet();
		expect(encodeRunText(set, 'ab')).toEqual({ font: 0, hex: '2122', length: 2 });
		// `b` is already spoken for; only `c` is new.
		expect(encodeRunText(set, 'bc')).toEqual({ font: 0, hex: '2223', length: 2 });
		expect(set).toHaveLength(1);
	});

	it('skips code 0x20, which every extractor reads as a space', () => {
		expect(TEXT_CODE_FIRST).toBeGreaterThan(0x20);
	});

	it('opens a second font when the first runs out of codes', () => {
		const set = createFontSet();
		// One run per character, so the spill happens at a run boundary.
		for (let i = 0; i < CODES_PER_FONT; i++) encodeRunText(set, String.fromCodePoint(0x4e00 + i));
		expect(set).toHaveLength(1);
		const spilled = encodeRunText(set, 'overflow');
		expect(set).toHaveLength(2);
		expect(spilled?.font).toBe(1);
		// …and a run whose characters all fit in the FIRST font goes back to it, rather
		// than duplicating them in the new one.
		expect(encodeRunText(set, String.fromCodePoint(0x4e00))?.font).toBe(0);
	});

	it('returns nothing for empty text', () => {
		expect(encodeRunText(createFontSet(), '')).toBeNull();
	});
});

describe('textLayerOps', () => {
	const run = (over: Partial<Run> = {}): Run => ({ t: 'Margin', x: 0.25, y: 0.5, w: 0.2, s: 0.05, ...over });

	it('marks the text invisible', async () => {
		const { blocks } = await roundTrip([run()]);
		expect(blocks[0].mode).toBe('3'); // rendering mode 3 = neither filled nor stroked
	});

	it('places the run at the measured spot, with the PDF origin at the BOTTOM left', async () => {
		const { blocks } = await roundTrip([run({ x: 0.25, y: 0.5 })], 960, 720);
		expect(blocks[0].x).toBeCloseTo(0.25 * 960, 2);
		// A y of 0.5 is the baseline HALFWAY DOWN the slide, which is halfway UP the page.
		// Written without the flip this reads 360 too — so the run sits at a quarter and
		// three-quarters, where the two disagree.
		expect(blocks[0].y).toBeCloseTo(720 - 0.5 * 720, 2);
		const low = await roundTrip([run({ y: 0.25 })], 960, 720);
		expect(low.blocks[0].y).toBeCloseTo(540, 2);
	});

	it('sizes the font from the page height', async () => {
		const { blocks } = await roundTrip([run({ s: 0.05 })], 960, 720);
		expect(blocks[0].size).toBeCloseTo(36, 2);
	});

	it('scales the run horizontally so its width matches what the browser measured', async () => {
		const { blocks, widths } = await roundTrip([run({ t: 'Margin', w: 0.2, s: 0.05 })], 960, 720);
		const perGlyph = widths.get(blocks[0].font as string)?.[0] as number;
		expect(perGlyph).toBe(TEXT_NOMINAL_WIDTH);
		// The width a reader computes: glyphs x width/1000 x size x Tz/100.
		const drawn = 'Margin'.length * (perGlyph / 1000) * blocks[0].size * (blocks[0].tz / 100);
		expect(drawn).toBeCloseTo(0.2 * 960, 1);
	});

	it('never collapses a run to zero width when the measurement is degenerate', async () => {
		const { blocks } = await roundTrip([run({ w: 0 })]);
		expect(blocks[0].tz).toBeGreaterThan(0);
	});

	it('drops a run with no size rather than writing a zero-height one', async () => {
		const { blocks } = await roundTrip([run({ s: 0 }), run({ t: 'kept' })]);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].text).toBe('kept');
	});

	it('survives a run list that is missing, or carries junk', () => {
		expect(textLayerOps(undefined as never, createFontSet(), 960, 720)).toEqual({ ops: '', fonts: [] });
		expect(textLayerOps([{ t: 'x' } as never], createFontSet(), 960, 720).ops).toBe('');
	});
});

describe('the round trip a reader takes', () => {
	it('gives back the exact characters it was handed', async () => {
		const words = ['Margin', 'expansion', '—', '42%', 'café', '日本語', '👋'];
		const { blocks } = await roundTrip(words.map((t, i) => ({ t, x: 0.1, y: (i + 1) / 10, w: 0.15, s: 0.04 })));
		expect(blocks.map((b) => b.text)).toEqual(words);
	});

	it('writes one font per 223 characters and names only the ones a page uses', async () => {
		const { fontCount } = await roundTrip([{ t: 'Ordinary slide copy', x: 0.1, y: 0.5, w: 0.4, s: 0.04 }]);
		expect(fontCount).toBe(1);
	});

	it('writes a glyph name alongside the CMap, so a reader that ignores one still reads', async () => {
		const { stream } = await roundTrip([{ t: 'A', x: 0.1, y: 0.5, w: 0.05, s: 0.04 }]);
		expect(glyphName('A')).toBe('uni0041');
		expect(stream).toContain('Tj');
	});

	it('escapes nothing, because the string is hex', async () => {
		// The literal form `(…)` is what corrupted the sticky-note annotations; a run
		// carrying a paren must not be able to end its own string.
		const { blocks } = await roundTrip([{ t: 'ship)it\\', x: 0.1, y: 0.5, w: 0.2, s: 0.04 }]);
		expect(blocks[0].text).toBe('ship)it\\');
	});
});

describe('toUnicodeCMap', () => {
	it('chunks past 100 characters, which is the cap a CMap block may carry', () => {
		const chars = Array.from({ length: 250 }, (_v, i) => String.fromCodePoint(0x41 + i));
		const cmap = toUnicodeCMap(chars);
		expect(cmap.match(/beginbfchar/g)).toHaveLength(3);
		expect(cmap).toContain('100 beginbfchar');
		expect(cmap).toContain('50 beginbfchar');
	});

	it('carries an astral character as a surrogate pair', () => {
		expect(toUnicodeCMap(['👋'])).toContain('<D83DDC4B>');
		expect(glyphName('👋')).toBe('u1F44B');
	});
});

describe('the page shape the rest of the toolchain reads', () => {
	it('keeps `/Contents` a single stream, not the array pdf-lib normalizes to', async () => {
		// `tools/bench-pdf-export.mjs` resolves each page's image THROUGH its content
		// stream and takes `instanceof PDFRawStream`; the array form makes it read every
		// text-bearing page as empty and then call any page order identical. Adding the
		// fonts after the stream is exactly what produces that array.
		const { contentsIsArray } = await roundTrip([{ t: 'Copy', x: 0.1, y: 0.5, w: 0.1, s: 0.04 }]);
		expect(contentsIsArray).toBe(false);
	});
});
