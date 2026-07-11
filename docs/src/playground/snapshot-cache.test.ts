// Snapshot-cache unit tests (jsdom). Covers the localStorage round-trip + size
// cap, and the CSSOM critical-CSS walk on a plain stylesheet. jsdom's CSSOM is
// enough for style-rule matching + @font-face; the deeper grouping-rule recursion
// is exercised end-to-end in the browser harness (see the decision doc).

import { beforeEach, describe, expect, it } from 'vitest';
import { extractCriticalFromDoc, loadSnapshot, SNAPSHOT_KEY, saveSnapshot } from './snapshot-cache.js';

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
});
