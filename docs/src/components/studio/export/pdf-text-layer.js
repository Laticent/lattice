// The PDF text layer: how a slide's words become SELECTABLE, SEARCHABLE, and
// screen-reader-readable text on a page that is otherwise a picture.
//
// WHY THIS EXISTS. The Studio's PDF export rasterizes each slide and writes it as
// one full-bleed image XObject (`pdf-image-stream.js`). That is faithful to the
// pixel and inert to everything else: Cmd-F finds nothing, a cursor selects
// nothing, and a screen reader is handed 56 blank pages. The fix is the one OCR
// tools have used for decades — draw the picture, then draw the same words over it
// in TEXT RENDERING MODE 3 (`3 Tr`), which marks glyphs invisible while leaving
// them in the content stream where every extractor, reader and selection tool
// looks. The page LOOKS byte-identical and now carries its own copy.
//
// WHAT THE RUNS ARE. `pdf-text-extract.js` reads the words out of the capture
// frame's live DOM, one WORD per run, each normalized to the slide box:
// `{ t, x, y, w, s }` with x/w as fractions of the box width and y (the baseline,
// measured from the TOP) and s (the font size) as fractions of its height. This
// module turns them into content-stream operators and the font objects they need.
// Normalized coordinates are what keep the two halves honest: the extractor never
// has to know the page is 960x720 points, and this half never has to know the
// capture ran at 2x.
//
// THE FONT IS A LOOKUP TABLE, NOT A TYPEFACE. Nothing here is drawn, so the glyph
// shapes are irrelevant and the only job of the font object is to say what each
// byte MEANS. So we write a simple Type1 font that borrows Helvetica's name (a
// standard-14 base needs no embedded program), give every code the same nominal
// 500/1000 width, and attach a `/ToUnicode` CMap that maps each code to the real
// character. Two consequences worth knowing:
//
//   - We can carry ANY character — CJK, emoji, combining marks — because the
//     meaning rides in the CMap rather than in an encoding we did not choose. A
//     simple font holds 223 codes, so a document past that opens another font;
//     an English deck uses exactly one.
//   - Uniform widths would drift a long word off its picture, so each run carries
//     a horizontal scale (`Tz`) computed to make the run's WIDTH match the width
//     the browser measured. The word's box is therefore exact; character positions
//     inside it are evenly spaced rather than true. Selection lands on the right
//     word, which is the unit that matters — a per-character truth would need a
//     per-character measurement on the main thread, which is the cost this avoids.
//
// The `/Differences` array names each code `/uniXXXX` as well. That is belt and
// braces: poppler reads `/ToUnicode` first and the glyph name only if that is
// missing, so the text survives a reader that ignores one of the two.

/** First byte code we hand out. 0x20 is skipped: extractors treat code 32 as a
 *  space, and a run never contains one (the extractor splits on whitespace and
 *  lets the GAP between runs say where the spaces are, exactly as OCR does). */
export const TEXT_CODE_FIRST = 0x21;
export const TEXT_CODE_LAST = 0xff;
export const CODES_PER_FONT = TEXT_CODE_LAST - TEXT_CODE_FIRST + 1;
/** Every code's width, in 1/1000 em. See the `Tz` note above. */
export const TEXT_NOMINAL_WIDTH = 500;

/** The resource name a page gives the n-th text font. */
export function textFontName(index) {
	return `LT${index}`;
}

/** A document-wide character → (font, code) allocator. One per exported PDF. */
export function createFontSet() {
	return [];
}

/** The first font with room for every character in `chars`, or a new one. */
function fontWithRoom(set, chars) {
	for (const font of set) {
		let need = 0;
		for (const ch of chars) if (!font.code.has(ch)) need++;
		if (font.chars.length + need <= CODES_PER_FONT) return font;
	}
	const font = { chars: [], code: new Map() };
	set.push(font);
	return font;
}

/**
 * Reserve codes for one run's text and return the hex string a `Tj` carries.
 *
 * The whole run lands in ONE font — a run is a word, so it can never need more
 * than 223 distinct characters — which is what lets a page name a single font
 * resource per run instead of splitting the string.
 * @returns {{font:number, hex:string, length:number}|null} null for empty text
 */
export function encodeRunText(set, text) {
	const chars = Array.from(String(text ?? ''));
	if (!chars.length) return null;
	const font = fontWithRoom(set, new Set(chars));
	let hex = '';
	for (const ch of chars) {
		let code = font.code.get(ch);
		if (code === undefined) {
			code = TEXT_CODE_FIRST + font.chars.length;
			font.chars.push(ch);
			font.code.set(ch, code);
		}
		hex += code.toString(16).padStart(2, '0');
	}
	return { font: set.indexOf(font), hex, length: chars.length };
}

/** A PDF number: fixed notation always (`1e-7` is not a PDF number), 3 decimals. */
function num(value) {
	if (!Number.isFinite(value)) return '0';
	const s = value.toFixed(3);
	return s.replace(/\.?0+$/, '') || '0';
}

/**
 * One page's invisible text, as content-stream operators.
 *
 * @param {Array<{t:string,x:number,y:number,w:number,s:number}>} runs normalized runs
 * @param {Array} fontSet the document's allocator (mutated — codes are assigned here)
 * @param {number} pageW page width in points
 * @param {number} pageH page height in points
 * @returns {{ops:string, fonts:number[]}} operators, and which fonts the page uses
 */
export function textLayerOps(runs, fontSet, pageW, pageH) {
	const used = new Set();
	let ops = '';
	for (const run of Array.isArray(runs) ? runs : []) {
		const size = Number(run?.s) * pageH;
		if (!(size > 0)) continue;
		const encoded = encodeRunText(fontSet, run.t);
		if (!encoded) continue;
		const width = Number(run.w) * pageW;
		const natural = encoded.length * size * (TEXT_NOMINAL_WIDTH / 1000);
		// Clamped, because a degenerate rect (a zero-width measurement, a run the
		// browser could not lay out) must not write `0 Tz` — which collapses the
		// whole run onto one point and can make an extractor read it as one glyph.
		const scale = natural > 0 && width > 0 ? Math.min(1000, Math.max(1, (width / natural) * 100)) : 100;
		used.add(encoded.font);
		// PDF user space is bottom-left; a run's y is its baseline from the top.
		ops += `BT\n3 Tr\n/${textFontName(encoded.font)} ${num(size)} Tf\n${num(scale)} Tz\n${num(Number(run.x) * pageW)} ${num(pageH - Number(run.y) * pageH)} Td\n<${encoded.hex}> Tj\nET\n`;
	}
	return { ops, fonts: [...used] };
}

/** A byte as two uppercase hex digits. */
function hex2(code) {
	return code.toString(16).toUpperCase().padStart(2, '0');
}

/** A character's UTF-16BE hex — one unit for the BMP, a surrogate pair above it. */
function utf16beHex(ch) {
	let hex = '';
	for (let i = 0; i < ch.length; i++) hex += ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
	return hex;
}

/** The AGL-style glyph name for a character (`uni0041`, or `u1F600` above the BMP). */
export function glyphName(ch) {
	const cp = ch.codePointAt(0) || 0;
	return cp <= 0xffff ? `uni${cp.toString(16).toUpperCase().padStart(4, '0')}` : `u${cp.toString(16).toUpperCase().padStart(5, '0')}`;
}

/**
 * The `/ToUnicode` CMap for one font: byte code → the character it means.
 * `beginbfchar` blocks cap at 100 entries, which the spec requires and poppler
 * enforces.
 */
export function toUnicodeCMap(chars) {
	const head = [
		'/CIDInit /ProcSet findresource begin',
		'12 dict begin',
		'begincmap',
		'/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
		'/CMapName /Adobe-Identity-UCS def',
		'/CMapType 2 def',
		'1 begincodespacerange',
		`<${hex2(TEXT_CODE_FIRST)}> <${hex2(TEXT_CODE_LAST)}>`,
		'endcodespacerange',
	];
	const body = [];
	for (let i = 0; i < chars.length; i += 100) {
		const chunk = chars.slice(i, i + 100);
		body.push(`${chunk.length} beginbfchar`);
		chunk.forEach((ch, k) => {
			body.push(`<${hex2(TEXT_CODE_FIRST + i + k)}> <${utf16beHex(ch)}>`);
		});
		body.push('endbfchar');
	}
	return [...head, ...body, 'endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end', ''].join('\n');
}

/**
 * Register one text font (its `/ToUnicode` stream and its dictionary) in `doc`.
 *
 * @param {import('pdf-lib').PDFDocument} doc
 * @param {{PDFRawStream:any}} lib the pdf-lib pieces the caller already imported
 * @param {string[]} chars the font's characters, in code order
 */
export function registerTextFont(doc, { PDFRawStream }, chars) {
	const cmap = new TextEncoder().encode(toUnicodeCMap(chars));
	const toUnicode = doc.context.register(PDFRawStream.of(doc.context.obj({ Length: cmap.length }), cmap));
	return doc.context.register(
		doc.context.obj({
			Type: 'Font',
			Subtype: 'Type1',
			// A standard-14 base name, so no font program has to be embedded. Nothing is
			// drawn from it (`3 Tr`); it exists to give the codes widths and a fallback.
			BaseFont: 'Helvetica',
			FirstChar: TEXT_CODE_FIRST,
			LastChar: TEXT_CODE_FIRST + Math.max(0, chars.length - 1),
			Widths: doc.context.obj(chars.map(() => TEXT_NOMINAL_WIDTH)),
			Encoding: doc.context.obj({
				Type: 'Encoding',
				BaseEncoding: 'WinAnsiEncoding',
				Differences: doc.context.obj([TEXT_CODE_FIRST, ...chars.map(glyphName)]),
			}),
			ToUnicode: toUnicode,
		}),
	);
}
