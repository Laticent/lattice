// WHICH RENDERED SLIDES A SOURCE SLIDE BECOMES — the Studio's map through a split panes slide.
//
// The Studio counts slides as SOURCE CHUNKS (`splitSlides` in ./lint): the rail, the caret, lint's
// slide numbers and every write-back path (deck-ops.ts, motion-sheet.ts, compose deck-source.ts)
// index that list. The engine renders a panes slide it SPLITS (lib/core/panes.js
// `installPaneSplit`: always on a square, portrait, story or mobile deck, and on a 16:9 one whose
// two components fit neither way) as one slide per pane. So after one, "chunk k" is no longer
// "rendered slide k", and the preview, which narrows a whole-deck render by index, used to take
// its alignment fallback and show the chunk alone, first pane only.
//
// The chunks are NOT cut here, on purpose. They feed write-back, and a chunk cut at the second
// pane marker would write that cut into the author's source as a `---`. The map rides beside the
// chunk list instead: `counts[i]` is how many rendered slides chunk i becomes, and a split chunk
// is shown the way a structurally split slide already is — one PAGE at a time, the page that holds
// the caret (single-slide-render.ts), with the ‹ › verbs stepping through it (StudioShell).
//
// The split rule is `lintCore.paneSplitLine`, the linter's reading of the SAME `arrangePanes`
// call the engine makes (lib/core/pane-spec.js), so the map, `lint:deck` and the render cannot
// disagree about where a slide ends. `authoring-core.generated.js` is already in the Studio's
// eager chunk (architect.ts imports it statically), so this import adds no route bytes.

import { caretProbe } from '@/lib/caret-probe';
import { lintCore } from '@/playground/authoring-core.generated.js';

const core = lintCore as unknown as { paneSplitLine: (slide: string, source: string) => number };

/** The probe the shared position guard refuses on (`positionIsTrustworthy`): any pane marker. */
const PANE_PROBE = /<!--\s*pane\s*:/;

/** A pane marker alone on its line (lib/core/pane-spec.js `PANE_RE`). */
const PANE_MARKER = /^<!--\s*pane:\s*([a-z][\w-]*)\s*-->$/;

/** The 0-based line of `chunk` that starts its second rendered slide, or -1 when it renders as
 *  one. `deck` is the whole document the engine renders (front matter included), for its size. */
export function paneSplitLineOf(chunk: string, deck: string): number {
	const text = String(chunk ?? '');
	if (!text.includes('pane:')) return -1; // the cheap reject every non-panes slide takes
	try {
		return core.paneSplitLine(text, String(deck ?? ''));
	} catch {
		return -1; // an unreadable slide renders as whatever the engine makes of it; do not guess
	}
}

/** How many rendered slides each chunk becomes (1, or 2 for a split panes slide), index-aligned
 *  with `slides`. */
export function renderedPageCounts(slides: readonly string[], deck: string): number[] {
	return slides.map((s) => (paneSplitLineOf(s, deck) >= 0 ? 2 : 1));
}

/** The map for a deck that carries pane markers, or `undefined` for every other deck — which
 *  then hands the preview nothing new and renders exactly as before.
 *
 *  A panes deck gets the map even when nothing in it splits (a 16:9 deck whose panes fit: all
 *  ones). The shared position guard (lib/diagnostics/slice-equivalence-core.mjs
 *  `positionIsTrustworthy`) refuses to hand a panes deck its page position without one, because
 *  it cannot tell by itself whether a slide splits; the map is the caller saying so. */
export function paneSplitCounts(slides: readonly string[], deck: string): number[] | undefined {
	if (!slides.some((s) => PANE_PROBE.test(s))) return undefined;
	return renderedPageCounts(slides, deck);
}

/**
 * Which rendered page of a split panes chunk holds the caret line, or `undefined` to keep the
 * page already shown.
 *
 * Structural, not scored: the line is found in the chunk's own source, and its position against
 * the markers decides. Before the first marker is the masthead, which every page carries, so it
 * keeps the page shown (crossing the heading does not flash page one). The editor reports the
 * caret line's raw markdown (CodeMirror) or its plain text (Compose); both are compared through
 * `caretProbe`, the normalizer the structural-split pick uses. A line whose text appears in both
 * panes, a blank line and a line too short to place all keep the page shown.
 */
export function panePageOfCaret(chunk: string, deck: string, caretText: string): number | undefined {
	const cut = paneSplitLineOf(chunk, deck);
	if (cut < 0) return undefined;
	// The raw line first (a marker or a directive normalizes to nothing), then the normalized text.
	const raw = String(caretText ?? '').trim();
	const probe = caretProbe(raw);
	if (!raw) return undefined;
	const lines = String(chunk).split('\n');
	const first = lines.findIndex((l) => PANE_MARKER.test(l.trim()));
	const pages = new Set<number>();
	lines.forEach((line, i) => {
		if (first < 0 || i < first) return; // masthead: on every page
		if (line.trim() === raw || (probe.length >= 3 && caretProbe(line) === probe)) pages.add(i >= cut ? 1 : 0);
	});
	return pages.size === 1 ? [...pages][0] : undefined;
}

/** The components a deck puts in a pane (`<!-- pane: X -->`), unique, in order. A saved component
 *  used ONLY in a pane is still used: its CSS has to reach the preview and the export, or the
 *  pane renders unstyled (lib/layout/bridge.js `referencedComponents` reads the same markers). */
export function paneMarkerComponents(src: string): string[] {
	const out = new Set<string>();
	for (const line of String(src ?? '').split('\n')) {
		const m = PANE_MARKER.exec(line.trim());
		if (m) out.add(m[1]);
	}
	return [...out];
}
