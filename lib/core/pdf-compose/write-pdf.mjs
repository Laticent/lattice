/**
 * lib/core/pdf-compose/write-pdf.mjs — the WRITER of the shared PDF writer.
 *
 * Turns the reader's drawing lists plus one photo per slide into PDF bytes with
 * pdf-lib. Each page is the photo underneath, then chart shapes as vector paths, then
 * every word as real text in the deck's own (subset, weight-pinned) font. Environment-
 * neutral: it runs in the CLI's page and in the Studio's page alike, and it touches no
 * DOM — everything it needs is in its arguments.
 */
import fontkit from '@pdf-lib/fontkit';
import {
	concatTransformationMatrix, degrees, 
	PDFDocument, PDFHexString, PDFName, PDFNumber, PDFOperator, PDFString, popGraphicsState, pushGraphicsState, rgb, setCharacterSpacing, setFillingColor, setGraphicsState,drawSvgPath as svgPathOperators,
} from 'pdf-lib';

/**
 * A PNG's own compressed data as a PDF image, with no decode: an 8-bit RGB, non-interlaced PNG
 * (what Chrome's screenshot writes) is a zlib stream of scanlines each led by its filter byte, and
 * a PDF reads exactly that under FlateDecode with /Predictor 15. pdf-lib's `embedPng` decodes and
 * deflates it again in JavaScript, which cost ~0.45 s a 4K slide (a 116-slide 4K deck: 0.7 s of
 * writing became 55 s). Any other PNG (alpha, a palette, 16-bit, interlaced) returns null and
 * takes `embedPng`.
 * @returns {import('pdf-lib').PDFRef | null}
 */
export function rgbPngXObject(doc, bytes) {
	const u32 = (o) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
	const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (bytes.length < 33 || SIG.some((b, i) => bytes[i] !== b)) return null;
	const w = u32(16), h = u32(20);
	if (bytes[24] !== 8 || bytes[25] !== 2 || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) return null;
	const parts = [];
	let len = 0;
	for (let at = 8; at + 8 <= bytes.length;) {
		const n = u32(at);
		const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
		if (type === 'IDAT') { parts.push(bytes.subarray(at + 8, at + 8 + n)); len += n; }
		if (type === 'IEND') break;
		at += 12 + n;
	}
	if (!len) return null;
	const data = new Uint8Array(len);
	let o = 0;
	for (const p of parts) { data.set(p, o); o += p.length; }
	const stream = doc.context.stream(data, {
		Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8,
		Filter: 'FlateDecode', DecodeParms: { Predictor: 15, Colors: 3, BitsPerComponent: 8, Columns: w },
	});
	return doc.context.register(stream);
}

/** CSS px -> PDF pt. Chrome's `page.pdf({ width: 'Npx' })` uses the same 96 dpi. */
export const PT_PER_PX = 0.75;
/** Chrome's synthetic oblique for a face with no italic cut: a 1/4 skew (14.04 deg). */
const SYNTHETIC_OBLIQUE = degrees((Math.atan(0.25) * 180) / Math.PI);
/** Horizontal scale band for fitting a word to the width the browser measured. */
const TZ_MIN = 90, TZ_MAX = 110;

const mul = (A, B) => [
	A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
	A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
	A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];
const FLIP_Y = [1, 0, 0, -1, 0, 0];
const col = (c) => rgb(c[0] / 255, c[1] / 255, c[2] / 255);
const Tz = (v) => PDFOperator.of('Tz', [PDFNumber.of(v)]);
const op = (name, ...args) => PDFOperator.of(name, args);
const inv = (m) => {
	const det = m[0] * m[3] - m[1] * m[2];
	return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
};
const PAINT = new Set(['f', 'F', 'f*', 'S', 's', 'B', 'B*', 'b', 'b*', 'n', 'q', 'Q', 'rg', 'RG', 'd', 'w', 'J', 'j', 'gs']);

/**
 * Path-construction operators for SVG path data, drawn under `T = P·mat·FLIP_Y` (pdf-lib
 * flips y itself and the flip cancels). Arcs, relative commands and smooth curves come
 * from pdf-lib's own SVG path parser, so no path grammar is duplicated here.
 */
/**
 * SVG path data re-spelled as one command or number per token, space-separated. pdf-lib's
 * parser mis-reads spellings the SVG grammar allows: KaTeX's tall delimiters break a line
 * after a comma before a negative number (`349,\n-36`), and the parser turned the rest of
 * the path into NaN — which a viewer treats as a broken operator and drops the whole shape
 * (found by the thin-line sweep, 2026-09-27). Tokenizing also splits `1.5.5` and `2-3`.
 */
export function normalizePath(d) {
	const src = String(d);
	const NUM = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/;
	const out = [];
	let i = 0, cmd = '', arg = 0;
	while (i < src.length) {
		const ch = src[i];
		if (/[\s,]/.test(ch)) { i++; continue; }
		if (/[a-df-zA-DF-Z]/.test(ch)) { out.push(ch); cmd = ch; arg = 0; i++; continue; }
		// An arc's 4th and 5th arguments are one-character flags that may run together (`011`).
		if ((cmd === 'a' || cmd === 'A') && (arg % 7 === 3 || arg % 7 === 4) && (ch === '0' || ch === '1')) { out.push(ch); arg++; i++; continue; }
		const m = src.slice(i).match(NUM);
		if (!m) { i++; continue; }
		out.push(m[0].toLowerCase()); arg++; i += m[0].length; // pdf-lib reads `1E-5` as 1, then -5
	}
	return out.join(' ');
}
/**
 * Whether a matrix can be drawn under: finite, and invertible — the writer inverts every
 * shape's and clip's matrix to restore the graphics state, and a collapsed one (`scale(0)`
 * above a nested <svg>) inverts to NaN, which blanks the rest of the page (the fourth checker
 * pass, 2026-09-27).
 */
export function matrixIsDrawable(m) {
	if (!m || m.length !== 6 || !m.every(Number.isFinite)) return false;
	return Math.abs(m[0] * m[3] - m[1] * m[2]) > 1e-9;
}

/** Whether a path turns into PDF operators with finite numbers only. */
export function pathIsDrawable(d) {
	try {
		return pathOperators(d).every((o) => o.args.every((a) => !(typeof a?.asNumber === 'function') || Number.isFinite(a.asNumber())));
	} catch {
		return false;
	}
}
const pathOperators = (d) => svgPathOperators(normalizePath(d), { x: 0, y: 0, color: rgb(0, 0, 0) }).filter((o) => !PAINT.has(o.name));

/**
 * Intersect the current clip with every clip the reader found. Each clip is the union of
 * its parts; the reader guarantees one matrix per clip. Leaves the CTM where it found it.
 */
function applyClips(page, P, clips) {
	for (const parts of clips || []) {
		const T = mul(mul(P, parts[0].mat), FLIP_Y);
		const ops = [concatTransformationMatrix(...T)];
		for (const part of parts) ops.push(...pathOperators(part.d).filter((o) => o.name !== 'cm'));
		// pdf-lib's own translate/flip preamble, re-applied once for the whole union.
		ops.splice(1, 0, concatTransformationMatrix(1, 0, 0, -1, 0, 0));
		ops.push(op('W'), op('n'), concatTransformationMatrix(...inv(mul(P, parts[0].mat))));
		page.pushOperators(...ops);
	}
}

/**
 * Give pdf-lib every glyph the text actually draws, not only the ones the font's cmap names.
 * pdf-lib writes a font's /W widths and its ToUnicode map from the cmap's glyphs alone
 * (`CustomFontEmbedder.allGlyphsInFontSortedById`). A feature the slide asks for draws
 * OTHER glyphs: `tnum` swaps each digit for a tabular alternate the cmap never reaches. Those
 * got the default 1000-unit width, so "24" drew as "2 4", and no Unicode, so pdftotext and
 * copy-paste dropped them (followups.d/2515, gallery.pdf p27). This records each glyph as
 * it is encoded, with the code points fontkit's layout carried through the substitution,
 * and lists them beside the cmap's glyphs when the font is written at save.
 * @param {import('pdf-lib').PDFFont} pdfFont
 */
export function coverShapedGlyphs(pdfFont) {
	const e = pdfFont.embedder;
	// The full-font embedder only (`subset: false`): pdf-lib's subsetting embedder keeps its own
	// glyph map and would bypass the recording below.
	if (typeof e?.allGlyphsInFontSortedById !== 'function' || e.glyphIdMap) throw new Error('coverShapedGlyphs: needs a font embedded with subset: false');
	const shaped = new Map();
	e.encodeText = (text) => {
		const { glyphs } = e.font.layout(text, e.fontFeatures);
		let hex = '';
		for (const g of glyphs) {
			if (!shaped.has(g.id)) shaped.set(g.id, g);
			hex += g.id.toString(16).padStart(4, '0');
		}
		return PDFHexString.of(hex);
	};
	// /W takes EVERY glyph, as stock pdf-lib does for the cmap's. ToUnicode takes only those with
	// code points: fontkit caches a glyph with the code points it was first made with, and a glyph
	// a decomposition reached first has none, which would write an empty `<>` entry. Dropping it
	// from /W too would draw it 1000 units wide (the checker's probe, 2026-10-05).
	let all, mapped, forMap = false;
	e.glyphCache = {
		access() {
			if (!all) {
				const byId = new Map(shaped);
				// The cmap's own glyph wins on a shared id: its code point is the canonical one.
				for (const g of e.allGlyphsInFontSortedById()) byId.set(g.id, g);
				all = [...byId.values()].sort((a, b) => a.id - b.id);
				mapped = all.filter((g) => g.codePoints?.length);
			}
			return forMap ? mapped : all;
		},
	};
	const embedCmap = e.embedUnicodeCmap.bind(e);
	e.embedUnicodeCmap = (context) => {
		forMap = true;
		try { return embedCmap(context); } finally { forMap = false; }
	};
}

/** Ascent/descent (as fractions of the em) the way browsers pick them. */
export function fontMetrics(fk) {
	const os2 = fk['OS/2'];
	const useTypo = os2 && (os2.fsSelection & 0x80) !== 0; // USE_TYPO_METRICS
	const asc = useTypo ? os2.typoAscender : fk.ascent;
	const desc = useTypo ? -os2.typoDescender : -fk.descent;
	return { asc: asc / fk.unitsPerEm, desc: desc / fk.unitsPerEm };
}

/**
 * @param {object} args
 * @param {Array<{w:number,h:number,words:object[],shapes:object[],links:object[],photo?:Uint8Array,photoType?:'jpeg'|'png'}>} args.slides
 * @param {Map<string,{ttf:Uint8Array,feat:object}>} args.fonts keyed by `word.fontKey`
 * @returns {Promise<{ bytes: Uint8Array, drift: number[] }>}
 */
export async function writeDeckPdf({ slides, fonts, meta = {}, assets = new Map() }) {
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	// pdf-lib names fonts and resources with a Math.random() suffix, so two renders of one
	// deck differed in 3,617 bytes. A counter is just as unique and keeps the CLI's PDF
	// byte-reproducible (engineering/pipeline.md §4a).
	let serial = 0;
	doc.context.addRandomSuffix = (prefix) => `${prefix}-${++serial}`;
	// What Chrome's printer records, so switching writers loses no accessibility:
	// the title (shown in the viewer's title bar) and the document language.
	if (meta.title) doc.setTitle(meta.title, { showInWindowTitleBar: true });
	if (meta.lang) doc.setLanguage(meta.lang);
	// The dates come from the host: the CLI passes its pinned epoch (SOURCE_DATE_EPOCH, or
	// 1970) so the file is byte-reproducible; the dates sit inside a compressed object
	// stream, where lib/core/pdf-timestamps.js cannot pin them after the fact.
	if (meta.date) { doc.setCreationDate(meta.date); doc.setModificationDate(meta.date); }
	doc.setCreator('Lattice');
	doc.setProducer('Lattice pdf-compose (pdf-lib)');
	const tags = new Tagger(doc);
	const embedded = new Map();
	for (const [key, f] of fonts) {
		const font = await doc.embedFont(f.ttf, { subset: false, features: f.feat });
		coverShapedGlyphs(font);
		embedded.set(key, { font, hasSpace: font.getCharacterSet().includes(32), ...fontMetrics(fontkit.create(f.ttf)) });
	}
	const drift = [];
	const pages = [];
	for (const s of slides) {
		const W = s.w * PT_PER_PX, H = s.h * PT_PER_PX;
		const page = doc.addPage([W, H]);
		tags.beginPage(page);
		const P = [PT_PER_PX, 0, 0, -PT_PER_PX, 0, H]; // slide px (y down) -> page pt (y up)
		// The photo and the chart geometry are presentation, not content: artifacts, so a
		// screen reader skips them (the chart's words are tagged below, under a Figure).
		page.pushOperators(op('BMC', PDFName.of('Artifact')));
		if (s.photo) {
			const direct = s.photoType === 'png' && rgbPngXObject(doc, s.photo);
			if (direct) {
				const name = page.node.newXObject('Photo', direct);
				page.pushOperators(pushGraphicsState(), concatTransformationMatrix(W, 0, 0, H, 0, 0), op('Do', name), popGraphicsState());
			} else {
				const img = s.photoType === 'png' ? await doc.embedPng(s.photo) : await doc.embedJpg(s.photo);
				page.drawImage(img, { x: 0, y: 0, width: W, height: H });
			}
		}
		// The slide's OWN edge (its spectrum bar, a dark slide's hairline; read-slide.mjs
		// readSectionEdges) is the section's background and border, which paint under everything on
		// the slide. So it is drawn straight over the photo, before the images and shapes the
		// writer draws for the slide's content: drawn with those, it buried a chart line that ran
		// across a divider's rail (the round-3 checker, 2026-10-06).
		for (const sh of s.shapes) if (sh.edge) drawShape(doc, page, P, sh);
		page.pushOperators(op('EMC'));
		// Images at their own resolution, original bytes, embedded once per URL. An <img>
		// with alt text is a Figure; a background image is decoration.
		for (const im of s.images || []) {
			const a = assets.get(im.url);
			if (!a) continue;
			if (!a.xobj) a.xobj = a.type === 'png' ? await doc.embedPng(a.bytes) : await doc.embedJpg(a.bytes);
			const tagged = im.kind === 'img' && im.alt;
			page.pushOperators(tagged ? op('BDC', PDFName.of('Figure'), doc.context.obj({ MCID: tags.mark(`img${im.sid}`, 'Figure', im.alt) })) : op('BMC', PDFName.of('Artifact')), pushGraphicsState());
			applyClips(page, P, im.clips);
			page.drawImage(a.xobj, { x: im.x * PT_PER_PX, y: H - (im.y + im.h) * PT_PER_PX, width: im.w * PT_PER_PX, height: im.h * PT_PER_PX, opacity: im.op < 0.999 ? im.op : undefined });
			page.pushOperators(popGraphicsState(), op('EMC'));
		}
		page.pushOperators(op('BMC', PDFName.of('Artifact')));
		for (const sh of s.shapes) if (!sh.edge) drawShape(doc, page, P, sh);
		page.pushOperators(op('EMC'));
		s.words.forEach((w, i) => {
			const f = embedded.get(w.fontKey);
			if (!f) return;
			// A real space after each word that has a neighbor in its block: words are placed
			// one by one, and without it copy-paste and screen readers run them together. The
			// space draws nothing, and the next word is placed absolutely either way.
			const next = s.words[i + 1];
			const space = !!next && next.sid === w.sid && !w.joinNext && f.hasSpace;
			page.pushOperators(op('BDC', PDFName.of(w.role || 'P'), doc.context.obj({ MCID: tags.mark(w.sid ?? -1, w.role || 'P') })));
			drawWord(page, P, H, w, f, drift, space);
			page.pushOperators(op('EMC'));
		});
		for (const l of s.links) if (l.href) addLink(doc, page, H, l);
		pages.push({ page, H, links: s.links.filter((l) => l.dest != null) });
	}
	// Jumps inside the deck point at pages, so they are written once every page exists.
	for (const { page, H, links } of pages) for (const l of links) if (pages[l.dest]) addLink(doc, page, H, l, pages[l.dest].page);
	tags.finish();
	// pdf-lib gives every page it draws on an empty /Annots array (PDFPageLeaf.normalizedEntries).
	// A page with no link carries none: a consumer reads the entry's presence as "has an
	// annotation" (the CLI's speaker-note check did, and every note-less page failed it).
	for (const { page } of pages) {
		const annots = page.node.lookup(PDFName.of('Annots'));
		if (annots && annots.size() === 0) page.node.delete(PDFName.of('Annots'));
	}
	// Object streams: 13% smaller on the 9-slide Northwind deck (253 vs 291 KB).
	return { bytes: await doc.save({ useObjectStreams: true }), drift };
}

function drawShape(doc, page, P, sh) {
	page.pushOperators(pushGraphicsState());
	applyClips(page, P, sh.clips);
	if (sh.grad) drawGradient(doc, page, P, sh);
	// pdf-lib's drawSvgPath flips y itself; pre-flip so the two cancel and `mat` rules.
	const T = mul(mul(P, sh.mat), FLIP_Y);
	page.pushOperators(concatTransformationMatrix(...T));
	// A dash array that is all zeros, sums to zero or has a negative entry is a SOLID line in
	// SVG (Mermaid's edges compute `stroke-dasharray: 0`) — and an error in PDF, where poppler
	// then draws nothing: every Mermaid edge vanished (the checker's pass, 2026-09-27).
	let dash = sh.dash && sh.dash !== 'none' ? sh.dash.split(/[\s,]+/).map(parseFloat).filter((n) => !Number.isNaN(n)) : undefined;
	if (dash && (!dash.length || dash.some((n) => n < 0) || dash.reduce((a, b) => a + b, 0) <= 0)) dash = undefined;
	// SVG repeats an odd-length dash list to make it even; PDF does not.
	if (dash && dash.length % 2) dash = [...dash, ...dash];
	let fill = sh.grad ? null : sh.fill;
	if (fill && sh.rule === 'evenodd') {
		// pdf-lib's drawSvgPath fills nonzero only; an even-odd fill (a ring) is written by hand.
		page.pushOperators(pushGraphicsState());
		const a = sh.fop * fill[3];
		if (a < 0.999) page.pushOperators(setGraphicsState(page.node.newExtGState('GS', doc.context.obj({ Type: 'ExtGState', ca: a }))));
		page.pushOperators(setFillingColor(col(fill)), concatTransformationMatrix(1, 0, 0, -1, 0, 0), ...pathOperators(sh.d).filter((o) => o.name !== 'cm'), op('f*'), popGraphicsState());
		fill = null;
	}
	if (fill || sh.stroke) {
		page.drawSvgPath(normalizePath(sh.d), {
			x: 0, y: 0,
			color: fill ? col(fill) : undefined,
			opacity: fill ? sh.fop * fill[3] : undefined,
			borderColor: sh.stroke ? col(sh.stroke) : undefined,
			borderWidth: sh.stroke ? sh.sw : undefined,
			borderOpacity: sh.stroke ? sh.sop * sh.stroke[3] : undefined,
			borderLineCap: sh.cap === 'round' ? 1 : sh.cap === 'square' ? 2 : 0,
			borderDashArray: dash?.length ? dash : undefined,
		});
	}
	page.pushOperators(popGraphicsState());
}

/** A gradient fill: clip to the shape, then paint an axial or radial shading over it. */
function drawGradient(doc, page, P, sh) {
	const g = sh.grad;
	const T = mul(mul(P, sh.mat), FLIP_Y);
	page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...T), concatTransformationMatrix(1, 0, 0, -1, 0, 0),
		...pathOperators(sh.d).filter((o) => o.name !== 'cm'), op(sh.rule === 'evenodd' ? 'W*' : 'W'), op('n'),
		concatTransformationMatrix(...inv(mul(P, sh.mat))), concatTransformationMatrix(...mul(mul(P, sh.mat), g.space)));
	const a = g.alpha * sh.fop;
	if (a < 0.999) page.pushOperators(setGraphicsState(page.node.newExtGState('GS', doc.context.obj({ Type: 'ExtGState', ca: a, CA: a }))));
	page.pushOperators(op('sh', addShading(doc, page, g)), popGraphicsState());
}

function shadingFunction(doc, stops) {
	let s = [...stops];
	if (s[0].o > 0) s.unshift({ ...s[0], o: 0 });
	if (s[s.length - 1].o < 1) s.push({ ...s[s.length - 1], o: 1 });
	// Several stops piled on an END (0 or 1) paint nothing past it: keep the outermost one at 0
	// and the last one at 1, so the stitching Bounds stay strictly inside (0, 1).
	while (s.length > 2 && s[1].o <= 0) s = s.slice(1);
	while (s.length > 2 && s[s.length - 2].o >= 1) s = [...s.slice(0, -2), s[s.length - 1]];
	const c01 = (c) => c.map((v) => Math.round((v / 255) * 1e4) / 1e4);
	const seg = (a, b) => doc.context.obj({ FunctionType: 2, Domain: [0, 1], C0: c01(a.c), C1: c01(b.c), N: 1 });
	if (s.length === 2) return seg(s[0], s[1]);
	const fns = [], bounds = [], encode = [];
	for (let i = 0; i < s.length - 1; i++) {
		fns.push(seg(s[i], s[i + 1]));
		encode.push(0, 1);
		// Bounds must increase; a hard stop (two stops at one offset) nudges by a hair.
		if (i < s.length - 2) bounds.push(Math.min(1 - 1e-5 * (s.length - 2 - i), Math.max(s[i + 1].o, (bounds.at(-1) ?? 0) + 1e-5)));
	}
	return doc.context.obj({ FunctionType: 3, Domain: [0, 1], Functions: fns, Bounds: bounds, Encode: encode });
}

function addShading(doc, page, g) {
	const shading = doc.context.register(doc.context.obj({
		ShadingType: g.type === 'linear' ? 2 : 3, ColorSpace: 'DeviceRGB', Coords: g.coords,
		Function: shadingFunction(doc, g.stops), Extend: [true, true],
	}));
	const res = page.node.Resources();
	let dict = res.lookup(PDFName.of('Shading'));
	if (!dict) { dict = doc.context.obj({}); res.set(PDFName.of('Shading'), dict); }
	const name = PDFName.of(`Sh${dict.keys().length}`);
	dict.set(name, shading);
	return name;
}

function drawWord(page, P, H, w, f, drift, space = false) {
	const text = space ? `${w.t} ` : w.t;
	const n = [...w.t].length;
	const natural = f.font.widthOfTextAtSize(w.t, w.size);
	// Fit the word to the width the browser measured: pdf-lib applies no kerning, so a
	// word can run a few px long. Words are placed one by one, so nothing accumulates.
	const target = w.w - w.ls * n;
	const tz = natural > 0 && target > 0 ? Math.min(TZ_MAX, Math.max(TZ_MIN, (100 * target) / natural)) : 100;
	const opts = { size: w.size * PT_PER_PX, font: f.font, color: col(w.color), opacity: w.op * w.color[3] };
	if (w.synthItalic) opts.ySkew = SYNTHETIC_OBLIQUE;
	const content = (f.asc + f.desc) * w.size;
	if (w.svg) {
		// Place in the SVG's own user space so rotation and scale come along exactly.
		const by = w.etop + (w.eh - content) / 2 + f.asc * w.size;
		const T = mul(mul(P, w.mat), FLIP_Y);
		page.pushOperators(pushGraphicsState());
		applyClips(page, P, w.clips);
		page.pushOperators(concatTransformationMatrix(...T), setCharacterSpacing(0), Tz(tz));
		page.drawText(text, { ...opts, size: w.size, x: w.px, y: -by });
		page.pushOperators(Tz(100), popGraphicsState());
		return;
	}
	drift.push(Math.abs(natural + w.ls * n - w.w));
	// The baseline the reader measured in the browser; the font-metric estimate is the fallback.
	const base = w.base ?? w.top + (w.h - content) / 2 + f.asc * w.size;
	// Tz scales Tc too (PDF 9.4.4: tx = (w0·Tfs + Tc) · Th), so undo it to keep the spacing true.
	page.pushOperators(setCharacterSpacing((w.ls * PT_PER_PX * 100) / tz), Tz(tz));
	page.drawText(text, { ...opts, x: w.x * PT_PER_PX, y: H - base * PT_PER_PX });
	page.pushOperators(setCharacterSpacing(0), Tz(100));
}

/**
 * The tag tree: Document > one element per text block (H1…H6, P, LI, TH, TD …, Figure for
 * a chart's labels), each holding the marked-content ids of its words, plus the parent
 * tree that maps every id back to its element. That is the structure Chrome's tagged PDF
 * carries, and what a screen reader reads.
 */
class Tagger {
	constructor(doc) {
		this.doc = doc;
		this.pages = [];
		this.root = doc.context.nextRef();
		this.docElem = doc.context.nextRef();
		this.kids = [];
	}
	beginPage(page) {
		const index = this.pages.length;
		page.node.set(PDFName.of('StructParents'), PDFNumber.of(index));
		page.node.set(PDFName.of('Tabs'), PDFName.of('S'));
		this.pages.push({ ref: page.ref, mcids: [], elems: new Map() });
	}
	/** A new marked-content id on the current page, filed under block `sid`. */
	mark(sid, role, alt) {
		const pg = this.pages[this.pages.length - 1];
		const mcid = pg.mcids.length;
		let el = pg.elems.get(sid);
		if (!el) { el = { ref: this.doc.context.nextRef(), role, alt, mcids: [] }; pg.elems.set(sid, el); this.kids.push({ el, page: pg }); }
		el.mcids.push(mcid);
		pg.mcids.push(el.ref);
		return mcid;
	}
	finish() {
		const ctx = this.doc.context;
		for (const { el, page } of this.kids) {
			const d = { Type: 'StructElem', S: el.role, P: this.docElem, Pg: page.ref, K: el.mcids };
			if (el.alt) d.Alt = PDFString.of(el.alt);
			ctx.assign(el.ref, ctx.obj(d));
		}
		ctx.assign(this.docElem, ctx.obj({ Type: 'StructElem', S: 'Document', P: this.root, K: this.kids.map((k) => k.el.ref) }));
		const nums = [];
		for (const [i, p] of this.pages.entries()) nums.push(i, p.mcids);
		ctx.assign(this.root, ctx.obj({ Type: 'StructTreeRoot', K: this.docElem, ParentTree: ctx.obj({ Nums: nums }), ParentTreeNextKey: this.pages.length }));
		const cat = this.doc.catalog;
		cat.set(PDFName.of('StructTreeRoot'), this.root);
		cat.set(PDFName.of('MarkInfo'), ctx.obj({ Marked: true }));
	}
}

function addLink(doc, page, H, l, destPage) {
	const x1 = l.x * PT_PER_PX, y2 = H - l.y * PT_PER_PX;
	const annot = doc.context.obj({
		Type: 'Annot', Subtype: 'Link', Border: [0, 0, 0],
		Rect: [x1, y2 - l.h * PT_PER_PX, x1 + l.w * PT_PER_PX, y2],
		...(destPage ? { Dest: [destPage.ref, 'Fit'] } : { A: { Type: 'Action', S: 'URI', URI: PDFString.of(l.href) } }),
	});
	const ref = doc.context.register(annot);
	const annots = page.node.lookup(PDFName.of('Annots'));
	if (annots) annots.push(ref);
	else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
}
