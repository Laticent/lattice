import type { RectSource } from '@/lib/vetrina';
import { frameGeom, innerRectToParent } from '@/playground/frame-geom.js';

// THE GUIDE RUNG — pointing at the part of the slide currently being narrated (#1397).
//
// CC shows the words, Voice speaks them, Guide shows you WHERE TO LOOK. Three independent
// toggles over one narration.
//
// ── Where the targets come from, and why NOT from the projection ───────────────────────────
//
// The design record proposed sourcing targets from `projectDeckSpeech`, on the grounds that it
// "already knows which DOM node each sentence came from and throws it away". Reading the
// pipeline, that is half true and the half that is false is the load-bearing half:
//
//   `speakGeneric` (lib/transformers/prose-projection.mjs) does hold `el` alongside its text —
//   but per BLOCK, not per sentence, and it joins those blocks into ONE string per slide.
//   Sentences do not exist yet at that point. They are created much later and somewhere else,
//   by `buildTrack` segmenting the projected string in read-aloud.ts.
//
// So there is no per-sentence node to keep. Threading one through would mean carrying node
// identity across four string-only boundaries — the projection primitives, `normalizeProjected`,
// the `string[]` return that both Present AND the CLI export consume, and `buildTrack`'s cue
// construction — i.e. changing the shared export kernel's contract for a Studio-only feature.
//
// Worse, it would be threading identity through the WRONG DOCUMENT. The projection parses a
// detached copy of the render; the slide a viewer is looking at is a live iframe whose DOM the
// runtime has since mutated (Mermaid inflated, charts drawn, KaTeX typeset). A node from the
// detached parse is not a node you can point at.
//
// So Guide resolves LATE, against the live frame, by matching the cue's DISPLAY text to the
// smallest block that contains it. That works on every existing deck with zero authoring —
// which was the actual requirement — costs the shared kernel nothing, and is robust to whatever
// the runtime did to the DOM after render, because it reads the DOM that is on screen.
//
// ── The two named constraints ──────────────────────────────────────────────────────────────
//
// CROSS-FRAME. Vetrina's stage sits over the live app and never enters a preview iframe. The
// slide IS an iframe. Handled by `RectSource` (the target widening from #1400) fed by the shared
// `frame-geom` bridge — so the library still knows nothing about frames.
//
// ONE CONDUCTOR. Read-aloud owns the clock. Nothing here has a timer: the cursor moves when the
// reader says the cue changed, full stop. A second clock (Vetrina's storyboard `readMs` dwell)
// would drift against the audio within a slide and point at the wrong thing — which is the
// most likely way this feature ships feeling broken.

/** Collapse whitespace the way the projection does, so DOM text and cue text compare equal. */
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Strip what a reader normalizes away but the DOM still shows, so a match is not defeated by
 *  punctuation the projection rewrote (a terminating period it added, curly quotes, dashes).
 *
 *  LETTERS OF EVERY SCRIPT, not `[a-z0-9]`. An ASCII-only class does not merely fail on a
 *  Cyrillic or Greek deck — it fails DANGEROUSLY: every letter is dropped and the sentence
 *  collapses to a run of spaces, which still clears the length guard, so `hay.includes(needle)`
 *  degrades into "does this block have at least as many words" and the cursor lands on an
 *  arbitrary line, confidently. (CJK collapses to the empty string and merely goes silent.)
 *  `\p{L}\p{N}` keeps the letters, so matching stays matching. `frontMatterLang` makes
 *  non-English decks a supported surface, so this is a real deck, not a hypothetical. */
const loose = (s: string): string =>
	norm(s)
		.toLowerCase()
		.replace(/[‘’“”]/g, "'")
		.replace(/[–—]/g, '-')
		.replace(/[^\p{L}\p{N}' -]+/gu, '');

/** Blocks worth pointing at — the same shape the projection walks, minus the containers, so a
 *  match lands on the paragraph rather than on the `<section>` that also contains it. */
const BLOCK_SELECTOR = 'p, li, dd, dt, blockquote, figcaption, h1, h2, h3, h4, th, td, code';

/**
 * The element inside `frameDoc` that a spoken sentence came from, or null.
 *
 * Smallest-containing-block, not first-match: a `<li>` inside a `<ul>` inside a `<section>` all
 * "contain" the sentence, and only the `<li>` is worth pointing at. Ties break INWARD — see the
 * loop, where document order would otherwise hand back the wrapper.
 */
export function findCueTarget(frameDoc: Document | null, text: string): Element | null {
	if (!frameDoc) return null;
	const needle = loose(text);
	// Long enough to identify something, and carrying at least one letter or digit. A needle of
	// pure separators would match the first block with as many of them, which is not a match.
	if (needle.length < 3 || !/[\p{L}\p{N}]/u.test(needle)) return null;
	let best: Element | null = null;
	let bestLen = Number.POSITIVE_INFINITY;
	for (const el of frameDoc.querySelectorAll(BLOCK_SELECTOR)) {
		const hay = loose(el.textContent ?? '');
		if (!hay) continue;
		// CONTAINMENT ONE WAY ONLY: the block must contain the sentence. The reverse — a block
		// whose text is a SUBSTRING of the sentence — was allowed here for reach, and it is a
		// target-picking machine for the wrong element: any such block is by definition shorter
		// than the paragraph that really holds the sentence, so smallest-wins always prefers it.
		// A heading, a kicker, a table cell or an inline `<code>` whose words recur in the
		// sentence beneath it takes the cursor every time — the everyday Lattice slide shape.
		//
		// Measured over the 124 decks in `examples/` + `test/integration/baseline-decks/`
		// (5,551 cues): the reverse branch raised the match rate from 83.5% to 90.7% and
		// produced 639 hits on an element holding less than half the spoken sentence. Without
		// it: ZERO such hits, and the number of slides where the cursor never moves barely
		// changes (64 → 62). It bought reach by pointing somewhere wrong.
		if (!hay.includes(needle)) continue;
		// Strictly smaller wins. On a TIE, prefer the one nested inside the incumbent: a
		// `<blockquote>` wrapping a single `<p>` has byte-identical text, and document order hands
		// you the blockquote — so a plain `<` kept pointing at the wrapper instead of the line.
		// (The `quote` component is exactly that shape, so this is not a hypothetical.)
		if (hay.length < bestLen || (hay.length === bestLen && (best as Element | null)?.contains(el))) {
			best = el;
			bestLen = hay.length;
		}
	}
	return best;
}

/** The spoken text of a cue, in the form the DOM would show it (display, not spoken — the
 *  spoken form has acronyms expanded and say-as applied, which the slide does not contain). */
export function cueDisplayText(cue: { words?: { display?: string }[] } | null | undefined): string {
	if (!cue?.words?.length) return '';
	return norm(cue.words.map((w) => w.display ?? '').join(' '));
}

/** The Vetrina cursor's own footprint, in PARENT pixels — a 28x28 box centered on the point it
 *  is placed at (`stage.ts`: `width:28px;height:28px;transform:translate(-50%,-50%)`). It does
 *  not scale with the frame, because the cursor lives in the parent document, not in the slide. */
export const POINTER_BOX = 28;

export type Box = { left: number; top: number; width: number; height: number };

const overlaps = (a: Box, b: Box): boolean => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
const boxAt = (x: number, y: number, half: number): Box => ({ left: x - half, top: y - half, width: half * 2, height: half * 2 });
const inside = (b: Box, f: Box): boolean => b.left >= f.left && b.top >= f.top && b.left + b.width <= f.left + f.width && b.top + b.height <= f.top + f.height;

/**
 * Where to put the pointer so it POINTS AT `target` without covering ANY text on the slide.
 *
 * THE POINTER MUST NEVER OBSCURE THE TEXT IT IS READING. Vetrina's `aimAt` lands a cue INSIDE
 * its target's box (`left + 22`, `top + 18`) — right for a walkthrough aiming at a button,
 * because that is where a click lands, and exactly wrong for a line of prose: the arrow tip lands
 * mid-first-line and its 28px body hangs across the opening words. Guide shipped that.
 *
 * CLEARING THE TARGET IS NOT ENOUGH, and that is the whole reason this takes `obstacles`. The
 * first version tried four positions around the target's own box and still failed on the real
 * surface, because the obvious place to stand — just below a heading — is where the paragraph
 * is. A slide is mostly text; the pointer has to find the whitespace, not merely step off one
 * block.
 *
 * So: candidate positions on the four sides at three distances, plus the slide's own left and
 * right margins, scored by how much text they would cover and then by how far they sit from the
 * thing being named. The nearest position that covers nothing wins; if a slide genuinely has no
 * clear spot the least-covering one does, because a pointer slightly over a neighbor still beats
 * a pointer half off the card.
 *
 * Everything is in ONE coordinate space — the caller works in the frame's INNER coordinates and
 * maps the result out, so the anchor is computed once per cue and rides the frame's scale and
 * position for free rather than being recomputed every animation frame.
 */
export function pointerAnchor(target: Box, frame: Box, obstacles: readonly Box[] = [], half: number = POINTER_BOX / 2): { x: number; y: number } {
	const pad = half + 5;
	const midY = target.top + target.height / 2;
	const nearX = target.left + Math.min(target.width / 2, pad);
	const candidates: Array<{ x: number; y: number }> = [];
	for (const gap of [5, 20, 44]) {
		candidates.push({ x: target.left - gap - half, y: midY }); // left margin, level — the classic deictic
		candidates.push({ x: nearX, y: target.top + target.height + gap + half }); // under the line
		candidates.push({ x: nearX, y: target.top - gap - half }); // above it
		candidates.push({ x: target.left + target.width + gap + half, y: midY }); // right margin, level
	}
	// The slide's own margins, as a last resort before giving up on clearance entirely.
	candidates.push({ x: frame.left + pad, y: midY }, { x: frame.left + frame.width - pad, y: midY });

	let best: { x: number; y: number } | null = null;
	let bestScore = Number.POSITIVE_INFINITY;
	for (const c of candidates) {
		const box = boxAt(c.x, c.y, half);
		if (!inside(box, frame)) continue; // a pointer half off the card reads as a bug, not a gesture
		const hits = obstacles.reduce((n, o) => n + (overlaps(box, o) ? 1 : 0), 0);
		const dist = Math.hypot(c.x - target.left, c.y - midY);
		const score = hits * 1e6 + dist;
		if (score < bestScore) {
			bestScore = score;
			best = c;
		}
	}
	if (best) return best;
	const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
	return {
		x: clamp(nearX, frame.left + pad, frame.left + frame.width - pad),
		y: clamp(target.top + target.height + 5 + half, frame.top + pad, frame.top + frame.height - pad),
	};
}

/**
 * A live `RectSource` for the cue currently being spoken — the thing Vetrina points at.
 *
 * The ELEMENT is resolved once, here, and captured. What stays live is its RECT: the returned
 * source re-measures on every call, because the element moves under two independent forces (the
 * slide's own reflow and the frame's scale/position within its pane) and a rect read once goes
 * stale under either. Re-resolving the element every frame would buy nothing — the slide's DOM does
 * not change while one sentence is spoken — and would cost a `querySelectorAll` per frame.
 *
 * Returns null when nothing on the slide contains the spoken sentence. That is a real state, not
 * an error: a slide narrated by a speaker note says things the slide does not show. The CALLER
 * must then hide the cursor (`setCursorVisible(false)`) rather than leave it parked on the last
 * sentence's target — a stationary cursor is read as a claim about whatever it sits on.
 *
 * The rect handed back is NOT the matched element's box — it is a small anchor beside it, chosen
 * by `pointerAnchor` so the cursor points at the text without covering it. Vetrina aims a cue
 * inside its target's box, which is right for a button and wrong for a sentence, and the host is
 * the side that knows which of those it just resolved.
 */
export function guideTargetFor(getFrame: () => HTMLIFrameElement | null, text: string): RectSource | null {
	const frame = getFrame();
	const doc = (() => {
		try {
			return frame?.contentDocument ?? null;
		} catch {
			return null;
		}
	})();
	const el = findCueTarget(doc, text);
	if (!el || !doc) return null;

	// Solve the placement ONCE, in the frame's INNER coordinates, and map it out every frame.
	//
	// Not per frame: finding whitespace means measuring every block on the slide, and doing that
	// at 60fps to answer a question whose inputs cannot change mid-sentence would be real
	// main-thread work on the one surface that must not stutter. The slide's own layout is fixed
	// while a sentence is spoken; what moves is the FRAME, and mapping an inner point out through
	// `frameGeom` picks that up for free — which is the same reason `frameRectSource` re-measures
	// rather than snapshotting (#1400).
	const geom0 = frameGeom(getFrame());
	const S = geom0?.S ?? 1;
	const root = doc.documentElement.getBoundingClientRect();
	const obstacles: Box[] = [];
	for (const node of doc.querySelectorAll(BLOCK_SELECTOR)) {
		const r = node.getBoundingClientRect();
		if (r.width > 0 && r.height > 0 && (node.textContent ?? '').trim()) obstacles.push({ left: r.left, top: r.top, width: r.width, height: r.height });
	}
	const t0 = el.getBoundingClientRect();
	// The pointer's 28px is PARENT pixels and does not scale with the frame, so its half-extent in
	// inner coordinates is `half / S` — the one conversion that has to happen for this to be right
	// on a scaled preview.
	const anchor = pointerAnchor(
		{ left: t0.left, top: t0.top, width: t0.width, height: t0.height },
		{ left: root.left, top: root.top, width: root.width, height: root.height },
		obstacles,
		POINTER_BOX / 2 / (S || 1),
	);

	const GONE = { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, toJSON: () => ({}) } as DOMRect;
	return {
		getBoundingClientRect(): DOMRect {
			try {
				const geom = frameGeom(getFrame());
				if (!geom || !el.isConnected) return GONE;
				// A 2x2 box centered on the anchor: `aimAt` takes `left + min(w/2, 22)`, so a box
				// this small resolves to the anchor point itself rather than to an offset into it.
				const r = innerRectToParent({ left: anchor.x - 1, top: anchor.y - 1, width: 2, height: 2 }, geom);
				return { x: r.left, y: r.top, left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom, toJSON: () => ({ left: r.left, top: r.top, width: r.width, height: r.height }) } as DOMRect;
			} catch {
				return GONE; // a cross-origin or torn-down frame is "nowhere", never a throw
			}
		},
	};
}
