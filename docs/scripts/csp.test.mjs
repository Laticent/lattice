// Unit tests for the pure halves of scripts/csp.mjs. No build, no dist.

import { describe, expect, it } from 'vitest';
import { isFramePage, policyFor, sha256, withPolicy } from './csp.mjs';

const page = (head, body = '') => `<!doctype html><html><head><meta charset="utf-8"><title>t</title>${head}</head><body>${body}</body></html>`;
const scriptHashes = (html) => policyFor(html).match(/script-src ([^;]*)/)[1].split(' ').filter((t) => t.startsWith("'sha256-"));

describe('policyFor', () => {
	it('hashes each executed inline script, exactly as written', () => {
		const html = page('<script>var a = 1;</script>', '<script type="module">import "./x.js";</script>');
		expect(scriptHashes(html).sort()).toEqual([sha256('var a = 1;'), sha256('import "./x.js";')].sort());
	});

	it('skips scripts loaded by src and JSON data blocks, which CSP does not hash', () => {
		const html = page('<script src="/_astro/a.js"></script><script type="application/ld+json">{"a":1}</script><script type="application/json">{}</script>');
		expect(scriptHashes(html)).toEqual([]);
	});

	it('is not fooled by `<script>` or `<style>` written inside a comment or a style', () => {
		// The SiteHeader shape: a comment that names `<style>`, then a real style, then a script.
		const html = page('<!-- a <style> here, and a <script> too --><style>a{b:c}</style><script>real()</script>');
		expect(scriptHashes(html)).toEqual([sha256('real()')]);
		// A comment that mentions `<script>` before a real one: a scripts-only pass would start a
		// phantom element at the comment and hash ` mention --><script>real()` instead.
		const html1 = page('<!-- a <script> mention --><script>real()</script>');
		expect(scriptHashes(html1)).toEqual([sha256('real()')]);
		const html2 = page('<style>/* <script>x</script> */ a{}</style><script>y()</script>');
		expect(scriptHashes(html2)).toEqual([sha256('y()')]);
		// An end tag with attributes or whitespace is valid HTML and still closes the script.
		const html3 = page('<script>z()</script\t\n foo><script>w()</script >');
		expect(scriptHashes(html3).sort()).toEqual([sha256('z()'), sha256('w()')].sort());
	});

	it('allows nothing it was not given: no inline handlers, no eval, no other origin', () => {
		const p = policyFor(page(''));
		expect(p).toContain("default-src 'self'");
		expect(p).not.toMatch(/script-src[^;]*'unsafe-(inline|eval|hashes)'/);
		expect(p).toContain("object-src 'none'");
		expect(p).toContain("frame-src 'none'");
		expect(p).toContain("img-src 'self' data: blob:");
		expect(p).toContain("connect-src 'self'");
	});
});

describe('withPolicy', () => {
	it('puts one policy right after <meta charset>, and is idempotent', () => {
		const once = withPolicy(page('<script>z()</script>'));
		expect(once).toMatch(/^<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"/);
		expect(withPolicy(once)).toBe(once);
		expect(once.match(/Content-Security-Policy/g)).toHaveLength(1);
	});
});

describe('isFramePage', () => {
	const builds = (graph) => (f) => graph[f] === true;
	it('marks a page whose HTML names the preview runtime', () => {
		expect(isFramePage(page('', '<x-island props="{runtimeUrl:1}">'), builds({}))).toBe(true);
	});
	it('marks a page that can load a module that builds a srcdoc frame', () => {
		expect(isFramePage(page('<script type="module" src="/_astro/app.js"></script>'), builds({ 'app.js': true }))).toBe(true);
	});
	it('leaves a page whose modules build no frame', () => {
		expect(isFramePage(page('<script type="module" src="/_astro/app.js"></script>'), builds({ 'app.js': false }))).toBe(false);
	});
});
