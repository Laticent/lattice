// jsPDF's PNG step, off the main thread. A printed sheet PDF (`assembleSheetPdf`) hands jsPDF one PNG per slide, and jsPDF's
// `processPNG` decodes it and deflates its pixels again in script: 51 s of a 50-slide print on the main thread, profiled
// (engineering/decisions/2026-11-11-deferred-asset-bytes.md §7). That step is a pure function of the PNG's bytes and the
// compression word, so it runs here, one page per job, and the page's writer places what comes back (pdf-image-pool.js).
// The same library, the same function, the same inputs: the same bytes as the main thread writes.
import { processPng } from './pdf-image-process.js';

self.onmessage = (e) => {
	const { id, bytes, compression } = e.data;
	try {
		self.postMessage({ id, result: processPng(bytes, compression) });
	} catch (err) {
		self.postMessage({ id, error: String(err?.message || err) });
	}
};
