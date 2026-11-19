// Post-build step: a strict Content-Security-Policy for every page whose code a strict policy
// cannot break (#3207 stage 1, #3277 stage 2). Runs LAST among the steps that rewrite HTML, so the hashes it writes
// are hashes of the bytes that ship.
//
// WHY OUR OWN STEP AND NOT ASTRO'S `security.csp`. Measured on this site (2026-11-17), Astro 7's
// CSP (a) does not hash `is:inline` scripts, which every route carries (the palette seed, the
// service-worker registration, `define:vars`); (b) is computed before the post-build steps
// rewrite the HTML (bake-*, inject-modulepreload, hoist-stylesheets, stable-island-uids), so its
// hashes can describe bytes that no longer exist; and (c) landed outside <head> on the landing
// page, where the browser ignores the whole policy. Hashing the final file avoids all three.
//
// WHICH PAGES. Every page, except the kinds a strict policy would still break:
//   frame    — it can write a same-origin document whose scripts are inline (the export player's
//              capture and prune frames, in the Studio);
//   eval     — its code can evaluate a string as script (HarfBuzz's font subsetter, through woff2);
//   network  — its code imports a runtime from an origin whose own requests no scan of ours can list
//              (esm.run: the on-device voice and model runtimes).
// A page whose code calls a KNOWN outside origin gets the policy with that origin added to exactly
// the directive the call needs (ORIGIN_DIRECTIVES), rather than losing the policy.
// Measured 2026-11-17: stage 1 covered 75 of 203 routes, stage 2 covers 198 of 204 (MIN_POLICY_PAGES).
// What is left, and how each closes: followups.d/3277-p1-csp-remaining-pages.md.
//
// PREVIEW FRAMES ARE COVERED (stage 2, engineering/decisions/2026-11-17-site-discovery.md §2). A slide preview is a
// same-origin `srcdoc` frame, and a srcdoc document inherits its parent's policy. The engine used to
// write inline scripts into that frame at run time, some with per-deck values (`window.__SLIDE_W=…`),
// which no build-time hash covers: under a strict policy the Playground preview rendered blank. The
// three preview builders now name one same-origin file instead (lib/core/frame-agents.mjs),
// and the two SANDBOXED frames (the code-package runner and the draw host), whose documents carry
// their own strict policy and hashed script, load through a same-origin shell that escapes the
// inheritance (lib/packages/sandbox-shell.mjs).
//
// A PAGE IS STILL A FRAME PAGE when a module it can load (statically or dynamically) assembles a
// document with an interpolated inline `<script>` and no policy of its own in front of it. A
// document that DOES open with its own policy (the sandbox documents) is a sandbox document, which
// reaches its frame through the shell; it is not counted.
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
import { SANDBOX_SHELL_FILE } from '../../lib/packages/sandbox-shell.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '..', 'dist');

const META_RE = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/gi;
// A data block (JSON, ld+json) is never run, so CSP does not govern it and it needs no hash.
const isDataBlock = (type) => /^application\/(?:ld\+)?json$/i.test(String(type ?? '').trim());

export const sha256 = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/**
 * The policy for one page, from the final bytes of its inline scripts, plus the outside origins its
 * code calls (`allow`, from `classify`): each joins exactly the directives named for it.
 * @param {string} html
 * @param {Record<string, string[]>} [allow]
 */
export function policyFor(html, allow = {}) {
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
	const plus = (d) => (allow[d]?.length ? ` ${allow[d].join(' ')}` : '');
	return [
		"default-src 'self'",
		// 'report-sample' puts the first 40 characters of a blocked script in the violation
		// event, so a regression names its own source (it is sent nowhere: a <meta> policy has
		// no report endpoint).
		// 'wasm-unsafe-eval' lets a page compile WebAssembly and nothing else (it is not JS eval).
		// A wasm library on a policy page (the first one found was Calco's HarfBuzz font subsetter,
		// which Chromium refused to compile; WebKit and Gecko did not enforce it) needs it.
		`script-src 'self' 'wasm-unsafe-eval' 'report-sample' ${[...scripts].sort().join(' ')}${plus('script-src')}`,
		// `blob:`: the single-slide preview shares one engine sheet across its frames as a blob URL
		// (single-slide-render.ts `sharedSheetHref`), and WebKit checks a srcdoc frame's <link> against
		// the inherited policy. A blob is a same-document payload; it reaches no network.
		"style-src 'self' 'unsafe-inline' blob:",
		"img-src 'self' data: blob:",
		"font-src 'self' data:",
		"media-src 'self' data: blob:",
		`connect-src 'self'${plus('connect-src')}`,
		"worker-src 'self' blob:",
		"manifest-src 'self'",
		allow['frame-src']?.length ? `frame-src${plus('frame-src')}` : "frame-src 'none'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	].join('; ');
}

/** Insert the policy right after <meta charset> (which must stay within the first 1024 bytes). */
export function withPolicy(html, allow = {}) {
	const clean = html.replace(META_RE, '');
	const meta = `<meta http-equiv="Content-Security-Policy" content="${policyFor(clean, allow)}">`;
	const charset = clean.match(/<meta charset="?utf-8"?\s*\/?>/i);
	if (!charset) throw new Error('no <meta charset> to anchor the policy after');
	const at = charset.index + charset[0].length;
	return clean.slice(0, at) + meta + clean.slice(at);
}

// ── what a page's code can reach ────────────────────────────────────────────
// Every outside origin found in code a policy page can load must be named in one of these lists,
// or the build fails: a new origin is a decision, not something the policy discovers at run time by
// breaking a feature. (The first review of this step found two that did: the voice demos call
// OpenRouter and Google and import a model runtime from esm.run.)
//
// ORIGIN_DIRECTIVES: an origin the page's code really calls, and the directive(s) that call needs.
// A page whose code reaches one gets the policy with `https://<origin>` added to just those
// directives; a page that does not reach it gets none of them.
export const ORIGIN_DIRECTIVES = Object.freeze({
	'openrouter.ai': ['connect-src'], // voice-model.js and the Studio's AI: speech, chat and the model catalog, on the visitor's key
	'generativelanguage.googleapis.com': ['connect-src'], // voice-model.js: Gemini speech, on the visitor's key
	// The video plugin's players (lib/plugins/providers.generated.mjs `embed`), mounted by
	// docs/src/playground/video-overlay.js in the PAGE when a reader taps a poster.
	'www.youtube-nocookie.com': ['frame-src'],
	'player.vimeo.com': ['frame-src'],
	'www.instagram.com': ['frame-src'],
	// TikTok's player, and its oEmbed lookup (video-overlay.js resolves a share link to a video id).
	'www.tiktok.com': ['frame-src', 'connect-src'],
});
// OPEN_ORIGINS: an origin the page imports CODE from, which then makes requests of its own to
// hosts no scan of our bundle can list (esm.run serves from jsDelivr, and the runtimes it serves
// fetch their models and wasm from elsewhere). A page that reaches one keeps no policy ('network')
// until those hosts are measured.
export const OPEN_ORIGINS = Object.freeze([
	'esm.run', // voice-model.js imports kokoro-js; the Studio's on-device models import web-llm and transformers.js
]);
/** Every origin a page's code may call at run time (stage 1's name for the union). */
export const RUNTIME_ORIGINS = Object.freeze([...Object.keys(ORIGIN_DIRECTIVES), ...OPEN_ORIGINS]);
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
	'placeholder.invalid', // lib/core/subresource-csp.mjs: the base a relative URL is parsed against, never fetched
	// The video plugin's WATCH and oEmbed templates: links a reader opens, and lookups only the CLI makes.
	'www.youtube.com',
	'youtu.be',
	'vimeo.com',
	// Data-source provenance (`sourceUrl`, lib/plugins/chart-family/kinds/map/map.basemap*.json): where a bundled map came from.
	'raw.githubusercontent.com',
	'cdn.jsdelivr.net',
	// The old-browser guide's "how to update your browser" links (one per browser and store).
	'support.google.com',
	'play.google.com',
	'support.microsoft.com',
	'support.mozilla.org',
	'support.apple.com',
	'help.opera.com',
]);

// CODE THAT EVALUATES A STRING needs 'unsafe-eval', which this policy never grants, so a page
// that can reach it gets no policy. Two ways to find it: a direct `eval(` / `Function(` in the
// bundle, and modules known to do it INDIRECTLY, which no text search sees. HarfBuzz's
// Emscripten bindings (font-subset, hb-subset) build their invokers with `new Function` through
// an alias: under the policy Calco's PPTX export hung at "Embedding fonts…" (measured
// 2026-11-17; 1 s and 3 fonts without the policy). e2e/site-csp.spec.ts clicks every control on
// the library demos with a policy, which is what catches an indirect one this list lacks.
// The globalThis fallback `Function("return this")()` is excluded: it runs only where
// `globalThis` is missing, which is no browser this site supports, and counting it would quietly
// strip the policy from any page that reaches a bundled polyfill (found by review). Each exempt
// page and its reason is printed by every build, so a page that loses its policy is visible.
//
// NEVER-RUN AND CAUGHT EVALUATIONS are excluded the same way, each by its exact shape, because each
// one is in a bundle a frame page reaches and none of them evaluates anything in a supported
// browser (measured over the stage-2 build, 2026-11-17):
//   - the globalThis fallback above;
//   - the `function-bind` polyfill (`Function("binder", …)`), used only where
//     `Function.prototype.bind` is missing;
//   - JSZip's `setImmediate` polyfill, which builds a function from a STRING callback
//     (`typeof cb != "function" && (cb = Function("" + cb))`); every caller passes a function;
//   - CodeMirror's legacy Pug mode, which probes an attribute's JavaScript for syntax inside a
//     `try` (`try { return Function("", "var x " + …) }`). Under the policy the probe throws, the
//     mode catches it, and the attribute keeps its plain highlighting. The browser reports a
//     violation when someone edits Pug in the code editor; nothing else changes.
const TOLERATED_EVALS = [
	/Function\(\s*["'`]return this["'`]\s*\)/g,
	/Function\(\s*["'`]binder["'`]\s*,\s*["'`]return function \(["'`]\s*\+\s*[\w$]+\.join\(\s*["'`],["'`]\s*\)\s*\+\s*["'`]\)\{ return binder\.apply\(this,\s*arguments\); \}["'`]\s*\)/g,
	/typeof (\w+)\s*!==?\s*["'`]function["'`]\s*&&\s*\(\1\s*=\s*(?:new )?Function\(\s*(?:""|''|``)\s*\+\s*\1\s*\)\)/g,
	/try\s*\{\s*return\s+Function\(\s*(?:""|''|``)\s*,\s*["'`]var x ["'`]\s*\+\s*[\w$]+\.attrValue\b/g,
];
const DIRECT_EVAL = /new Function\(|[^.\w$]Function\(|[^.\w$]eval\(/;
export const evaluatesCode = (code) => DIRECT_EVAL.test(TOLERATED_EVALS.reduce((c, re) => c.replace(re, ''), code));
export const INDIRECT_EVAL_CHUNKS = Object.freeze([/^font-subset\./, /^hb-subset\./]);

const ORIGIN_RE = /https:\/\/([a-z0-9.-]+\.[a-z]{2,})/g;

// A module that ASSEMBLES A DOCUMENT WITH AN INLINE SCRIPT: a `<script …>` opening tag in a string,
// with no `src`, an executable type, and a body (`<script>`+js, `<script${n}>${js}`, a literal
// `<script>window.__SLIDE_W=…`, `<script type="module">…`). Written into a same-origin frame, such a
// script is refused by the inherited policy. The tag may carry interpolated attributes (the builders'
// nonce idiom bundles to `"<script"+n+">"`), so the opening tag is read up to the first `>` that is
// not inside an interpolation. A document whose own policy sits right in front of the script is a
// SANDBOX document (`sandboxCsp`, `drawFrameCsp`): it reaches its frame through the sandbox shell,
// which escapes the inheritance (lib/packages/sandbox-shell.mjs), so it is not counted. That is a
// claim about the document, not the call site: a builder that wrote such a document into a srcdoc
// would pass here and fail in the browser, where the e2e reads it.
// What this cannot see is a script made with `createElement('script')` and given text at run time;
// e2e/site-csp.spec.ts, which reads refusals out of every frame, is the guard for that shape.
const SCRIPT_OPEN = /<script(?=[\s>"'`$+])/g;
// The document the script sits in opens with its own policy: the last `<!doctype html` before it is
// followed by a CSP meta. (A module-loaded draw frame puts its import map between the two.)
const OWN_POLICY = /http-equiv=\\?["']?Content-Security-Policy/;
function ownPolicyBefore(code, at) {
	const pre = code.slice(Math.max(0, at - 2000), at);
	const doc = pre.lastIndexOf('<!doctype html');
	return doc !== -1 && OWN_POLICY.test(pre.slice(doc));
}
// Any `type` but a script type is a data block the browser never runs, an interpolated one included:
// every builder that writes `type="${…}"` writes a data envelope (lattice-doc.js, data-block.js).
const NOT_RUN_TYPE = /\btype=(?!\\?["']?(?:module\b|text\/javascript|application\/javascript))/i;
// Markup in a string starts the string, follows a tag or a line, or is spliced in; prose that names
// `<script>` follows a space ("no <script>, no <style>" in a model prompt, a lint message).
const MARKUP_BEFORE = /(?:[`"'>+]|\\n|\n)\s*$/;
export function writesInlineFrameScript(code) {
	for (const m of code.matchAll(SCRIPT_OPEN)) {
		if (!MARKUP_BEFORE.test(code.slice(Math.max(0, m.index - 3), m.index))) continue;
		// The opening tag: up to the first `>` outside an interpolation (`${…}` or a `"+x+"` splice).
		let i = m.index + 7;
		let depth = 0;
		const stop = Math.min(code.length, i + 200);
		for (; i < stop; i++) {
			const c = code[i];
			if (c === '$' && code[i + 1] === '{') depth++;
			else if (c === '}' && depth) depth--;
			else if (c === '>' && !depth) break;
		}
		if (i >= stop) continue; // not a tag (a regex, prose, a cut-off string)
		const tag = code.slice(m.index, i + 1);
		// A pattern, not markup: a `[`, `(` or `\` left once the interpolations (`${…}`, a `"+call()+"` splice),
		// escaped quotes and escaped slashes are taken out. A splice may call a function (a nonce getter).
		const bare = tag
			.replace(/\$\{[^}]*\}/g, '')
			.replace(/(["'`])\s*\+[^"'`]*?\+\s*\1/g, '')
			.replace(/\\["'`/]/g, '');
		if (/[[\\(]/.test(bare)) continue;
		if (/\bsrc=/.test(tag) || NOT_RUN_TYPE.test(tag)) continue;
		const body = code.slice(i + 1, i + 12);
		if (/^(?:<\\?\/script|`|"|')/.test(body) && !/^(?:`|"|')\s*\+/.test(body)) continue; // empty element, or the string ends
		if (!ownPolicyBefore(code, m.index)) return true;
	}
	return false;
}

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
		let sandbox = false;
		const origins = new Set();
		for (const f of seen) {
			const code = src.get(f);
			if (code.includes(SANDBOX_SHELL_FILE)) sandbox = true;
			if (writesInlineFrameScript(code)) frame = true;
			if (evaluatesCode(code) || INDIRECT_EVAL_CHUNKS.some((re) => re.test(f))) evals = true;
			for (const [, o] of code.matchAll(ORIGIN_RE)) origins.add(o);
		}
		return { frame, evals, sandbox, origins };
	};
}

/**
 * How a page is treated: `exempt` is why it gets no policy ('frame', 'eval' or 'network'), or null
 * when it gets one; `allow` maps each directive to the outside origins the page's code calls
 * (ORIGIN_DIRECTIVES), which its policy names. 'frame': a module it can load writes a same-origin
 * document with an inline script. 'eval': its code can evaluate a string as script. 'network': it
 * imports code from an OPEN origin. Throws on an origin in no list.
 */
export function classify(html, reach) {
	const { frame, evals, sandbox, origins } = reach([...html.matchAll(/\/_astro\/([^"'\s?&]+\.js)/g)].map(([, f]) => f));
	// A page that gets no policy anyway has no allowance to compute: its origins are a decision for
	// the change that gives it one.
	if (frame || evals) return { exempt: frame ? 'frame' : 'eval', allow: {} };
	const unknown = [...origins].filter((o) => !RUNTIME_ORIGINS.includes(o) && !LINK_ONLY_ORIGINS.includes(o));
	if (unknown.length) throw new Error(`code on this page names ${unknown.join(', ')}: add each to ORIGIN_DIRECTIVES, OPEN_ORIGINS or LINK_ONLY_ORIGINS in scripts/csp.mjs`);
	/** @type {Record<string, string[]>} */
	const allow = {};
	// The sandbox shell is a same-origin FILE the code-package runner and the draw host load into a
	// sandboxed frame (lib/packages/sandbox-shell.mjs), so a page that can open one needs `frame-src
	// 'self'`; a srcdoc preview is not fetched and needs nothing. Every other page keeps `'none'`.
	if (sandbox) allow['frame-src'] = ["'self'"];
	for (const o of [...origins].sort()) for (const d of ORIGIN_DIRECTIVES[o] ?? []) (allow[d] ??= []).push(`https://${o}`);
	const exempt = [...origins].some((o) => OPEN_ORIGINS.includes(o)) ? 'network' : null;
	return { exempt, allow };
}

/** Why a page gets no policy, or null when it gets one (`classify(...).exempt`). */
export function exemption(html, reach) {
	return classify(html, reach).exempt;
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

/**
 * Pages that WOULD get the policy and are held back by name, each with why. A held page that would
 * not get a policy anyway, or that no longer exists, fails the build, so the list cannot rot.
 */
export const HELD_ROUTES = Object.freeze({
	// The policy tag is about 1.05 KB (ten script hashes and the video players' frame origins), and
	// the landing page's HTML sits 52 B under its 121,924 B htmlRaw hard ceiling (measured 2026-11-19,
	// docs/scripts/check-route-budget.mjs), so the policy would put it about 1.0 KB past.
	// Raising a ceiling is the owner's call, put to them with this change; until then the page
	// keeps no policy rather than a trimmed one.
	'index.html': 'route budget: the policy would put the landing page 1.0 KB past its htmlRaw ceiling',
});

/** The fewest pages that must carry the policy (see the check in `main`). */
export const MIN_POLICY_PAGES = 198;

function main() {
	const check = process.argv.includes('--check');
	const reach = moduleGraph(DIST);
	const errors = [];
	let applied = 0;
	const exempt = { frame: 0, eval: 0, network: 0, held: 0 };
	const held = new Set();
	const named = [];
	for (const file of pages(DIST)) {
		const rel = path.relative(DIST, file);
		const html = fs.readFileSync(file, 'utf8');
		if (/<meta http-equiv="refresh"/i.test(html)) continue; // a redirect stub: no content
		const metas = html.match(META_RE) ?? [];
		let why;
		let allow;
		try {
			({ exempt: why, allow } = classify(html, reach));
		} catch (err) {
			errors.push(`${rel}: ${err.message}`);
			continue;
		}
		const key = rel.split(path.sep).join('/');
		if (Object.hasOwn(HELD_ROUTES, key)) {
			held.add(key);
			if (why) errors.push(`${key}: HELD_ROUTES holds it back, but it gets no policy anyway (${why}); remove the entry`);
			why = 'held';
		}
		if (why) {
			exempt[why]++;
			named.push(`${rel.replace(/index\.html$/, '') || '/'} (${why})`);
			// Applying is idempotent: a page that has become exempt since an earlier run loses
			// its old policy. Checking reports one, which would break the page.
			if (metas.length && !check) fs.writeFileSync(file, html.replace(META_RE, ''));
			else if (metas.length) errors.push(`${rel}: a ${why} page carries a CSP, which would break it`);
			continue;
		}
		applied++;
		if (!check) {
			fs.writeFileSync(file, withPolicy(html, allow));
			continue;
		}
		if (metas.length !== 1) {
			errors.push(`${rel}: ${metas.length} CSP meta tags (want 1)`);
			continue;
		}
		if (withPolicy(html, allow) !== html) errors.push(`${rel}: CSP hashes do not match the page's inline scripts (a step rewrote it after csp.mjs?)`);
	}
	for (const key of Object.keys(HELD_ROUTES)) if (!held.has(key)) errors.push(`${key}: HELD_ROUTES names a page the build did not produce; remove the entry`);
	// A FLOOR, so a page that silently loses its policy fails the build instead of printing one line
	// nobody reads (an exemption is computed, not declared: a new import can strip a page). Raise it
	// when a change covers more pages; lowering it is a decision a PR states.
	if (applied < MIN_POLICY_PAGES) errors.push(`only ${applied} page(s) got a policy, below the floor of ${MIN_POLICY_PAGES}: a change stripped the policy from a page (the exempt list below names each and why)`);
	if (errors.length) {
		console.error(`csp: ${errors.length} problem(s)\n  ${errors.join('\n  ')}${named.length ? `\n  exempt: ${named.join(', ')}` : ''}`);
		process.exit(1);
	}
	console.log(`csp: ${check ? 'verified' : 'applied'} a strict policy on ${applied} page(s); left without one: ${exempt.frame} that write an inline-script frame, ${exempt.eval} that evaluate code, ${exempt.network} that import from an open origin, ${exempt.held} held back by name${named.length ? ` (${named.join(', ')})` : ''}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
