/**
 * WHICH KIND OF SWAP IS THIS? — the one question a preview frame cannot answer for itself.
 *
 * The runtime holds a rendered Mermaid diagram on screen while an edited fence re-renders
 * (`adoptOutgoingDiagrams` in lib/runtime/index.js). That is only ever correct when the
 * arriving fence is the SAME fence: the same slide, edited. From inside the frame an edit
 * and a navigation are indistinguishable — both replace a section with one that has the
 * same node count, the same fence count and the same scope key — so the HOST says which
 * happened, by stamping `data-lattice-swap` before it writes.
 *
 * This module is that answer, and it lives in the kernel because BOTH preview hosts owe it
 * (HARD RULE #1): `patchSlideBody` in docs/src/lib/single-slide-render.ts renders one slide
 * and asks `deckContextKey`; `patchSections` in docs/src/playground/deck-preview.js renders
 * a filmstrip and asks `sectionSwapKind`. They were two hand-rolled answers before, and
 * both were wrong in the same way.
 *
 * THE DEFECT THIS EXISTS TO KILL. Both hosts used to compare POSITION — "is the slide index
 * the same?", "does the deck still have the same number of slides?" — and position is not
 * identity. Deleting a slide keeps the index (`deleteSlide` returns `clampIndex(i, len-1)`,
 * docs/src/components/studio/deck-ops.ts), so the Studio's own Delete-slide button was
 * stamped `in-place` and painted the DELETED slide's diagram on top of the slide that
 * replaced it — reproduced on the built Studio, 10 frames over ~136ms. Reordering keeps
 * every slide at *a* position, so the Playground stamped a reorder `in-place` too. Opening
 * a different deck of the same length did the same. The adversarial trio found all four;
 * `origin/main` shows a blank there, so this branch would have turned *empty* into *wrong*.
 *
 * WHAT AN EDIT ACTUALLY IS, stated exactly: everything except the slide on screen is
 * byte-identical to what it was on the last render. Not "similar" — a source-similarity
 * threshold was tried here and refuted (all twelve pairs of examples/mermaid-init-merge.md
 * scored 0.68-0.82 and would each have held the others' ink). Equality is decidable, needs
 * no threshold to fit, and fails in the safe direction: anything this cannot prove is an
 * edit is reported as a reflow, which costs a held diagram and never risks a wrong one.
 */

import { frontMatterBlockOf, splitSlideChunks } from './slide-boundaries.mjs';

/** The two legal values of `data-lattice-swap`. A host stamps one before every write. */
export const SWAP_IN_PLACE = 'in-place';
export const SWAP_REFLOW = 'reflow';

/**
 * Everything in `deckSource` EXCEPT slide `slideIndex`, as a comparable string.
 *
 * Two renders of the same deck agree on this key exactly when the author edited only the
 * slide being shown. Editing slide 3 leaves slides 1,2,4… untouched, so the key holds and
 * the swap is `in-place`. Deleting a slide, reordering, opening another deck, restoring a
 * checkpoint or filtering by reader lens all change which slides are NOT the shown one, so
 * the key moves and the swap is a reflow — which is the correct answer for every one of
 * them.
 *
 * `deckId` is a stable identity for the DECK, not its text — the Studio's `deck.id`. It is
 * optional, and it earns its place on the one shape the source cannot answer for itself: a
 * deck of a single slide (see below).
 *
 * Returns `null` when the answer is unknown — no index, an index the deck does not have, or
 * a one-slide deck with no `deckId`. Two `null`s never compare equal: `swapKindForSlide`
 * reports an unknown as a reflow rather than letting two unknowns agree.
 *
 * Each retained slide is LENGTH-PREFIXED rather than joined on a separator. No separator
 * is safe: any byte we could pick is a byte an author can type, and a slide containing it
 * would let two different slide lists build the same key. `12:<12 bytes>` cannot be
 * misread whatever the 12 bytes are, so the encoding is injective by construction.
 *
 * The key is raw text, NOT a hash. It is a correctness guard, and a 32-bit hash of a whole
 * deck collides; decks here are kilobytes and the comparison is one string equality per
 * render, so exactness is the cheap option rather than the expensive one.
 */
export function deckContextKey(deckSource, slideIndex, deckId) {
	if (typeof slideIndex !== 'number' || !Number.isInteger(slideIndex) || slideIndex < 0) return null;
	const src = String(deckSource ?? '');
	// The ONE front-matter reader (HARD RULE #1). A hand-rolled copy of this regex shipped
	// here first and diverged on two shapes the shared one gets right — front matter with
	// no trailing newline, and lone-CR line endings — and both misses fold the front matter
	// into slide 0, which is the slide this key BLANKS. A `theme:` edit would have gone
	// invisible and stamped `in-place`, the exact opposite of what including it is for.
	const fm = frontMatterBlockOf(src);
	const slides = splitSlideChunks(src.slice(fm.length)).chunks;
	if (slideIndex >= slides.length) return null;
	const id = typeof deckId === 'string' && deckId ? deckId : '';
	// A ONE-SLIDE DECK HAS NO CONTEXT, and without a deck id that is undecidable. Every
	// slide but the shown one is what this key compares, so a deck of one compares nothing:
	// two different one-slide decks sharing front matter produce the identical key, and the
	// switch between them was stamped `in-place`. `newDeckSource()` emits exactly one slide
	// with no front matter, so that is the shape every Studio deck starts life as. With an
	// id the question is decidable and the hold survives; without one the honest answer is
	// "unknown", which is a reflow — a lost hold on single-slide previews, never a wrong one.
	if (!id && slides.length <= 1) return null;
	// The shown slide is blanked, not dropped: the key still records WHERE it sits among
	// the others, so moving it is visible here even though its own text is excluded.
	const rest = slides.map((s, i) => (i === slideIndex ? '-' : `${s.length}:${s}`)).join('');
	return `${id.length}:${id}/${fm.length}:${fm}/${slides.length}/${rest}`;
}

/**
 * `in-place` when this render is the same slide as the last one, edited; `reflow` otherwise.
 *
 * The context key does the work: it catches every change that keeps the index — delete,
 * deck switch, checkpoint restore — and it encodes the shown slide's POSITION as the `-`
 * token, so two equal non-null keys already imply equal indices. The index comparison is
 * therefore redundant by construction today, and it is kept rather than deleted because it
 * is one cheap `!==` and it stops the whole guard turning on the key's internal encoding
 * staying position-bearing. Said plainly here because an earlier draft of this comment
 * claimed both halves were load-bearing, and a checker measured that they are not.
 *
 * A `null` on either side is an unknown, and an unknown is a reflow.
 */
export function swapKindForSlide(prev, next) {
	if (!prev || !next) return SWAP_REFLOW;
	if (prev.key === null || next.key === null) return SWAP_REFLOW;
	if (prev.index !== next.index) return SWAP_REFLOW;
	return prev.key === next.key ? SWAP_IN_PLACE : SWAP_REFLOW;
}

/**
 * The filmstrip twin: `in-place` when EXACTLY ONE section's HTML changed.
 *
 * An edit re-renders one slide and leaves the rest byte-identical, so exactly one entry of
 * `next` differs from `prev`. Everything the old `next.length !== cur.length` test let
 * through fails this: a reorder moves at least two sections, and pasting a different deck
 * of the same length changes all of them. Zero changes is also a reflow — nothing is
 * replaced, so there is no arrival to hold ink for, and saying `in-place` would only leave
 * a stale stamp behind for the next burst to read.
 */
export function sectionSwapKind(prevSections, nextSections) {
	if (!Array.isArray(prevSections) || !Array.isArray(nextSections)) return SWAP_REFLOW;
	if (prevSections.length !== nextSections.length || nextSections.length === 0) return SWAP_REFLOW;
	let changed = 0;
	for (let i = 0; i < nextSections.length; i++) {
		if (prevSections[i] !== nextSections[i] && ++changed > 1) return SWAP_REFLOW;
	}
	return changed === 1 ? SWAP_IN_PLACE : SWAP_REFLOW;
}
