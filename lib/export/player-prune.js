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
 * The player inlines the WHOLE visual contract (all 61 components) but a given deck
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
	// SVG text placement. `dominant-baseline` is the only property some chart rules
	// set at all — the `… tspan` companions that keep a wrapped label centered in
	// WebKit (#2297) — so without it here a prune could drop one of those rules and
	// the gate would see no difference. `text-anchor` is its horizontal twin and
	// was unguarded for the same reason.
	'dominant-baseline', 'text-anchor',
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

// Opt-in keep list for classes that only exist AFTER the player's JS runs, which the
// static DOM the prune matches against therefore never shows. Matched per SIMPLE
// selector, never as a substring — so `body` never keeps `.accent-body`, while
// `.anima-live` does keep `.anima-live.scene-controls-shown .scene-control`.
// :root / html / body match the real document via querySelector and need no entry.
//
// `.anima-live` — Anima's hydrate (docs/src/lib/anima/hydrate.ts) marks the figure it
// animates in place and mounts the live clone in a `.scene-live` stage. Every rule that
// sizes that stage and its control keys off `.anima-live` (scene.styles.css). Pruned,
// the live SVG fell back to the browser's 300x150 replaced size: a heatmap filling a
// 1152x424 chart body shrank to 300x169 the moment its motion mounted, and its labels
// with it.
const PLAYER_PRUNE_SAFELIST = ['.anima-live'];

// A base's simple selectors: split on combinators, commas and the parens of a functional
// pseudo (so `:where(.anima-live) p` yields `.anima-live`, not `.anima-live)`), then split
// each compound at every class / id / attribute / pseudo boundary.
// `.a.b > c[d]` → `.a`, `.b`, `c`, `[d]`.
function simpleSelectors(base) {
	return base.split(/[\s>+~,()]+/).flatMap((compound) => compound.split(/(?=[.#[:])/));
}

// The four pseudo-elements CSS 2 wrote with ONE colon. A minifier emits them that way (the
// Studio's engine bundle ships `lattice.css` minified, `::before` → `:before`), and css-tree
// parses the one-colon form as a pseudo-CLASS. Left in a base, it asks `querySelector` for
// `.x:before`, which never matches, so every `::before`/`::after` rule was pruned as unused:
// the Reading view's state markers vanished.
//
// OPT-IN (`legacyPseudoElements`), and only the fenced Reading-view sheet opts in. The player's
// own prune has the same blind spot, but fixing it there changes what an exported player keeps
// (the CLI's unminified sheet still carries KaTeX's one-colon rules, and the Studio export's
// prune could start to pass its gate), and export bytes need the owner's sign-off. It rides
// with the CLI convergence (decision 2026-09-24 §8 step 4), which owes that sign-off anyway.
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);

/** A pseudo-element node; with `legacy`, the one-colon CSS 2 spelling counts too. */
function isPseudoElement(node, legacy = true) {
	return node.type === 'PseudoElementSelector' || (legacy && node.type === 'PseudoClassSelector' && LEGACY_PSEUDO_ELEMENTS.has(node.name));
}

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
function baseSelectorString(csstree, selector, legacy = false) {
	const clone = csstree.clone(selector);
	const drop = [];
	clone.children.forEach((node, item) => {
		if (
			isPseudoElement(node, legacy) ||
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
 * `opts.legacyPseudoElements` treats one-colon `:before`/`:after`/… as pseudo-elements
 * (see LEGACY_PSEUDO_ELEMENTS for why it is opt-in).
 *
 * @param {string} css
 * @param {{ legacyPseudoElements?: boolean }} [opts]
 * @returns {string[]}
 */
function collectBaseSelectors(css, opts = {}) {
	const csstree = requireCssTree();
	if (!csstree) return [];
	const set = new Set();
	const ast = csstree.parse(css);
	csstree.walk(ast, {
		visit: 'Selector',
		enter(selector) {
			const base = baseSelectorString(csstree, selector, !!opts.legacyPseudoElements);
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
	// Safelist match is per simple selector (see simpleSelectors), never a substring —
	// so a `body` entry can't accidentally keep `.accent-body`.
	const safelisted = (base) => {
		const parts = simpleSelectors(base);
		return safelist.some((s) => base === s || parts.includes(s));
	};
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
					if (!keep(baseSelectorString(csstree, selector, !!opts.legacyPseudoElements))) dead.push(selItem);
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

// At-rules a FENCED sheet must not carry into a document it shares with an app. A selector
// fence reaches style rules only; these live in the WHOLE document's namespace or reach
// outside it, so each one is dropped, never passed through. Found by red team, 2026-09-25,
// each observed in Chromium 131 against the real kernel:
//   @font-face           a deck face named like an app family takes over the app's text, and
//                        per-glyph `unicode-range` sources beacon which characters it draws
//   @keyframes           a deck `@keyframes spin` replaces the app's own; its url()s fetch
//   @property            registers an app custom property with a deck `initial-value`
//   @counter-style, @font-feature-values   the same global-name shape
//   @layer               a statement would declare layer names in the app's cascade (HARD
//                        RULE #26: engine CSS layers nothing); a BLOCK is unwrapped instead,
//                        so an author's layered rules survive, fenced
//   @import @page @charset @namespace      fetch, or apply to the whole document
// What a chart loses is motion and deck-only faces: a figure keeps its paint and falls back to
// the app's own copy of the family where the app has one (the site self-hosts the deck faces).
const SCOPED_DROP_ATRULES = new Set([
	'font-face', 'keyframes', '-webkit-keyframes', 'property', 'counter-style', 'font-feature-values',
	'layer', 'import', 'page', 'charset', 'namespace',
]);

// A declaration that names a REMOTE resource. The Studio's top-level document carries no
// subresource CSP (the preview iframe and every export do, lib/core/subresource-csp.mjs), so in
// this sheet a deck `url()` would fetch from the app's origin the moment the view opens.
// Each `url()` argument and each quoted string is judged as ONE unit, from its start: a remote
// one opens with a scheme and `//`, or with a bare `//`. Judged as text, the engine's own mark
// tokens would fall, because a `data:image/svg+xml` url carries `xmlns='http://www.w3.org/…'`
// inside it. `data:` and relative urls (same-origin) survive.
const URL_OR_STRING_RE = /(["'])((?:\\[\s\S]|(?!\1)[^\\])*)\1|url\(\s*([^"'\s)][^)]*)\)/gi;
function namesRemoteResource(valueText) {
	for (const m of valueText.matchAll(URL_OR_STRING_RE)) {
		const ref = (m[2] !== undefined ? m[2] : m[3] || '').trim();
		if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(ref)) return true;
	}
	return false;
}

/**
 * The deck stylesheet for slide content re-hosted inside ANOTHER app's document: pruned to
 * the rules the content uses, then fenced so no deck rule can reach the app around it. Built
 * for the Studio's Reading view, which renders Read · Article in the app's top-level document
 * on purpose (reader-mode tools read only the top level), and so cannot take the player's
 * whole-document sheet (engineering/decisions/2026-09-24-one-style-delivery-spine.md §7 fork
 * 2, §8 step 3).
 *
 * - `css` is the engine's FLAT pack with the `article.lattice > ` wrapper already stripped.
 * - Named definitions (`@font-face`, `@keyframes`, `@property`, …) and any declaration naming
 *   a remote resource are DROPPED, because no selector fence can hold them: see
 *   SCOPED_DROP_ATRULES and `namesRemoteResource` above for what each one did when it was let through.
 * - `isUsed(base)` is the host's authoritative match against the content's real DOM, as for
 *   `prunePlayerCss`.
 * - Every selector S becomes `:where(<root>) S:where(<within>, <within> *)`: its subject must
 *   sit inside the article root AND be a figure or inside one, so the app's prose and chrome
 *   match nothing. Both wrappers are `:where()`, so no rule's specificity moves.
 * - `:root` becomes `<within>` (a class, so the same (0,1,0)): the palette tokens land on each
 *   figure, not on the app's `<html>`, and the app's prose keeps the app's own colors.
 * - Each figure gets the deck's body ink (`color:var(--text-body)`, as the player's article
 *   root sets it), and `opts.colorScheme` pins `color-scheme` on it, so the pack's
 *   `light-dark()` resolves to the deck's mode rather than the app's.
 *
 * WHY NOT `@scope`. It was the first draft, and it cannot work here: inside `@scope (R)` a
 * selector with no `:scope` in it is read as a DESCENDANT of R, so the re-host arms, which
 * all start at the figure (`figure.chart-frame .chart-status`), could never match with the
 * figure as R. Measured in Chromium 131: every chart painted black.
 *
 * FAILS CLOSED. The player's prune falls back to the FULL sheet on any doubt, which is right
 * for a standalone file. Here the full sheet would be ~0.8 MB of unfenced deck CSS inside the
 * app, so any failure returns `applied: false` and an empty sheet: the figures lose their
 * paint (what this view shipped before), and the app is never restyled.
 *
 * @param {string} css
 * @param {(base: string) => boolean} isUsed
 * @param {{ root: string, within: string, colorScheme?: 'light'|'dark', safelist?: string[] }} opts
 * @returns {{ css: string, applied: boolean, totalRules: number, keptRules: number }}
 */
function scopeReHostedCss(css, isUsed, opts) {
	const none = { css: '', applied: false, totalRules: 0, keptRules: 0 };
	const csstree = requireCssTree();
	if (!csstree || !opts?.root || !opts.within) return none;
	const pruned = prunePlayerCss(css, isUsed, { ...opts, legacyPseudoElements: true });
	if (!pruned.applied) return none;
	try {
		const prefix = csstree.parse(`:where(${opts.root}) x`, { context: 'selector' }).children;
		const suffix = csstree.parse(`:where(${opts.within}, ${opts.within} *)`, { context: 'selector' }).children.first;
		const withinNodes = csstree.parse(opts.within, { context: 'selector' }).children;
		const ast = csstree.parse(pruned.css);
		csstree.walk(ast, {
			visit: 'Rule',
			enter(rule) {
				if (!rule.prelude || rule.prelude.type !== 'SelectorList') return;
				if (this.atrule && /keyframes$/i.test(this.atrule.name)) return;
				rule.prelude.children.forEach((selector) => {
					const kids = selector.children;
					// `:root` → the figure. Only a TOP-LEVEL `:root` compound: one nested in
					// `:is()`/`:not()` keeps its meaning and simply matches nothing here.
					kids.forEach((node, item) => {
						if (node.type === 'PseudoClassSelector' && node.name === 'root') {
							withinNodes.forEach((w) => {
								kids.insert(kids.createItem(csstree.clone(w)), item);
							});
							kids.remove(item);
						}
					});
					// The suffix goes on the SUBJECT compound, before its FIRST pseudo-element:
					// nothing but a pseudo-element's own user-action pseudo-classes may follow one,
					// so `.x::-webkit-scrollbar-thumb:hover` fenced after the `:hover` would be an
					// invalid selector, and in a list it would void its neighbors with it.
					let at = null;
					for (let it = kids.tail; it && it.data.type !== 'Combinator'; it = it.prev) {
						if (isPseudoElement(it.data)) at = it;
					}
					const s = kids.createItem(csstree.clone(suffix));
					if (at) kids.insert(s, at);
					else kids.append(s);
					// The prefix: `:where(<root>)` and a descendant combinator, in front.
					const head = kids.head;
					prefix.forEach((node) => {
						if (node.type === 'TypeSelector' && node.name === 'x') return;
						kids.insert(kids.createItem(csstree.clone(node)), head);
					});
				});
			},
		});
		// Drop every declaration naming a remote resource, wherever it sits.
		csstree.walk(ast, {
			visit: 'Declaration',
			enter(decl, item, list) {
				if (list && namesRemoteResource(csstree.generate(decl.value))) list.remove(item);
			},
		});
		// Drop the global-namespace at-rules at ANY depth (an `@keyframes` inside `@media` is
		// still document-global). A `@layer` BLOCK is unwrapped rather than dropped: its rules
		// are style rules the fence already holds, and only the layer name is global.
		csstree.walk(ast, {
			visit: 'Atrule',
			leave(atrule, item, list) {
				if (!list) return;
				const name = atrule.name.toLowerCase();
				if (name === 'layer' && atrule.block) {
					atrule.block.children.forEach((child) => {
						list.insert(list.createItem(child), item);
					});
					list.remove(item);
				} else if (SCOPED_DROP_ATRULES.has(name)) list.remove(item);
			},
		});
		const rules = [];
		ast.children.forEach((node) => {
			rules.push(csstree.generate(node));
		});
		// The figure's BASE: the deck's body ink (the player's article root sets the same
		// `color:var(--text-body)`, and a slide gets it from the theme), so chart text inherits
		// the deck's ink and not the app's prose color. And the deck's `color-scheme`.
		const mode = opts.colorScheme === 'dark' || opts.colorScheme === 'light' ? `;color-scheme:${opts.colorScheme}` : '';
		const scheme = `:where(${opts.root}) ${opts.within}{color:var(--text-body)${mode}}`;
		return {
			css: scheme + rules.join(''),
			applied: true,
			totalRules: pruned.totalRules,
			keptRules: pruned.keptRules,
		};
	} catch {
		return none;
	}
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
	scopeReHostedCss,
};
