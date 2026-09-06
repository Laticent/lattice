// Anima — FRAMES: the beats a compiled scene actually paints.
//
// `2026-09-02-frame-model-for-motion.md` §1 says a motion is a finite, ordered set of known
// frames, and frame k is `at(k/N)` — a deterministic still. This module is what turns a
// compiled `Timeline` into that set, so a surface can SHOW the frames instead of describing
// them. It is pure: no DOM, no clock, no renderer. `compile()` supplies the truth; this only
// picks the moments worth looking at and reports what is true at each one.
//
// ── WHY THIS IS NOT `marks + labels + settle` ───────────────────────────────────────────────
//
// The obvious formula — "5 bands, then the labels, then settled, so 7 frames" — is wrong in
// four separate ways, each measured against `chart-anima.ts` rather than assumed. A frame strip
// built on that formula would state counts a viewer never sees:
//
//  1. **A synchronized build has ONE window, not N.** `chart-anima.ts:286` sets
//     `synchronized = style === 'together' || isSector`, and a sector chart (`role === 'sector'`
//     — a pie or donut) is synchronized under EVERY style, deliberately: a staggered disc reads
//     as "missing a slice", not "assembling". So a 5-slice pie has one reveal window, and
//     calling it 5 frames is a lie about what the viewer sees.
//  2. **Labels are always ONE window, whatever their count.** `labelAt` (`chart-anima.ts:322`)
//     is computed once, outside the loop. Five labels and fifty labels both add one beat.
//  3. **There is no settle beat in the timeline.** Nothing emits a terminal window; "settled" is
//     the HOST holding the last frame (`hydrate.ts:290`). It is a real state a viewer sees, so
//     this module reports it — as the final beat's condition, never as an extra window.
//  4. **Adjacent windows ALWAYS overlap, by construction.** Mark *i*'s window is
//     `[i·slot, i·slot + slot + 0.08]` (`chart-anima.ts:301-302`), so mark *i+1* opens 0.08 of
//     the duration BEFORE mark *i* finishes — 160 ms at the fastest speed, 432 ms at the
//     slowest. There is never an instant where one mark has finished and the next has not begun.
//     A beat is therefore a moment where something STARTS, not a moment where everything is
//     still: `partial` reports what is still arriving, so the UI can show it rather than imply a
//     crispness the engine does not produce.
//
// The emphasis beat (`highlight`) is conditional and funnel-only in practice —
// `hydrateChart` sources `highlightMarks` from `worstMarks`, which returns `[]` unless the chart
// has ≥2 `.funnel-band[data-value]` nodes — so it is discovered from the scene, never assumed.

import type { Motion, Scene, SceneState, Timeline } from './types';

/**
 * Two beats closer together than this are ONE beat to a viewer.
 *
 * The number is the engine's own: `chart-anima.ts:302` overlaps adjacent mark windows by 0.08 of
 * the duration, and at the fastest speed (`speedToDurationMs('fast') === 2000`) that overlap is
 * 160 ms. A separation below this floor cannot be read as two distinct events, so reporting two
 * frames there would over-count what the viewer actually perceives.
 */
export const MERGE_FLOOR_MS = 120;

/** What is true at one beat. `k` is the index a UI shows; `at` is the `k/N` of the frame model. */
export interface FrameBeat {
	k: number;
	/** Normalized position in the timeline, 0..1 — the `t` of `at(t)`. */
	at: number;
	atMs: number;
	/** How long this beat holds before the next opens. The last beat holds to the end. */
	holdMs: number;
	/** Elements whose reveal window OPENS here — what this beat starts bringing in. This is the
	 *  event a viewer perceives, and it is why a beat is an opening rather than a closing: a
	 *  strip keyed on closings spends most of its frames on moments where nothing happens. */
	enters: string[];
	/** Elements fully present at this beat. Grows monotonically; complete on the settled beat. */
	arrived: string[];
	/** Elements still mid-reveal here, with their progress. This is the honest half: on a chart
	 *  build most beats have one, because the windows overlap. */
	partial: { id: string; reveal: number }[];
	/** Every element fully present. The final beat is the still an export prints. */
	settled: boolean;
	/** Beats folded into this one for being under `MERGE_FLOOR_MS` apart. 0 normally. */
	merged: number;
}

export interface FrameSet {
	beats: FrameBeat[];
	durationMs: number;
	/** Every mark shares one window — `together`, or any sector chart. The build is a single
	 *  fade, and a UI must not describe it as a sequence of N. */
	synchronized: boolean;
	/** True when the scene carries a `highlight`, i.e. the engine chose a mark to emphasize.
	 *  Funnels only in practice; discovered here, never assumed. */
	emphasizes: boolean;
}

/** The verbs that bring an element INTO the picture, and so define a beat. `slide` is excluded
 *  deliberately: `rise` co-windows it with the reveal (`chart-anima.ts:307`), so counting it
 *  would double every beat of a `rise` build without adding a moment a viewer can see. */
type WindowedMotion = Extract<Motion, { verb: 'reveal' | 'draw' | 'trace' }>;
const isRevealing = (m: Motion): m is WindowedMotion => m.verb === 'reveal' || m.verb === 'draw' || m.verb === 'trace';
const windowOf = (m: WindowedMotion) => ({
	at: Math.min(1, Math.max(0, typeof m.at === 'number' ? m.at : 0)),
	span: typeof m.span === 'number' ? m.span : 1,
});

/** Every element in a scene, flattened — a built scene nests, an svg scene is flat. */
function allElements(scene: Scene): { id: string; motion?: readonly Motion[] }[] {
	const out: { id: string; motion?: readonly Motion[] }[] = [];
	const walk = (els: readonly { id: string; motion?: readonly Motion[]; children?: readonly unknown[] }[]) => {
		for (const el of els) {
			out.push({ id: el.id, motion: el.motion });
			if (Array.isArray(el.children)) walk(el.children as typeof els);
		}
	};
	walk(scene.elements as unknown as Parameters<typeof walk>[0]);
	return out;
}

/**
 * The moments worth looking at: where a reveal window OPENS, plus the end of the timeline.
 *
 * Openings, not closings — measured, not assumed. Keying on both edges was the first draft, and
 * running it over a real 5-band funnel produced ELEVEN beats, seven of which completed nothing:
 * because windows overlap by 0.08 (`chart-anima.ts:302`), every closing falls in the middle of
 * the next mark's arrival, so it reads as a frame where nothing happened. Openings give the
 * events a viewer can actually name — "band 3 arrives" — and the final beat at `t = 1` supplies
 * the one moment the build is complete, which is the still an export prints (§2.3).
 */
function beatTimes(scene: Scene): number[] {
	const times = new Set<number>([0, 1]);
	for (const el of allElements(scene)) {
		for (const m of el.motion ?? []) {
			if (isRevealing(m)) times.add(windowOf(m).at);
		}
	}
	return [...times].sort((a, b) => a - b);
}

/** The reveal windows that open at exactly `t`, by element id. */
function opensAt(scene: Scene, t: number): string[] {
	const ids: string[] = [];
	for (const el of allElements(scene)) {
		for (const m of el.motion ?? []) {
			if (isRevealing(m) && windowOf(m).at === t) ids.push(el.id);
		}
	}
	return ids;
}

const revealOf = (state: SceneState, id: string): number => {
	const walk = (els: readonly { id: string; reveal: number; children?: readonly unknown[] }[]): number | null => {
		for (const el of els) {
			if (el.id === id) return el.reveal;
			if (Array.isArray(el.children)) {
				const hit = walk(el.children as typeof els);
				if (hit != null) return hit;
			}
		}
		return null;
	};
	return walk(state.elements as unknown as Parameters<typeof walk>[0]) ?? 1;
};

/**
 * The frame set a compiled scene paints.
 *
 * Grounded in the compiler rather than in a second reading of the windows: every reported state
 * comes from `timeline.at(t)`, so easing, clamping and window arithmetic are the engine's, not a
 * re-implementation that could drift from it.
 */
export function framesOf(scene: Scene, timeline: Timeline): FrameSet {
	const durationMs = timeline.durationMs;
	const els = allElements(scene);
	const revealing = els.filter((e) => (e.motion ?? []).some(isRevealing));

	// A build is synchronized when every revealing element opens at the same moment AND closes at
	// the same moment. Read from the scene rather than passed in, so a caller cannot mislabel it.
	const windows = revealing.map((e) => {
		const m = (e.motion ?? []).find(isRevealing);
		if (!m) return 'none';
		const w = windowOf(m);
		return `${w.at}:${w.span}`;
	});
	const synchronized = windows.length > 1 && new Set(windows).size === 1;
	const emphasizes = els.some((e) => (e.motion ?? []).some((m) => m.verb === 'highlight'));

	const raw = beatTimes(scene).map((at) => {
		const state = timeline.at(at * durationMs);
		const reveals = revealing.map((e) => ({ id: e.id, reveal: revealOf(state, e.id) }));
		return {
			at,
			atMs: at * durationMs,
			enters: opensAt(scene, at),
			arrived: reveals.filter((r) => r.reveal >= 1).map((r) => r.id),
			partial: reveals.filter((r) => r.reveal > 0 && r.reveal < 1).map((r) => ({ id: r.id, reveal: r.reveal })),
			settled: reveals.every((r) => r.reveal >= 1),
		};
	});

	// Fold beats that sit under the legibility floor into the one before them. The count they
	// carry is kept rather than discarded — a UI that says "2 marks arrive together" is telling
	// the truth, and one that silently showed a beat the viewer cannot resolve is not.
	const kept: typeof raw = [];
	const mergedInto: number[] = [];
	for (const beat of raw) {
		const prev = kept[kept.length - 1];
		if (prev && beat.atMs - prev.atMs < MERGE_FLOOR_MS) {
			// The later state is the one held, but the entrances of BOTH are what arrived — a
			// merged beat says "two marks arrive together", which is what the viewer sees.
			kept[kept.length - 1] = { ...beat, enters: [...prev.enters, ...beat.enters] };
			mergedInto[kept.length - 1] = (mergedInto[kept.length - 1] ?? 0) + 1;
			continue;
		}
		kept.push(beat);
		mergedInto.push(0);
	}

	const beats: FrameBeat[] = kept.map((beat, i) => {
		const next = kept[i + 1];
		return {
			k: i,
			at: beat.at,
			atMs: beat.atMs,
			holdMs: (next ? next.atMs : durationMs) - beat.atMs,
			enters: beat.enters,
			arrived: beat.arrived,
			partial: beat.partial,
			settled: beat.settled,
			merged: mergedInto[i] ?? 0,
		};
	});

	return { beats, durationMs, synchronized, emphasizes };
}
