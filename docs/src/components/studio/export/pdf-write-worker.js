// The vector PDF's WRITE step, off the main thread.
//
// `composeDeckPdf` (lib/core/pdf-compose/compose.mjs) reads each slide on the page, because reading measures layout and
// hit-tests. Writing is pure: pdf-lib lays out every word with fontkit and serializes the file, from plain data. On the
// 40-slide gallery at 4x CPU that write was one 3.8 s task on the main thread
// (engineering/decisions/2026-10-29-studio-activity-audit.md). Here it is the same function on another thread, so the
// bytes are the same bytes.
//
// Protocol:
//   in  : {slides, fonts, meta, assets}   (structured-cloned; the caller keeps its copy for the fallback)
//   out : {type:'done', bytes, drift}     (bytes: Uint8Array, its buffer transferred)
//   out : {type:'error', message}

import { writeDeckPdf } from '../../../../../lib/core/pdf-compose/write-pdf.mjs';

self.onmessage = async (e) => {
	try {
		const { bytes, drift } = await writeDeckPdf(e.data);
		const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
		self.postMessage({ type: 'done', bytes, drift }, whole ? [bytes.buffer] : []);
	} catch (err) {
		self.postMessage({ type: 'error', message: String(err?.message || err) });
	}
};
