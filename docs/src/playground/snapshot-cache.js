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

export const SNAPSHOT_KEY = 'lattice-studio-last-slide';
const MAX_BYTES = 240 * 1024; // localStorage-friendly cap; skip a snapshot bigger than this

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

// Recursively collect the CSS the slide can use. Style rules are kept when a
// selector matches; @font-face/@keyframes/@property/@import are kept whole;
// grouping rules (@media/@container/@supports/@layer{…}) recurse and are dropped
// when nothing inside survives. Mirrors critical-css.mjs's pruneBlock, on the CSSOM.
function collectRules(rules, doc, out) {
	for (const rule of rules) {
		if (rule.selectorText !== undefined && rule.style) {
			// CSSStyleRule
			if (rule.selectorText.split(',').some((s) => selectorMatches(doc, s))) out.push(rule.cssText);
		} else if (rule.type === 5 || rule.type === 7 || rule.type === 3 || (rule.constructor && rule.constructor.name === 'CSSPropertyRule')) {
			// @font-face (5) · @keyframes (7) · @import (3) · @property — position-independent, keep whole
			out.push(rule.cssText);
		} else if (rule.cssRules) {
			// @media/@container/@supports/@layer{…} — recurse; keep only if non-empty
			const inner = [];
			collectRules(rule.cssRules, doc, inner);
			if (inner.length) {
				const head = rule.cssText.slice(0, rule.cssText.indexOf('{'));
				out.push(`${head}{${inner.join('')}}`);
			}
		} else {
			out.push(rule.cssText); // @layer statement / anything else — keep
		}
	}
}

/** Critical CSS for the rendered slide in `doc`, from the live CSSOM. */
export function extractCriticalFromDoc(doc) {
	const out = [];
	for (const sheet of doc.styleSheets) {
		try {
			collectRules(sheet.cssRules, doc, out);
		} catch {
			/* a sheet we can't read (shouldn't happen for same-origin srcdoc) — skip */
		}
	}
	return out.join('\n');
}

/**
 * Snapshot the fully-rendered slide in a live preview iframe.
 * @returns {{v:1,html:string,css:string,w:number,h:number,palette:string,mode:string,ts:number}|null}
 */
export function captureFromFrame(frame, meta) {
	try {
		const doc = frame?.contentDocument;
		const lattice = doc?.querySelector('.lattice');
		if (!lattice) return null;
		const html = lattice.outerHTML;
		let css = extractCriticalFromDoc(doc);
		if (!html || !css) return null;
		// The engine's @font-face use relative `url(fonts/…)`, which would resolve
		// against `/studio/` (→ 404) when the snapshot is replayed into the top
		// document. Rewrite to the absolute served themes/ base so the replayed slide
		// uses the real faces (same fix as the build-time front-A shell).
		if (meta.themeUrlBase) css = css.replace(/url\((['"]?)fonts\//g, `url($1${meta.themeUrlBase}fonts/`);
		return { v: 1, html, css, w: meta.w || 1280, h: meta.h || 720, palette: meta.palette, mode: meta.mode, ts: meta.ts || 0 };
	} catch {
		return null;
	}
}

/** Persist a snapshot (latest only). Returns false if it's too big or storage fails. */
export function saveSnapshot(snap) {
	try {
		if (!snap) return false;
		const s = JSON.stringify(snap);
		if (s.length > MAX_BYTES) return false;
		localStorage.setItem(SNAPSHOT_KEY, s);
		return true;
	} catch {
		return false;
	}
}

/** Read the stored snapshot, or null. */
export function loadSnapshot() {
	try {
		const s = localStorage.getItem(SNAPSHOT_KEY);
		return s ? JSON.parse(s) : null;
	} catch {
		return null;
	}
}
