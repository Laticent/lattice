// Snapshot-cache unit tests (jsdom). Covers the localStorage round-trip + size
// cap, and the CSSOM critical-CSS walk on a plain stylesheet. jsdom's CSSOM is
// enough for style-rule matching + @font-face; the deeper grouping-rule recursion
// is exercised end-to-end in the browser harness (see the decision doc).

import { beforeEach, describe, expect, it } from 'vitest';
import {
	captureFirstSectionFromFrame,
	extractCriticalFromDoc,
	loadPlaygroundSnapshot,
	loadSnapshot,
	PG_SNAPSHOT_KEY,
	SNAPSHOT_KEY,
	savePlaygroundSnapshot,
	saveSnapshot,
} from './snapshot-cache.js';

describe('saveSnapshot / loadSnapshot', () => {
	beforeEach(() => localStorage.clear());

	it('round-trips a snapshot', () => {
		const snap = { v: 1, html: '<div class="lattice"></div>', css: '.x{}', w: 1280, h: 720, palette: 'indaco', mode: 'light', ts: 1 };
		expect(saveSnapshot(snap)).toBe(true);
		expect(loadSnapshot()).toEqual(snap);
	});

	it('refuses a snapshot over the size cap (and leaves storage untouched)', () => {
		const big = { v: 1, html: '', css: 'x'.repeat(300 * 1024), w: 1280, h: 720, palette: 'indaco', mode: 'light', ts: 1 };
		expect(saveSnapshot(big)).toBe(false);
		expect(localStorage.getItem(SNAPSHOT_KEY)).toBe(null);
	});

	it('loadSnapshot returns null when absent or corrupt', () => {
		expect(loadSnapshot()).toBe(null);
		localStorage.setItem(SNAPSHOT_KEY, '{not json');
		expect(loadSnapshot()).toBe(null);
	});

	it('re-sanitizes html at the storage boundary (defense in depth, #22)', () => {
		// A snap that skipped captureFromFrame's sanitize (a hypothetical future writer)
		// must still be scrubbed before it can be stored + replayed into the top document.
		const dirty = { v: 1, html: '<img src=x onerror="alert(1)"><script>evil()</script>', css: '.x{}', w: 1, h: 1, palette: 'indaco', mode: 'light', ts: 1 };
		expect(saveSnapshot(dirty)).toBe(true);
		const stored = loadSnapshot();
		expect(stored.html).not.toContain('onerror');
		expect(stored.html).not.toContain('<script');
	});

	// ── The STYLESHEET channel of the same boundary (#22) ────────────────────────────────
	//
	// A `<style>`'s content is HTML RAWTEXT: it ends at the first `</style`, and knows nothing
	// about CSS strings or comments. The snapshot's css is produced by serializing the live
	// CSSOM (`rule.cssText`), and that serializer normalizes `<\/style` back into a LIVE
	// terminator — so an escape applied wherever the preview document was assembled does not
	// survive into storage. The guard is owed here, at the re-serialization.
	//
	// This arm KILLS the storage-boundary call: delete it and the payload round-trips intact.
	it('escapes the element terminator in css at the storage boundary (#22, stylesheet channel)', () => {
		const dirty = {
			v: 1,
			html: '<div class="lattice"></div>',
			css: '.x::after{content:"</style><img src=x onerror=alert(1)>"}',
			w: 1,
			h: 1,
			palette: 'indaco',
			mode: 'light',
			ts: 1,
		};
		expect(saveSnapshot(dirty)).toBe(true);
		const stored = loadSnapshot();
		// No live terminator survives — the one thing that turns stylesheet text into markup.
		expect(stored.css).not.toMatch(/<\/style/i);
		// …and the declaration is otherwise intact: `\/` is CSS's escape for `/`, so the
		// computed value is unchanged. This is not a CSS sanitizer and must not become one.
		expect(stored.css).toContain('<\\/style>');
		expect(stored.css).toContain('img src=x');
	});

	it('leaves a real stylesheet byte-identical (the guard is identity on clean css)', () => {
		const css = '.lattice section{color:var(--fg)}@font-face{src:url(fonts/a.woff2)}';
		expect(saveSnapshot({ v: 1, html: '<div></div>', css, w: 1, h: 1, palette: 'indaco', mode: 'light', ts: 1 })).toBe(true);
		expect(loadSnapshot().css).toBe(css);
	});
});

describe('captureFirstSectionFromFrame (Playground filmstrip → first slide only)', () => {
	beforeEach(() => localStorage.clear());

	// A fake iframe whose contentDocument is a multi-slide filmstrip, with the FIT
	// agent's inline transform on each section (as the live preview carries). Uses the
	// global jsdom document so `<style>` populates styleSheets (a detached
	// createHTMLDocument does not parse them, so the critical-CSS walk would be empty).
	//
	// Rects are STUBBED, because jsdom reports every box as 0x0 and the capture refuses a
	// snapshot it cannot measure a fit for (#1563 — a snapshot with no fit is one the
	// replay will reject, so storing it would only overwrite a good one). The numbers are
	// the real proportions from a 1194x834 session: an 856x683 preview pane, an iframe
	// filling it, and the live slide inset 36px and centered.
	const rect = (left: number, top: number, width: number, height: number) =>
		({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;
	function fakeBox() {
		return { getBoundingClientRect: () => rect(338, 151, 856, 683) } as unknown as HTMLElement;
	}
	function fakeFrame() {
		document.head.innerHTML = '<style>.title{color:red}section{color:blue}</style>';
		document.body.innerHTML =
			'<article class="lattice">' +
			'<section class="title" style="transform:scale(0.3);transform-origin:top left;margin-bottom:12px"><h1>One</h1></section>' +
			'<section class="title" style="transform:scale(0.3)"><h1>Two</h1></section>' +
			'<section class="title" style="transform:scale(0.3)"><h1>Three</h1></section>' +
			'</div>';
		const first = document.querySelector('.lattice > section') as HTMLElement;
		// Frame-local coordinates: the live slide sits 36px in and 139px down inside the frame.
		first.getBoundingClientRect = () => rect(36, 139, 784, 441);
		// The frame is deliberately INSET from the box (10px right, 4px down) rather than flush
		// with it. Flush rects make `fr.left - br.left` zero, so the cross-frame term could be
		// dropped or sign-flipped and this test would still pass — it asserted the transform
		// without ever exercising it.
		return { contentDocument: document, getBoundingClientRect: () => rect(348, 155, 846, 679) } as unknown as HTMLIFrameElement;
	}

	it('captures ONLY the first section, wrapped in a fresh .lattice (not the whole filmstrip)', () => {
		const snap = captureFirstSectionFromFrame(fakeFrame(), { box: fakeBox(), palette: 'indaco', mode: 'light', srcHash: 'abc', w: 1280, h: 720, ts: 1 });
		expect(snap).not.toBeNull();
		expect(snap?.html).toContain('One');
		expect(snap?.html).not.toContain('Two');
		expect(snap?.html).not.toContain('Three');
		// The captured wrapper must MIRROR the live container's element. The engine emits
		// `<article class="lattice">` and the CSS captured with it is scoped
		// `article.lattice > section`; a synthesized `<div>` would replay that stylesheet
		// against a container none of it matches — a first paint of raw unstyled Markdown.
		// This assertion used to pin `<div>`, which is why the miss went unnoticed.
		expect(snap?.html).toMatch(/^<article class="lattice">/);
	});

	// Kills the CAPTURE-SITE stylesheet guard specifically: this asserts the value the
	// capture RETURNS, before it reaches the storage boundary, so the boundary call cannot
	// stand in for it. The payload rides in the preview's own CSSOM exactly as a hostile
	// theme's would, and `rule.cssText` is what re-serializes it.
	it('escapes the element terminator in the CAPTURED css (#22, stylesheet channel)', () => {
		const frame = fakeFrame();
		const doc = frame.contentDocument as Document;
		// Injected via `textContent`, not `innerHTML`: the payload IS an element terminator, so
		// writing it as markup would end the `<style>` in the fixture itself and the rule would
		// never reach the CSSOM this capture serializes. That asymmetry is the whole bug.
		doc.head.innerHTML = '';
		const styleEl = doc.createElement('style');
		styleEl.textContent = 'section{color:blue}section::after{content:"</style><img src=x onerror=alert(1)>"}';
		doc.head.appendChild(styleEl);
		const snap = captureFirstSectionFromFrame(frame, { box: fakeBox(), palette: 'indaco', mode: 'light', srcHash: 'abc', ts: 1 });
		expect(snap).not.toBeNull();
		expect(snap?.css).not.toMatch(/<\/style/i);
	});

	it('strips the FIT agent inline transform/margin from the captured slide', () => {
		const snap = captureFirstSectionFromFrame(fakeFrame(), { box: fakeBox(), palette: 'indaco', mode: 'light', srcHash: 'abc', ts: 1 });
		expect(snap?.html).not.toContain('scale(0.3)');
		expect(snap?.html).not.toContain('margin-bottom');
	});

	// The fit is what makes the cached slide land ON the live one instead of near it
	// (#1563): stored in the replay box's coordinates, alongside the box size it was taken
	// in, so a later replay into a re-dragged pane rescales rather than misplaces.
	it('records where the live slide sits inside the box the replay paints into', () => {
		const snap = captureFirstSectionFromFrame(fakeFrame(), { box: fakeBox(), palette: 'indaco', mode: 'light', srcHash: 'abc', ts: 1 });
		// The frame is flush with the box here, so the slide's box coordinates are its
		// frame-local ones; the box's own size rides along for the rescale.
		// x = (frame.left - box.left) + section.left = 10 + 36; y = (155 - 151) + 139 = 143.
		expect(snap?.fit).toEqual({ x: 46, y: 143, w: 784, h: 441, boxW: 856, boxH: 683 });
	});

	it('refuses to capture when it cannot measure a fit — a snapshot the replay would reject', () => {
		// No box (an older caller, or a frame with no wrap): the html and css would be fine,
		// but without a fit the replay declines to paint. Refusing here keeps the PREVIOUS
		// good snapshot in place instead of overwriting it with an unusable one.
		expect(captureFirstSectionFromFrame(fakeFrame(), { palette: 'indaco', mode: 'light', srcHash: 'abc', ts: 1 })).toBeNull();
	});

	// A COLLAPSED preview pane is the shape that would do real damage if this leaked (#1590):
	// `.pg-preview-wrap` lives inside `.pg-pane-inner`, which a collapsed pane hides, so the
	// box measures 0x0 while the filmstrip behind it is still perfectly capturable. A fit
	// taken there would be replayed into an EXPANDED pane on the next load, and the ratio
	// between a ~28px rail and a 656px pane is where the "23x oversized slide at first paint"
	// worry comes from. The capture refuses instead, which is also what keeps the previous
	// good snapshot: `savePlaygroundSnapshot` is never reached. Confirmed on the real surface
	// as well — the stored `ts` is unchanged across a capture attempted while collapsed.
	it('refuses a fit measured in a COLLAPSED pane (a 0x0 box), keeping the last good snapshot', () => {
		const collapsed = { getBoundingClientRect: () => rect(1166, 151, 0, 0) } as unknown as HTMLElement;
		expect(captureFirstSectionFromFrame(fakeFrame(), { box: collapsed, palette: 'indaco', mode: 'light', srcHash: 'abc', ts: 1 })).toBeNull();
	});

	it('carries the srcHash identity and returns null on an empty filmstrip', () => {
		const snap = captureFirstSectionFromFrame(fakeFrame(), { box: fakeBox(), palette: 'cuoio', mode: 'dark', srcHash: 'deadbeef', ts: 9 });
		expect(snap?.srcHash).toBe('deadbeef');
		expect(snap?.palette).toBe('cuoio');
		expect(snap?.mode).toBe('dark');
		const empty = document.implementation.createHTMLDocument('');
		expect(captureFirstSectionFromFrame({ contentDocument: empty } as unknown as HTMLIFrameElement, { box: fakeBox(), palette: 'indaco', mode: 'light', srcHash: '', ts: 0 })).toBeNull();
	});
});

describe('Playground snapshot store is SEPARATE from the Studio store', () => {
	beforeEach(() => localStorage.clear());

	it('savePlaygroundSnapshot writes its OWN key, leaving the Studio key untouched', () => {
		const snap = { v: 1, srcHash: 'h1', html: '<div class="lattice"></div>', css: '.x{}', w: 1280, h: 720, palette: 'indaco', mode: 'light', ts: 1 };
		expect(savePlaygroundSnapshot(snap)).toBe(true);
		expect(localStorage.getItem(PG_SNAPSHOT_KEY)).not.toBe(null);
		expect(localStorage.getItem(SNAPSHOT_KEY)).toBe(null); // never crosses into the Studio store
		expect(loadPlaygroundSnapshot()).toEqual(snap);
		expect(loadSnapshot()).toBe(null);
	});

	it('re-sanitizes at the storage boundary for the Playground key too (#22)', () => {
		const dirty = { v: 1, srcHash: 'h', html: '<img src=x onerror="alert(1)"><script>evil()</script>', css: '.x{}', w: 1, h: 1, palette: 'indaco', mode: 'light', ts: 1 };
		expect(savePlaygroundSnapshot(dirty)).toBe(true);
		const stored = loadPlaygroundSnapshot();
		expect(stored.html).not.toContain('onerror');
		expect(stored.html).not.toContain('<script');
	});
});

describe('extractCriticalFromDoc', () => {
	it('keeps rules that match the slide and drops the rest', () => {
		document.head.innerHTML = '<style>.title{color:red}.unused-zzz{color:blue}h1{font:1em/1 x}@font-face{font-family:F;src:url(f.woff2)}</style>';
		document.body.innerHTML = '<article class="lattice"><section class="title"><h1>Hi</h1></section></article>';
		const css = extractCriticalFromDoc(document);
		expect(css).toContain('.title');
		expect(css).toContain('h1');
		expect(css).toContain('@font-face'); // always kept
		expect(css).not.toContain('unused-zzz'); // class not present in the slide
	});

	it('drops @import (would fetch an external sheet on the top origin, red-team finding)', () => {
		document.head.innerHTML = '<style>@import url("https://evil.example/x.css");.title{color:red}</style>';
		document.body.innerHTML = '<article class="lattice"><section class="title"></section></article>';
		const css = extractCriticalFromDoc(document);
		expect(css).toContain('.title');
		expect(css).not.toContain('@import');
		expect(css).not.toContain('evil.example');
	});

	it('scopes every rule under the shell selector, re-targeting root-ish page rules', () => {
		document.head.innerHTML =
			'<style>html,body{background:blue;padding:18px}:root{--bg:red}.lattice{visibility:hidden}.lattice>section{color:green}</style>';
		document.body.innerHTML = '<article class="lattice"><section class="title"></section></article>';
		const css = extractCriticalFromDoc(document, '.pg-ssr-shell');
		// Page-level rules re-target ONTO the shell box (no bare html/body/:root leak into the top doc).
		expect(css).toMatch(/\.pg-ssr-shell\s*\{[^}]*background/); // html,body{background} → .pg-ssr-shell{…}
		expect(css).toMatch(/\.pg-ssr-shell\s*\{[^}]*--bg/); //          :root{--bg}       → .pg-ssr-shell{…}
		expect(css).not.toMatch(/(^|,|})\s*html\s*[,{]/); // no bare html rule survives
		expect(css).not.toMatch(/(^|,|})\s*body\s*[,{]/); // no bare body rule survives
		// Slide rules become descendant-scoped, inert anywhere but inside the shell.
		expect(css).toContain('.pg-ssr-shell .lattice');
		expect(css).toContain('.pg-ssr-shell .lattice>section');
	});
});
