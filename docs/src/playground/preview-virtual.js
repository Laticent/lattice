// preview-virtual.js — pure, DOM-free core for the Playground's live filmstrip preview.
//
// WHY THIS EXISTS
// The preview once re-rendered the WHOLE deck into the iframe on every edit:
// `frame.srcdoc = <all N slides>`, which makes the browser re-parse the doc,
// re-run the runtime DOM transforms over every <section>, FIT-scale them, and
// lay out N fixed 1280x720 slides — O(N) per keystroke, seconds on a big deck.
// (The markdown->HTML render itself is cheap: 522 slides in ~310ms in the browser;
// the cost is the browser-side mount/layout of every slide.)
//
// THE MODEL — two layers.
// 1. PATCH. Keep ONE persistent iframe. On edit, re-render the whole deck's HTML (cheap),
//    split it into per-slide strings, diff against the previous render, and replace only
//    the <section> nodes whose HTML changed — O(changed slides) per edit.
// 2. VIRTUAL LIST (2026-09-28). Only the slides in view, plus a small overscan, are REAL
//    sections in the frame. Every other slide is a PLACEHOLDER: an empty `<div data-lv-ph>`
//    carrying the slide's identity (its number, its anchor id, whether it is a sketch slide)
//    and nothing else. The fit agent scales it exactly like a slide, so the filmstrip's
//    geometry, DOM order and slide count are what a fully mounted deck would have: every
//    consumer that addresses a slide by position (section numbers, sketch-ink seeds, the
//    walk bands, debug labels) still reads the right answer. As the reader scrolls, slides
//    are mounted ahead of the view and returned to placeholders behind it, so CPU and
//    memory follow the window, not the deck. `content-visibility: auto` was the previous
//    answer (2026-06-10 note); it skips paint but not the runtime's work, the style recalc
//    against the engine sheet or the memory, and a 522-slide deck took 8-14s to show its
//    first slide under it. Decision: engineering/decisions/2026-09-28-playground-virtual-filmstrip.md.
//
// This module is the pure, DOM-free kernel of both layers: splitting the rendered HTML into
// per-slide strings, diffing two renders, and the placeholder and window arithmetic. Its one
// import (the shared section walker) is DOM-free too, so it is unit-tested directly in Node.
// The controller that consumes it is `deck-render.js` (Playground only), and `deck-preview.js`
// re-exports `splitSections` so every host shares one implementation.

import { splitSections as splitSectionsCore, unclosedSectionAt } from '../../../lib/core/split-sections.mjs';

// Split the rendered HTML into one HTML string per slide, with the engine's own walker
// (`splitSections`, lib/core/split-sections.mjs — HARD RULE #1).
//
// This used to pair each `<section …>` with the next literal `</section>`, on the claim that
// user content is escaped so no stray section tag appears inside a slide. An HTML comment is not
// escaped: a `</section>` quoted in one ended the slide there, and the truncated string went on
// to `sanitizeSlideHtml` and `patchSections`, so the preview replaced a live slide with half of
// it. The shared walker reads a tag in a comment, in `<style>`/`<script>` text or in an attribute
// value as text, and pairs a nested section with its own close, so each string here is one whole
// top-level slide, the same slide the iframe's DOM holds at that index.
//
// A section that never CLOSES runs to the end of the document, because that is what the DOM
// does with it: a browser auto-closes it at end of file, and every later slide sits inside
// it. The shared walker leaves such a section to its trailing gap, which returned NO piece for
// it or anything after it, and `patchSections` then emptied the whole preview while an author
// was half-way through typing `<section class="x">`. One piece from the open tag to the end
// keeps the count equal to the DOM's.
export function splitSections(html) {
	if (!html) return [];
	const pieces = splitSectionsCore(html);
	const out = pieces.filter((p) => p.type === 'section').map((p) => p.openTag + p.inner + p.close);
	const open = unclosedSectionAt(html, pieces);
	if (open >= 0) out.push(html.slice(open));
	return out;
}

// Diff two arrays of per-slide HTML. Returns the indices (into `next`) whose HTML
// differs from `prev` at the same position, whether the slide COUNT changed
// (a structural change — insert/delete/reorder), and the new count. A plain
// string compare is the cheapest reliable signal; slide HTML is small and this
// runs once per (debounced) render, not per frame.
export function diffSections(prev, next) {
	const p = prev || [];
	const n = next || [];
	const changed = [];
	for (let i = 0; i < n.length; i++) {
		if (p[i] !== n[i]) changed.push(i);
	}
	return { changed, countChanged: p.length !== n.length, count: n.length };
}

// ── The virtual list ─────────────────────────────────────────────────────────────

/** The attribute that marks a placeholder. */
export const LV_ATTR = 'data-lv-ph';
/** The attribute every REAL slide of a virtual filmstrip carries: its index in the deck. */
export const LV_INDEX = 'data-lv-i';
/** What the frame's queries use to walk every slide, real or not, in deck order. */
export const SLIDE_SELECTOR = ':scope>section,:scope>div[data-lv-ph]';

// A placeholder is a `<div>`, NOT a `<section>`, and that is the whole performance story. The
// slide runtime treats every `section` in the document as a slide: a placeholder `<section>`
// had backdrops, rails and watermarks built into it, and the runtime's whole-document pass re-ran
// over all of them each time the window moved — measured, a 522-slide deck scrolled at a 417ms
// median frame on a 4x-slowed CPU, worse than mounting everything. A `<div>` is invisible to it.
//
// What a placeholder still carries is the slide's IDENTITY, so nothing that addresses a slide
// by number or anchor loses it: `data-lattice-slide` (the walk groups split pages by it), `id`
// (an in-deck link target), and whether the slide is a sketch slide (the runtime installs its
// hand-drawn ink only if one exists). Values are read from the SANITIZED open tag and must match
// a strict shape, so nothing reaches the frame the sanitizer did not pass (HARD RULE #22).
function attrOf(openTag, name) {
	const m = new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(openTag);
	return m ? m[1] : null;
}
function placeholderFromTag(openTag) {
	const slide = attrOf(openTag, 'data-lattice-slide');
	const id = attrOf(openTag, 'id');
	const cls = attrOf(openTag, 'class') || '';
	let out = `<div ${LV_ATTR}=""`;
	if (slide && /^[0-9.]+$/.test(slide)) out += ` data-lattice-slide="${slide}"`;
	if (id && /^[A-Za-z0-9_-]+$/.test(id)) out += ` id="${id}"`;
	if (/(^|\s)sketch(\s|$)/.test(cls)) out += ' data-lv-sketch=""';
	return out + '></div>';
}

/** The placeholder for one slide, from its SANITIZED HTML, cut with the engine's own section
 *  walker so an attribute value holding a `>` cannot end the tag early. */
export function placeholderOf(sectionHtml) {
	const piece = splitSectionsCore(String(sectionHtml || '')).find((p) => p.type === 'section');
	return placeholderFromTag(piece ? piece.openTag : '');
}

/** Stamp a real slide with its deck index (`data-lv-i`). */
export function withIndex(sectionHtml, i) {
	return String(sectionHtml).replace(/^(\s*<section)\b/i, `$1 ${LV_INDEX}="${Number(i) | 0}"`);
}

/**
 * Which slides to mount: the ones in view, plus `overscan` on each side. `first`/`last` are
 * the indices of the first and last slide touching the viewport. Returns an inclusive range
 * clamped to the deck, or null for an empty deck.
 */
export function windowRange(first, last, count, overscan = 1) {
	if (!(count > 0)) return null;
	const lo = Math.max(0, Math.min(count - 1, Math.floor(first) - overscan));
	const hi = Math.max(lo, Math.min(count - 1, Math.ceil(last) + overscan));
	return { lo, hi };
}

/**
 * The slides a scroll position shows. `pitch` is one slide plus the gap, `top` is where
 * slide 0 starts in the frame document, `y` the scroll offset and `h` the viewport height.
 */
export function visibleRange(y, h, top, pitch, count) {
	if (!(count > 0) || !(pitch > 0)) return null;
	const first = Math.max(0, Math.min(count - 1, Math.floor((y - top) / pitch)));
	const last = Math.max(first, Math.min(count - 1, Math.floor((y + h - top) / pitch)));
	return { first, last };
}

/**
 * Rebuild a rendered deck's HTML with only the sections `keep(i)` names mounted, and every
 * other section a placeholder. Text between sections is kept verbatim. A section that never
 * closes means the walker could not see the deck's shape, so the HTML comes back unchanged
 * (fully mounted) rather than guessed at.
 */
export function virtualHtml(html, keep) {
	if (!html) return html;
	const pieces = splitSectionsCore(html);
	if (unclosedSectionAt(html, pieces) >= 0) return html;
	let i = -1;
	return pieces
		.map((p) => {
			if (p.type !== 'section') return p.text;
			i += 1;
			return keep(i) ? withIndex(p.openTag, i) + p.inner + p.close : placeholderFromTag(p.openTag);
		})
		.join('');
}

export default { splitSections, diffSections, placeholderOf, withIndex, windowRange, visibleRange, virtualHtml, LV_ATTR, LV_INDEX, SLIDE_SELECTOR };
