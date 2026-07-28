// Last-slide snapshot cache — so a RETURNING Studio visitor sees their real last
// slide at first paint instead of a blank screen while the app hydrates + the
// engine loads (front A only bakes the NEWCOMER slide at build time; a returning
// user's deck lives in localStorage, invisible to the build). On leaving the
// Studio we snapshot the live preview — the fully-rendered slide HTML plus JUST
// the CSS it uses, pulled from the iframe's already-parsed CSSOM — and stash it;
// studio.astro's pre-paint replay script paints it into the instant-shell next
// visit. See engineering/decisions/2026-07-11-preview-performance-diagnosis.md (front A).
//
// WHY CSSOM, not css-tree: the build-time extractor (docs/scripts/critical-css.mjs)
// parses the sheet with css-tree — too heavy to ship to the browser. Here the theme
// sheet is ALREADY parsed inside the preview iframe, so we walk its live CSSOM and
// keep the rules whose selectors match the rendered slide — native, allocation-cheap,
// and it captures runtime-drawn content (chart SVGs) as static HTML for free.

import { sanitizeSlideHtml } from '../lib/sanitize-slide-html.js';

export const SNAPSHOT_KEY = 'lattice-studio-last-slide';
// The Playground's OWN key — a SEPARATE store from the Studio's. The two surfaces
// snapshot different things (the Studio a single-slide DeckPreview keyed by deckId;
// the Playground the FIRST section of a multi-slide filmstrip keyed by a source
// hash), so a shared key would let one surface's replay try to paint the other's
// snapshot. See engineering/decisions/2026-07-11-preview-performance-diagnosis.md.
export const PG_SNAPSHOT_KEY = 'lattice-docs-pg-last-slide';
// The Playground instant-shell box (playground.astro / playground.css). The captured
// CSS is scoped under this so it's inert everywhere else in the top document.
export const PG_SHELL_SCOPE = '.pg-ssr-shell';
// UTF-16 code-unit cap (localStorage stores UTF-16, ~2 bytes/unit, so this is
// ~480KB on disk — comfortably inside a ~5MB origin quota, latest-only).
const MAX_UNITS = 240 * 1024;

// Pseudo-classes/elements the live document can't be asked to match; strip them so
// the STRUCTURAL selector still tests, and keep the rule if what remains matches.
const STRIP_PSEUDO =
	/::[a-z-]+(\([^)]*\))?|:(hover|focus|focus-within|focus-visible|active|visited|target|checked|disabled|enabled|first-child|last-child|only-child|first-of-type|last-of-type|nth-child\([^)]*\)|nth-of-type\([^)]*\)|not\([^)]*\)|is\([^)]*\)|where\([^)]*\)|has\([^)]*\))/gi;

function selectorMatches(doc, selectorText) {
	const probe = selectorText.replace(STRIP_PSEUDO, '').replace(/\s+/g, ' ').trim();
	if (!probe || probe === '*') return true;
	try {
		return !!doc.querySelector(probe);
	} catch {
		return true; // a selector the engine can't evaluate → keep (conservative)
	}
}

// Split a selector LIST on its top-level commas only — a comma inside `:is(…)` /
// `:where(…)` / `[attr="a,b"]` is NOT a separator (naive `.split(',')` shreds them).
function splitTopLevelCommas(sel) {
	const out = [];
	let depth = 0;
	let cur = '';
	for (const ch of sel) {
		if (ch === '(' || ch === '[') depth++;
		else if (ch === ')' || ch === ']') depth--;
		else if (ch === ',' && depth === 0) {
			out.push(cur);
			cur = '';
			continue;
		}
		cur += ch;
	}
	if (cur.trim()) out.push(cur);
	return out;
}

// Prefix ONE selector with a scope. A root-ish leading compound (`html` / `body` /
// `:root`, with any attribute/pseudo qualifiers) is REPLACED by the scope so its
// declarations — crucially the theme's `:root[data-palette]` token block, but also
// the frame's `body{background;flex}` — re-target onto the shell box instead of
// leaking onto the TOP document's real html/body (which would repaint the page and
// break its layout). Every other selector is scoped as a descendant.
const ROOT_COMPOUND = /^(?:html|body|:root)(?:\[[^\]]*\]|[.:#][\w-]+|\([^)]*\))*/i;
function scopeSelector(sel, scope) {
	const s = sel.trim();
	const m = ROOT_COMPOUND.exec(s);
	if (m) return scope + s.slice(m[0].length); // ':root[..] .lattice' → '<scope> .lattice'; ':root[..]' → '<scope>'
	return `${scope} ${s}`;
}

// Recursively collect the CSS the slide can use. Style rules are kept when a
// selector matches; @font-face/@keyframes/@property/@import are kept whole;
// grouping rules (@media/@container/@supports/@layer{…}) recurse and are dropped
// when nothing inside survives. Mirrors critical-css.mjs's pruneBlock, on the CSSOM.
// When `scope` is set (the Playground path), every kept style rule is scoped under it
// so the snapshot CSS is inert outside the instant-shell — the Studio path passes no
// scope and keeps the historical unscoped output (its shell is a full-page overlay).
function collectRules(rules, doc, out, scope) {
	for (const rule of rules) {
		// @import — DROP. The snapshot CSS is injected into the TOP document (not the
		// sandboxed preview iframe); a replayed @import would fetch an arbitrary external
		// sheet on the main origin. The engine inlines all faces/tokens, so a real slide
		// never depends on one — dropping it closes an injection vector (red-team finding).
		if (rule.type === 3) continue;
		if (rule.selectorText !== undefined && rule.style) {
			// CSSStyleRule
			const parts = splitTopLevelCommas(rule.selectorText).filter((s) => selectorMatches(doc, s));
			if (!parts.length) continue;
			if (scope) out.push(`${parts.map((s) => scopeSelector(s, scope)).join(',')}{${rule.style.cssText}}`);
			else out.push(rule.cssText);
		} else if (rule.type === 5 || rule.type === 7 || (rule.constructor && rule.constructor.name === 'CSSPropertyRule')) {
			// @font-face (5) · @keyframes (7) · @property — position-independent, keep whole
			out.push(rule.cssText);
		} else if (rule.cssRules) {
			// @media/@container/@supports/@layer{…} — recurse; keep only if non-empty
			const inner = [];
			collectRules(rule.cssRules, doc, inner, scope);
			if (inner.length) {
				const head = rule.cssText.slice(0, rule.cssText.indexOf('{'));
				out.push(`${head}{${inner.join('')}}`);
			}
		} else {
			out.push(rule.cssText); // @layer statement / anything else — keep
		}
	}
}

/** Critical CSS for the rendered slide in `doc`, from the live CSSOM. `scope`, when
 *  given, confines every rule under that selector (the Playground instant-shell). */
export function extractCriticalFromDoc(doc, scope) {
	const out = [];
	for (const sheet of doc.styleSheets) {
		try {
			collectRules(sheet.cssRules, doc, out, scope);
		} catch {
			/* a sheet we can't read (shouldn't happen for same-origin srcdoc) — skip */
		}
	}
	return out.join('\n');
}

/**
 * Snapshot the fully-rendered slide in a live preview iframe.
 * @returns {{v:1,deckId:string,slideIndex:number,html:string,css:string,w:number,h:number,palette:string,mode:string,ts:number}|null}
 */
export function captureFromFrame(frame, meta) {
	try {
		const doc = frame?.contentDocument;
		const lattice = doc?.querySelector('.lattice');
		if (!lattice) return null;
		// SANITIZE AT THE CHOKEPOINT (#22): the replay injects this HTML into the TOP
		// document (not a sandboxed iframe), and for a returning user it derives from
		// whatever deck they last viewed — including a shared/AI deck. Running DOMPurify
		// HERE, inside the only capture function, makes a capture-without-sanitize path
		// impossible by construction (browser-verified: keeps chart SVGs, strips
		// onerror/javascript:). The slide was already sanitized before render; this is
		// the enforcing pass for the new main-document sink.
		const html = sanitizeSlideHtml(lattice.outerHTML);
		let css = extractCriticalFromDoc(doc);
		if (!html || !css) return null;
		// The engine's @font-face use relative `url(fonts/…)`, which would resolve
		// against `/studio/` (→ 404) when the snapshot is replayed into the top
		// document. Rewrite to the absolute served themes/ base so the replayed slide
		// uses the real faces (same fix as the build-time front-A shell).
		if (meta.themeUrlBase) css = css.replace(/url\((['"]?)fonts\//g, `url($1${meta.themeUrlBase}fonts/`);
		// deckId + slideIndex identify WHICH deck/slide this snapshot is of, so the replay
		// paints it only when the app is about to boot that same deck. Without them the
		// shell can flash deck B's last slide before the app hydrates deck A (the app boots
		// loadDeckList()[0], NOT the most-recently-viewed deck) — the wrong-deck flash the
		// adversarial trio's inversion pass caught. deckId '' → replay never matches (safe).
		return { v: 1, deckId: meta.deckId || '', slideIndex: meta.slideIndex || 0, html, css, w: meta.w || 1280, h: meta.h || 720, palette: meta.palette, mode: meta.mode, ts: meta.ts || 0 };
	} catch {
		return null;
	}
}

/**
 * Snapshot JUST the FIRST section of a multi-slide filmstrip preview (the Playground's
 * `iframe#preview`, whose `.lattice` holds ALL N sections). An instant-shell shows one
 * slide, and grabbing the whole `.lattice` would blow `MAX_UNITS` on a big deck (capture
 * silently fails → the flash persists) — so wrap only slide 0 in a fresh `.lattice`.
 * `meta.srcHash` is the identity (a hash of the persisted draft source) the Playground's
 * pre-paint replay matches on, in place of the Studio's deckId. SANITIZES at the
 * chokepoint (#22) exactly like captureFromFrame — the capture-without-sanitize path is
 * impossible by construction.
 * @returns {{v:1,srcHash:string,html:string,css:string,w:number,h:number,palette:string,mode:string,ts:number}|null}
 */
export function captureFirstSectionFromFrame(frame, meta) {
	try {
		const doc = frame?.contentDocument;
		const lattice = doc?.querySelector('.lattice');
		if (!lattice) return null;
		const first = lattice.querySelector(':scope > section');
		if (!first) return null;
		// Clone slide 0 into a fresh `.lattice` wrapper (preserving any modifier classes
		// on the filmstrip's `.lattice`). Strip the FIT agent's inline scale/margin — they
		// scale the LIVE filmstrip to its container and are meaningless once detached; the
		// shell CSS sizes the slide to the preview pane itself.
		// Mirror the LIVE container's element, don't hardcode one. The engine emits
		// `<article class="lattice">` (it was a `<div>` until the semantic-HTML pass), and
		// the CSS captured alongside this snapshot is scoped `article.lattice > section`.
		// Synthesizing a `<div>` here would replay that stylesheet against a container it
		// can never match — the full CSS retained, none of it applying, i.e. a first paint
		// of raw unstyled Markdown. That is precisely the failure the same retag avoided in
		// `share-export.ts`; this consumer was missed on the first pass.
		const wrap = doc.createElement(lattice.tagName ? lattice.tagName.toLowerCase() : 'article');
		wrap.className = lattice.className || 'lattice';
		const sec = first.cloneNode(true);
		sec.style.removeProperty('transform');
		sec.style.removeProperty('transform-origin');
		sec.style.removeProperty('margin-bottom');
		wrap.appendChild(sec);
		const html = sanitizeSlideHtml(wrap.outerHTML);
		// SCOPE the critical CSS under the shell box: the filmstrip's srcdoc carries
		// page-level `html,body{…}` / `.lattice{visibility:hidden}` and the theme's
		// `:root[data-palette]` token block — injected RAW into the TOP document they
		// would repaint the whole Playground page and hide the slide. Scoping re-targets
		// them onto `.pg-ssr-shell` so the slide gets its tokens while the page is untouched.
		let css = extractCriticalFromDoc(doc, PG_SHELL_SCOPE);
		if (!html || !css) return null;
		// Same relative-font-URL rewrite as captureFromFrame: the replayed CSS lives in
		// the TOP document (`/playground/`), so `url(fonts/…)` must be made absolute.
		if (meta.themeUrlBase) css = css.replace(/url\((['"]?)fonts\//g, `url($1${meta.themeUrlBase}fonts/`);
		return { v: 1, srcHash: meta.srcHash || '', html, css, w: meta.w || 1280, h: meta.h || 720, palette: meta.palette, mode: meta.mode, ts: meta.ts || 0 };
	} catch {
		return null;
	}
}

/** Persist a snapshot under `key` (latest only). Returns false if it's too big or
 *  storage fails. The sole writer for BOTH snapshot keys — the #22 storage-boundary
 *  sanitize below covers every caller. */
function saveSnapshotTo(snap, key) {
	try {
		if (!snap) return false;
		// Defense in depth (#22): re-sanitize at the STORAGE boundary so every writer —
		// captureFromFrame / captureFirstSectionFromFrame today, any future one — is
		// covered, not just the one capture path. Those already sanitize; this is
		// idempotent (DOMPurify on already-clean HTML is a no-op) and makes an unsanitized
		// value physically unstorable. Guard on a string html so a malformed snap just
		// fails the size gate.
		if (typeof snap.html === 'string') snap = { ...snap, html: sanitizeSlideHtml(snap.html) };
		const s = JSON.stringify(snap);
		if (s.length > MAX_UNITS) return false;
		localStorage.setItem(key, s);
		return true;
	} catch {
		return false;
	}
}

/** Read the snapshot stored under `key`, or null. */
function loadSnapshotFrom(key) {
	try {
		const s = localStorage.getItem(key);
		return s ? JSON.parse(s) : null;
	} catch {
		return null;
	}
}

/** Persist the Studio snapshot (latest only). */
export function saveSnapshot(snap) {
	return saveSnapshotTo(snap, SNAPSHOT_KEY);
}

/** Read the stored Studio snapshot, or null. */
export function loadSnapshot() {
	return loadSnapshotFrom(SNAPSHOT_KEY);
}

/** Persist the Playground snapshot (latest only). */
export function savePlaygroundSnapshot(snap) {
	return saveSnapshotTo(snap, PG_SNAPSHOT_KEY);
}

/** Read the stored Playground snapshot, or null. */
export function loadPlaygroundSnapshot() {
	return loadSnapshotFrom(PG_SNAPSHOT_KEY);
}
