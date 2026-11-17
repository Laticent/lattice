// Post-build step: a strict Content-Security-Policy for every page whose code a strict policy
// cannot break (#3207, stage 1). Runs LAST among the steps that rewrite HTML, so the hashes it writes
// are hashes of the bytes that ship.
//
// WHY OUR OWN STEP AND NOT ASTRO'S `security.csp`. Measured on this site (2026-11-17), Astro 7's
// CSP (a) does not hash `is:inline` scripts, which every route carries (the palette seed, the
// service-worker registration, `define:vars`); (b) is computed before the post-build steps
// rewrite the HTML (bake-*, inject-modulepreload, hoist-stylesheets, stable-island-uids), so its
// hashes can describe bytes that no longer exist; and (c) landed outside <head> on the landing
// page, where the browser ignores the whole policy. Hashing the final file avoids all three.
//
// WHICH PAGES. Every page except three kinds, each of which a strict policy would break:
//   frame    — it can build a slide preview (below);
//   eval     — its code can evaluate a string as script (Calco's HarfBuzz font subsetter);
//   network  — its code calls another origin at run time (the voice demos: OpenRouter, Google).
// Measured 2026-11-17: 75 of 203 routes get the policy; 125 frame, 1 eval, 2 network.
//
// A slide preview is a same-origin `srcdoc` iframe, and a srcdoc
// document inherits its parent's policy. The engine writes inline scripts into that frame at run
// time, some with per-deck values (`window.__SLIDE_W=…`), so no build-time hash can cover them:
// under a strict policy the Playground preview rendered blank. Stage 2 moves those scripts into
// same-origin files, then extends this policy to the frame pages
// (followups.d/3277-p1-csp-frame-pages.md). Until then a frame page gets NO policy rather than a
// weak one: `'unsafe-inline'` scripts would look like protection while blocking almost nothing.
//
// A PAGE IS A FRAME PAGE when its HTML names the preview runtime, or when any module it can load
// (its scripts, island components, modulepreloads, and everything those import, statically or
// dynamically) contains `srcdoc`. Dynamic imports count, so a preview that only appears on a
// click still marks the page.
//
// THE POLICY. Scripts: our origin plus the exact hash of each inline script, and nothing else
// (no inline event handlers, no eval). Styles: our origin and inline. Inline styles have to stay
// allowed: Radix's dialog scroll lock (react-remove-scroll) injects a <style> carrying the
// visitor's measured scrollbar width, which no build-time hash can match, and blocking it lets
// the page scroll behind every open dialog (Gecko and Chromium both reported it; measured
// 2026-11-17). A nonce cannot help a static site: it would be the same public string on every
// load. What an injected style could do is read the page through attribute selectors and leak
// it in a url() — and every channel for that is closed here: images, fonts, media and fetches
// are our origin (plus data:/blob:) only. Everything else is our origin only. `frame-ancestors`
// is absent because a <meta> policy cannot carry it (browsers ignore it there).
//
// Also run with `--check` (by the build, after writing): re-reads every page and fails when a
// policy page lacks exactly one policy, an exempt page carries one, an outside origin is in
// neither list, or a hash no longer matches its script. Standalone: `npm run csp` (needs a built dist/).

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromHtml } from 'hast-util-from-html';
import { selectAll } from 'hast-util-select';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '..', 'dist');

const META_RE = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/gi;
// A data block (JSON, ld+json) is never run, so CSP does not govern it and it needs no hash.
const isDataBlock = (type) => /^application\/(?:ld\+)?json$/i.test(String(type ?? '').trim());

export const sha256 = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** The policy for one page, from the final bytes of its inline scripts. */
export function policyFor(html) {
	// Parse the page the way the browser does (parse5, via hast) and hash each inline script's
	// text exactly as the parser hands it over. Pattern-matching the markup got this wrong twice
	// (an HTML comment that says `<style>` swallowed a real element; an end tag such as
	// `</script foo>` is valid HTML that a regex misses), and a hash of the wrong bytes blocks
	// the script it was meant to allow.
	const scripts = new Set();
	for (const el of selectAll('script', fromHtml(html))) {
		if (el.properties.src !== undefined || isDataBlock(el.properties.type)) continue;
		scripts.add(sha256(el.children.map((c) => (c.type === 'text' ? c.value : '')).join('')));
	}
	return [
		"default-src 'self'",
		// 'report-sample' puts the first 40 characters of a blocked script in the violation
		// event, so a regression names its own source (it is sent nowhere: a <meta> policy has
		// no report endpoint).
		// 'wasm-unsafe-eval' lets a page compile WebAssembly and nothing else (it is not JS eval).
		// A wasm library on a policy page (the first one found was Calco's HarfBuzz font subsetter,
		// which Chromium refused to compile; WebKit and Gecko did not enforce it) needs it.
		`script-src 'self' 'wasm-unsafe-eval' 'report-sample' ${[...scripts].sort().join(' ')}`,
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self' data:",
		"media-src 'self' data: blob:",
		"connect-src 'self'",
		"worker-src 'self' blob:",
		"manifest-src 'self'",
		"frame-src 'none'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	].join('; ');
}

/** Insert the policy right after <meta charset> (which must stay within the first 1024 bytes). */
export function withPolicy(html) {
	const clean = html.replace(META_RE, '');
	const meta = `<meta http-equiv="Content-Security-Policy" content="${policyFor(clean)}">`;
	const charset = clean.match(/<meta charset="?utf-8"?\s*\/?>/i);
	if (!charset) throw new Error('no <meta charset> to anchor the policy after');
	const at = charset.index + charset[0].length;
	return clean.slice(0, at) + meta + clean.slice(at);
}

// ── what a page's code can reach ────────────────────────────────────────────
// Every outside origin found in code a policy page can load must be named in one of these two
// lists, or the build fails: a new origin is a decision, not something the policy discovers
// at run time by breaking a feature. (The first review of this step found two that did: the
// voice demos call OpenRouter and Google and import a model runtime from esm.run.)
//
// A page whose code calls a RUNTIME origin gets no policy (stage 2 gives those pages a
// per-page allowance). LINK-ONLY origins appear as strings that are never fetched or run.
export const RUNTIME_ORIGINS = Object.freeze([
	'openrouter.ai', // voice-model.js: cloud speech + the model catalog, on the visitor's key
	'generativelanguage.googleapis.com', // voice-model.js: Gemini speech, on the visitor's key
	'esm.run', // voice-model.js: imports kokoro-js, the on-device voice runtime
]);
export const LINK_ONLY_ORIGINS = Object.freeze([
	'github.com', // repository and issue links
	'react.dev', // React's own error-message links
	'radix-ui.com', // Radix's own warning-message links
	'rolldown.rs', // the bundler's runtime error links
	'unpkg.com', // detect-gpu's default table URL; gpu-rank.ts replaces it with self-hosted tables
	'lattice.dev', // the fallback origin string used when `location` is undefined (never in a browser)
	'lattice.style', // our own production origin, in links
	'stuk.github.io', // JSZip's license link
	'evil.example', // a Vetrina fixture asserting that a hostile url() is rejected
]);

// CODE THAT EVALUATES A STRING needs 'unsafe-eval', which this policy never grants, so a page
// that can reach it gets no policy. Two ways to find it: a direct `eval(` / `Function(` in the
// bundle, and modules known to do it INDIRECTLY, which no text search sees. HarfBuzz's
// Emscripten bindings (font-subset, hb-subset) build their invokers with `new Function` through
// an alias: under the policy Calco's PPTX export hung at "Embedding fonts…" (measured
// 2026-11-17; 1 s and 3 fonts without the policy). e2e/site-csp.spec.ts clicks every control on
// the library demos with a policy, which is what catches an indirect one this list lacks.
const DIRECT_EVAL = /new Function\(|[^.\w$]Function\(|[^.\w$]eval\(/;
export const INDIRECT_EVAL_CHUNKS = Object.freeze([/^font-subset\./, /^hb-subset\./]);

const ORIGIN_RE = /https:\/\/([a-z0-9.-]+\.[a-z]{2,})/g;

function moduleGraph(dist) {
	const dir = path.join(dist, '_astro');
	const src = new Map();
	for (const f of fs.readdirSync(dir)) if (f.endsWith('.js')) src.set(f, fs.readFileSync(path.join(dir, f), 'utf8'));
	const deps = (code) => [...code.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["'`]\.\/([^"'`]+\.js)["'`]/g)].map((m) => m[1]);
	/** Everything a page can load from these entry chunks, statically or dynamically. */
	return (roots) => {
		const seen = new Set();
		const stack = [...roots];
		while (stack.length) {
			const f = stack.pop();
			if (seen.has(f) || !src.has(f)) continue;
			seen.add(f);
			stack.push(...deps(src.get(f)));
		}
		let frame = false;
		let evals = false;
		const origins = new Set();
		for (const f of seen) {
			const code = src.get(f);
			if (code.includes('srcdoc')) frame = true;
			if (DIRECT_EVAL.test(code) || INDIRECT_EVAL_CHUNKS.some((re) => re.test(f))) evals = true;
			for (const [, o] of code.matchAll(ORIGIN_RE)) origins.add(o);
		}
		return { frame, evals, origins };
	};
}

/**
 * Why a page gets no policy, or null when it gets one. 'frame': it can build a srcdoc preview
 * (its HTML names the runtime, or a module it can load contains `srcdoc`), which inherits the
 * policy and runs per-deck inline scripts. 'eval': its code can evaluate a string as script.
 * 'network': its code calls a RUNTIME origin.
 * Throws on an origin in neither list.
 */
export function exemption(html, reach) {
	if (/srcdoc|lattice-runtime|runtimeUrl/.test(html)) return 'frame';
	const { frame, evals, origins } = reach([...html.matchAll(/\/_astro\/([^"'\s?&]+\.js)/g)].map(([, f]) => f));
	if (frame) return 'frame';
	if (evals) return 'eval';
	const unknown = [...origins].filter((o) => !RUNTIME_ORIGINS.includes(o) && !LINK_ONLY_ORIGINS.includes(o));
	if (unknown.length) throw new Error(`code on this page names ${unknown.join(', ')}: add each to RUNTIME_ORIGINS or LINK_ONLY_ORIGINS in scripts/csp.mjs`);
	return [...origins].some((o) => RUNTIME_ORIGINS.includes(o)) ? 'network' : null;
}

function pages(dist) {
	const out = [];
	(function walk(dir) {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) {
				if (e.name !== '_astro' && !p.includes(`${path.sep}playground${path.sep}v`)) walk(p);
			} else if (e.name.endsWith('.html')) out.push(p);
		}
	})(dist);
	return out;
}

function main() {
	const check = process.argv.includes('--check');
	const reach = moduleGraph(DIST);
	const errors = [];
	let applied = 0;
	const exempt = { frame: 0, eval: 0, network: 0 };
	for (const file of pages(DIST)) {
		const rel = path.relative(DIST, file);
		const html = fs.readFileSync(file, 'utf8');
		if (/<meta http-equiv="refresh"/i.test(html)) continue; // a redirect stub: no content
		const metas = html.match(META_RE) ?? [];
		let why;
		try {
			why = exemption(html, reach);
		} catch (err) {
			errors.push(`${rel}: ${err.message}`);
			continue;
		}
		if (why) {
			exempt[why]++;
			// Applying is idempotent: a page that has become exempt since an earlier run loses
			// its old policy. Checking reports one, which would break the page.
			if (metas.length && !check) fs.writeFileSync(file, html.replace(META_RE, ''));
			else if (metas.length) errors.push(`${rel}: a ${why} page carries a CSP, which would break it`);
			continue;
		}
		applied++;
		if (!check) {
			fs.writeFileSync(file, withPolicy(html));
			continue;
		}
		if (metas.length !== 1) {
			errors.push(`${rel}: ${metas.length} CSP meta tags (want 1)`);
			continue;
		}
		if (withPolicy(html) !== html) errors.push(`${rel}: CSP hashes do not match the page's inline scripts (a step rewrote it after csp.mjs?)`);
	}
	if (errors.length) {
		console.error(`csp: ${errors.length} problem(s)\n  ${errors.join('\n  ')}`);
		process.exit(1);
	}
	console.log(`csp: ${check ? 'verified' : 'applied'} a strict policy on ${applied} page(s); left without one (stage 2): ${exempt.frame} that build a preview frame, ${exempt.eval} that evaluate code, ${exempt.network} that call another origin.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
