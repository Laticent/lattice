/**
 * lib/core/hidden-slides.mjs — THE ONE TEST for "is this rendered slide hidden?"
 *
 * The engine marks a slide its author hid (`<!-- hide -->`, `_hide: true`) with `data-lattice-hidden="true"` and
 * leaves it in the document, so the editor can show it. Present and every export leave it out. Every consumer asks
 * here, on a section string or a live element, so the mark is spelled once (HARD RULE #1).
 * Design: engineering/decisions/2026-11-06-hidden-slides.md.
 */


const HIDDEN_ATTR = 'data-lattice-hidden';
const OPEN_TAG_RE = /^\s*<section\b[^>]*>/i;
const HIDDEN_RE = /\sdata-lattice-hidden\s*=\s*(["'])true\1/i;

/** True when a `<section …>…</section>` string's OWN open tag carries the hidden mark (a nested section never counts). */
function isHiddenSection(sectionHtml) {
	const open = OPEN_TAG_RE.exec(String(sectionHtml ?? ''));
	return !!open && HIDDEN_RE.test(open[0]);
}

/** True when a live `<section>` element carries the hidden mark. */
function isHiddenElement(el) {
	return !!el && typeof el.getAttribute === 'function' && el.getAttribute(HIDDEN_ATTR) === 'true';
}

/**
 * The rendered deck without its hidden slides, and which slides went: `{ html, hidden }`, `hidden` holding the
 * 0-based positions (among the document's top-level sections) that were removed. `splitSections` is the shared
 * depth-aware walker (`@laticent/markup`), passed in so this file stays dependency-free. A caller holding a list
 * keyed by slide position (review comments, preview cells) drops the same positions with `shownOnly`.
 */
function withoutHiddenSlides(html, splitSections) {
	const src = String(html ?? '');
	if (!src.includes(HIDDEN_ATTR)) return { html: src, hidden: [] };
	const hidden = [];
	let k = -1;
	const out = splitSections(src)
		.map((p) => {
			if (p.type !== 'section') return p.text;
			k += 1;
			if (HIDDEN_RE.test(p.openTag)) {
				hidden.push(k);
				return '';
			}
			return `${p.openTag}${p.inner}${p.close}`;
		})
		.join('');
	return { html: hidden.length ? out : src, hidden };
}

/** `list` without the entries at `hidden`'s positions. A HOLE stays a hole at its new position: a sparse list (review
 *  comments, one entry per page that has any) must not close up, or a comment lands on the wrong page. */
function shownOnly(list, hidden) {
	if (!Array.isArray(list) || !hidden?.length) return list;
	const drop = new Set(hidden);
	const out = [];
	let k = 0;
	for (let i = 0; i < list.length; i++) {
		if (drop.has(i)) continue;
		if (i in list) out[k] = list[i];
		k += 1;
	}
	out.length = k;
	return out;
}

// The token rule lives in the ES module every reader shares (lib/core/hide-directive.mjs). This file is an ES module
// with no require of its own, so the docs app imports it directly (docs/src/plugins/vite-cjs-lib-dev.test.ts);
// lib/core/hidden-slides.js re-exports it for the CommonJS callers.
import { tokensHide, tokensHideState } from './hide-directive.mjs';

/** A `<!-- _hide: true|false -->` block token, for a pass that cuts a slide into pages: each page ENDS with the
 *  slide's resolved state, so a hide written on one page cannot outvote the slide's (the last hide wins). */
function hideToken(state, on = true) {
	const t = new state.Token('html_block', '', 0);
	t.content = `<!-- _hide: ${on ? 'true' : 'false'} -->\n`;
	t.block = true;
	return t;
}

export { HIDDEN_ATTR, hideToken, isHiddenElement, isHiddenSection, shownOnly, tokensHide, tokensHideState, withoutHiddenSlides };
