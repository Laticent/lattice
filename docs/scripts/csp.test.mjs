// Unit tests for the pure halves of scripts/csp.mjs. No build, no dist.

import { describe, expect, it } from 'vitest';
import { classify, evaluatesCode, exemption, LINK_ONLY_ORIGINS, OPEN_ORIGINS, ORIGIN_DIRECTIVES, policyFor, RUNTIME_ORIGINS, sha256, withPolicy, writesInlineFrameScript } from './csp.mjs';

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
		let sandbox = false;
		for (const r of roots) {
			frame ||= Boolean(graph[r]?.frame);
			evals ||= Boolean(graph[r]?.evals);
			sandbox ||= Boolean(graph[r]?.sandbox);
			for (const o of graph[r]?.origins ?? []) origins.add(o);
		}
		return { frame, evals, sandbox, origins };
	};
	const withApp = page('<script type="module" src="/_astro/app.js"></script>');

	it('gives a policy to a page that builds a preview frame, whose scripts are now same-origin files', () => {
		// Stage 1 exempted any page whose HTML named the runtime; stage 2 does not.
		expect(exemption(page('', '<x-island props="{runtimeUrl:1}">'), reach({}))).toBeNull();
	});
	it('exempts a page that can load a module writing a same-origin document with an inline script', () => {
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
	it('ignores the never-run and caught evaluations, each by its exact shape, and nothing near them', () => {
		// function-bind's polyfill, JSZip's setImmediate string callback, CodeMirror's Pug syntax probe.
		expect(evaluatesCode('r=Function(`binder`,`return function (`+o.join(`,`)+`){}`)(i)')).toBe(false);
		expect(evaluatesCode('u.setImmediate=function(e){typeof e!=`function`&&(e=Function(``+e));}')).toBe(false);
		expect(evaluatesCode('if(x)try{return Function(``,`var x `+r.attrValue),r.a=1}catch(e){}')).toBe(false);
		// The same names doing real evaluation still count.
		expect(evaluatesCode('r=Function(`binder`)+Function(src)')).toBe(true);
		expect(evaluatesCode('typeof e!=`function`&&(e=Function(``+f))')).toBe(true);
		expect(evaluatesCode('try{return Function(``,body)}catch(e){}')).toBe(true);
	});
	it('counts a document with an interpolated inline script, and not a sandbox document that opens with its own policy', () => {
		expect(writesInlineFrameScript('a=`<main></main>\n<script>${js}<\\/script>`')).toBe(true);
		expect(writesInlineFrameScript('a="<script>"+fit()+"</script>"')).toBe(true);
		expect(writesInlineFrameScript('a=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${p}"></head><body><script>${s}<\\/script>`')).toBe(false);
		// The shapes review found the first detector missed: the bundled nonce idiom, an interpolated
		// attribute, a module script, and a literal body (stage 1's own failure).
		for (const code of ['x="<script"+n+">"+js', 'x=`<script${n}>${js}`', 'x=`<script type="module">${js}`', 'x="<script>window.__SLIDE_W="+w', 'x=`<script>var W=${w}`']) {
			expect(writesInlineFrameScript(code), code).toBe(true);
		}
		// A module-loaded sandbox document: its import map sits between its policy and its script.
		expect(writesInlineFrameScript('a=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${p}"><script type="importmap">${m}<\\/script></head><body><script type="module">${b}<\\/script>`')).toBe(false);
		// A script loaded from a file, a data block (its type interpolated or not), a pattern, and a
		// mention in prose are not inline scripts.
		expect(writesInlineFrameScript('a=`<script src="${u}"><\\/script>`')).toBe(false);
		expect(writesInlineFrameScript('a="<script"+n+" src=\\""+u+"\\"></script>"')).toBe(false);
		expect(writesInlineFrameScript('a=`<script type="${t}" id="d">${j}<\\/script>`')).toBe(false);
		expect(writesInlineFrameScript('re=/<script[^>]*>/gi')).toBe(false);
		expect(writesInlineFrameScript('never write `<script>` in a deck')).toBe(false);
		expect(writesInlineFrameScript('t.push(`policy:a <script> with a data: source`)')).toBe(false);
	});
	it('gives a page that calls a known origin the policy, with that origin in exactly the directives it needs', () => {
		const { exempt, allow } = classify(withApp, reach({ 'app.js': { origins: ['www.tiktok.com', 'openrouter.ai', 'github.com'] } }));
		expect(exempt).toBeNull();
		expect(allow).toEqual({ 'frame-src': ['https://www.tiktok.com'], 'connect-src': ['https://openrouter.ai', 'https://www.tiktok.com'] });
		const p = policyFor(page(''), allow);
		expect(p).toContain("connect-src 'self' https://openrouter.ai https://www.tiktok.com");
		expect(p).toContain('frame-src https://www.tiktok.com');
		expect(p).not.toContain("frame-src 'none'");
		expect(p).not.toContain('github.com');
	});
	it('lets a page that can open the sandbox shell frame its own origin, and no other page', () => {
		expect(classify(withApp, reach({ 'app.js': { sandbox: true } })).allow).toEqual({ 'frame-src': ["'self'"] });
		expect(policyFor(page(''), classify(withApp, reach({ 'app.js': {} })).allow)).toContain("frame-src 'none'");
	});
	it('exempts a page that imports code from an open origin', () => {
		expect(exemption(withApp, reach({ 'app.js': { origins: ['esm.run', 'openrouter.ai'] } }))).toBe('network');
	});
	it('gives a policy to a page whose code only names link-only origins', () => {
		expect(exemption(withApp, reach({ 'app.js': { origins: ['github.com', 'react.dev'] } }))).toBeNull();
	});
	it('fails on an origin in no list, so a new one is a decision', () => {
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
		const all = [...Object.keys(ORIGIN_DIRECTIVES), ...OPEN_ORIGINS, ...LINK_ONLY_ORIGINS];
		expect(new Set(all).size).toBe(all.length);
		expect(new Set(RUNTIME_ORIGINS)).toEqual(new Set([...Object.keys(ORIGIN_DIRECTIVES), ...OPEN_ORIGINS]));
	});
	it('names only directives the policy writes, so an allowance cannot silently miss', () => {
		const written = policyFor(page('')).split('; ').map((d) => d.split(' ')[0]);
		for (const ds of Object.values(ORIGIN_DIRECTIVES)) for (const d of ds) expect(written).toContain(d);
	});
});
