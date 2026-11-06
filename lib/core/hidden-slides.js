/**
 * lib/core/hidden-slides.js — THE ONE TEST for "is this rendered slide hidden?"
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

/**
 * Does a run of markdown-it tokens (one authored slide, before the engine cuts it into pages) hide itself? Its
 * top-level comments, read by the engine's grammar, the last `hide` winning. For the passes that cut ONE authored
 * slide into several (the heading split, the pane split): every page they make of a hidden slide is hidden too.
 */
function tokensHide(tokens) {
	const { readDirectiveComment } = require('./comment-directive');
	const { hideOn } = require('./meta-keys');
	let hidden = false;
	for (const t of tokens) {
		if (t.type !== 'html_block' || t.level) continue;
		const dir = readDirectiveComment(t.content, HIDE_ONLY);
		if (dir) hidden = hideOn(dir.value);
	}
	return hidden;
}
const HIDE_ONLY = { known: new Set(['hide']), flags: new Set(['hide']) };

/** A `<!-- _hide -->` block token, for a pass that opens a new page of a hidden slide. */
function hideToken(state) {
	const t = new state.Token('html_block', '', 0);
	t.content = '<!-- _hide -->\n';
	t.block = true;
	return t;
}

module.exports = { HIDDEN_ATTR, isHiddenSection, isHiddenElement, withoutHiddenSlides, shownOnly, tokensHide, hideToken };
