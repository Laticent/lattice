// Unit tests for the pure halves of scripts/csp.mjs. No build, no dist.

import { describe, expect, it } from 'vitest';
import { evaluatesCode, exemption, LINK_ONLY_ORIGINS, policyFor, RUNTIME_ORIGINS, sha256, withPolicy } from './csp.mjs';

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
		expect(p).not.toMatch(/script-src[^;]*'unsafe-(inline|hashes)'/);
		expect(p).not.toMatch(/'unsafe-eval'/);
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

describe('exemption', () => {
	// A fake module graph: each entry chunk maps to what everything it can load contains.
	const reach = (graph) => (roots) => {
		const origins = new Set();
		let frame = false;
		let evals = false;
		for (const r of roots) {
			frame ||= Boolean(graph[r]?.frame);
			evals ||= Boolean(graph[r]?.evals);
			for (const o of graph[r]?.origins ?? []) origins.add(o);
		}
		return { frame, evals, origins };
	};
	const withApp = page('<script type="module" src="/_astro/app.js"></script>');

	it('exempts a page whose HTML names the preview runtime', () => {
		expect(exemption(page('', '<x-island props="{runtimeUrl:1}">'), reach({}))).toBe('frame');
	});
	it('exempts a page that can load a module that builds a srcdoc frame', () => {
		expect(exemption(withApp, reach({ 'app.js': { frame: true } }))).toBe('frame');
	});
	it('exempts a page whose code can evaluate a string as script', () => {
		expect(exemption(withApp, reach({ 'app.js': { evals: true } }))).toBe('eval');
	});
	it('ignores the globalThis fallback that never runs in a browser, and counts real evaluation', () => {
		expect(evaluatesCode('var g=globalThis||Function(`return this`)();')).toBe(false);
		expect(evaluatesCode("var g=self||Function('return this')();")).toBe(false);
		expect(evaluatesCode('x=new Function(a,b)')).toBe(true);
		expect(evaluatesCode('y=eval(s)')).toBe(true);
		expect(evaluatesCode('this.Function(x)')).toBe(false);
	});
	it('exempts a page whose code calls another origin at run time', () => {
		expect(exemption(withApp, reach({ 'app.js': { origins: ['openrouter.ai'] } }))).toBe('network');
	});
	it('gives a policy to a page whose code only names link-only origins', () => {
		expect(exemption(withApp, reach({ 'app.js': { origins: ['github.com', 'react.dev'] } }))).toBeNull();
	});
	it('fails on an origin in neither list, so a new one is a decision', () => {
		expect(() => exemption(withApp, reach({ 'app.js': { origins: ['tracker.example'] } }))).toThrow(/tracker\.example/);
	});
});

describe('the policy', () => {
	it('lets a page compile WebAssembly (Calco’s font subsetter) without allowing JS eval', () => {
		const p = policyFor(page(''));
		expect(p).toMatch(/script-src 'self' 'wasm-unsafe-eval'/);
		expect(p).not.toMatch(/'unsafe-eval'/);
	});
	it('lists every runtime and link-only origin once, in exactly one list', () => {
		const all = [...RUNTIME_ORIGINS, ...LINK_ONLY_ORIGINS];
		expect(new Set(all).size).toBe(all.length);
	});
});
