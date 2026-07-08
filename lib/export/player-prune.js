/**
 * lib/export/player-prune.js
 *
 * The used-selector CSS prune + used-family FONT prune KERNEL for the self-contained
 * `.html` player. Extracted from html-player.js so BOTH hosts share one source
 * (HARD RULE #1): the CLI emulator drives it in a headless Chromium page
 * (lattice-emulator.js › prunePlayerCssInPage), and the Studio drives the SAME kernel
 * against an offscreen full-deck iframe (docs/src/…/player-prune-browser.ts, via the
 * bundled player-prune.generated.js).
 *
 * CommonJS so it re-exports cleanly into the CJS html-player adapter AND bundles for
 * the browser with esbuild (css-tree has a `browser` build the bundler resolves). The
 * functions are pure except for the optional `css-tree` require — absent → pruning is
 * skipped and the full CSS ships (never a hard failure on a frozen artifact).
 *
 * The player inlines the WHOLE visual contract (all 53 components) but a given deck
 * uses a handful. Dropping the rules whose selectors match no element in the baked DOM
 * is the last size lever toward the "Minimal" tier — and the riskiest, because a
 * wrongly-dropped rule breaks a FROZEN file silently. Two guards make it safe:
 * (1) matching is AUTHORITATIVE — the host answers `isUsed` with real-DOM
 * `querySelector` against the union of all three view-DOMs, not a token heuristic;
 * (2) the host gates the result behind a computed-style diff (GATE_PROPS, below) and
 * falls back to the full CSS on any mismatch.
 */

// The computed-style properties the host's prune GATE compares (full CSS vs pruned,
// across all three views + ::before/::after) — a single shared list so the CLI and
// browser gates check exactly the same surface. A diff on any of these rejects the
// CSS prune and ships the full stylesheet.
const GATE_PROPS = [
	'display', 'position', 'top', 'left', 'right', 'bottom', 'z-index', 'float',
	'color', 'background-color', 'background-image', 'background-size', 'background-position',
	'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
	'text-align', 'text-transform', 'text-decoration-line', 'white-space', 'vertical-align',
	'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
	'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'box-sizing',
	'flex-grow', 'flex-shrink', 'flex-basis', 'flex-direction', 'flex-wrap',
	'grid-template-columns', 'grid-template-rows', 'gap', 'align-items', 'justify-content', 'justify-items',
	'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
	'border-top-color', 'border-radius', 'border-style', 'opacity', 'transform', 'overflow',
	'content', 'aspect-ratio', 'order', 'grid-column', 'grid-row',
];

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
 * Every distinct base selector in `css` (deduped) — the host tests each against
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
 * authoritative predicate (real-DOM `querySelector` from the host). At-rules ride
 * along: @font-face / @keyframes / @page / @layer / @import are always kept, and
 * @media / @container / @supports keep only their surviving inner rules (an emptied
 * block is dropped). A rule with several selectors keeps only the members that match.
 * css-tree absent OR any parse error → the full CSS is returned unchanged (never a
 * hard failure on a frozen artifact).
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
 * for nothing. `usedFamilies` is authoritative — the host collects it from the real
 * render (every face the browser actually loaded, UNION every family named in an
 * element's computed `font-family`), so a deck that genuinely uses `sketch` keeps
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
	GATE_PROPS,
	DYNAMIC_PSEUDO_CLASSES,
	DYNAMIC_PSEUDO_RE,
	PLAYER_PRUNE_SAFELIST,
	baseSelectorString,
	collectBaseSelectors,
	prunePlayerCss,
	normalizeFamily,
	prunePlayerFontFaces,
};
