// preview-virtual.js — pure, DOM-free core for the Drawing Board's incremental
// live preview.
//
// WHY THIS EXISTS
// The preview re-rendered the WHOLE deck into the iframe on every edit:
// `frame.srcdoc = <all N slides>`, which makes the browser re-parse the doc,
// re-run the runtime DOM transforms over every <section>, FIT-scale them, and
// lay out N fixed 1280x720 slides — O(N) per keystroke, seconds on a big deck.
// (The markdown->HTML render itself is cheap: marp-core does 800 slides in
// ~285ms; the cost is the browser-side mount/layout of every slide.)
//
// THE MODEL
// Keep ONE persistent iframe. On edit, re-render the whole deck's HTML (cheap),
// split it into per-slide strings, diff against the previous render, and replace
// only the <section> nodes whose HTML changed — so the per-edit cost is
// O(changed slides), not O(deck). A full srcdoc rewrite still runs on first
// render and on palette/mode change (theme CSS + Mermaid theming bake into the
// document). Off-screen virtualization is the browser's own `content-visibility:
// auto` on the fixed-size slides (every node stays mounted; the browser skips
// off-screen layout/paint) — not a JS virtual list, so this kernel needs no
// windowing math.
//
// This module is the pure kernel of the patch path: splitting the rendered HTML
// into per-slide strings and diffing two renders. It is DOM-free, and its one
// import (the shared section walker) is too, so it is unit-tested directly in Node. The
// controller that consumes it is `renderDeck` in `deck-preview.js`, which re-exports
// `splitSections` so every host shares one implementation.

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

export default { splitSections, diffSections };
