// The PDF page-image kernel: how a captured slide bitmap becomes a PDF image
// XObject, without a PNG round-trip.
//
// WHY THIS EXISTS. The export used to hand each slide's PNG blob to jsPDF's
// `addImage`, which INFLATES the PNG to raw pixels in JavaScript and re-deflates
// them into the PDF. Measured on the real export, that one call is the whole
// pipeline: 824 ms/slide in Chromium, 1186 in Firefox, 1010 in WebKit, against a
// main thread that draws a slide in 256-651 ms. The pixels are already in the
// canvas, and every engine ships a native deflate (`CompressionStream`), so the
// PNG round-trip buys nothing.
//
// WHAT WE WRITE INSTEAD. PDF's `/FlateDecode` with `/Predictor 15` takes exactly
// the byte layout PNG uses inside its IDAT: each row prefixed by a filter tag.
// So we read the bitmap's pixels once, drop the alpha channel, tag each row
// `0` (no filter), deflate the lot natively, and hand the result over as an image
// XObject. Measured on the same slides: 114 / 109 / 135 ms per slide across the
// three engines — 7-11x — with output that rasterizes IDENTICALLY (AE = 0 on
// every page, poppler at 72 dpi). The file shrinks too: ~5% over a real 56-page
// deck, where the image streams are most of the bytes either way.
//
// Alpha is dropped deliberately, and it must be composited first: the capture is
// RGBA and its text is anti-aliased against transparency, so dropping alpha
// without an opaque underlay changes every glyph edge. The caller paints white
// before drawing the bitmap, which is what a PDF page is anyway.

/** PDF points per CSS pixel.
 *
 *  This is jsPDF's DEFAULT px unit (1px = 4/3 pt), which is what the main-thread
 *  fallback constructs — NOT its `px_scaling` hotfix, which is the other direction
 *  (1px = 0.75pt) and is used by the print-sheet lane. Matching the fallback is the
 *  point: the two lanes must write the same page box for the same deck. If you ever
 *  add the hotfix to `buildPdfBlobOnMainThread`, this constant has to move with it. */
export const PX_TO_PT = 4 / 3;

/**
 * Pack RGBA pixels into PNG-predictor rows: `[0, r,g,b, r,g,b, …]` per row.
 * @param {Uint8ClampedArray|Uint8Array} rgba source pixels, 4 bytes each
 * @param {number} width in pixels
 * @param {number} height in pixels
 * @returns {Uint8Array} rows ready for `/Predictor 15 /Colors 3 /BitsPerComponent 8`
 */
export function packPredictorRows(rgba, width, height) {
	const rowLen = width * 3 + 1;
	const rows = new Uint8Array(rowLen * height);
	for (let y = 0; y < height; y++) {
		let out = y * rowLen;
		rows[out++] = 0; // filter tag: none
		let i = y * width * 4;
		for (let x = 0; x < width; x++) {
			rows[out++] = rgba[i];
			rows[out++] = rgba[i + 1];
			rows[out++] = rgba[i + 2];
			i += 4;
		}
	}
	return rows;
}

/** Deflate with the platform's own compressor (zlib wrapper — what `/FlateDecode` expects). */
export async function deflate(bytes) {
	// Written to the stream directly rather than through `new Blob([…]).stream()`:
	// jsdom's Blob has no `stream()`, and this keeps the kernel testable off a browser.
	const compressor = new CompressionStream('deflate');
	const writer = compressor.writable.getWriter();
	writer.write(bytes);
	writer.close();
	return new Uint8Array(await new Response(compressor.readable).arrayBuffer());
}

/**
 * The image XObject dictionary for one page image.
 * @param {import('pdf-lib').PDFContext} context
 * @param {{width:number, height:number, jpeg:boolean}} image
 */
export function imageDict(context, { width, height, jpeg }) {
	return context.obj({
		Type: 'XObject',
		Subtype: 'Image',
		Width: width,
		Height: height,
		ColorSpace: 'DeviceRGB',
		BitsPerComponent: 8,
		...(jpeg
			? { Filter: 'DCTDecode' }
			: {
					Filter: 'FlateDecode',
					DecodeParms: context.obj({ Predictor: 15, Colors: 3, BitsPerComponent: 8, Columns: width }),
				}),
	});
}

/**
 * The page's content stream: draw one full-bleed image, nothing else.
 *
 * Written explicitly rather than through pdf-lib's `pushOperators`, which buffers
 * into a stream its own drawing API materializes — measured, a page built that way
 * round-trips with an EMPTY `/Contents` and renders blank.
 * @param {number} w page width in points
 * @param {number} h page height in points
 * @param {string} name the XObject's resource name
 */
export function pageContentOps(w, h, name = 'Im0') {
	return new TextEncoder().encode(`q\n${w} 0 0 ${h} 0 0 cm\n/${name} Do\nQ\n`);
}
