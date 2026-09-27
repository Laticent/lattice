/**
 * lib/export/pdf-asset-reader.js — the CLI's file reader for the shared PDF writer.
 *
 * The writer runs in the CLI's Chrome page, and a file:// page cannot fetch file:// URLs,
 * so Node reads a deck's local images and fonts for it (page.exposeFunction). The deck's own
 * scripts can call that function too, which makes this a TRUST BOUNDARY — a red-team pass
 * (2026-09-27) showed the first version fetching any http(s) URL from the exporting machine
 * and reading image or font files anywhere on disk. So:
 *   · local files only — no http(s), ever;
 *   · confined, by REAL path, to the given roots (the deck's folder and Lattice's install),
 *     so neither `..` nor a symlink walks out;
 *   · a regular file under the size cap;
 *   · and only bytes that are an image or a font the writer embeds cross back.
 * Anything refused stays in the slide's photo, which still shows it.
 */
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const MAX_BYTES = 64 * 1024 * 1024;

/** PNG, JPEG, or a web font (WOFF, WOFF2, TrueType, OpenType), by magic number. */
function assetKind(buf) {
	const magic = buf.length > 4 ? buf.readUInt32BE(0) : 0;
	if (magic === 0x89504e47) return 'png';
	if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
	if ([0x774f4646, 0x774f4632, 0x00010000, 0x4f54544f, 0x74727565].includes(magic)) return 'font';
	return '';
}

/**
 * @param {string[]} roots directories the reader may read inside (resolved to real paths)
 * @param {{maxBytes?: number}} [opts]
 */
function createAssetReader(roots, { maxBytes = MAX_BYTES } = {}) {
	const real = roots.map((p) => { try { return fs.realpathSync(p); } catch { return null; } }).filter(Boolean);
	const readConfined = (url) => {
		if (!String(url).startsWith('file:')) throw new Error('local files only');
		const file = fs.realpathSync(fileURLToPath(url));
		if (!real.some((root) => file === root || file.startsWith(root + path.sep))) throw new Error('outside the allowed folders');
		const st = fs.statSync(file);
		if (!st.isFile() || st.size > maxBytes) throw new Error('not a regular file under the size cap');
		return fs.readFileSync(file);
	};
	return {
		/** Image or font bytes, as base64 — or a throw. */
		asset(url) {
			const buf = readConfined(url);
			if (!assetKind(buf)) throw new Error('not an image or a font');
			return buf.toString('base64');
		},
		/** A local stylesheet's @font-face blocks, and nothing else of it — or a throw. */
		fontFaceRules(href) {
			if (!/\.css$/i.test(new URL(href).pathname)) throw new Error('not a stylesheet');
			return (readConfined(href).toString('utf8').match(/@font-face\s*\{[^}]*\}/g) || []).join('\n');
		},
	};
}

module.exports = { createAssetReader, assetKind, MAX_BYTES };
