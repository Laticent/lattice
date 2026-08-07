// The narration PRECEDENCE, resolved in one place for every Studio surface that has to
// answer "what does this slide say out loud?".
//
// WHY THIS EXISTS. Three surfaces ask that question and they must agree exactly:
//
//   · Present / Prepare  — synthesizes the answer and stores the clip under a key built
//                          from the SPOKEN text (`voice.clipKey`).
//   · the caption export — writes the answer into the `.vtt` sidecars.
//   · the webpage export — looks the answer's clips UP in that same store to bake them
//                          into a shared deck.
//
// The third one is why a near-miss stops being cosmetic. A cache key is content-complete:
// if the export resolves a slide's narration even slightly differently from the surface
// that synthesized it, the lookup does not degrade — it MISSES, silently and permanently.
// The author would Prepare the whole deck, watch it complete, and still be told the export
// found no audio for that slide, with no action available to fix it.
//
// That was not hypothetical. Present resolved `caption -> front-matter caption -> note ->
// CHART FACTS -> projection` while the docs-site export resolved the same chain WITHOUT the
// chart rung, so every recognized chart slide (funnel, radar, quadrant, weighted journey,
// state chart) narrated its computed facts live and its heading-only figure projection on
// export. The CLI had already closed that gap for its own captions (#902 Gap 1,
// lattice-emulator.js); the browser export had not. `applyChartNarration` below is that
// same substitution, shared rather than copied a third time.

import { narrateChart as narrateChartDefault } from '@/playground/read-along-core.generated.js';

/** What a single slide offers, in precedence order. Every field is optional: each caller
 *  supplies the rungs it actually has, and a blank/whitespace value never wins. */
export type NarrationChain = {
	/** 1. the slide's inline `<!-- caption: … -->` — the author's exact read-as text. */
	caption?: string | null;
	/** 2. the front-matter `captions:` entry for this slide (keyed by AUTHORED number). */
	fmCaption?: string | null;
	/** 3. the authored speaker note. */
	note?: string | null;
	/** 4. a recognized chart's COMPUTED facts (`narrateChart`) — a funnel's conversion rate,
	 *     the auto-fit scale an unlabeled axis is plotted against — which exist only in the
	 *     render and never in the figure projection's heading-only caption. */
	chart?: string | null;
	/** 5. the component-aware DOM speech projection for this slide. */
	projected?: string | null;
	/** 6. a last-resort local flatten, for a surface that has to say SOMETHING before the
	 *     async projection lands (Present opens instantly; the export never needs this). */
	fallback?: string | null;
};

/** The one precedence ladder. Pure, synchronous, and total — an all-blank chain reads as
 *  silence (`''`), which is a legitimate answer for a genuinely contentless slide. */
export function resolveNarration(chain: NarrationChain): string {
	const rungs = [chain.caption, chain.fmCaption, chain.note, chain.chart, chain.projected, chain.fallback];
	for (const rung of rungs) {
		// Trim only to TEST the rung — a caption's own leading/trailing space is the author's,
		// and `buildTrack` is what normalizes for speech.
		if (String(rung ?? '').trim()) return rung as string;
	}
	return '';
}

/**
 * Substitute each recognized chart slide's computed narration into the DOM projection, at
 * the PROJECTION precedence level — so an inline caption, a front-matter caption, or a
 * speaker note still wins, exactly as `resolveNarration` and the CLI both order it.
 *
 * Returns a NEW array; `projected` is not mutated. When the two inputs disagree on length
 * the projection is returned untouched: an index mapping we cannot trust would bind a
 * chart's facts to the wrong slide, which is worse than the heading-only caption it would
 * have replaced. (In the Studio they always agree — the docs render never runs the CLI's
 * Fit-Spine autosplit — so the guard is belt-and-suspenders rather than a live path.)
 *
 * A single pathological slide cannot disable narration for the rest of the deck: each
 * narrator call is guarded on its own.
 *
 * @param slidesMd per-slide source Markdown, fences INTACT (a `diagram` slide's Mermaid
 *        narrator needs the fence — it is gone from a baked render)
 * @param projected the component-aware projection, index-aligned to `slidesMd`
 * @param narrateChart injectable for tests; defaults to the shared kernel's narrator
 */
export function applyChartNarration(
	slidesMd: readonly string[],
	projected: readonly string[],
	narrateChart: (md: string) => string | null = narrateChartDefault,
): string[] {
	const out = [...projected];
	if (!slidesMd.length || slidesMd.length !== projected.length) return out;
	for (let i = 0; i < slidesMd.length; i++) {
		try {
			const chart = narrateChart(slidesMd[i]);
			if (String(chart ?? '').trim()) out[i] = chart as string;
		} catch {
			// This slide keeps its projection. Never let one chart take the deck down.
		}
	}
	return out;
}
