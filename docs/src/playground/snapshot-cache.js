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

// Recursively collect the CSS the slide can use. Style rules are kept when a
// selector matches; @font-face/@keyframes/@property/@import are kept whole;
// grouping rules (@media/@container/@supports/@layer{…}) recurse and are dropped
// when nothing inside survives. Mirrors critical-css.mjs's pruneBlock, on the CSSOM.
function collectRules(rules, doc, out) {
	for (const rule of rules) {
		// @import — DROP. The snapshot CSS is injected into the TOP document (not the
		// sandboxed preview iframe); a replayed @import would fetch an arbitrary external
		// sheet on the main origin. The engine inlines all faces/tokens, so a real slide
		// never depends on one — dropping it closes an injection vector (red-team finding).
		if (rule.type === 3) continue;
		if (rule.selectorText !== undefined && rule.style) {
			// CSSStyleRule
			if (rule.selectorText.split(',').some((s) => selectorMatches(doc, s))) out.push(rule.cssText);
		} else if (rule.type === 5 || rule.type === 7 || (rule.constructor && rule.constructor.name === 'CSSPropertyRule')) {
			// @font-face (5) · @keyframes (7) · @property — position-independent, keep whole
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

/** Persist a snapshot (latest only). Returns false if it's too big or storage fails. */
export function saveSnapshot(snap) {
	try {
		if (!snap) return false;
		// Defense in depth (#22): re-sanitize at the STORAGE boundary so every writer —
		// captureFromFrame today, any future one — is covered, not just the one capture
		// path. captureFromFrame already sanitizes; this is idempotent (DOMPurify on
		// already-clean HTML is a no-op) and makes an unsanitized value physically
		// unstorable. Guard on a string html so a malformed snap just fails the size gate.
		if (typeof snap.html === 'string') snap = { ...snap, html: sanitizeSlideHtml(snap.html) };
		const s = JSON.stringify(snap);
		if (s.length > MAX_UNITS) return false;
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
