// PDF export worker — the off-main-thread half of the one-click image PDF.
//
// The main thread owns everything that needs the DOM (the capture iframe and
// html-to-image's clone + SVG draw) and hands each slide over as a transferred
// ImageBitmap. Everything CPU-heavy and DOM-free lands here instead of freezing
// the page: the PNG deflate (OffscreenCanvas.convertToBlob — previously a
// synchronous canvas.toDataURL on the main thread), jsPDF's per-image PNG
// parse/re-encode (addImage), and the final document serialization (output).
// On a large deck those three were the freeze; the UI thread now only clones,
// draws, and paints progress.
//
// Protocol (all messages are {type, ...}):
//   in  : {type:'init', pageW, pageH, total, props:{title,subject,author,keywords,creator}}
//   in  : {type:'slide', index, bitmap}            (bitmap is a transferred ImageBitmap)
//   in  : {type:'finish'}
//   out : {type:'progress', index}                 (slide encoded + embedded)
//   out : {type:'done', bytes}                     (ArrayBuffer, transferred)
//   out : {type:'error', message}
//
// Messages are processed through a serial promise chain: onmessage handlers are
// async (convertToBlob awaits), and without the chain two 'slide' messages could
// interleave their awaits and embed pages out of order.

import { jsPDF } from 'jspdf';

let pdf = null;
let page = null;
let chain = Promise.resolve();
// One reusable scratch canvas (slides in a deck share one geometry) — churning
// a fresh multi-MB OffscreenCanvas per slide is avoidable allocator pressure
// on the memory-capped mobile browsers this worker exists to protect.
let scratch = null;

async function handle(m) {
	if (m.type === 'init') {
		page = { w: m.pageW, h: m.pageH };
		pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [page.w, page.h], compress: true });
		pdf.setProperties(m.props);
		return;
	}
	if (m.type === 'slide') {
		const bmp = m.bitmap;
		if (!scratch || scratch.width !== bmp.width || scratch.height !== bmp.height) {
			scratch = new OffscreenCanvas(bmp.width, bmp.height);
		}
		const canvas = scratch;
		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(bmp, 0, 0);
		bmp.close();
		const blob = await canvas.convertToBlob({ type: 'image/png' });
		const png = new Uint8Array(await blob.arrayBuffer());
		if (m.index > 0) pdf.addPage([page.w, page.h], 'landscape');
		pdf.addImage(png, 'PNG', 0, 0, page.w, page.h);
		self.postMessage({ type: 'progress', index: m.index });
		return;
	}
	if (m.type === 'finish') {
		const bytes = pdf.output('arraybuffer');
		self.postMessage({ type: 'done', bytes }, [bytes]);
	}
}

self.onmessage = (e) => {
	chain = chain.then(() => handle(e.data)).catch((err) => {
		self.postMessage({ type: 'error', message: err?.message || String(err) });
	});
};
