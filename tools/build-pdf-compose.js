#!/usr/bin/env node
/**
 * Bundle the shared PDF writer (lib/core/pdf-compose) into one browser IIFE the CLI
 * injects into its own Chrome page:
 *
 *   lib/core/pdf-compose/compose.mjs + html-to-image
 *     ->  dist/lattice-pdf-compose-min.js   (sets globalThis.LatticePdfCompose)
 *
 * WHY A BUNDLE AT ALL. The CLI and the Studio must run the SAME code that decides what
 * the PDF looks like (engineering/decisions/2026-09-27-studio-export-one-engine.md). The
 * Studio imports the modules through Vite; the CLI's page is a plain document, so it gets
 * them as one script. Chrome's own `page.pdf()` is no longer the writer — only the place
 * the slides are laid out, and the comparison oracle behind `--chrome-pdf`.
 *
 * WHY dist/ AND NOT A COMMITTED STRING (unlike the speech-projection bundle): pdf-lib,
 * fontkit and the WOFF2 decoder make this ~1.7 MB, too large to commit. dist/ ships in
 * the npm package and is rebuilt by `npm run build`; a missing bundle makes the CLI fall
 * back to `page.pdf()` and say so.
 *
 * Flags: --check (exit 1 when the bundle is missing or stale), --silent.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'lattice-pdf-compose-min.js');
const ENTRY = path.join(ROOT, 'lib', 'core', 'pdf-compose', '.bundle-entry.tmp.mjs');
const ENTRY_SRC = `
import { composeDeckPdf, makeHtmlToImageCamera } from './compose.mjs';
import { toCanvas, toJpeg, getFontEmbedCSS } from 'html-to-image';
globalThis.LatticePdfCompose = { composeDeckPdf, makeHtmlToImageCamera, toCanvas, toJpeg, getFontEmbedCSS };
`;

function build({ check = false, silent = false } = {}) {
	fs.writeFileSync(ENTRY, ENTRY_SRC);
	let iife;
	try {
		// esbuild's own API, not `node_modules/.bin/esbuild`: that shim is extensionless and Windows
		// cannot spawn it, so this step failed there with ENOENT (#2459).
		iife = require('esbuild').buildSync({
			entryPoints: [ENTRY],
			bundle: true,
			minify: true,
			format: 'iife',
			platform: 'browser',
			logLevel: 'error',
			legalComments: 'none',
			write: false,
			absWorkingDir: ROOT,
		}).outputFiles[0].text;
	} finally {
		fs.rmSync(ENTRY, { force: true });
	}
	if (check) {
		const cur = fs.existsSync(DIST) ? fs.readFileSync(DIST, 'utf8') : '';
		if (cur !== iife) {
			console.error('pdf-compose bundle STALE — run `node tools/build-pdf-compose.js`');
			process.exit(1);
		}
		if (!silent) console.log(`pdf-compose bundle OK — ${(iife.length / 1024).toFixed(0)} KB.`);
		return;
	}
	fs.mkdirSync(path.dirname(DIST), { recursive: true });
	fs.writeFileSync(DIST, iife);
	if (!silent) console.log(`[build-pdf-compose] dist/lattice-pdf-compose-min.js (${(iife.length / 1024).toFixed(0)} KB)`);
}

if (require.main === module) build({ check: process.argv.includes('--check'), silent: process.argv.includes('--silent') });
module.exports = { build };
