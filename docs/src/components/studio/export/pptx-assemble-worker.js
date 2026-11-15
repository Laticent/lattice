// The PowerPoint assembly worker — the half of a .pptx build that is pure CPU.
//
// WHY THIS EXISTS, and why it is NOT the per-slide encode. Measured on the real
// Studio export, a 56-slide deck: the PDF (whose encode already runs in a worker)
// blocks the main thread for 8,549 ms across 52 stalls, worst 367 ms — that is
// html-to-image's clone + draw, which needs the DOM and cannot move. PowerPoint
// blocked for 10,769 ms across 65 stalls, worst 717 ms. The PER-SLIDE stalls are the
// SAME in both (350 ms vs 367 ms), which is the measurement that redirected this
// work: `canvas.toDataURL` is the browser's native encoder and is not the problem.
// The PowerPoint-specific cost is the TAIL — writing one XML part per slide and the
// zip write — a single freeze at the end, with nothing painting through it.
//
// So the whole DOCUMENT build moves, not the encode. Calco's PPTX writer
// (`writePptx`, docs/src/lib/calco/pptx.ts) touches no DOM; the download is the main
// thread's job anyway. It is the same writer the CLI and the editable export use.
//
// Protocol (all messages are {type, ...}):
//   in  : {type:'init', size:{width,height}, props:{title,subject,author,company}}
//   in  : {type:'slide', index, bytes, altText}   (bytes is a transferred ArrayBuffer)
//   in  : {type:'finish'}
//   out : {type:'progress', index}
//   out : {type:'done', bytes}                    (ArrayBuffer, transferred)
//   out : {type:'error', message}
//
// The slide pictures arrive as raw PNG (or, for a photographic slide, JPEG) BYTES, and
// Calco stores them as they are: an ArrayBuffer transfers to this thread for free, and
// nothing is base64'd on either side.

import JSZip from 'jszip';
import { writePptx } from '@/lib/calco/pptx';

let deck = null;
let chain = Promise.resolve();

async function handle(m) {
	if (m.type === 'init') {
		// Calco strips the control characters XML forbids and escapes the rest.
		deck = { width: m.size.width, height: m.size.height, ...m.props, slides: [] };
		return;
	}
	if (m.type === 'slide') {
		deck.slides[m.index] = { image: new Uint8Array(m.bytes), frames: [], description: m.altText };
		self.postMessage({ type: 'progress', index: m.index });
		return;
	}
	if (m.type === 'finish') {
		const bytes = await writePptx(JSZip, deck, 'arraybuffer');
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
