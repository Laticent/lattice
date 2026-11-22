// jsPDF's PNG step for a printed sheet PDF, run in a pool before the document is written (pdf-image-worker.js).
//
// WHY. `assembleSheetPdf` adds one PNG per slide with `pdf.addImage`, and jsPDF's `processPNG` decodes each one and deflates
// its pixels again in script. On a 50-slide deck that was 51 s of a 110 s print, on the main thread, in one block per page
// (engineering/decisions/2026-11-11-deferred-asset-bytes.md §7). Every page's step is independent, so the pool runs them side
// by side, and the main thread only places the results.
//
// TWO KINDS OF PAGE. A plain 8-bit RGB PNG, which is what the shared writer writes for every opaque slide, goes in as its own
// compressed pixels (`directPng`, lastra's `rgbPngIdat`): no decode, no second deflate, nothing for a worker to do. The
// PIXELS are the PNG's exactly; the file's compression is the shared writer's instead of jsPDF's, so the file's bytes differ
// from jsPDF's re-compression (2026-11-11-deferred-asset-bytes.md §9, signed off by the owner). Any other PNG (a slide with
// transparency) takes jsPDF's own `processPNG` in a worker, on exactly the bytes `addImage` would hand it, with the same
// compression word, so that page is byte for byte what jsPDF writes. `installPreparedPngs` stands in for the document's own
// `processPNG` for exactly one image: jsPDF still assigns the index and the alias, still skips a repeated image by its alias,
// and still writes the objects. test: pdf-image-pool.test.ts.
import { rgbPngIdat } from '@laticent/lastra';
import { createSharedPool, createWorkerPool } from '../../../lib/worker-pool.js';
import { poolSize } from './picture-encoder-pool.js';

/** One page's step is a second or two of script; a worker silent far past that is gone (a phone kills workers silently). */
const DEADLINE_MS = 60_000;

const shared = createSharedPool(() =>
	createWorkerPool({
		spawn: () => new Worker(new URL('./pdf-image-worker.js', import.meta.url), { type: 'module' }),
		size: poolSize(),
		deadlineMs: DEADLINE_MS,
		label: 'pdf image',
	}),
);

/** The PNG bytes jsPDF reads: the bytes themselves, or a `data:` URL's base64, decoded. Anything else is not prepared (null). */
export function pngBytesOf(image) {
	if (image instanceof Uint8Array) return image[0] === 0x89 && image[1] === 0x50 ? image : null;
	if (typeof image !== 'string') return null;
	const m = /^data:image\/png;base64,/i.exec(image);
	if (!m) return null;
	const bin = atob(image.slice(m[0].length));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/**
 * COMPRESSED ONCE. The shared writer (canvas-encode.mjs) has just written each slide as an 8-bit RGB PNG tuned for size, and
 * a PDF can carry that PNG's compressed pixels exactly as they are (lastra's `rgbPngIdat`). This is the image object jsPDF's
 * writer reads (`putImage`: width, height, color space, bits, filter, decode parameters, data), built from those bytes with
 * no decode and no second deflate, the same thing the PDF export's writer does (pdf-compose/write-pdf.mjs `rgbPngXObject`).
 * The pixels are the PNG's; only the compression in the file is the shared writer's instead of jsPDF's. Null for any PNG
 * that is not plain RGB (a slide with transparency), which takes jsPDF's own step in the pool.
 */
export function directPng(image) {
	const bytes = pngBytesOf(image);
	const png = bytes && rgbPngIdat(bytes);
	if (!png) return null;
	let data = '';
	for (let i = 0; i < png.data.length; i += 0x8000) data += String.fromCharCode(...png.data.subarray(i, i + 0x8000));
	return {
		data,
		width: png.width,
		height: png.height,
		colorSpace: 'DeviceRGB',
		bitsPerComponent: 8,
		filter: 'FlateDecode',
		decodeParameters: `/Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${png.width}`,
	};
}

/** One page's job: jsPDF's result for `image`, or null for jsPDF's own path. Never rejects. */
function job(image, compression) {
	return shared.use(async (pool) => {
		// Any failure costs only this image its head start: jsPDF's own path writes it (`installPreparedPngs`).
		try {
			if (!pngBytesOf(image)) return null;
			// Read only once a worker is held, so a deck's pictures are not all held twice while they wait. A COPY goes to the
			// worker: transferring the caller's own buffer would empty the picture the print panel keeps for a re-placed sheet.
			const out = await pool.run(() => {
				const own = /** @type {Uint8Array} */ (pngBytesOf(image));
				const bytes = typeof image === 'string' ? own : own.slice();
				return { message: { bytes, compression }, transfer: [bytes.buffer] };
			});
			return 'value' in out ? out.value.result : null;
		} catch {
			return null;
		}
	});
}

/**
 * The jobs of the CURRENT picture set, by picture. Started as each slide is photographed (`startPng`, from
 * `rasterizeDeckImages`), so the pool works while the main thread photographs the next slide and the sheet finds most of its
 * results waiting; kept until the next set starts, so a re-placed sheet (a paper or layout change on the same pictures)
 * runs no job at all. Keyed by the picture itself (its bytes object, or its text) under each compression word.
 * @type {Map<string, { has(k: unknown): boolean, get(k: unknown): Promise<object|null>|undefined, set(k: unknown, v: Promise<object|null>): unknown }>}
 */
let started = new Map();
/**
 * The jobs for one compression word. A picture held as BYTES is keyed weakly: its job (and the image built from it, about the
 * picture's size) goes when the print panel lets go of the picture, not when the next print starts (the checker, PR #3148).
 * A picture held as text (a `data:` URL) cannot be a weak key, and is kept until `startPngSet`.
 */
const jobsFor = (compression) => {
	let m = started.get(compression);
	if (!m) {
		const weak = new WeakMap();
		const strong = new Map();
		const of = (k) => (typeof k === 'object' && k !== null ? weak : strong);
		m = { has: (k) => of(k).has(k), get: (k) => of(k).get(k), set: (k, v) => of(k).set(k, v) };
		started.set(compression, m);
	}
	return m;
};

/** Forget the previous picture set's jobs: a new one is being photographed. */
export function startPngSet() {
	started = new Map();
}

/** Start jsPDF's step for one picture now, in the pool. */
export function startPng(image, compression) {
	const jobs = jobsFor(compression);
	if (jobs.has(image)) return;
	// A plain RGB PNG goes in as it is, at no cost worth a worker; only another kind of PNG takes jsPDF's step in the pool.
	const direct = directPng(image);
	jobs.set(image, direct ? Promise.resolve(direct) : job(image, compression));
}

/**
 * jsPDF's `processPNG` result for each image, from the pool; null where an image is not prepared. A picture already started
 * reuses its job.
 * @param {unknown[]} images  what `addImage` will be handed, in order
 * @param {string} compression  the word `addImage` resolves to (`'SLOW'` for a `compress: true` document)
 * @returns {Promise<(object|null)[]>}
 */
export function preparePngs(images, compression) {
	return Promise.all(
		images.map((image) => {
			if (typeof image !== 'string' && !(image instanceof Uint8Array)) return null;
			startPng(image, compression);
			return jobsFor(compression).get(image);
		}),
	);
}

/**
 * Let `pdf` use a prepared result for the NEXT image it processes. Call `next(result)` right before `addImage`; jsPDF calls
 * `processPNG` at most once per `addImage` (not at all for a repeated image), and the hook is cleared either way.
 * @param {{ processPNG: (...args: unknown[]) => unknown }} pdf
 */
export function installPreparedPngs(pdf, compression) {
	const own = pdf.processPNG;
	let pending = null;
	pdf.processPNG = function (data, index, alias, comp, ...rest) {
		const ready = pending;
		pending = null;
		if (ready && comp === compression) return { ...ready, index, alias };
		return own.call(this, data, index, alias, comp, ...rest);
	};
	return {
		next(result) {
			pending = result || null;
		},
		done() {
			pending = null;
		},
	};
}
