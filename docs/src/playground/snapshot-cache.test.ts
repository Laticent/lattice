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
});

describe('captureFirstSectionFromFrame (Playground filmstrip → first slide only)', () => {
	beforeEach(() => localStorage.clear());

	// A fake iframe whose contentDocument is a multi-slide filmstrip, with the FIT
	// agent's inline transform on each section (as the live preview carries). Uses the
	// global jsdom document so `<style>` populates styleSheets (a detached
	// createHTMLDocument does not parse them, so the critical-CSS walk would be empty).
	function fakeFrame() {
		document.head.innerHTML = '<style>.title{color:red}section{color:blue}</style>';
		document.body.innerHTML =
			'<div class="lattice">' +
			'<section class="title" style="transform:scale(0.3);transform-origin:top left;margin-bottom:12px"><h1>One</h1></section>' +
			'<section class="title" style="transform:scale(0.3)"><h1>Two</h1></section>' +
			'<section class="title" style="transform:scale(0.3)"><h1>Three</h1></section>' +
			'</div>';
		return { contentDocument: document } as unknown as HTMLIFrameElement;
	}

	it('captures ONLY the first section, wrapped in a fresh .lattice (not the whole filmstrip)', () => {
		const snap = captureFirstSectionFromFrame(fakeFrame(), { palette: 'indaco', mode: 'light', srcHash: 'abc', w: 1280, h: 720, ts: 1 });
		expect(snap).not.toBeNull();
		expect(snap?.html).toContain('One');
		expect(snap?.html).not.toContain('Two');
		expect(snap?.html).not.toContain('Three');
		expect(snap?.html).toMatch(/^<div class="lattice">/);
	});

	it('strips the FIT agent inline transform/margin from the captured slide', () => {
		const snap = captureFirstSectionFromFrame(fakeFrame(), { palette: 'indaco', mode: 'light', srcHash: 'abc', ts: 1 });
		expect(snap?.html).not.toContain('scale(0.3)');
		expect(snap?.html).not.toContain('margin-bottom');
	});

	it('carries the srcHash identity and returns null on an empty filmstrip', () => {
		const snap = captureFirstSectionFromFrame(fakeFrame(), { palette: 'cuoio', mode: 'dark', srcHash: 'deadbeef', ts: 9 });
		expect(snap?.srcHash).toBe('deadbeef');
		expect(snap?.palette).toBe('cuoio');
		expect(snap?.mode).toBe('dark');
		const empty = document.implementation.createHTMLDocument('');
		expect(captureFirstSectionFromFrame({ contentDocument: empty } as unknown as HTMLIFrameElement, { palette: 'indaco', mode: 'light', srcHash: '', ts: 0 })).toBeNull();
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
		document.body.innerHTML = '<div class="lattice"><section class="title"><h1>Hi</h1></section></div>';
		const css = extractCriticalFromDoc(document);
		expect(css).toContain('.title');
		expect(css).toContain('h1');
		expect(css).toContain('@font-face'); // always kept
		expect(css).not.toContain('unused-zzz'); // class not present in the slide
	});

	it('drops @import (would fetch an external sheet on the top origin, red-team finding)', () => {
		document.head.innerHTML = '<style>@import url("https://evil.example/x.css");.title{color:red}</style>';
		document.body.innerHTML = '<div class="lattice"><section class="title"></section></div>';
		const css = extractCriticalFromDoc(document);
		expect(css).toContain('.title');
		expect(css).not.toContain('@import');
		expect(css).not.toContain('evil.example');
	});

	it('scopes every rule under the shell selector, re-targeting root-ish page rules', () => {
		document.head.innerHTML =
			'<style>html,body{background:blue;padding:18px}:root{--bg:red}.lattice{visibility:hidden}.lattice>section{color:green}</style>';
		document.body.innerHTML = '<div class="lattice"><section class="title"></section></div>';
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
