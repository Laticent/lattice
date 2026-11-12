/**
 * lib/core/png-idat.mjs — a PNG's own compressed pixels, ready for a PDF, with no decode.
 *
 * An 8-bit RGB, non-interlaced PNG is a zlib stream of scanlines each led by its filter byte, and a PDF reads exactly that
 * under `/FlateDecode` with `/Predictor 15`. So a PDF writer can carry the PNG's compressed bytes as they are instead of
 * decoding them and compressing them again. The two PDF writers both do: the PDF export's (pdf-compose/write-pdf.mjs
 * `rgbPngXObject`, through pdf-lib) and the printed sheet's (studio export `assembleSheetPdf`, through jsPDF), which
 * spent 51 s of a 50-slide print decoding and re-compressing PNGs the shared writer (canvas-encode.mjs) had just tuned for
 * size (engineering/decisions/2026-11-11-deferred-asset-bytes.md §9). Any other PNG (alpha, a palette, 16-bit,
 * interlaced) answers null and takes its writer's own path.
 *
 * Pure and dependency-free: the browser and Node both load it.
 */

/**
 * @param {Uint8Array} bytes  a PNG file
 * @returns {{ width: number, height: number, data: Uint8Array } | null}  the concatenated IDAT bytes, or null
 */
export function rgbPngIdat(bytes) {
	const u32 = (o) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
	const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (!bytes || bytes.length < 33 || SIG.some((b, i) => bytes[i] !== b)) return null;
	const width = u32(16);
	const height = u32(20);
	// Bit depth 8, color type 2 (RGB), deflate, adaptive filtering, no interlace.
	if (bytes[24] !== 8 || bytes[25] !== 2 || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) return null;
	const parts = [];
	let len = 0;
	for (let at = 8; at + 8 <= bytes.length; ) {
		const n = u32(at);
		const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
		if (type === 'IDAT') {
			parts.push(bytes.subarray(at + 8, at + 8 + n));
			len += n;
		}
		if (type === 'IEND') break;
		at += 12 + n;
	}
	if (!len) return null;
	const data = new Uint8Array(len);
	let o = 0;
	for (const p of parts) {
		data.set(p, o);
		o += p.length;
	}
	return { width, height, data };
}

/** The `/DecodeParms` a PDF needs to read `rgbPngIdat`'s data. */
export const RGB_PNG_DECODE_PARMS = (width) => ({ Predictor: 15, Colors: 3, BitsPerComponent: 8, Columns: width });
