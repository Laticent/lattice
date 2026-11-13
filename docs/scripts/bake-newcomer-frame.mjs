#!/usr/bin/env node
// Bake the NEWCOMER'S FIRST PREVIEW DOCUMENT — the exact frame document the Playground writes for
// a first-time visitor — so the page can load it into the preview iframe while the app is still
// downloading, instead of showing an empty pane for the seconds that takes.
//
// WHY A BAKE OF THE FRAME, NOT A PICTURE OF A SLIDE. The Studio shipped a build-time "welcome
// slide" once and retired it (engineering/decisions/2026-07-21-studio-preview-one-skeleton.md):
// it was a SECOND surface drawn beside the live iframe, in its own coordinate system, and the edge
// between the two was a seam. This bake is not a second surface. It is the live iframe's own first
// document, and the app ADOPTS it: the document carries the render state `renderDeck` would have
// kept after writing it (the signature, the restyle key, the section list), so the app's first
// render compares against it and changes only what differs — nothing, when the bake is current;
// a patched slide or an in-place restyle when it is not. A full rewrite happens only if the slide
// SIZE changed, and then the page hides the frame first, exactly as it does today.
//
// HOW IT STAYS THE SAME DOCUMENT. It is not a second model of the render. It runs the page's own
// modules — the engine bundle the browser loads, the bridge (`playground-engine.ts`), the plan
// reader and the filmstrip builder (`deck-render.js`) — against the files this build just staged,
// in a jsdom window, through the same `renderInto` call the app makes. What it cannot share is the
// page's computed `--bg-alt`, which it reads from the generated token sheet instead.
//
// Runs after `astro build`, reads `dist/playground/index.html` for the island's props (the same
// values the app is handed), and writes `newcomer/<mode>/index.html` for each mode beside the
// runtime, in the content-hashed `dist/playground/v/<hash>/`.
// A failure FAILS THE BUILD. The page names the bake unconditionally for a newcomer, so a build
// that shipped without it would point every first visit at a 404 frame; and a bake the app cannot
// adopt is caught by the first-paint e2e spec, which asserts the adoption.
//
// Usage: node scripts/bake-newcomer-frame.mjs [--dist <dir>]

import fs from 'node:fs';
import path from 'node:path';
import { bakeVite, bakeWindow, DOCS, deserialize, distDir, importEngine, ORIGIN, paneBackground, unescapeAttr } from './lib/bake-harness.mjs';

const DIST = distDir();
const PALETTE = 'cuoio';
const MODES = ['light', 'dark'];

function readPgData() {
	const html = fs.readFileSync(path.join(DIST, 'playground/index.html'), 'utf8');
	for (const m of html.matchAll(/<astro-island\b[^>]*>/g)) {
		const tag = m[0];
		if (!/component-url="[^"]*PlaygroundIsland/.test(tag)) continue;
		const props = /\sprops="([^"]*)"/.exec(tag);
		if (!props) break;
		return deserialize(JSON.parse(unescapeAttr(props[1]))).data;
	}
	throw new Error('bake: no PlaygroundIsland props in dist/playground/index.html');
}

async function main() {
	const pg = readPgData();
	if (!pg.plansBase) {
		console.log('bake-newcomer-frame: this build stages no walk plans — nothing to bake.');
		return;
	}
	const origin = ORIGIN;
	const win = bakeWindow(DIST, '/playground/', PALETTE);
	await importEngine(DIST, pg.engineUrl, win);
	const vite = await bakeVite();
	try {
		const { createEngineBridge } = await vite.ssrLoadModule('/src/lib/playground-engine.ts');
		const { readPlan, resolveComponent, fingerprint } = await vite.ssrLoadModule('/src/lib/playground-controller.ts');
		const { renderDeck } = await vite.ssrLoadModule('/src/playground/deck-render.js');
		win.LatticeDeckPreview = { renderDeck };

		// The newcomer's deck: the first component's walk plan, joined the way `startWalk` joins it.
		const component = resolveComponent(pg.catalog, null).name;
		const planFile = path.join(DIST, new URL(`${pg.plansBase}${encodeURIComponent(component)}.json`, `${origin}/playground/`).pathname);
		const plan = readPlan(fs.readFileSync(planFile, 'utf8'));
		if (!plan) throw new Error(`bake: unreadable plan for ${component}`);
		const source = plan.slides.map((s) => s.md).join('\n\n---\n\n');

		const bridge = createEngineBridge(pg.themeBase, pg.runtimeUrl, pg.engineUrl, pg.palettes, { dagreUrl: pg.dagreUrl, katexUrl: pg.katexUrl });
		for (const mode of MODES) {
			win.document.documentElement.setAttribute('data-mode', mode);
			win.document.documentElement.style.setProperty('--bg-alt', paneBackground(PALETTE, mode));
			let srcdoc = '';
			const frame = { contentDocument: null, contentWindow: null, set srcdoc(v) { srcdoc = v; }, get srcdoc() { return srcdoc; } };
			const r = await bridge.renderInto(frame, source, PALETTE, mode, { frameSig: '', lastSections: null }, true);
			if (r.status !== 'rendered' || !srcdoc) throw new Error(`bake: render failed (${mode}): ${r.message || r.status}`);
			const { sanitizeCache: _drop, ...state } = r.state;
			// The seed the app adopts. `<` is escaped so no string in it can close the script
			// element it rides in (HARD RULE #22 — the sections are sanitized slide HTML, but a
			// `</script>` inside one would still end this element early).
			const seed = JSON.stringify({ v: 1, component, srcHash: fingerprint(source), palette: PALETTE, mode, count: r.count, state }).replace(/</g, '\\u003c');
			// Replacer FUNCTIONS, never replacement strings: in a string, `$\``, `$&` and `$'` are
			// patterns, and a slide carrying one (the math plan does) would paste the document around
			// the match into the seed — raw `</script>` included (found by the red team).
			const baked = srcdoc
				.replace('<html ', () => '<html data-pg-bake="" ')
				.replace(/<\/body>(?![\s\S]*<\/body>)/, () => `<script type="application/json" id="pg-bake">${seed}</script></body>`);
			if (baked === srcdoc || !baked.includes('id="pg-bake"')) throw new Error('bake: could not embed the seed');
			// The bridge resolves a deck's relative images against `location`, which is this build's
			// stand-in origin: a plan with a sample image would ship an address no visitor can reach.
			if (baked.includes(origin)) throw new Error(`bake: the document names the build's stand-in origin (${origin}) — a relative asset was resolved against it`);
			// Beside the runtime it loads, in the content-hashed asset directory: a bake cached
			// past a deploy then still finds its runtime, where a fixed URL would outlive it.
			// A DIRECTORY INDEX (`newcomer/<mode>/`), not `newcomer-<mode>.html`: the runtime reads
			// a document whose URL ends in `.html` as an export and fetches the `.md` beside it for
			// its front matter (lib/runtime `deckFrontMatterSource`). The live frame is `about:srcdoc`
			// and fetches nothing; this URL keeps the bake the same.
			const out = path.join(DIST, new URL(`newcomer/${mode}/index.html`, new URL(pg.runtimeUrl, `${origin}/`)).pathname);
			fs.mkdirSync(path.dirname(out), { recursive: true });
			fs.writeFileSync(out, baked);
			console.log(`bake-newcomer-frame: ${path.relative(DOCS, out)} — ${component}, ${r.count} slides, ${(baked.length / 1024).toFixed(1)}KB`);
		}
	} finally {
		await vite.close();
		win.close();
	}
}

main().catch((e) => {
	console.error(`bake-newcomer-frame FAILED: ${e?.stack || e}`);
	process.exit(1);
});
