// The PowerPoint assembly worker — the half of a .pptx build that is pure CPU.
//
// WHY THIS EXISTS, and why it is NOT the per-slide encode. Measured on the real
// Studio export, a 56-slide deck: the PDF (whose encode already runs in a worker)
// blocks the main thread for 8,549 ms across 52 stalls, worst 367 ms — that is
// html-to-image's clone + draw, which needs the DOM and cannot move. PowerPoint
// blocks for 10,769 ms across 65 stalls, worst 717 ms. The PER-SLIDE stalls are the
// SAME in both (350 ms vs 367 ms), which is the measurement that redirected this
// work: `canvas.toDataURL` is the browser's native encoder and is not the problem.
// The PowerPoint-specific cost is the TAIL — pptxgenjs generating one XML part per
// slide, JSZip base64-decoding every image, and the zip write — a single 717 ms
// freeze at the end, with nothing painting through it.
//
// So the whole DOCUMENT build moves, not the encode. pptxgenjs touches no DOM on
// this path: the one place it does is `writeFile`, whose downloader builds an
// anchor. `write({ outputType: 'blob' })` is the same export with the download left
// to the caller — which is the main thread's job anyway.
//
// Protocol (all messages are {type, ...}):
//   in  : {type:'init', layout:{custom,w,h}, props:{title,subject,author,company}}
//   in  : {type:'slide', index, bytes, altText}   (bytes is a transferred ArrayBuffer)
//   in  : {type:'finish'}
//   out : {type:'progress', index}
//   out : {type:'done', bytes}                    (ArrayBuffer, transferred)
//   out : {type:'error', message}
//
// The slide images arrive as raw PNG BYTES and are base64'd here. That is deliberate:
// pptxgenjs validates its `data` for a `base64,` marker, so SOMEBODY has to encode
// 56 multi-megabyte images, and an ArrayBuffer transfers to this thread for free
// while a data-URL string would be copied whole.

import PptxGenJS from 'pptxgenjs';

let pptx = null;
let slides = [];
let chain = Promise.resolve();

/** Base64 for a byte array, in chunks `String.fromCharCode` can actually take. */
function toBase64(bytes) {
	let binary = '';
	const STEP = 0x8000;
	for (let i = 0; i < bytes.length; i += STEP) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
	return btoa(binary);
}

async function handle(m) {
	if (m.type === 'init') {
		pptx = new PptxGenJS();
		slides = [];
		pptx.title = m.props.title;
		pptx.subject = m.props.subject;
		pptx.author = m.props.author;
		pptx.company = m.props.company;
		// Slide aspect from the deck's own geometry, resolved by the caller — 16:9 keeps
		// the built-in LAYOUT_WIDE; anything else gets a custom layout at the same aspect.
		if (m.layout.custom) {
			pptx.defineLayout({ name: 'LATTICE', width: m.layout.w, height: m.layout.h });
			pptx.layout = 'LATTICE';
		} else {
			pptx.layout = 'LAYOUT_WIDE';
		}
		return;
	}
	if (m.type === 'slide') {
		slides[m.index] = { data: `image/png;base64,${toBase64(new Uint8Array(m.bytes))}`, altText: m.altText };
		self.postMessage({ type: 'progress', index: m.index });
		return;
	}
	if (m.type === 'finish') {
		for (const slide of slides) {
			pptx.addSlide().addImage({ data: slide.data, x: 0, y: 0, w: '100%', h: '100%', altText: slide.altText });
		}
		const blob = await pptx.write({ outputType: 'blob' });
		const bytes = await blob.arrayBuffer();
		self.postMessage({ type: 'done', bytes }, [bytes]);
	}
}

self.onmessage = (e) => {
	// Serial, like the PDF worker's: the handlers await, and two messages interleaving
	// would add slides out of order.
	chain = chain.then(() => handle(e.data)).catch((err) => {
		self.postMessage({ type: 'error', message: err?.message || String(err) });
	});
};
