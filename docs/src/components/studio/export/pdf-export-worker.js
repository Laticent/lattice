// PDF export worker — the off-main-thread half of the one-click image PDF.
//
// The main thread owns everything that needs the DOM (the capture iframe and
// html-to-image's clone + SVG draw) and hands each slide over as a transferred
// ImageBitmap. Everything CPU-heavy and DOM-free lands here instead of freezing
// the page: reading the bitmap's pixels, compressing them, and writing the PDF.
//
// Protocol (all messages are {type, ...}):
//   in  : {type:'init', pageW, pageH, total, pageFormat:'png'|'jpeg',
//          props:{title,subject,author,keywords,creator}, annotations}
//   in  : {type:'slide', index, bitmap, text}      (bitmap is a transferred ImageBitmap;
//                                                  text is the slide's words — see below)
//   in  : {type:'finish'}
//   out : {type:'progress', index}                 (slide encoded + embedded)
//   out : {type:'done', bytes}                     (ArrayBuffer, transferred)
//   out : {type:'error', message}
//
// THE ENCODE IS NOT A PNG ROUND-TRIP any more, and that is the whole performance
// story — see `pdf-image-stream.js` for the mechanism and the measurements. The
// short version: jsPDF's `addImage` inflated each canvas PNG and re-deflated it in
// JavaScript at ~1 s/slide; the pixels are already here and every engine ships a
// native deflate, so we pack the rows ourselves and write the image XObject
// straight into a pdf-lib document. Measured 7-11x faster per slide, with output
// that rasterizes identically and a file ~5% smaller over a real 56-page deck.
//
// Page format is a WORKSPACE PREFERENCE (Studio › Workspace › General): 'png'
// (default) is pixel-lossless; 'jpeg' (q95) hands the canvas's own JPEG bytes to
// `/DCTDecode` with no re-encode at all, for a smaller file on photographic decks,
// at the price of JPEG's edge artifacts. The trade-off is the USER's, not ours.
//
// THE PAGE IS NOT JUST A PICTURE any more. Each 'slide' carries the words the main
// thread measured off the same laid-out DOM (`pdf-text-extract.js`), and 'finish'
// writes them over the image in text rendering mode 3 — invisible ink that Cmd-F,
// a text cursor and a screen reader all read. The mechanism, the font objects and
// what the layer deliberately leaves out are in `pdf-text-layer.js`. The codes are
// allocated ACROSS the document, which is why every page's operators are built in
// one pass before any font object is registered.
//
// Messages are processed through a serial promise chain: onmessage handlers are
// async (the encode awaits), and without the chain two 'slide' messages could
// interleave their awaits and embed pages out of order.

import { PDFDocument, PDFHexString, PDFName, PDFRawStream } from 'pdf-lib';
import { stickyNotePlacements } from '../../../playground/pdf-sticky-notes.js';
import { deflate, imageDict, PX_TO_PT, packPredictorRows, pageContentOps } from './pdf-image-stream.js';
import { createFontSet, registerTextFont, textFontName, textLayerOps } from './pdf-text-layer.js';

let doc = null;
let box = null; // page box in px (the deck's geometry) — points are px * PX_TO_PT
let jpeg = false;
let annotations = null; // per-page comment sticky notes (index-aligned to slides)
let props = null;
let pages = []; // one image XObject ref per slide, in slide order
let texts = []; // one array of normalized text runs per slide, index-aligned to `pages`
let chain = Promise.resolve();
// One reusable scratch canvas (slides in a deck share one geometry) — churning a
// fresh multi-MB OffscreenCanvas per slide is avoidable allocator pressure on the
// memory-capped mobile browsers this worker exists to protect.
let scratch = null;

/** Encode one drawn scratch canvas into the bytes a PDF image XObject carries. */
async function encode(canvas, ctx) {
	if (jpeg) {
		// The canvas's own JPEG encoder produces a DCT stream a PDF can carry verbatim,
		// so nothing decodes or re-encodes it on the way in.
		const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
		return new Uint8Array(await blob.arrayBuffer());
	}
	const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
	return deflate(packPredictorRows(data, width, height));
}

/** A slide's review comments, as PDF `Text` annotations on the page just written. */
function writeStickyNotes(page, notes) {
	const placements = stickyNotePlacements(notes, box.w, box.h);
	if (!placements.length) return;
	const pageH = box.h * PX_TO_PT;
	const refs = placements.map((note) => {
		// Page px with a top-left origin → PDF points with a bottom-left one.
		const x0 = note.x * PX_TO_PT;
		const x1 = (note.x + note.w) * PX_TO_PT;
		const y1 = pageH - note.y * PX_TO_PT;
		const y0 = pageH - (note.y + note.h) * PX_TO_PT;
		// ALWAYS the hex form. `PDFString.of` writes `(value)` with no escaping, so a
		// comment containing `)` — `ship it :)` — closes the literal early and corrupts
		// the annotation dictionary; because pdf-lib packs a page's objects into one
		// object stream, that takes every note on the page down with it (measured, and
		// the jsPDF lane this replaces escaped properly). Hex has no delimiter to break
		// and carries non-ASCII as UTF-16BE either way.
		const text = (value) => PDFHexString.fromText(value);
		return doc.context.register(
			doc.context.obj({
				Type: 'Annot',
				Subtype: 'Text',
				Name: 'Comment',
				Rect: [x0, y0, x1, y1],
				T: text(note.title),
				Contents: text(note.contents),
				Open: false,
				F: 4, // print
				P: page.ref,
			}),
		);
	});
	page.node.set(PDFName.of('Annots'), doc.context.obj(refs));
}

async function handle(m) {
	if (m.type === 'init') {
		box = { w: m.pageW, h: m.pageH };
		jpeg = m.pageFormat === 'jpeg';
		annotations = m.annotations || null;
		props = m.props || {};
		pages = [];
		texts = [];
		doc = await PDFDocument.create();
		return;
	}
	if (m.type === 'slide') {
		const bmp = m.bitmap;
		if (!scratch || scratch.width !== bmp.width || scratch.height !== bmp.height) {
			scratch = new OffscreenCanvas(bmp.width, bmp.height);
		}
		const canvas = scratch;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		// White underlay, for BOTH formats. JPEG has no alpha channel and a bare encode
		// composites stray transparency onto BLACK; the flate path drops the alpha
		// channel, and dropping it without compositing changes every anti-aliased glyph
		// edge. Paper-white is the safe floor either way (slides paint their own
		// full-bleed background, so it never shows).
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(bmp, 0, 0);
		bmp.close();
		const bytes = await encode(canvas, ctx);
		const dict = imageDict(doc.context, { width: canvas.width, height: canvas.height, jpeg });
		pages[m.index] = doc.context.register(PDFRawStream.of(dict, bytes));
		texts[m.index] = Array.isArray(m.text) ? m.text : [];
		self.postMessage({ type: 'progress', index: m.index });
		return;
	}
	if (m.type === 'finish') {
		const w = box.w * PX_TO_PT;
		const h = box.h * PX_TO_PT;
		const name = PDFName.of('Im0');
		// Pass one: every page's invisible text, which is also what assigns the
		// document's character codes. The font objects cannot be written until the last
		// page has had its say, so they are registered between the two passes.
		const fontSet = createFontSet();
		// `Array.from`, not `pages.map`: a slide that never arrived leaves a HOLE, and
		// `map` preserves holes — `layers[i]` would then be undefined in the loop below.
		const layers = Array.from({ length: pages.length }, (_v, i) => textLayerOps(texts[i], fontSet, w, h));
		const fontRefs = fontSet.map((font) => registerTextFont(doc, { PDFRawStream }, font.chars));
		for (let i = 0; i < pages.length; i++) {
			const page = doc.addPage([w, h]);
			page.node.setXObject(name, pages[i]);
			// Image first, words over it — the order OCR output uses, and the one that
			// keeps a viewer's selection on top of the picture it belongs to.
			const image = pageContentOps(w, h);
			const words = new TextEncoder().encode(layers[i].ops);
			const ops = new Uint8Array(image.length + words.length);
			ops.set(image);
			ops.set(words, image.length);
			// Deflated, unlike the image-only stream this replaces: a wordy slide is a few
			// KB of operators, which is ~3% of a 56-page deck left uncompressed for no
			// reason when the compressor is already right here.
			const stream = await deflate(ops);
			// Fonts before `/Contents`, which keeps the single-reference form every page had
			// before the text layer — but the ordering is NOT what guarantees it, and an
			// earlier version of this comment said it was. pdf-lib's `normalize()` is
			// `if (this.normalized) return`, and `setXObject` two lines up has already run
			// it, so `/Contents` can no longer be wrapped in an array whatever the order.
			// The durable guard is in the READERS — `tools/bench-pdf-export.mjs` and
			// `docs/e2e/pdf-export-worker.spec.ts` now take both shapes — because a reader
			// that takes only one silently reports every text-bearing page as empty, and a
			// verification tool that cannot fail is worse than no tool.
			for (const f of layers[i].fonts) page.node.setFontDictionary(PDFName.of(textFontName(f)), fontRefs[f]);
			page.node.set(
				PDFName.of('Contents'),
				doc.context.register(PDFRawStream.of(doc.context.obj({ Length: stream.length, Filter: 'FlateDecode' }), stream)),
			);
			if (annotations) writeStickyNotes(page, annotations[i]);
		}
		if (props.title) doc.setTitle(props.title);
		if (props.subject) doc.setSubject(props.subject);
		if (props.author) doc.setAuthor(props.author);
		if (props.creator) doc.setCreator(props.creator);
		if (props.keywords) doc.setKeywords(String(props.keywords).split('; ').filter(Boolean));
		// pdf-lib otherwise advertises ITSELF (a GitHub URL) in /Producer. The deck's
		// provenance is Lattice's to state. Note the fallback lane does NOT match here:
		// jsPDF writes its own name into /Producer and puts ours in /Creator, so the
		// field is a reliable tell of which lane built a given file.
		doc.setProducer(props.creator || 'Lattice');
		const bytes = (await doc.save()).buffer;
		self.postMessage({ type: 'done', bytes }, [bytes]);
	}
}

self.onmessage = (e) => {
	chain = chain.then(() => handle(e.data)).catch((err) => {
		self.postMessage({ type: 'error', message: err?.message || String(err) });
	});
};
