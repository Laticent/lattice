import type { RectSource } from '@/lib/vetrina';
import { frameRectSource } from '@/playground/frame-geom.js';

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
 *  punctuation the projection rewrote (a terminating period it added, curly quotes, dashes). */
const loose = (s: string): string =>
	norm(s)
		.toLowerCase()
		.replace(/[‘’“”]/g, "'")
		.replace(/[–—]/g, '-')
		.replace(/[^a-z0-9' -]+/g, '');

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
	if (needle.length < 3) return null; // too short to identify anything honestly
	let best: Element | null = null;
	let bestLen = Number.POSITIVE_INFINITY;
	for (const el of frameDoc.querySelectorAll(BLOCK_SELECTOR)) {
		const hay = loose(el.textContent ?? '');
		if (!hay) continue;
		if (!(hay.includes(needle) || (needle.length > 24 && hay.length > 8 && needle.includes(hay)))) continue;
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

/**
 * A live `RectSource` for the cue currently being spoken — the thing Vetrina points at.
 *
 * Resolution is deferred into the rect source rather than done once: the frame's own geometry
 * moves with its host's layout, and re-querying is cheap next to being wrong. Returns null when
 * nothing matches, which Vetrina treats as "no target" (a no-op cue) rather than an error — a
 * slide whose narration is a speaker note has no on-slide text to point at, and that is fine.
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
	if (!el) return null;
	return frameRectSource(getFrame, () => el);
}
