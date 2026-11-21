// Unit tests for the pure halves of scripts/csp.mjs. No build, no dist.

import { describe, expect, it } from 'vitest';
import { classify, evaluatesCode, exemption, LINK_ONLY_ORIGINS, OPEN_ORIGINS, ORIGIN_DIRECTIVES, ownOriginsIn, PREVIEW_ORIGIN, policyFor, RUNTIME_ORIGINS, selfOrigins, sha256, withPolicy, writesInlineFrameScript } from './csp.mjs';

// The site's own origins, which every 'self' directive names beside it, as this run's environment builds them.
const OWN = selfOrigins([]).join(' '); // as this run's environment builds it (a PR run in CI adds the preview project)

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
		const p = policyFor(page(''), {}, ['https://lattice.style']);
		expect(p).toContain("default-src 'self'");
		expect(p).not.toMatch(/script-src[^;]*'unsafe-(inline|hashes)'/);
		expect(p).not.toMatch(/'unsafe-eval'/);
		expect(p).toContain("object-src 'none'");
		expect(p).toContain("frame-src 'none'");
		expect(p).toContain("img-src 'self' https://lattice.style data: blob:");
		expect(p).toContain("connect-src 'self' https://lattice.style");
		expect(p).not.toMatch(/https?:\/\/(?!lattice\.style)/);
	});

	// Gecko matches an inherited 'self' wrongly for a subresource the service worker answers to a srcdoc
	// preview, so every directive that names 'self' names the site's origins beside it.
	it('names the site’s own origins beside every \'self\' that a preview frame loads through', () => {
		const p = policyFor(page(''), {}, ['https://lattice.style']);
		for (const d of ['script-src', 'style-src', 'img-src', 'font-src', 'media-src', 'connect-src', 'worker-src']) {
			expect(p, d).toMatch(new RegExp(`${d} 'self' https://lattice\\.style(?: |;|$)`));
		}
		expect(p).toContain("default-src 'self';");
		expect(p).toContain("base-uri 'self';");
	});
	it('names the preview project only on a pull-request build, never in production', () => {
		expect(selfOrigins([], {})).toEqual(['https://lattice.style']);
		expect(selfOrigins([], { GITHUB_HEAD_REF: 'claude/x' })).toEqual(['https://lattice.style', PREVIEW_ORIGIN]);
		expect(selfOrigins([], { GITHUB_HEAD_REF: '' })).toEqual(['https://lattice.style']);
	});
	// --check rebuilds the policy with this run's origins; a page built with --self-origin (build:e2e)
	// differs only there, and reading the page's own origins back is what tells that from a rewrite.
	it('does not count a `<script>` code span inside a template literal as a frame script', () => {
		expect(writesInlineFrameScript('const doc=`| HTML tags like \\`<script>\\` printed |`')).toBe(false);
		// …while a real inline frame script in a template literal still counts.
		expect(writesInlineFrameScript('f.srcdoc=`<html><body><script>go()</script></body></html>`')).toBe(true);
		// A script BODY that starts with an escaped backtick is markup, not a code span (second checker, 32ab992).
		expect(writesInlineFrameScript('f.srcdoc=`<html><body>\\`<script>\\`x\\`;go()</script></body></html>`')).toBe(true);
		expect(writesInlineFrameScript('const t=`use a \\`<script>\\` tag.`')).toBe(false);
	});
	it('reads back the site origins a written policy names, so --check can tell them from a rewrite', () => {
		const page = '<!doctype html><html><head><meta charset="utf-8"><script>1</script></head><body></body></html>';
		const own = ['https://lattice.style', 'http://localhost:4321'];
		const written = withPolicy(page, {}, own);
		const meta = written.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)?.[0] ?? '';
		expect(ownOriginsIn(meta)).toEqual(own);
		expect(withPolicy(written, {}, ['https://lattice.style'])).not.toBe(written);
		expect(withPolicy(written, {}, ownOriginsIn(meta) ?? [])).toBe(written);
		expect(ownOriginsIn('<meta content="default-src \'self\'">')).toBeNull();
	});
	it('takes a local origin from --self-origin, and refuses anything that is not an origin', () => {
		expect(selfOrigins(['node', 'csp.mjs', '--self-origin=http://localhost:4321'], {})).toEqual(['https://lattice.style', 'http://localhost:4321']);
		for (const bad of ["http://x; script-src 'unsafe-inline'", 'javascript:1', 'https://a.example/path', "'unsafe-eval'"]) {
			expect(() => selfOrigins([`--self-origin=${bad}`], {}), bad).toThrow(/not a scheme/);
		}
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
		expect(evaluatesCode('r=Function(`binder`,`return function (`+o.join(`,`)+`){ return binder.apply(this,arguments); }`)(i)')).toBe(false);
		expect(evaluatesCode('u.setImmediate=function(e){typeof e!=`function`&&(e=Function(``+e));}')).toBe(false);
		expect(evaluatesCode('if(x)try{return Function(``,`var x `+r.attrValue),r.a=1}catch(e){}')).toBe(false);
		// The same names doing real evaluation still count.
		expect(evaluatesCode('r=Function(`binder`)+Function(src)')).toBe(true);
		expect(evaluatesCode('typeof e!=`function`&&(e=Function(``+f))')).toBe(true);
		expect(evaluatesCode('try{return Function(``,body)}catch(e){}')).toBe(true);
		// A PREFIX of a tolerated shape is not the shape: the tolerance reads the whole call (found by review).
		expect(evaluatesCode('r=Function(`binder`,userText)(i)')).toBe(true);
		expect(evaluatesCode('r=Function(`binder`,`return function (`+o.join(`,`)+`){`+body+`}`)(i)')).toBe(true);
		expect(evaluatesCode('try{return Function(``,`var x `+anyCode)}catch(e){}')).toBe(true);
	});
	it('counts a document with an interpolated inline script, and not a sandbox document that opens with its own policy', () => {
		expect(writesInlineFrameScript('a=`<main></main>\n<script>${js}<\\/script>`')).toBe(true);
		expect(writesInlineFrameScript('a="<script>"+fit()+"</script>"')).toBe(true);
		expect(writesInlineFrameScript('a=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${p}"></head><body><script>${s}<\\/script>`')).toBe(false);
		// The shapes review found the first detector missed: the bundled nonce idiom, an interpolated
		// attribute, a module script, a literal body (stage 1's own failure), and a splice that calls a
		// function (a nonce getter: the `(` in the tag read as a regex until the second review).
		for (const code of ['x="<script"+n+">"+js', 'x=`<script${n}>${js}`', 'x=`<script type="module">${js}`', 'x="<script>window.__SLIDE_W="+w', 'x=`<script>var W=${w}`', 'x="<script nonce=\\""+getNonce()+"\\">"+body', "x='<script nonce=\"'+n()+'\">'+js",
			// …and the shapes the red team found it blind to: tag case, an empty or ecmascript type, a data-src.
			'x=`<SCRIPT>${js}`', 'x=`<script type="">${js}`', 'x=`<script type=text/ecmascript>${js}`', 'x=`<script data-src=1>${js}`']) {
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
		expect(p).toContain(`connect-src 'self' ${OWN} https://openrouter.ai https://www.tiktok.com`);
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
		expect(p).toContain(`script-src 'self' ${OWN} 'wasm-unsafe-eval'`);
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
