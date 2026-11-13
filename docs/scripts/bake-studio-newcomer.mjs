#!/usr/bin/env node
// Bake the STUDIO NEWCOMER'S FIRST WRITE: the parts of the document the Studio's live preview writes
// for a first-time visitor (the welcome deck, slide 1, palette cuoio), and the host state the
// renderer keeps after writing it. The page fetches it from the head; the preview's renderer writes
// it as soon as the island mounts, before the engine has evaluated, and the first real render then
// patches the same document in place (single-slide-render.ts `adoptBake`).
//
// Decision: engineering/decisions/2026-11-08-studio-newcomer-bake.md (option A). Why PARTS and not a
// finished document: the document carries a per-page-load script nonce, this origin's font policy and
// a blob URL for the shared sheet. A finished file would freeze all three. The renderer that adopts
// the bake builds the document itself with its own `srcdoc()`, so none of them is in the file.
//
// HOW IT STAYS THE SAME WRITE. It is not a second model of the render. It runs the Studio's own
// renderer (`createSingleSlideRenderer`, with the flags DeckPreview gives the editing preview) against
// the engine and themes this build just staged, in a jsdom window, with the arguments StudioShell
// passes for the welcome deck. The renderer's `captureWrite` hook hands over the parts of the full
// write; the host fields after it are the state. The e2e spec `studio-newcomer-bake.spec.ts` asserts
// that the live first render PATCHES the adopted document, which fails if any argument here drifts
// from StudioShell's.
//
// Runs after `astro build`. Reads the Studio's options from `dist/studio/index.html` (the
// `data-studio-boot` block and the island's props) and writes `studio-newcomer/<mode>.json` beside the
// runtime, in the content-hashed `dist/playground/v/<hash>/`. A failure FAILS THE BUILD.
//
// Usage: node scripts/bake-studio-newcomer.mjs [--dist <dir>]

import fs from 'node:fs';
import path from 'node:path';
import { bakeVite, bakeWindow, DOCS, deserialize, distDir, importEngine, ORIGIN, paneBackground, unescapeAttr } from './lib/bake-harness.mjs';

const DIST = distDir();
const PALETTE = 'cuoio';
const MODES = ['light', 'dark'];

/** The Studio island's `options` prop, as the page hands it to StudioShell. */
function readStudioOptions() {
	const html = fs.readFileSync(path.join(DIST, 'studio/index.html'), 'utf8');
	for (const m of html.matchAll(/<astro-island\b[^>]*>/g)) {
		const tag = m[0];
		if (!/component-url="[^"]*StudioIsland/.test(tag)) continue;
		const props = /\sprops="([^"]*)"/.exec(tag);
		if (!props) break;
		return deserialize(JSON.parse(unescapeAttr(props[1]))).options;
	}
	throw new Error('bake-studio: no StudioIsland props in dist/studio/index.html');
}

async function main() {
	const options = readStudioOptions();
	if (!options?.runtimeUrl || !options?.engineUrl || !options?.themeBase) throw new Error('bake-studio: the Studio options name no runtime, engine or theme base');
	const win = bakeWindow(DIST, '/studio/', PALETTE);
	// The shared sheet is a blob URL in the page; the bake carries the CSS text, so keep it inline here.
	const createObjectURL = URL.createObjectURL;
	URL.createObjectURL = undefined;
	await importEngine(DIST, options.engineUrl, win);
	const vite = await bakeVite();
	try {
		const { createSingleSlideRenderer, bakeSourceKey } = await vite.ssrLoadModule('/src/playground/single-slide-render.ts');
		const { DECKS, deckSource } = await vite.ssrLoadModule('/src/components/studio/decks.ts');
		const { splitSlides } = await vite.ssrLoadModule('/src/lib/deck-lint.ts');
		const { frontMatterBlock } = await vite.ssrLoadModule('/src/lib/front-matter.ts');
		const { SLIDE_SEP } = await vite.ssrLoadModule('/src/components/studio/deck-ops.ts');

		// The newcomer's deck, joined the way StudioShell joins it: `editorSample` is the front matter
		// plus the authored slides, and `editorSlideAlone` is the front matter plus the shown one.
		const deck = DECKS[0];
		const source = deckSource(deck);
		const fm = frontMatterBlock(source);
		const slides = splitSlides(source.slice(fm.length));
		const sample = fm + slides.join(SLIDE_SEP);
		const slideIndex = 0;
		// StudioShell's `previewDeckId`: the deck, the reader lens and the source epoch, which a first visit starts at 0.
		const deckId = `${deck.id}:full:0`;

		for (const mode of MODES) {
			win.document.documentElement.setAttribute('data-mode', mode);
			win.document.documentElement.style.setProperty('--bg-alt', paneBackground(PALETTE, mode));
			let write = null;
			// The flags DeckPreview gives the Studio's editing preview: `scaleImages` always, `liveLayout` from StudioShell.
			const renderer = createSingleSlideRenderer({ ...options, scaleImages: true, liveLayout: true, captureWrite: (parts) => { write = parts; } });
			const host = win.document.createElement('div');
			win.document.body.appendChild(host);
			const r = await renderer.renderInto(host, sample, false, undefined, undefined, undefined, undefined, {
				slideIndex,
				slideCount: slides.length,
				slideMarkdown: fm + slides[slideIndex],
				deckId,
				focused: true,
				caretText: '',
				webOrigins: [],
			});
			renderer.dispose();
			host.remove();
			if (!r.ok || r.writePath !== 'write' || !write) throw new Error(`bake-studio: render failed (${mode}): ${r.error || r.writePath}`);
			if (write.html.includes(ORIGIN) || write.css.includes(ORIGIN)) throw new Error(`bake-studio: the write names the build's stand-in origin (${ORIGIN}) — a relative asset was resolved against it`);
			const bake = {
				v: 1,
				src: bakeSourceKey(sample),
				slideIndex,
				palette: PALETTE,
				flags: 'LI',
				runtimeUrl: options.runtimeUrl,
				write,
				host: { frameSig: host.__latticeFrameSig, restyleSig: host.__latticeRestyleSig, frameCss: host.__latticeFrameCss, shownSlide: host.__latticeShownSlide },
			};
			if (!bake.host.frameSig || !bake.host.restyleSig || !bake.host.frameCss || !bake.host.shownSlide) throw new Error(`bake-studio: the renderer kept no host state (${mode})`);
			// Beside the runtime it loads, in the content-hashed asset directory: a bake cached past a
			// deploy then still names the runtime it was made with, which `adoptBake` checks.
			const out = path.join(DIST, new URL(`studio-newcomer/${mode}.json`, new URL(options.runtimeUrl, `${ORIGIN}/`)).pathname);
			fs.mkdirSync(path.dirname(out), { recursive: true });
			const text = JSON.stringify(bake);
			fs.writeFileSync(out, text);
			console.log(`bake-studio-newcomer: ${path.relative(DOCS, out)} — ${deck.id} slide ${slideIndex + 1}, ${(text.length / 1024).toFixed(1)}KB (css ${(write.css.length / 1024).toFixed(1)}KB)`);
		}
	} finally {
		URL.createObjectURL = createObjectURL;
		await vite.close();
		win.close();
	}
}

main().catch((e) => {
	console.error(`bake-studio-newcomer FAILED: ${e?.stack || e}`);
	process.exit(1);
});
