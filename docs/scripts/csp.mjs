// Post-build step: a strict Content-Security-Policy for every page that cannot build a preview
// frame (#3207, stage 1). Runs LAST among the steps that rewrite HTML, so the hashes it writes
// are hashes of the bytes that ship.
//
// WHY OUR OWN STEP AND NOT ASTRO'S `security.csp`. Measured on this site (2026-11-17), Astro 7's
// CSP (a) does not hash `is:inline` scripts, which every route carries (the palette seed, the
// service-worker registration, `define:vars`); (b) is computed before the post-build steps
// rewrite the HTML (bake-*, inject-modulepreload, hoist-stylesheets, stable-island-uids), so its
// hashes can describe bytes that no longer exist; and (c) landed outside <head> on the landing
// page, where the browser ignores the whole policy. Hashing the final file avoids all three.
//
// WHY ONLY FRAME-FREE PAGES. A slide preview is a same-origin `srcdoc` iframe, and a srcdoc
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
// click still marks the page. Measured: 78 of 203 routes are frame-free.
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
// frame-free page lacks exactly one policy, a frame page carries one, or a hash no longer
// matches its script. Standalone: `npm run csp` (needs a built dist/).

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
		`script-src 'self' 'report-sample' ${[...scripts].sort().join(' ')}`,
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

// ── frame detection ─────────────────────────────────────────────────────────
function moduleGraph(dist) {
	const dir = path.join(dist, '_astro');
	const src = new Map();
	for (const f of fs.readdirSync(dir)) if (f.endsWith('.js')) src.set(f, fs.readFileSync(path.join(dir, f), 'utf8'));
	const memo = new Map();
	const builds = (file, seen = new Set()) => {
		if (memo.has(file)) return memo.get(file);
		if (seen.has(file) || !src.has(file)) return false;
		seen.add(file);
		const code = src.get(file);
		const deps = [...code.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["'`]\.\/([^"'`]+\.js)["'`]/g)].map((m) => m[1]);
		const result = code.includes('srcdoc') || deps.some((d) => builds(d, seen));
		memo.set(file, result);
		return result;
	};
	return builds;
}

export function isFramePage(html, builds) {
	if (/srcdoc|lattice-runtime|runtimeUrl/.test(html)) return true;
	return [...html.matchAll(/\/_astro\/([^"'\s?&]+\.js)/g)].some(([, f]) => builds(f));
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
	const builds = moduleGraph(DIST);
	const errors = [];
	let applied = 0;
	let framed = 0;
	for (const file of pages(DIST)) {
		const rel = path.relative(DIST, file);
		const html = fs.readFileSync(file, 'utf8');
		if (/<meta http-equiv="refresh"/i.test(html)) continue; // a redirect stub: no content
		const metas = html.match(META_RE) ?? [];
		if (isFramePage(html, builds)) {
			framed++;
			if (metas.length) errors.push(`${rel}: a frame page carries a CSP, which would blank its previews`);
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
		const want = withPolicy(html);
		if (want !== html) errors.push(`${rel}: CSP hashes do not match the page's inline scripts (a step rewrote it after csp.mjs?)`);
	}
	if (errors.length) {
		console.error(`csp: ${errors.length} problem(s)\n  ${errors.join('\n  ')}`);
		process.exit(1);
	}
	console.log(`csp: ${check ? 'verified' : 'applied'} a strict policy on ${applied} frame-free page(s); ${framed} frame page(s) left without one (stage 2).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
