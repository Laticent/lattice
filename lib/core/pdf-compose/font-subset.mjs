/**
 * lib/core/pdf-compose/font-subset.mjs — static, subset TrueType from a deck's web font.
 *
 * A deck ships WOFF2, often VARIABLE (one file covers every weight). A PDF needs a
 * static font per weight it draws, holding only the characters it uses. HarfBuzz's
 * subsetter does both in one pass: it pins the `wght` axis to the weight the browser
 * resolved and drops every glyph the text never uses.
 *
 * Environment-neutral. The host hands in the HarfBuzz subsetter's WebAssembly bytes
 * (the CLI reads them from node_modules, the Studio fetches them as a static asset);
 * WOFF2 decoding is `woff2-encoder`'s, which runs unchanged in Node and the browser.
 */
import woff2Decompress from 'woff2-encoder/decompress';

const TAG = (s) => [...s].reduce((a, c) => (a << 8) + c.charCodeAt(0), 0) >>> 0;
const HB_SUBSET_SETS_LAYOUT_FEATURE_TAG = 6;
// The subset keeps ONLY the layout features the text asks for (tnum, lnum, onum …), and the
// alternates they reach. Not every feature: with ligatures kept, pdf-lib draws "fi" as one
// glyph whose ToUnicode entry is lost, and "first" copies out as "rst" (measured 2026-09-27).
// Not none either: a closure-free subset dropped tnum's alternates, so tabular figures drew
// proportional, ~20% narrow (the checker's pass, 2026-09-27).

/**
 * @param {BufferSource} wasmBytes harfbuzzjs's `hb-subset.wasm`
 * `text` null keeps EVERY character the font maps: Calco's editable office export pins a
 * variable face to one weight without subsetting it, because the reader of an editable file
 * types words the slide never used.
 *
 * @returns {Promise<(font: Uint8Array, text: string | null, axes?: Record<string, number>, features?: string[]) => Promise<Uint8Array>>}
 */
export async function createFontSubsetter(wasmBytes) {
	const { instance } = await WebAssembly.instantiate(wasmBytes);
	const hb = instance.exports;
	return async function subset(fontBytes, text, axes = {}, features = []) {
		let sfnt = fontBytes instanceof Uint8Array ? fontBytes : new Uint8Array(fontBytes);
		if (sfnt[0] === 0x77 && sfnt[1] === 0x4f && sfnt[2] === 0x46 && sfnt[3] === 0x32) sfnt = await woff2Decompress(sfnt); // 'wOF2'
		const input = hb.hb_subset_input_create_or_fail();
		if (!input) throw new Error('harfbuzz: could not create subset input');
		const buf = hb.malloc(sfnt.byteLength);
		new Uint8Array(hb.memory.buffer).set(sfnt, buf);
		const blob = hb.hb_blob_create(buf, sfnt.byteLength, 2 /* WRITABLE */, 0, 0);
		const face = hb.hb_face_create(blob, 0);
		hb.hb_blob_destroy(blob);
		try {
			const feats = hb.hb_subset_input_set(input, HB_SUBSET_SETS_LAYOUT_FEATURE_TAG);
			hb.hb_set_clear(feats);
			for (const f of features) hb.hb_set_add(feats, TAG(f));
			const uni = hb.hb_subset_input_unicode_set(input);
			if (text == null) {
				// Everything: the empty set, inverted.
				hb.hb_set_clear(uni);
				hb.hb_set_invert(uni);
			} else for (const ch of text) hb.hb_set_add(uni, ch.codePointAt(0));
			// A static face has no such axis and the call returns 0: that is the answer, not an error.
			for (const [axis, v] of Object.entries(axes)) hb.hb_subset_input_pin_axis_location(input, face, TAG(axis), v);
			const sub = hb.hb_subset_or_fail(face, input);
			if (!sub) throw new Error('harfbuzz: subset failed');
			const res = hb.hb_face_reference_blob(sub);
			const off = hb.hb_blob_get_data(res, 0), len = hb.hb_blob_get_length(res);
			const out = new Uint8Array(hb.memory.buffer).slice(off, off + len);
			hb.hb_blob_destroy(res);
			hb.hb_face_destroy(sub);
			if (!len) throw new Error('harfbuzz: empty subset');
			// Pad the file. @pdf-lib/fontkit reads a 10-byte glyph header even for an EMPTY
			// glyph (the space), straight from the whole font buffer: when that glyph is the
			// last one and `glyf` is the last table, the read runs off the end and throws
			// "Trying to access beyond buffer length" (measured 2026-09-27). Trailing zeros
			// after the last table are legal TrueType and decode as an empty header.
			const padded = new Uint8Array(out.length + 16);
			padded.set(out);
			return padded;
		} finally {
			hb.hb_subset_input_destroy(input);
			hb.hb_face_destroy(face);
			hb.free(buf);
		}
	};
}
