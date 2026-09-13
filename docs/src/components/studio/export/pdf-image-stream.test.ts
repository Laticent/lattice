import { inflateSync } from 'node:zlib';
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { deflate, imageDict, PX_TO_PT, packPredictorRows, pageContentOps } from './pdf-image-stream.js';

// The export's page-image kernel. What matters here is that the bytes we hand a PDF
// are the pixels we were given — the export's whole claim is that dropping the PNG
// round-trip changed the speed and nothing else — and that the stream we write is
// one a PDF reader can actually decode.

/** A recognisable test image: a horizontal ramp with a vertical tint, fully opaque. */
function rgbaRamp(width: number, height: number, alpha = 255) {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			data[i] = (x * 255) / Math.max(1, width - 1);
			data[i + 1] = (y * 255) / Math.max(1, height - 1);
			data[i + 2] = 128;
			data[i + 3] = alpha;
		}
	}
	return data;
}

/** Undo `/Predictor 15` with filter tag 0 — the inverse of what we write. */
function unpack(rows: Uint8Array, width: number, height: number) {
	const out = new Uint8Array(width * height * 3);
	const rowLen = width * 3 + 1;
	for (let y = 0; y < height; y++) {
		expect(rows[y * rowLen]).toBe(0); // every row carries the "no filter" tag
		out.set(rows.subarray(y * rowLen + 1, y * rowLen + rowLen), y * width * 3);
	}
	return out;
}

describe('packPredictorRows', () => {
	it('writes a filter tag per row and drops the alpha channel', () => {
		const rows = packPredictorRows(rgbaRamp(4, 3), 4, 3);
		expect(rows.length).toBe((4 * 3 + 1) * 3);
		expect(unpack(rows, 4, 3).length).toBe(4 * 3 * 3);
	});

	it('keeps every RGB value exactly', () => {
		const source = rgbaRamp(37, 11); // deliberately not a round number
		const rgb = unpack(packPredictorRows(source, 37, 11), 37, 11);
		for (let p = 0; p < 37 * 11; p++) {
			expect(rgb[p * 3]).toBe(source[p * 4]);
			expect(rgb[p * 3 + 1]).toBe(source[p * 4 + 1]);
			expect(rgb[p * 3 + 2]).toBe(source[p * 4 + 2]);
		}
	});

	it('ignores alpha rather than premultiplying by it', () => {
		// The caller composites over white BEFORE this runs; if this silently applied
		// alpha instead, a half-transparent capture would darken on export.
		const opaque = packPredictorRows(rgbaRamp(8, 8, 255), 8, 8);
		const ghost = packPredictorRows(rgbaRamp(8, 8, 12), 8, 8);
		expect(Array.from(ghost)).toEqual(Array.from(opaque));
	});
});

describe('deflate', () => {
	it('produces a zlib stream that inflates back to the input', async () => {
		const rows = packPredictorRows(rgbaRamp(64, 48), 64, 48);
		const compressed = await deflate(rows);
		expect(compressed.length).toBeLessThan(rows.length);
		expect(Array.from(inflateSync(Buffer.from(compressed)))).toEqual(Array.from(rows));
	});
});

describe('imageDict', () => {
	it('describes a flate image with PNG predictors', async () => {
		const doc = await PDFDocument.create();
		const dict = imageDict(doc.context, { width: 12, height: 4, jpeg: false });
		expect(dict.get(PDFName.of('Filter'))?.toString()).toBe('/FlateDecode');
		expect(dict.get(PDFName.of('ColorSpace'))?.toString()).toBe('/DeviceRGB');
		const parms = dict.lookup(PDFName.of('DecodeParms'), PDFDict);
		expect(parms.get(PDFName.of('Predictor'))?.toString()).toBe('15');
		expect(parms.get(PDFName.of('Columns'))?.toString()).toBe('12');
	});

	it('describes a JPEG image with no predictor at all', async () => {
		const doc = await PDFDocument.create();
		const dict = imageDict(doc.context, { width: 12, height: 4, jpeg: true });
		expect(dict.get(PDFName.of('Filter'))?.toString()).toBe('/DCTDecode');
		expect(dict.get(PDFName.of('DecodeParms'))).toBeUndefined();
	});
});

describe('a page written this way', () => {
	it('round-trips through a PDF reader with its pixels intact', async () => {
		const [width, height] = [24, 16];
		const source = rgbaRamp(width, height);
		const doc = await PDFDocument.create();
		const bytes = await deflate(packPredictorRows(source, width, height));
		const ref = doc.context.register(PDFRawStream.of(imageDict(doc.context, { width, height, jpeg: false }), bytes));
		const [w, h] = [1280 * PX_TO_PT, 720 * PX_TO_PT];
		const page = doc.addPage([w, h]);
		page.node.setXObject(PDFName.of('Im0'), ref);
		const ops = pageContentOps(w, h);
		page.node.set(PDFName.of('Contents'), doc.context.register(PDFRawStream.of(doc.context.obj({ Length: ops.length }), ops)));
		doc.setTitle('Deck');
		doc.setProducer('Lattice');

		// `updateMetadata: false` on the READ: pdf-lib stamps its own /Producer into any
		// document it loads, so a default load would report on itself, not on the file.
		const back = await PDFDocument.load(await doc.save(), { updateMetadata: false });
		const [readPage] = back.getPages();
		expect(back.getProducer()).toBe('Lattice');
		expect(readPage.getSize()).toEqual({ width: w, height: h });

		// The content stream has to actually DRAW the image — a page that merely carries
		// it in its resources renders blank, which is the mistake this kernel exists past.
		const contents = back.context.lookup(readPage.node.get(PDFName.of('Contents')));
		expect(contents).toBeInstanceOf(PDFRawStream);
		expect(new TextDecoder().decode((contents as PDFRawStream).contents)).toContain('/Im0 Do');

		const xobject = readPage.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
		const image = xobject?.get(PDFName.of('Im0'));
		const stream = back.context.lookup(image);
		expect(stream).toBeInstanceOf(PDFRawStream);
		const rgb = unpack(new Uint8Array(inflateSync(Buffer.from((stream as PDFRawStream).contents))), width, height);
		for (let p = 0; p < width * height; p++) {
			expect(rgb[p * 3]).toBe(source[p * 4]);
			expect(rgb[p * 3 + 1]).toBe(source[p * 4 + 1]);
			expect(rgb[p * 3 + 2]).toBe(source[p * 4 + 2]);
		}
	});

	it('writes the page box and the draw matrix the fallback lane writes', () => {
		// The numbers are LITERAL and the matrix is read back element by element, on
		// purpose: deriving them from PX_TO_PT makes the assertion tautological, and a
		// flipped or offset matrix rendered every page upside down while passing a
		// suite that only checked the operator names.
		const width = 1280 * PX_TO_PT;
		const height = 720 * PX_TO_PT;
		expect(width).toBeCloseTo(1706.67, 2);
		expect(height).toBe(960);
		const ops = new TextDecoder().decode(pageContentOps(width, height));
		const matrix = /q\n([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) cm\n\/Im0 Do\nQ\n/.exec(ops);
		expect(matrix).not.toBeNull();
		const [a, b, c, d, e, f] = (matrix as RegExpExecArray).slice(1).map(Number);
		expect([b, c, e, f]).toEqual([0, 0, 0, 0]); // no skew, no offset
		expect(a).toBeCloseTo(1706.67, 2); // full bleed, not flipped
		expect(d).toBe(960);
	});

	it('carries a sticky note whose rect is inside the page', async () => {
		const doc = await PDFDocument.create();
		const [w, h] = [1280 * PX_TO_PT, 720 * PX_TO_PT];
		const page = doc.addPage([w, h]);
		const annot = doc.context.register(
			doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [10, 10, 32, 32], T: PDFString.of('reviewer'), Contents: PDFString.of('note'), Open: false, F: 4, P: page.ref }),
		);
		page.node.set(PDFName.of('Annots'), doc.context.obj([annot]));
		const back = await PDFDocument.load(await doc.save());
		const list = back.getPages()[0].node.Annots();
		expect(list?.size()).toBe(1);
	});
});

describe('annotation text', () => {
	// The worker writes every note as a hex string. `PDFString.of` does NO escaping, so
	// a comment containing `)` closes the literal early and corrupts the annotation —
	// and because pdf-lib packs a page's objects into one object stream, it takes every
	// note on that page down with it. This pins the round-trip for the characters that
	// broke it, and for text no ASCII form could carry.
	it.each([
		['ship it :) done', 'a closing paren'],
		['open ( never closed', 'an opening paren'],
		['path C:\\Users\\me', 'backslashes'],
		['ends with a backslash \\', 'a trailing backslash'],
		['résumé — 図表 ✔', 'non-ASCII'],
		['line one\nline two', 'a newline'],
	])('survives %s (%s)', async (body) => {
		const doc = await PDFDocument.create();
		const page = doc.addPage([100, 100]);
		const annot = doc.context.register(
			doc.context.obj({
				Type: 'Annot',
				Subtype: 'Text',
				Rect: [10, 10, 32, 32],
				T: PDFHexString.fromText('reviewer'),
				Contents: PDFHexString.fromText(body),
				Open: false,
				F: 4,
				P: page.ref,
			}),
		);
		page.node.set(PDFName.of('Annots'), doc.context.obj([annot]));
		const back = await PDFDocument.load(await doc.save());
		const list = back.getPages()[0].node.Annots();
		expect(list?.size()).toBe(1);
		const dict = list?.lookup(0, PDFDict);
		const contents = dict?.get(PDFName.of('Contents'));
		expect((contents as PDFHexString).decodeText()).toBe(body);
	});
});
