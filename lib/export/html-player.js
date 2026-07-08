/**
 * lib/export/html-player.js
 *
 * The Node ADAPTER for the self-contained `.html` PLAYER
 * (engineering/decisions/2026-07-07-html-lattice-player.md, and the extraction in
 * 2026-07-08-studio-html-player-export.md). The browser-safe ASSEMBLY logic lives
 * in the pure `player-core.mjs`; this file supplies the Node-locked capabilities it
 * needs — jsdom parse, DOMPurify sanitize, `crypto` sha256, `fs` image inlining,
 * KaTeX `fs` read, `subset-font` — and owns the post-assembly PRUNE kernel the
 * emulator drives in Chromium (kept adapter-side: the Studio prunes against its
 * live preview iframe instead).
 *
 * `buildPlayerHtml`'s output is BYTE-IDENTICAL to before the core was extracted
 * (golden-pinned in test/unit/export/html-player.test.js), so the shipped CLI
 * player (#798–#824) does not move a byte.
 *
 * CommonJS (lib/export convention, beside pptx-export.js). `async` because the
 * core + sanitizer are ESM (dynamic import) and it reads asset bytes off disk.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fileURLToPath } = require('node:url');

const MIME = {
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
};

/** Read a local file and return a data: URI, or null if unreadable. */
function fileToDataUri(absPath) {
	try {
		const ext = path.extname(absPath).toLowerCase();
		const mime = MIME[ext] || 'application/octet-stream';
		const buf = fs.readFileSync(absPath);
		if (ext === '.svg') {
			// SVG inlines smaller as utf8;charset with minimal percent-encoding than base64.
			const enc = encodeURIComponent(buf.toString('utf8')).replace(/%20/g, ' ');
			return `data:${mime};charset=utf-8,${enc}`;
		}
		return `data:${mime};base64,${buf.toString('base64')}`;
	} catch {
		return null;
	}
}

/**
 * Replace every `file://…` URL in the document (in `<img src>` and CSS
 * `url('file://…')`) with a data: URI. Returns the rewritten HTML and a list of
 * assets that could not be inlined (the honesty report).
 *
 * TRUST BOUNDARY: this reads arbitrary local files a `file://` URL names and bakes
 * their bytes into the shared file. That is BENIGN for the CLI (an author baking
 * their OWN deck on their OWN machine — they already have those files). It would be a
 * disclosure vector if this exporter is ever run SERVER-SIDE on an UNTRUSTED deck
 * (`<img src="file:///etc/passwd">`): a hosted bake path must first gate `file://`
 * inlining to an allowlisted asset root under the deck directory.
 */
function inlineFileUrls(html) {
	const missing = [];
	const inlinedUrls = new Set();
	const seen = new Map();
	const inline = (fileUrl) => {
		if (seen.has(fileUrl)) return seen.get(fileUrl);
		let abs;
		try {
			abs = fileURLToPath(fileUrl.split(/[?#]/)[0]);
		} catch {
			missing.push(fileUrl);
			return null;
		}
		const uri = fileToDataUri(abs);
		if (uri) inlinedUrls.add(fileUrl);
		else missing.push(fileUrl);
		seen.set(fileUrl, uri);
		return uri;
	};
	// `<img src="file://…">` ONLY (matched as a whole img tag): NOT stylesheet <link>
	// hrefs (data: link trips style-src CSP) and NOT <script src> (removed wholesale by
	// the jsdom pass — never inlined, never regex-"sanitized" here).
	let out = html.replace(/(<img\b[^>]*?\bsrc=)(["'])(file:\/\/[^"']+)\2/gi, (m, pre, q, url) => {
		const uri = inline(url);
		return uri ? `${pre}${q}${uri}${q}` : m;
	});
	// CSS `url(file://…)` / `url('file://…')` inside inline style attrs and <style>.
	out = out.replace(/url\((["']?)(file:\/\/[^)"']+)\1\)/gi, (m, q, url) => {
		const uri = inline(url);
		return uri ? `url(${q}${uri}${q})` : m;
	});
	return { html: out, missing, count: inlinedUrls.size };
}

/**
 * Assemble the self-contained player HTML (the CLI path). Delegates the browser-safe
 * assembly to the pure `player-core.mjs`, injecting the Node-locked capabilities.
 *
 * @param {object} opts  — see player-core.assemblePlayer's `data` (docHtml, source,
 *   title, theme, config, notes, now, build, playerVersion).
 * @returns {Promise<{ html: string, report: { images: number, missing: string[], strippedScripts: string[], math: boolean, fontBytesSaved: number, subsetApplied: boolean } }>}
 */
async function buildPlayerHtml(opts) {
	const { assemblePlayer } = await import('./player-core.mjs');
	const { JSDOM } = require('jsdom');
	const DOMPurify = require('dompurify');
	const { createSlideSanitizer } = await import('../core/sanitize-slide-html.mjs');
	// A dedicated jsdom window backs the DOMPurify sanitizer. `sanitize` is a pure
	// string→string transform (DOMPurify parses the input into its OWN document), so a
	// standalone window yields byte-identical output to the pre-extraction code, which
	// shared the parse window. The golden test pins that identity.
	const sanitize = createSlideSanitizer(DOMPurify, new JSDOM('').window);
	return assemblePlayer(opts, {
		parseHtml: (html) => new JSDOM(html).window.document,
		sanitize,
		sha256: async (s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64'),
		inlineAssets: inlineFileUrls,
		// Raw katex.min.css off disk (core minifies + inlines only when the deck has
		// math); null when unresolvable/unreadable → the core drops the link + reports it.
		katexCss: () => {
			try {
				return fs.readFileSync(require.resolve('katex/dist/katex.min.css'), 'utf8');
			} catch {
				return null;
			}
		},
		subsetFonts: subsetEmbeddedFonts,
	});
}

/**
 * Rewrite each embedded `@font-face` `data:font/woff2` to a glyph subset covering
 * only the characters the shipped file could ever show. OPTIONAL: if `subset-font`
 * isn't installed the file ships with full fonts (today's behavior) — never a hard
 * failure. Emoji are unaffected: they render via the recipient's SYSTEM emoji font
 * (no emoji font is embedded), so they were never in these text faces.
 *
 * @param {string} html the assembled player HTML
 * @returns {Promise<{ html: string, applied: boolean, saved: number }>}
 */
async function subsetEmbeddedFonts(html) {
	let subsetFont;
	try {
		subsetFont = require('subset-font');
	} catch {
		return { html, applied: false, saved: 0 }; // optional dep absent — ship full fonts
	}
	// The character set = EVERY distinct character in the whole document — visible
	// slide/article/chrome text AND the player-JS glyph literals (e.g. the ☀ that
	// only appears after a dark-toggle) AND attributes. Collected by CODE POINT (the
	// string iterator, so a surrogate-pair emoji stays one entry) — over-inclusive
	// on purpose: an unused char costs ~nothing, a missing one is permanent tofu.
	const chars = [...new Set(html)].join('');
	const re = /url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g;
	const uniq = [...new Set([...html.matchAll(re)].map((m) => m[1]))];
	const map = new Map();
	let saved = 0;
	for (const b64 of uniq) {
		try {
			const full = Buffer.from(b64, 'base64');
			const sub = await subsetFont(full, chars, { targetFormat: 'woff2' });
			const subB64 = sub.toString('base64');
			// Only accept a subset that is actually smaller (a corrupt/parse edge could
			// grow it); otherwise keep the full face.
			if (subB64.length < b64.length) {
				saved += b64.length - subB64.length;
				map.set(b64, subB64);
			}
		} catch {
			/* per-face failure — keep the full face, no tofu */
		}
	}
	if (map.size === 0) return { html, applied: false, saved: 0 };
	const out = html.replace(re, (m, b64) => (map.has(b64) ? `url(data:font/woff2;base64,${map.get(b64)})` : m));
	return { html: out, applied: true, saved };
}

// ── used-selector CSS pruning (P6) ───────────────────────────────────────────
// The player inlines the WHOLE visual contract (all 53 components) but a given
// deck uses a handful. Dropping the rules whose selectors match no element in the
// baked DOM is the last size lever toward the "Minimal" tier — and the riskiest,
// because a wrongly-dropped rule breaks a FROZEN file silently. Two guards make it
// safe: (1) matching is AUTHORITATIVE — the emulator answers `isUsed` with real
// Chromium `querySelector` against the union of all three view-DOMs, not a token
// heuristic; (2) the emulator gates the result behind a computed-style diff and
// falls back to the full CSS on any mismatch (see the --player wiring). Slide
// content is fully STATIC in the player (no overflow watcher, no in-slide runtime
// state), and the runtime-toggled chrome classes (lp-active / lp-on / data-lp-view)
// live in the un-pruned playerCss block — so the static union DOM is complete.
//
// The prune stays ADAPTER-owned (not in player-core): it needs `css-tree` loaded via
// `require` (optional, graceful skip) and a real-DOM matcher, both of which differ by
// host — the Studio (P2) prunes against its live preview iframe with the same kernel.

// Pseudo-classes a static `querySelector` can never satisfy — stripped to the
// structural BASE before matching, so `.btn:hover` rides with `.btn` and a
// `::before` decoration rides with its subject. Structural pseudos that
// querySelector CAN evaluate (:not/:is/:where/:has/:nth-*/:first-child/:root/…)
// are deliberately NOT here — they stay in the base and get matched for real.
const DYNAMIC_PSEUDO_CLASSES = new Set([
	'hover', 'focus', 'focus-visible', 'focus-within', 'active', 'target', 'visited',
	'link', 'checked', 'enabled', 'disabled', 'indeterminate', 'default', 'required',
	'optional', 'valid', 'invalid', 'in-range', 'out-of-range', 'read-only', 'read-write',
	'placeholder-shown', 'autofill', 'user-invalid', 'user-valid', 'current', 'past', 'future',
]);

// A dynamic pseudo can also hide NESTED inside a functional pseudo-class —
// `.a:is(.b:hover)`, `.a:has(:focus-within)` — where `baseSelectorString` (which
// strips only top-level pseudos) leaves it in the base. Such a base can never match
// the static DOM (`querySelector(':is(.b:hover)')` → null), so the rule would be
// FALSE-DROPPED and the computed-style gate can't catch it (it never enters an
// interaction state). So: if the base STILL carries a dynamic pseudo, force-keep the
// rule. Zero occurrences in today's lattice.css, but frozen files exported after a
// future `:has(:hover)` lands must not silently break.
const DYNAMIC_PSEUDO_RE = new RegExp(`:(?:${[...DYNAMIC_PSEUDO_CLASSES].join('|')})(?![-\\w])`, 'i');

// Optional opt-in keep list (whole-token match on the base, never a substring — so
// `body` never keeps `.accent-body`). Empty by default: :root / html / body all
// match the real document via querySelector, so they need no special-casing; this
// is the hook for a future runtime-injected class the static DOM wouldn't show.
const PLAYER_PRUNE_SAFELIST = [];

function requireCssTree() {
	try {
		return require('css-tree');
	} catch {
		return null; // optional dep absent — pruning is skipped, full CSS ships
	}
}

/**
 * Reduce ONE css-tree Selector node to its static base string: pseudo-elements and
 * dynamic pseudo-classes removed, everything structural (classes, attributes,
 * combinators, :not/:is/:has, …) kept. Returns '' when nothing structural remains
 * (e.g. a bare `::backdrop`) — the caller treats '' as keep-on-doubt.
 */
function baseSelectorString(csstree, selector) {
	const clone = csstree.clone(selector);
	const drop = [];
	clone.children.forEach((node, item) => {
		if (
			node.type === 'PseudoElementSelector' ||
			(node.type === 'PseudoClassSelector' && DYNAMIC_PSEUDO_CLASSES.has(node.name))
		) {
			drop.push(item);
		}
	});
	for (const item of drop) clone.children.remove(item);
	// A dangling leading/trailing combinator left by the removal (rare) would make
	// an invalid selector — trim to be safe.
	return csstree.generate(clone).replace(/^[\s>+~]+|[\s>+~]+$/g, '').trim();
}

/**
 * Every distinct base selector in `css` (deduped) — the emulator tests each against
 * the real rendered DOM and hands back the used set for {@link prunePlayerCss}.
 * Returns [] if css-tree isn't installed (→ caller keeps the full CSS).
 *
 * @param {string} css
 * @returns {string[]}
 */
function collectBaseSelectors(css) {
	const csstree = requireCssTree();
	if (!csstree) return [];
	const set = new Set();
	const ast = csstree.parse(css);
	csstree.walk(ast, {
		visit: 'Selector',
		enter(selector) {
			const base = baseSelectorString(csstree, selector);
			if (base) set.add(base);
		},
	});
	return [...set];
}

/**
 * Drop every style rule whose selectors all match nothing. `isUsed(base)` is the
 * authoritative predicate (real-DOM `querySelector` from the emulator). At-rules
 * ride along: @font-face / @keyframes / @page / @layer / @import are always kept,
 * and @media / @container / @supports keep only their surviving inner rules (an
 * emptied block is dropped). A rule with several selectors keeps only the members
 * that match. css-tree absent OR any parse error → the full CSS is returned
 * unchanged (never a hard failure on a frozen artifact).
 *
 * @param {string} css
 * @param {(base: string) => boolean} isUsed
 * @param {{ safelist?: string[] }} [opts]
 * @returns {{ css: string, applied: boolean, totalRules: number, keptRules: number }}
 */
function prunePlayerCss(css, isUsed, opts = {}) {
	const csstree = requireCssTree();
	if (!csstree) return { css, applied: false, totalRules: 0, keptRules: 0 };
	const safelist = opts.safelist || PLAYER_PRUNE_SAFELIST;
	// Safelist match is whole-token (split the base on combinators/commas), never a
	// substring — so a `body` entry can't accidentally keep `.accent-body`.
	const safelisted = (base) => safelist.some((s) => base === s || base.split(/[\s>+~,]+/).includes(s));
	const keep = (base) =>
		!base || DYNAMIC_PSEUDO_RE.test(base) || safelisted(base) || isUsed(base);
	let total = 0;
	let kept = 0;
	try {
		const ast = csstree.parse(css);
		// Pass 1 — prune selectors inside every style Rule; mark fully-dead rules.
		csstree.walk(ast, {
			visit: 'Rule',
			enter(rule, item, list) {
				if (!rule.prelude || rule.prelude.type !== 'SelectorList') return;
				// A rule INSIDE @keyframes has `from`/`to`/`50%` preludes that parse as a
				// SelectorList but are NOT document selectors — never prune them, or the
				// whole animation is silently dropped.
				if (this.atrule && /keyframes$/i.test(this.atrule.name)) return;
				total++;
				const dead = [];
				rule.prelude.children.forEach((selector, selItem) => {
					if (!keep(baseSelectorString(csstree, selector))) dead.push(selItem);
				});
				const survivors = rule.prelude.children.size - dead.length;
				if (survivors === 0) {
					list.remove(item); // whole rule is dead
					return;
				}
				for (const selItem of dead) rule.prelude.children.remove(selItem);
				kept++;
			},
		});
		// Pass 2 — drop at-rule blocks (@media/@container/@supports) emptied by pass 1.
		csstree.walk(ast, {
			visit: 'Atrule',
			enter(atrule, item, list) {
				if (atrule.block?.children.isEmpty) list.remove(item);
			},
		});
		return { css: csstree.generate(ast), applied: true, totalRules: total, keptRules: kept };
	} catch {
		return { css, applied: false, totalRules: total, keptRules: kept };
	}
}

/** Normalize a CSS font-family token for comparison: strip quotes + trim. */
function normalizeFamily(name) {
	return String(name).trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * Drop the embedded `@font-face` faces whose family the deck never uses. The player
 * embeds the WHOLE type stack (display serif, body sans, mono, AND the two `sketch`
 * hand faces) regardless of the deck; a boardroom deck ships the ~267 KB sketch pair
 * for nothing. `usedFamilies` is authoritative — the emulator collects it from the
 * real render (every face the browser actually loaded, UNION every family named in
 * an element's computed `font-family`), so a deck that genuinely uses `sketch` keeps
 * Caveat + Shantell; a deck that doesn't, drops them. Family-level by design: if a
 * family is used at all, ALL its weights/italics ride along (no weight surprise).
 *
 * SAFETY: keep-on-doubt everywhere. A face whose family can't be parsed is kept; an
 * EMPTY `usedFamilies` (detection failed) keeps everything (never strand a deck with
 * no fonts). Returns { css, applied, total, kept }.
 *
 * @param {string} fontCss  the `#lattice-embedded-fonts` block body (@font-face rules)
 * @param {Set<string>|string[]} usedFamilies  normalized family names actually used
 */
function prunePlayerFontFaces(fontCss, usedFamilies) {
	// Case-folded compare: CSS family matching is ASCII case-insensitive, so a theme
	// that authors a family in non-canonical case must still match its face.
	const fold = (s) => normalizeFamily(s).toLowerCase();
	const used = new Set([...usedFamilies].map(fold));
	if (used.size === 0) return { css: fontCss, applied: false, total: 0, kept: 0 };
	const faces = fontCss.match(/@font-face\s*\{[^}]*\}/gi) || [];
	if (faces.length === 0) return { css: fontCss, applied: false, total: 0, kept: 0 };
	let kept = 0;
	const out = faces
		.filter((face) => {
			const m = face.match(/font-family\s*:\s*([^;}]+)/i);
			if (!m) return true; // unparseable family → keep (never drop on doubt)
			const keep = used.has(fold(m[1]));
			if (keep) kept++;
			return keep;
		})
		.join('');
	// If nothing would be dropped, report not-applied (no rewrite needed). And if
	// NOTHING matched (kept 0) — a used-set that names no embedded family — treat it
	// as a detection failure and keep every face, never strand the deck fontless.
	if (kept === faces.length || kept === 0) return { css: fontCss, applied: false, total: faces.length, kept };
	return { css: out, applied: true, total: faces.length, kept };
}

module.exports = {
	buildPlayerHtml,
	inlineFileUrls,
	fileToDataUri,
	subsetEmbeddedFonts,
	collectBaseSelectors,
	prunePlayerCss,
	baseSelectorString,
	prunePlayerFontFaces,
	normalizeFamily,
	PLAYER_PRUNE_SAFELIST,
};
