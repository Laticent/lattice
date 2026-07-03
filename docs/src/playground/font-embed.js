// Self-hosted font embedding for the Drawing Board's image exports (PDF / PPTX).
//
// WHY THIS EXISTS — the lazy-load race.
// Marp's bespoke slide template lazy-loads each web font face only when the
// ACTIVE slide needs it (see engineering/decisions/2026-06-11-sketch-finish.md).
// The image exporters (the Studio's export/deck-export.js) rasterize EVERY slide — including
// off-screen ones they force-visualize mid-loop — through html-to-image. They
// awaited `document.fonts.ready` once, up front, before those off-screen slides
// requested their faces. So a face first needed by an off-screen slide (the
// Shantell Sans body face of a `finish: sketch` deck was the reported case, but
// any face can lose the race) had not finished loading from Google Fonts when its
// slide rasterized — and the slide fell back to a system font. Headings kept
// Caveat only because a bookend slide happened to be active when export ran.
//
// THE FIX — vendor the faces and embed them deterministically.
// Every engine text face (the families base.tokens.css declares, minus the ~25 MB
// Noto Color Emoji) is vendored as a latin-subset .woff2 under ./fonts and bundled
// by Vite. At export time we:
//   1. build ONE `@font-face` stylesheet with each face inlined as a data URI
//      (`fontEmbedCSS`), and hand it to every html-to-image call so each cloned
//      slide is self-contained — no network, no race, all fonts embedded; and
//   2. inject the same faces into the live preview document and await them, so the
//      source nodes lay out with the real metrics before they are cloned.
//
// The engine's Google-Fonts @import is left untouched — npm consumers and the live
// preview keep loading from Google; this module only governs what the EXPORT bakes
// in. Refresh the vendored files by re-running the latin-subset fetch documented
// in this PR if the engine's font set changes.

// Vite bundles each .woff2 and resolves the import to its served URL.
import caveat400 from './fonts/caveat-400.woff2';
import caveat700 from './fonts/caveat-700.woff2';
import jetbrains400 from './fonts/jetbrains-mono-400.woff2';
import jetbrains500 from './fonts/jetbrains-mono-500.woff2';
import jetbrains600 from './fonts/jetbrains-mono-600.woff2';
import outfit300 from './fonts/outfit-300.woff2';
import outfit400 from './fonts/outfit-400.woff2';
import outfit500 from './fonts/outfit-500.woff2';
import outfit600 from './fonts/outfit-600.woff2';
import outfit700 from './fonts/outfit-700.woff2';
import playfair400 from './fonts/playfair-display-400.woff2';
import playfair400i from './fonts/playfair-display-400-italic.woff2';
import playfair700 from './fonts/playfair-display-700.woff2';
import playfair700i from './fonts/playfair-display-700-italic.woff2';
import shantell400 from './fonts/shantell-sans-400.woff2';
import shantell500 from './fonts/shantell-sans-500.woff2';
import shantell700 from './fonts/shantell-sans-700.woff2';

// One entry per engine face: the CSS family name, weight, style, and bundled URL.
// Mirrors base.tokens.css's @import exactly (Noto Color Emoji excluded).
export const FACES = [
	{ family: 'Playfair Display', weight: 400, style: 'normal', url: playfair400 },
	{ family: 'Playfair Display', weight: 400, style: 'italic', url: playfair400i },
	{ family: 'Playfair Display', weight: 700, style: 'normal', url: playfair700 },
	{ family: 'Playfair Display', weight: 700, style: 'italic', url: playfair700i },
	{ family: 'Outfit', weight: 300, style: 'normal', url: outfit300 },
	{ family: 'Outfit', weight: 400, style: 'normal', url: outfit400 },
	{ family: 'Outfit', weight: 500, style: 'normal', url: outfit500 },
	{ family: 'Outfit', weight: 600, style: 'normal', url: outfit600 },
	{ family: 'Outfit', weight: 700, style: 'normal', url: outfit700 },
	{ family: 'JetBrains Mono', weight: 400, style: 'normal', url: jetbrains400 },
	{ family: 'JetBrains Mono', weight: 500, style: 'normal', url: jetbrains500 },
	{ family: 'JetBrains Mono', weight: 600, style: 'normal', url: jetbrains600 },
	{ family: 'Caveat', weight: 400, style: 'normal', url: caveat400 },
	{ family: 'Caveat', weight: 700, style: 'normal', url: caveat700 },
	{ family: 'Shantell Sans', weight: 400, style: 'normal', url: shantell400 },
	{ family: 'Shantell Sans', weight: 500, style: 'normal', url: shantell500 },
	{ family: 'Shantell Sans', weight: 700, style: 'normal', url: shantell700 },
];

const STYLE_ID = 'lattice-embedded-fonts';

function bytesToBase64(bytes) {
	let bin = '';
	const chunk = 0x8000; // avoid arg-count limits on String.fromCharCode
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
	}
	return btoa(bin);
}

async function faceDataUri(url) {
	const buf = await (await fetch(url)).arrayBuffer();
	return `data:font/woff2;base64,${bytesToBase64(new Uint8Array(buf))}`;
}

function faceRule(face, src) {
	return (
		'@font-face{' +
		`font-family:'${face.family}';` +
		`font-style:${face.style};` +
		`font-weight:${face.weight};` +
		'font-display:swap;' +
		`src:url(${src}) format('woff2')` +
		'}'
	);
}

// A @font-face block that references each vendored woff2 by its bundled URL
// (NOT inlined as a data URI) — for registering the faces in a live preview
// iframe. The browser fetches + caches each woff2 once across renders, so this
// is far lighter than the data-URI sheet a per-render srcdoc would otherwise
// carry. The preview needs this because the engine's Google-Fonts @import is
// inert inside the srcdoc <style> (it lands after other rules, where CSS ignores
// @import), so without it sketch's Caveat/Shantell never load in the preview.
export function previewFontFaceCss() {
	return FACES.map((f) => faceRule(f, f.url)).join('\n');
}

// Build the data-URI @font-face stylesheet once and memoize it. Fetches are
// same-origin (Vite-served bundled assets), so this is fast and offline-safe.
let cssPromise = null;
export function buildFontEmbedCss() {
	if (!cssPromise) {
		cssPromise = Promise.all(FACES.map((f) => faceDataUri(f.url)))
			.then((uris) => FACES.map((f, i) => faceRule(f, uris[i])).join('\n'))
			.catch((err) => {
				cssPromise = null; // let a later export retry
				throw err;
			});
	}
	return cssPromise;
}

// Inject the embedded faces into `doc` (idempotent) and wait until every face is
// usable, so the live nodes html-to-image clones are laid out with real metrics
// rather than the fallback face's. Best-effort: never rejects.
export async function ensureFontsLoaded(doc, css) {
	try {
		if (!doc.getElementById(STYLE_ID)) {
			const style = doc.createElement('style');
			style.id = STYLE_ID;
			style.textContent = css;
			doc.head.appendChild(style);
		}
		await Promise.all(
			FACES.map((f) => doc.fonts.load(`${f.style} ${f.weight} 1em '${f.family}'`).catch(() => {})),
		);
		await doc.fonts.ready;
	} catch (_e) {
		/* fonts best-effort — export still proceeds with whatever loaded */
	}
}
