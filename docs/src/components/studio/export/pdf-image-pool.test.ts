// @vitest-environment node
// The print sheet PDF's PNG step moved to a pool (pdf-image-pool.js). Its contract is that the file does not change:
//   1. the worker's function returns exactly jsPDF's own `processPNG` object, for opaque, transparent and gray pictures;
//   2. a document that places the prepared results writes the same bytes as one that lets jsPDF process every image,
//      a repeated picture (jsPDF's alias reuse) and an image with no result included.
// Seeded pixels (HARD RULE #32); the dates and file id are pinned so the two documents can be compared byte for byte.
import { encode } from 'fast-png';
import { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';
import { installPreparedPngs, pngBytesOf } from './pdf-image-pool.js';
import { processPng } from './pdf-image-process.js';

let x = 4242;
const rand = () => {
	x = (x * 1103515245 + 12345) % 2147483648;
	return x / 2147483648;
};
const png = (width: number, height: number, channels: 1 | 3 | 4) => {
	const data = Uint8Array.from({ length: width * height * channels }, (_, i) => (i % channels === 3 ? (rand() < 0.5 ? 255 : Math.floor(rand() * 256)) : Math.floor(rand() * 256)));
	const bytes = encode({ width, height, data, channels, depth: 8 });
	return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
};
const IMAGES = [png(64, 36, 3), png(48, 27, 4), png(32, 18, 1), png(80, 45, 4)];

const sheet = (prepared: (object | null)[] | null, images: string[]) => {
	const pdf = new jsPDF({ unit: 'px', format: [400, 300], compress: true, hotfixes: ['px_scaling'] });
	pdf.setCreationDate(new Date(Date.UTC(2026, 0, 1)));
	pdf.setFileId('0123456789ABCDEF0123456789ABCDEF');
	const hook = prepared ? installPreparedPngs(pdf as unknown as { processPNG: (...args: unknown[]) => unknown }, 'SLOW') : null;
	images.forEach((img, i) => {
		if (i) pdf.addPage([400, 300], 'landscape');
		hook?.next(prepared?.[i] ?? null);
		pdf.addImage(img, 'PNG', 10, 10, 200, 112);
		hook?.done();
	});
	return new Uint8Array(pdf.output('arraybuffer'));
};

describe('the pooled PNG step for a print sheet', () => {
	it('returns exactly what jsPDF computes on the main thread', () => {
		// `processPNG` is jsPDF's PNG plug-in method, present at run time and absent from its type declarations.
		const own = new jsPDF() as unknown as { processPNG: (bytes: Uint8Array, index: number, alias: string, compression: string) => unknown };
		for (const img of IMAGES) {
			const bytes = pngBytesOf(img) as Uint8Array;
			const theirs = own.processPNG(bytes, 7, 'a', 'SLOW') as Record<string, unknown>;
			const ours = processPng(bytes, 'SLOW') as Record<string, unknown>;
			expect({ ...ours, index: 7, alias: 'a' }).toEqual(theirs);
		}
	});

	it('writes the same PDF bytes, with a repeated picture and a picture with no result', () => {
		const images = [...IMAGES, IMAGES[1]];
		const prepared = images.map((img, i) => (i === 2 ? null : processPng(pngBytesOf(img) as Uint8Array, 'SLOW')));
		const plain = sheet(null, images);
		const pooled = sheet(prepared, images);
		expect(Buffer.from(pooled).equals(Buffer.from(plain))).toBe(true);
		// The arm: a wrong result really changes the file, so the equality above compared something.
		const wrong = sheet([prepared[1], ...prepared.slice(1)], images);
		expect(Buffer.from(wrong).equals(Buffer.from(plain))).toBe(false);
	});

	it('reads a PNG data URL the way jsPDF does, and nothing else', () => {
		expect(pngBytesOf('data:image/jpeg;base64,AAAA')).toBeNull();
		expect(pngBytesOf(new Uint8Array(3))).toBeNull();
		expect(Array.from((pngBytesOf('data:image/png;base64,iVBORw==') as Uint8Array).slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
	});
});

// A plain RGB PNG goes into the sheet as its own compressed pixels (`directPng`). The FILE differs from jsPDF's
// re-compression; the PIXELS must not. Decode every image stream of both PDFs (inflate, then undo the PNG row filters
// /Predictor 15 names) and compare them to the source pixels.
import { inflateSync } from 'node:zlib';
import { decode } from 'fast-png';
import { directPng } from './pdf-image-pool.js';

/** Undo PNG row filters (the /Predictor 15 a PDF reader applies) on `raw` scanlines of `w` pixels of `bpp` bytes. */
function unfilter(raw: Uint8Array, w: number, h: number, bpp: number): Uint8Array {
	const stride = w * bpp;
	const out = new Uint8Array(stride * h);
	for (let y = 0; y < h; y++) {
		const type = raw[y * (stride + 1)];
		for (let x = 0; x < stride; x++) {
			const v = raw[y * (stride + 1) + 1 + x];
			const a = x >= bpp ? out[y * stride + x - bpp] : 0;
			const b = y > 0 ? out[(y - 1) * stride + x] : 0;
			const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
			const p = a + b - c;
			const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
			const pred = type === 0 ? 0 : type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			out[y * stride + x] = (v + pred) & 255;
		}
	}
	return out;
}

/** The RGB pixels of every image XObject in a jsPDF document, in order. */
function imagePixels(pdfBytes: Uint8Array): Uint8Array[] {
	const text = Buffer.from(pdfBytes).toString('latin1');
	const out: Uint8Array[] = [];
	const re = /\/Subtype \/Image[\s\S]*?\/Width (\d+)[\s\S]*?\/Height (\d+)[\s\S]*?\/Length (\d+)[\s\S]*?stream\r?\n/g;
	for (let m = re.exec(text); m; m = re.exec(text)) {
		const [w, h, len] = [Number(m[1]), Number(m[2]), Number(m[3])];
		const start = m.index + m[0].length;
		const raw = inflateSync(Buffer.from(pdfBytes.subarray(start, start + len)));
		out.push(unfilter(raw, w, h, 3));
	}
	return out;
}

describe('a plain RGB PNG goes into the sheet as it is', () => {
	const RGB = [png(64, 36, 3), png(80, 45, 3), png(32, 18, 3)];
	it('builds the image from the PNG\'s own bytes, and none from a PNG with transparency', () => {
		const d = directPng(RGB[0]) as { data: string; filter: string; decodeParameters: string; width: number };
		expect(d.filter).toBe('FlateDecode');
		expect(d.decodeParameters).toBe('/Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 64');
		expect(directPng(IMAGES[1])).toBeNull(); // RGBA
		expect(directPng(IMAGES[2])).toBeNull(); // gray
		expect(directPng('data:image/jpeg;base64,AAAA')).toBeNull();
	});

	it('writes exactly the PNG\'s pixels, as jsPDF\'s own re-compression does', () => {
		const direct = sheet(RGB.map((img) => directPng(img)), RGB);
		const own = sheet(null, RGB);
		const want = RGB.map((img) => {
			const p = decode(pngBytesOf(img) as Uint8Array);
			return Uint8Array.from(p.data as Uint8Array);
		});
		expect(imagePixels(direct)).toEqual(want);
		expect(imagePixels(own)).toEqual(want);
		// The arm: the comparison reads real pixels, so a wrong image fails it.
		expect(imagePixels(sheet([directPng(RGB[1]), ...RGB.slice(1).map((img) => directPng(img))], RGB))[0]).not.toEqual(want[0]);
	});
});
