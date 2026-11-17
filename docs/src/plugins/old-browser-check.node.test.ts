// @vitest-environment node
import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { minifiedOldBrowserCheck } from './old-browser-check.mjs';

// The inline check exactly as the build puts it in every page's <head>: minified by esbuild, which refuses to run in
// jsdom, hence this file's node environment. The browsers it is for cannot parse anything newer than ES5.

describe('the shipped old-browser check', () => {
	const shipped = minifiedOldBrowserCheck('/old-browser.js');

	it('is ES5 after minification', () => {
		expect(() => parse(shipped, { ecmaVersion: 5 })).not.toThrow();
	});

	it('is one call of the named check, with its data and the notice address', () => {
		// Minified, it is an anonymous function called once; its `data-old-browser` mark is what a page is searched for.
		expect(shipped).toMatch(/^\(function\(/);
		expect(shipped).toContain('"data-old-browser"');
		expect(shipped).toContain('"/old-browser.js"');
		expect(shipped).toContain('selector(:has(a))');
	});

	it('stays small: every page carries it', () => {
		// 1,343 bytes before the hider painted a literal --bg (legacy Edge's mustard flash on refresh), about 1,490 after.
		expect(Buffer.byteLength(shipped)).toBeLessThan(1550);
	});
});
