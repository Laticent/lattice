/**
 * Unit: deck-preview.js — the shared multi-slide "filmstrip" preview controller
 * used by the playground, the Drawing Board, and both Workbench studios.
 *
 * The DOM/iframe parts (patchSections, renderDeck) are verified interactively in
 * each host; here we lock the two pure, Node-importable pieces: the `buildSrcdoc`
 * string assembly (so each per-surface knob keeps emitting the right CSS/agents —
 * the contract that, when it drifted across four hand-rolled copies, caused the
 * flash / flicker / gap bugs) and the `hashString` render-signature helper.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
	return import('../../../docs/src/playground/deck-preview.js');
}

const BASE = {
	html: '<div class="lattice"><section><h1>One</h1></section></div>',
	css: '/* theme */',
	mode: 'light',
	geom: { w: 1280, h: 720 },
	runtimeUrl: '/rt.js',
};

describe('buildSrcdoc', () => {
	test('always gates visibility, pins the slide box, and injects the engine + FIT', async () => {
		const { buildSrcdoc } = await load();
		const doc = buildSrcdoc({ ...BASE });
		// Anti-flash gate + the box pin that keeps container-type:size from collapsing.
		assert.match(doc, /\.lattice\{visibility:hidden;\}/);
		assert.match(doc, /\.lattice>section\{width:1280px;height:720px\}/);
		// FIT agent: scales, reveals, and exposes the patch hook — through the
		// drag-suspension gate (the pane splitter suspends per-frame re-fits
		// mid-drag; resume runs the one authoritative fit).
		assert.match(doc, /window\.__latticeFit=gatedFit/);
		assert.match(doc, /window\.__latticeFitSuspend=function\(\)\{fitSuspended=true;\}/);
		assert.match(doc, /window\.__latticeFitResume=function\(\)\{fitSuspended=false;requestAnimationFrame\(gatedFit\);setTimeout\(gatedFit,120\);\}/);
		assert.match(doc, /lattice\.style\.visibility="visible"/);
		// Engine wiring + the deck's geometry globals.
		assert.match(doc, /window\.__SLIDE_W=1280;window\.__SLIDE_H=720;/);
		assert.match(doc, /src="\/rt\.js"/);
	});

	test('stamps <html lang> — default en, and the deck language when given (WCAG 3.1.1)', async () => {
		const { buildSrcdoc } = await load();
		assert.match(buildSrcdoc({ ...BASE }), /<html lang="en">/); // default
		assert.match(buildSrcdoc({ ...BASE, lang: 'fr' }), /<html lang="fr">/);
		// A hostile lang is sanitized to letters/hyphen (no attribute-breakout).
		assert.match(buildSrcdoc({ ...BASE, lang: 'en"><script>' }), /<html lang="enscript">/);
	});

	test('always injects the link guard so an external tap cannot navigate (blank) the frame', async () => {
		const { buildSrcdoc } = await load();
		// The guard is unconditional (every filmstrip srcdoc), capture-phase, gated to
		// http(s) hrefs, and opens a top-level tab instead of navigating the iframe.
		const doc = buildSrcdoc({ ...BASE });
		assert.match(doc, /addEventListener\("click"[\s\S]*?closest\("a\[href\]"\)/);
		assert.match(doc, /\/\^https\?:\/i\.test\(href\)/);
		assert.match(doc, /window\.top\|\|window\)\.open\(href,"_blank"/);
		// It must run in capture phase (so it wins before the frame follows the link).
		assert.match(doc, /addEventListener\("click",function\(e\)\{[\s\S]*?\},true\)/);
		// Video posters first offer themselves to a parent-hosted player (window.__videoPlay);
		// only if that declines (no overlay / non-embeddable) does it fall back to a tab.
		assert.match(doc, /video-poster.*window\.__videoPlay/);
	});

	test('clamps the filmstrip tail by default and can be turned off', async () => {
		const { buildSrcdoc } = await load();
		assert.match(buildSrcdoc({ ...BASE }), /lattice\.style\.overflow="clip"/);
		assert.doesNotMatch(buildSrcdoc({ ...BASE, clamp: false }), /lattice\.style\.overflow="clip"/);
	});

	test('the gap rides into BOTH the FIT margin and the SYNC slot pitch', async () => {
		const { buildSrcdoc } = await load();
		const doc = buildSrcdoc({ ...BASE, gap: 22, sync: true });
		// FIT declares GAP once (marginBottom = SH*sc - SH + GAP).
		assert.match(doc, /GAP=22;/);
		assert.match(doc, /marginBottom=\(SH\*sc-SH\+GAP\)/);
		// SYNC: slot pitch = SH*(w/SW) + GAP — must agree with FIT or the scroll drifts.
		assert.match(doc, /SH\*\(w\/SW\)\+22/);
	});

	test('opt-in knobs only emit when requested', async () => {
		const { buildSrcdoc } = await load();
		const off = buildSrcdoc({ ...BASE });
		assert.doesNotMatch(off, /content-visibility:auto/);
		assert.doesNotMatch(off, /db-active/);
		assert.doesNotMatch(off, /@media print/);
		assert.doesNotMatch(off, /db-slide-scrolled/); // SYNC agent absent
		assert.doesNotMatch(off, /justify-content:safe center/);
		assert.doesNotMatch(off, /color-scheme:/);

		const on = buildSrcdoc({
			...BASE,
			mode: 'dark',
			contentVisibility: true,
			activeOutline: '#b0492e',
			printRules: true,
			sync: true,
			center: true,
			colorScheme: 'dark',
			fontCss: '/* faces */',
		});
		assert.match(on, /content-visibility:auto;contain-intrinsic-size:1280px 720px/);
		assert.match(on, /\.lattice>section\.db-active\{outline:3px solid #b0492e/);
		assert.match(on, /@media print/);
		assert.match(on, /db-slide-scrolled/); // SYNC agent present
		assert.match(on, /window\.__latticeTag=tag/);
		assert.match(on, /justify-content:safe center/);
		assert.match(on, /:root\{color-scheme:dark;\}/);
		assert.match(on, /\/\* faces \*\//);
	});

	test('print path un-hides + un-clamps .lattice so export is not clipped', async () => {
		const { buildSrcdoc } = await load();
		const doc = buildSrcdoc({ ...BASE, printRules: true, contentVisibility: true });
		assert.match(doc, /@media print\{/);
		// un-hides + un-clamps .lattice (then centers each slide on the sheet — the fit
		// flex column follows the un-hide props, so match the prefix, not a closing brace).
		assert.match(doc, /\.lattice\{visibility:visible!important;height:auto!important;overflow:visible!important;/);
		assert.match(doc, /content-visibility:visible!important/);
		// paper-fit: a standard sheet is picked and the slide is scaled to it.
		assert.match(doc, /@page\{size:(legal|letter) (landscape|portrait);margin:9mm;\}/);
		assert.match(doc, /zoom:[0-9.]+/);
	});

	test('background + padding follow the mode and the opt', async () => {
		const { buildSrcdoc } = await load();
		assert.match(buildSrcdoc({ ...BASE, mode: 'dark', padding: 22 }), /padding:22px;background:#0c0c0c;/);
		assert.match(buildSrcdoc({ ...BASE, mode: 'light' }), /background:#e7e7ea;/);
	});

	test('geometry drives the box, the globals, and the content-visibility placeholder', async () => {
		const { buildSrcdoc } = await load();
		const doc = buildSrcdoc({ ...BASE, geom: { w: 3840, h: 2160 }, contentVisibility: true });
		assert.match(doc, /\.lattice>section\{width:3840px;height:2160px\}/);
		assert.match(doc, /window\.__SLIDE_W=3840;window\.__SLIDE_H=2160;/);
		assert.match(doc, /contain-intrinsic-size:3840px 2160px/);
	});
});

describe('hashString', () => {
	test('is deterministic and order-sensitive', async () => {
		const { hashString } = await load();
		assert.equal(hashString('alpha'), hashString('alpha'));
		assert.notEqual(hashString('alpha'), hashString('beta'));
		assert.notEqual(hashString('ab'), hashString('ba'));
	});

	test('returns a non-negative integer', async () => {
		const { hashString } = await load();
		const h = hashString('some long-ish theme css string {}');
		assert.equal(Number.isInteger(h), true);
		assert.equal(h >= 0, true);
	});
});

// ── Remote-subresource containment (#1753) ────────────────────────────────────
// A deck could make a preview frame fetch an arbitrary external URL on open — a beacon
// leaking the viewer's IP and User-Agent and confirming they opened it — through FULLY
// SANITIZED slide HTML. The posture chosen is containment by CSP, matching what the
// exported player already ships.
//
// WHAT THESE PIN, AND WHAT THEY CANNOT. A browser's enforcement of a valid CSP is the
// browser's guarantee, not ours; what can regress on our side is the meta going missing,
// landing after content, or losing a directive. That is what is asserted here. The
// enforcement itself was measured on the REAL assembled srcdoc in Chromium 131: the same
// document fired 3 requests (markdown image, raw <img>, inline `background-image:url()`)
// with the meta removed and 0 with it present, the payload elements still in the DOM both
// times — so the fetch is refused rather than the markup rewritten.
describe('deck-preview: preview-frame CSP', () => {
	test('buildSrcdoc emits the CSP before any content or subresource link', async () => {
		const { buildSrcdoc } = await load();
		const doc = buildSrcdoc({ ...BASE });
		const csp = doc.indexOf('http-equiv="Content-Security-Policy"');
		assert.ok(csp !== -1, 'the preview srcdoc carries no CSP');
		// A CSP meta governs only what the parser has not already reached, so its POSITION
		// is the whole guarantee — after a <link> or the body it would be inert.
		assert.ok(csp < doc.indexOf('<body'), 'the CSP must precede <body>');
		const link = doc.indexOf('<link');
		if (link !== -1) assert.ok(csp < link, 'the CSP must precede every subresource link');
	});

	test('the policy closes every channel a deck can aim at a remote host', async () => {
		const { buildSrcdoc } = await load();
		const doc = buildSrcdoc({ ...BASE });
		// img: markdown images, raw <img>, and `url()` in an inline style attribute.
		// media: <video>/<audio>, which survive sanitization. connect/object/base/form:
		// exfiltration routes nothing in a preview needs.
		for (const directive of ['img-src', 'media-src', 'font-src', 'connect-src', 'object-src', 'base-uri', 'form-action']) {
			assert.match(doc, new RegExp(`${directive}[^;"]*[;"]`), `CSP is missing ${directive}`);
		}
		assert.match(doc, /img-src 'self' data: blob:;/, 'img-src must allow only same-document sources');
		// No `default-src`, deliberately: script/style/worker loading stays exactly as
		// unrestricted as before, so this cannot break Mermaid, KaTeX or the runtime by
		// starving a directive nobody enumerated.
		assert.doesNotMatch(doc, /default-src/, 'a default-src here would restrict more than the posture chose');
	});

	// The PREVIEW / EXPORT boundary, pinned from both sides. A preview is a frame the author
	// browses, where a deck's remote image beacons on open; the Studio's capture frame is an
	// export renderer whose output the author downloads, and containing it would blank a
	// legitimately-remote image in the .pdf/.pptx/.png — an export-bytes change, and a
	// divergence from the CLI, which emits no CSP. Neither side may flip by accident.
	test('csp:false omits the meta entirely — the export capture frame opts out', async () => {
		const { buildSrcdoc } = await load();
		assert.doesNotMatch(buildSrcdoc({ ...BASE, csp: false }), /Content-Security-Policy/);
		assert.match(buildSrcdoc({ ...BASE }), /Content-Security-Policy/, 'the DEFAULT must stay on');
	});

	test("the Studio's export capture frame passes csp:false, deliberately", () => {
		const fs = require('fs');
		const path = require('path');
		const src = fs.readFileSync(
			path.join(__dirname, '..', '..', '..', 'docs/src/components/studio/export/deck-export.js'), 'utf8'
		);
		assert.match(
			src, /csp:\s*false/,
			'deck-export.js builds the offscreen frame that PDF/PPTX/PNG are rasterized from. If it '
			+ 'stops passing csp:false, a deck\'s remote image is blocked during capture and blanks in '
			+ 'the downloaded file — an EXPORT-BYTES change needing sign-off (QUALITY BAR), not a tweak.'
		);
	});

	test('the font-src origin follows the katexUrl rather than a hard-coded CDN', async () => {
		const { previewCspMeta } = await load();
		assert.match(previewCspMeta({ katexUrl: 'https://cdn.example.net/katex/katex.min.css' }), /font-src 'self' data: https:\/\/cdn\.example\.net;/);
		// A relative path is already covered by 'self'; a malformed value must not throw.
		assert.match(previewCspMeta({ katexUrl: '/local/katex.css' }), /font-src 'self' data:;/);
		assert.match(previewCspMeta({ katexUrl: '???' }), /font-src 'self' data:;/);
		assert.match(previewCspMeta(), /font-src 'self' data:;/);
	});
});

// The CENSUS. `buildSrcdoc` is one of three modules that assemble a preview-frame document;
// the other two are TypeScript / dependency-heavy and are not Node-importable here, so they
// are pinned by SOURCE. This is the same shape HARD RULE #22's own guards use, and for the
// same reason: a file-scoped text match is what survives when the module cannot be loaded.
//
// The list mirrors SANCTIONED_PREVIEW_BUILDERS in tools/check-ownership.js minus
// `sanitize-slide-html.js`, which binds the sanitizer and assembles no document. If a fourth
// builder appears, #22's gate makes it declare its sanitizer calls; this makes it declare the
// CSP too — otherwise the new frame is open exactly as these three were.
describe('deck-preview: every preview-frame builder carries the CSP', () => {
	const fs = require('fs');
	const path = require('path');
	const ROOT = path.join(__dirname, '..', '..', '..');
	const BUILDERS = [
		'docs/src/playground/deck-preview.js',
		'docs/src/lib/single-slide-render.ts',
		'docs/src/components/studio/present/stage-window.js',
	];
	for (const rel of BUILDERS) {
		test(`${rel} calls previewCspMeta`, () => {
			const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
			assert.match(
				src, /previewCspMeta\(/,
				`${rel} assembles a preview document but does not emit the CSP — the frame it builds `
				+ 'can beacon the viewer out on open (#1753)'
			);
			// It has to land in the HEAD, before content. Assert the call sits ahead of the
			// document's <body>, which is the ordering the browser actually honors.
			const call = src.indexOf('previewCspMeta(');
			const body = src.indexOf("'</style></head><body>'") === -1 ? src.indexOf('<body') : src.indexOf("'</style></head><body>'");
			if (body !== -1) assert.ok(call < body, `${rel} emits the CSP after <body>, where it is inert`);
		});
	}
});
