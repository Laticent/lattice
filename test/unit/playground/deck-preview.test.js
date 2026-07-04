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
		assert.match(doc, /\.lattice\{visibility:visible!important;height:auto!important;overflow:visible!important;\}/);
		assert.match(doc, /content-visibility:visible!important/);
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
