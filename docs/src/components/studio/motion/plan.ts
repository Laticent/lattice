// THE PLAN — beats in, an Anima scene out, and back again.
//
// The authored model is a numbered RUNNING ORDER: parts sit in beats 1..N, and parts sharing a beat
// arrive together. That is the whole thing a user holds. There is no clock, no easing curve and no
// poster slider, because `2026-09-02-frame-model-for-motion.md` deleted all three as authored
// surfaces — motion is a finite ordered set of known frames, and a beat IS `k`.
//
// Compilation is arithmetic, done once, here:
//
//   N        = the number of distinct beats
//   beat k   → at = (k-1)/N, span = 1/N        (explicit per-part windows)
//   duration = N × beatMs                       (Calm 900 ms · Brisk 550 ms)
//   hero     = 1                                (the poster IS the settled last frame)
//
// WHY EXPLICIT WINDOWS AND NOT `sequence`: `compile.ts` implements `sequence` by tiling the WHOLE
// sequenced subset in tree pre-order — it knows nothing about beats. Emitting it would mean the user
// sets three beats and the deck plays eight evenly-spaced ones. Explicit `at`/`span` is what
// `compile` honors exactly, so the beats you see are the beats the deck plays.
//
// WHY `hero: 1`: `compile.ts`'s `poster()` samples `at(hero × duration)`, so the still the PDF
// freezes is the finished drawing. A half-drawn diagram is a defect, not a fallback.

import { parseScene, type Scene } from '@/lib/anima';
import type { IntakePart } from './svg-intake';

/** What a part does when its beat arrives. Every one maps to a verb that is PAINTED today —
 *  verified in `backends/svg-paint.ts` and `backends/drawable.ts`. `fill` is deliberately absent:
 *  `compile.ts` computes `level` and no backend reads it, so a control for it would not move. */
export type Role = 'draw' | 'fade' | 'slide' | 'still';

export type Pace = 'calm' | 'brisk';

/** Milliseconds per beat. Two words rather than a slider, because a slider invites tuning a clock
 *  the frame model says does not exist. Both are chosen defaults: a 4-beat Calm plan runs 3.6s,
 *  near the 3000ms `examples/anima-scene.md` authors by hand. */
export const PACE_MS: Record<Pace, number> = { calm: 900, brisk: 550 };

/** Where a sliding part comes from, as a fraction of the viewBox. Named directions rather than a
 *  free vector: the frame model has no clock to tune, and neither should this. */
export type SlideFrom = 'left' | 'right' | 'above' | 'below';

export interface PartPlan {
	role: Role;
	/** 1-based. Parts sharing a beat arrive together. */
	beat: number;
	from: SlideFrom;
	emphasize: boolean;
}

export type Plan = Map<string, PartPlan>;

export const DEFAULT_PART_PLAN: PartPlan = { role: 'fade', beat: 1, from: 'left', emphasize: false };

/** Slide distance as a fraction of the drawing's own box, so it reads the same at any size. */
const SLIDE_FRACTION = 0.18;

/**
 * `compile()`'s `at()` takes MILLISECONDS and derives `progress = t / durationMs`.
 *
 * This helper exists so that fact lives in exactly one place. Handing `at()` the frame model's own
 * `k/N` fraction — which is how every document in this repo writes it — seeks to progress ~0, and a
 * frame strip built that way shows frame 0 forever while looking perfectly correct.
 */
export function seekMs(fraction: number, durationMs: number): number {
	return Math.max(0, Math.min(1, fraction)) * durationMs;
}

/** The distinct beats a plan uses, in order, with gaps closed — so deleting a beat cannot leave a
 *  hole that would compile into dead time. */
export function beatsOf(plan: Plan): number[] {
	return Array.from(new Set(Array.from(plan.values()).map((p) => p.beat))).sort((a, b) => a - b);
}

function slideVector(from: SlideFrom, box: readonly [number, number, number, number]): [number, number] {
	// Rounded for the same reason `at` and `span` are: this lands in a fence a human reads and a
	// reviewer diffs, and `320 × 0.18` in binary floating point is 57.599999999999994.
	const round = (v: number) => Number(v.toFixed(4));
	const dx = round(box[2] * SLIDE_FRACTION);
	const dy = round(box[3] * SLIDE_FRACTION);
	if (from === 'left') return [-dx, 0];
	if (from === 'right') return [dx, 0];
	if (from === 'above') return [0, -dy];
	return [0, dy];
}

/**
 * Turn the running order into an Anima scene.
 *
 * A `still` part carries no presence verb — it is simply there from frame 0, which is the right
 * answer for a background frame and is why "Already there" is a role rather than an absence.
 * A part with no verbs at all is omitted from `elements` entirely: `parseScene` requires a unique
 * `pathRef` per element and an element that does nothing only costs a `getBBox` at mount.
 */
export function planToScene(parts: IntakePart[], plan: Plan, pace: Pace, assetName: string, box: readonly [number, number, number, number]): Scene {
	const beats = beatsOf(plan);
	const n = Math.max(1, beats.length);
	const durationMs = n * PACE_MS[pace];
	const rank = new Map(beats.map((b, i) => [b, i]));

	const elements = parts
		.map((part) => {
			const p = plan.get(part.pathRef) ?? DEFAULT_PART_PLAN;
			const k = rank.get(p.beat) ?? 0;
			const at = Number((k / n).toFixed(6));
			const span = Number((1 / n).toFixed(6));
			const motion: Record<string, unknown>[] = [];

			// `parseScene` REJECTS `reveal` combined with `draw`/`trace` on one element, so the role is a
			// radio rather than two toggles and the invalid combination is unreachable by construction.
			if (p.role === 'draw') motion.push({ verb: 'draw', at, span });
			else if (p.role === 'fade') motion.push({ verb: 'reveal', at, span });
			else if (p.role === 'slide') {
				// Slide pairs with reveal deliberately. `slide` alone travels a fully opaque shape home
				// from off-position, which reads as a shape that was always there and merely moved —
				// not as an arrival, which is what a beat means.
				motion.push({ verb: 'reveal', at, span });
				motion.push({ verb: 'slide', at, span, from: slideVector(p.from, box) });
			}
			if (p.emphasize) motion.push({ verb: 'highlight', at, span });

			return motion.length === 0 ? null : { id: part.pathRef, pathRef: part.pathRef, motion };
		})
		.filter((e): e is NonNullable<typeof e> => e !== null);

	return {
		source: 'svg',
		asset: assetName || 'drawing',
		duration: durationMs,
		hero: 1,
		elements,
	} as unknown as Scene;
}

/** Whether a scene's windows quantize to equal beats — the condition for showing it as a running
 *  order at all. A hand-edited or imported spec that does not is shown READ-ONLY rather than
 *  silently re-timed, because `scene` carries no version history to recover from. */
export function isBeatShaped(scene: Scene): boolean {
	if (scene.source !== 'svg' || scene.elements.length === 0) return false;
	const windows = scene.elements.flatMap((el) => (el.motion ?? []).map((m) => m as { at?: number; span?: number }));
	if (windows.length === 0) return false;
	const spans = windows.map((w) => w.span ?? 1);
	const span = spans[0];
	if (!span || span <= 0) return false;
	if (spans.some((s) => Math.abs(s - span) > 1e-4)) return false;
	const n = Math.round(1 / span);
	if (n < 1 || Math.abs(1 / n - span) > 1e-4) return false;
	return windows.every((w) => {
		const k = (w.at ?? 0) * n;
		return Math.abs(k - Math.round(k)) < 1e-4;
	});
}

/**
 * Invert the mapping — a saved asset reopens as the running order that made it.
 *
 * Reopening is a DERIVATION, not a stored blob: `StudioScene` has nowhere to put roles and beats and
 * this design does not add a field. Every UI choice maps onto exactly one spec construct, so the
 * inverse is total for anything this faculty wrote.
 *
 * A `pathRef` with no node in the art is NOT dropped — the caller shows it as a disabled row naming
 * what is missing, because silently losing a user's choreography is the failure the whole §7c
 * data-loss lesson is about.
 */
export function sceneToPlan(scene: Scene): { plan: Plan; pace: Pace; beats: number; beatShaped: boolean } {
	const plan: Plan = new Map();
	if (scene.source !== 'svg') return { plan, pace: 'calm', beats: 1, beatShaped: false };

	const beatShaped = isBeatShaped(scene);
	const spans = scene.elements.flatMap((el) => (el.motion ?? []).map((m) => (m as { span?: number }).span ?? 1));
	const n = beatShaped && spans.length ? Math.max(1, Math.round(1 / spans[0])) : 1;

	for (const el of scene.elements) {
		const motion = (el.motion ?? []) as { verb: string; at?: number; from?: readonly number[] }[];
		const verbs = new Set(motion.map((m) => m.verb));
		const role: Role = verbs.has('draw') || verbs.has('trace') ? 'draw' : verbs.has('slide') ? 'slide' : verbs.has('reveal') ? 'fade' : 'still';
		const at = motion[0]?.at ?? 0;
		const slide = motion.find((m) => m.verb === 'slide');
		const [dx, dy] = [slide?.from?.[0] ?? -1, slide?.from?.[1] ?? 0];
		const from: SlideFrom = Math.abs(dx) >= Math.abs(dy) ? (dx <= 0 ? 'left' : 'right') : dy <= 0 ? 'above' : 'below';
		plan.set(el.pathRef, { role, beat: Math.round(at * n) + 1, from, emphasize: verbs.has('highlight') });
	}

	const perBeat = scene.duration / Math.max(1, n);
	// Nearest of the two, so a re-saved asset does not drift its own pace.
	const pace: Pace = Math.abs(perBeat - PACE_MS.calm) <= Math.abs(perBeat - PACE_MS.brisk) ? 'calm' : 'brisk';
	return { plan, pace, beats: n, beatShaped };
}

/** Validate a scene the way the engine will, so the UI never offers a Save the store would refuse. */
export function validatePlan(scene: Scene): { ok: true } | { ok: false; errors: string[] } {
	const r = parseScene(scene);
	return r.ok ? { ok: true } : { ok: false, errors: r.errors };
}
