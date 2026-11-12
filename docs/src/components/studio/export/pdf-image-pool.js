// jsPDF's PNG step for a printed sheet PDF, run in a pool before the document is written (pdf-image-worker.js).
//
// WHY. `assembleSheetPdf` adds one PNG per slide with `pdf.addImage`, and jsPDF's `processPNG` decodes each one and deflates
// its pixels again in script. On a 50-slide deck that was 51 s of a 110 s print, on the main thread, in one block per page
// (engineering/decisions/2026-11-11-deferred-asset-bytes.md §7). Every page's step is independent, so the pool runs them side
// by side, and the main thread only places the results.
//
// WHY THE FILE CANNOT CHANGE. A worker runs jsPDF's own `processPNG` on exactly the bytes `addImage` would hand it (a data
// URL's base64, decoded, as jsPDF's `convertBase64ToBinaryString` does) with the same compression word. `prepared` then
// stands in for the document's own `processPNG` for exactly that image: jsPDF still assigns the index and the alias, still
// skips a repeated image by its alias, and still writes the objects. Any image without a result (no workers, a failed job,
// another compression) takes jsPDF's own path. test: pdf-image-pool.test.ts (the worker's result equals the main thread's).
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

/** The PNG bytes jsPDF reads from a `data:` URL: its base64, decoded. Anything else is not prepared (null). */
export function pngBytesOf(image) {
	if (typeof image !== 'string') return null;
	const m = /^data:image\/png;base64,/i.exec(image);
	if (!m) return null;
	const bin = atob(image.slice(m[0].length));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/** One page's job: jsPDF's result for `image`, or null for jsPDF's own path. Never rejects. */
function job(image, compression) {
	return shared.use(async (pool) => {
		// Any failure costs only this image its head start: jsPDF's own path writes it (`installPreparedPngs`).
		try {
			if (!/^data:image\/png;base64,/i.test(String(image))) return null;
			// Decoded only once a worker is held, so a deck's pictures are not all held twice while they wait.
			const out = await pool.run(() => {
				const bytes = /** @type {Uint8Array} */ (pngBytesOf(image));
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
 * runs no job at all. Keyed by the picture's text and the compression word.
 */
let started = new Map();

/** Forget the previous picture set's jobs: a new one is being photographed. */
export function startPngSet() {
	started = new Map();
}

/** Start jsPDF's step for one picture now, in the pool. */
export function startPng(image, compression) {
	const key = `${compression}\u0000${image}`;
	if (!started.has(key)) started.set(key, job(image, compression));
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
			if (typeof image !== 'string') return null;
			startPng(image, compression);
			return started.get(`${compression}\u0000${image}`);
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
