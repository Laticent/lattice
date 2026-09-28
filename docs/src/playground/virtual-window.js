// virtual-window.js — the pure, DOM-free half of the Playground's VIRTUAL FILMSTRIP (2026-09-28).
//
// Only the slides in view, plus a small overscan, are REAL sections in the preview frame. Every
// other slide is a PLACEHOLDER: an empty `<div data-lv-ph>` carrying the slide's identity (its
// number, its anchor id, whether it is a sketch slide) and nothing else. The fit agent scales it
// exactly like a slide, so the filmstrip's geometry, DOM order and slide count are what a fully
// mounted deck would have: every consumer that addresses a slide by position (section numbers,
// sketch-ink seeds, the walk bands, debug labels) still reads the right answer. As the reader
// scrolls, slides are mounted ahead of the view and returned to placeholders behind it, so CPU and
// memory follow the window, not the deck. `content-visibility: auto` was the previous answer
// (2026-06-10 note); it skips paint but not the runtime's work, the style recalc against the engine
// sheet or the memory, and a 522-slide deck took 8.5s to show its first slide under it.
// Decision: engineering/decisions/2026-09-28-playground-virtual-filmstrip.md.
//
// This module is the placeholder builder and the window arithmetic; the controller that moves the
// window is `deck-render.js`. It is its own module, apart from preview-virtual.js's patch kernel,
// because the Studio's preview builder imports that kernel and must not carry the virtual list.

import { splitSections as splitSectionsCore, unclosedSectionAt } from '../../../lib/core/split-sections.mjs';

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

export default { placeholderOf, withIndex, windowRange, visibleRange, virtualHtml, LV_ATTR, LV_INDEX, SLIDE_SELECTOR };
