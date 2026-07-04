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
//   in  : {type:'init', pageW, pageH, total, pageFormat:'png'|'jpeg',
//          props:{title,subject,author,keywords,creator}}
//   in  : {type:'slide', index, bitmap}            (bitmap is a transferred ImageBitmap)
//   in  : {type:'finish'}
//   out : {type:'progress', index}                 (slide encoded + embedded)
//   out : {type:'done', bytes}                     (ArrayBuffer, transferred)
//   out : {type:'error', message}
//
// Page format is a WORKSPACE PREFERENCE (Studio › Workspace › General): 'png'
// (default) is pixel-lossless but pays jsPDF's per-page PNG parse + re-deflate
// (~1s/page — the pipeline's dominant cost); 'jpeg' (q95) embeds by direct DCT
// byte copy — measured ~2x faster end-to-end and several-times-smaller files,
// at the price of JPEG's edge artifacts (visually clean at 2x, never
// mathematically lossless). The trade-off is the USER's, not ours.
//
// Messages are processed through a serial promise chain: onmessage handlers are
// async (convertToBlob awaits), and without the chain two 'slide' messages could
// interleave their awaits and embed pages out of order.

import { jsPDF } from 'jspdf';
import { addPageStickyNotes } from './pdf-sticky-notes.js';

let pdf = null;
let page = null;
let jpeg = false;
let annotations = null; // per-page comment sticky notes (index-aligned to slides)
let chain = Promise.resolve();
// One reusable scratch canvas (slides in a deck share one geometry) — churning
// a fresh multi-MB OffscreenCanvas per slide is avoidable allocator pressure
// on the memory-capped mobile browsers this worker exists to protect.
let scratch = null;

async function handle(m) {
	if (m.type === 'init') {
		page = { w: m.pageW, h: m.pageH };
		jpeg = m.pageFormat === 'jpeg';
		pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [page.w, page.h], compress: true });
		pdf.setProperties(m.props);
		annotations = m.annotations || null;
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
		if (jpeg) {
			// White underlay: JPEG has no alpha channel and a bare encode composites
			// stray transparent pixels onto BLACK — paper-white is the safe floor
			// (slides paint their own full-bleed background, so this never shows).
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
		ctx.drawImage(bmp, 0, 0);
		bmp.close();
		const blob = await canvas.convertToBlob(jpeg ? { type: 'image/jpeg', quality: 0.95 } : { type: 'image/png' });
		const bytes = new Uint8Array(await blob.arrayBuffer());
		if (m.index > 0) pdf.addPage([page.w, page.h], 'landscape');
		pdf.addImage(bytes, jpeg ? 'JPEG' : 'PNG', 0, 0, page.w, page.h);
		// Sticky notes for THIS slide land on the page just drawn (createAnnotation
		// targets the current page), so the review comments ride the exported PDF.
		if (annotations) addPageStickyNotes(pdf, annotations[m.index], page.w);
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
