// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { beatsOf, DEFAULT_PART_PLAN, isBeatShaped, PACE_MS, type Pace, type Plan, planToScene, sceneToPlan, seekMs, validatePlan } from './plan';
import { intake } from './svg-intake';

const svgOf = (inner: string) => `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const drawing = (n: number) => svgOf(Array.from({ length: n }, (_, i) => `<path id="n${i}" d="M${i} ${i} H${i + 5}" stroke="var(--accent)"/>`).join(''));
const partsOf = (n: number) => {
	const r = intake(drawing(n));
	if (!r.ok) throw new Error(r.message);
	return r;
};
const BOX = [0, 0, 100, 50] as const;

const planFor = (refs: string[], f: (ref: string, i: number) => Partial<(typeof DEFAULT_PART_PLAN)>): Plan =>
	new Map(refs.map((ref, i) => [ref, { ...DEFAULT_PART_PLAN, ...f(ref, i) }]));

describe('beats compile to explicit windows, never to sequence', () => {
	it('three beats tile [0,1] evenly and the duration follows the pace', () => {
		const { parts } = partsOf(3);
		const refs = parts.map((p) => p.pathRef);
		const scene = planToScene(parts, planFor(refs, (_r, i) => ({ beat: i + 1, role: 'fade' })), 'calm', 'flow', BOX);
		expect(scene.duration).toBe(3 * PACE_MS.calm);
		expect(scene.hero).toBe(1);
		const windows = (scene as { elements: { motion: { at: number; span: number }[] }[] }).elements.map((e) => e.motion[0]);
		expect(windows.map((w) => w.at)).toEqual([0, 1 / 3, 2 / 3].map((n) => Number(n.toFixed(6))));
		expect(windows.every((w) => w.span === Number((1 / 3).toFixed(6)))).toBe(true);
	});

	it('rounds the slide vector too — a fence a human reads carries no float noise', () => {
		// `320 × 0.18` is 57.599999999999994 in binary floating point, and that is what shipped into a
		// committed example deck before this rounded.
		const { parts } = partsOf(1);
		const plan = planFor(
			parts.map((p) => p.pathRef),
			() => ({ role: 'slide' as const, from: 'right' as const }),
		);
		const scene = planToScene(parts, plan, 'calm', 'drawing', [0, 0, 320, 180]);
		const el = (scene as unknown as { elements: { motion: { verb: string; from?: [number, number] }[] }[] }).elements[0];
		const slide = el.motion.find((m) => m.verb === 'slide');
		expect(slide?.from).toEqual([57.6, 0]);
	});

	it('never emits `sequence` — compile tiles the whole subset in tree order and would override the beats', () => {
		const { parts } = partsOf(4);
		const scene = planToScene(parts, planFor(parts.map((p) => p.pathRef), () => ({ role: 'draw' })), 'brisk', 'a', BOX);
		const verbs = (scene as { elements: { motion: { verb: string }[] }[] }).elements.flatMap((e) => e.motion.map((m) => m.verb));
		expect(verbs).not.toContain('sequence');
	});

	it('parts sharing a beat share a window — that is what "arrive together" means', () => {
		const { parts } = partsOf(3);
		const refs = parts.map((p) => p.pathRef);
		const scene = planToScene(parts, planFor(refs, (_r, i) => ({ beat: i === 2 ? 2 : 1 })), 'calm', 'a', BOX);
		const els = (scene as { elements: { motion: { at: number }[] }[] }).elements;
		expect(els[0].motion[0].at).toBe(els[1].motion[0].at);
		expect(els[2].motion[0].at).not.toBe(els[0].motion[0].at);
	});

	it('closes a gap in the beat numbers rather than compiling dead time', () => {
		const { parts } = partsOf(2);
		const refs = parts.map((p) => p.pathRef);
		// Beats 1 and 7 — the user deleted the ones between.
		const scene = planToScene(parts, planFor(refs, (_r, i) => ({ beat: i === 0 ? 1 : 7 })), 'calm', 'a', BOX);
		expect(scene.duration).toBe(2 * PACE_MS.calm);
		const ats = (scene as { elements: { motion: { at: number }[] }[] }).elements.map((e) => e.motion[0].at);
		expect(ats).toEqual([0, 0.5]);
	});

	it('beatsOf closes gaps and dedupes', () => {
		expect(beatsOf(new Map([['a', { ...DEFAULT_PART_PLAN, beat: 3 }], ['b', { ...DEFAULT_PART_PLAN, beat: 1 }], ['c', { ...DEFAULT_PART_PLAN, beat: 3 }]]))).toEqual([1, 3]);
	});
});

describe('roles map only onto verbs that are painted today', () => {
	it('draw emits draw; fade emits reveal', () => {
		const { parts } = partsOf(2);
		const refs = parts.map((p) => p.pathRef);
		const scene = planToScene(parts, planFor(refs, (_r, i) => ({ role: i === 0 ? 'draw' : 'fade' })), 'calm', 'a', BOX);
		const els = (scene as { elements: { motion: { verb: string }[] }[] }).elements;
		expect(els[0].motion.map((m) => m.verb)).toEqual(['draw']);
		expect(els[1].motion.map((m) => m.verb)).toEqual(['reveal']);
	});

	it('slide PAIRS with reveal — sliding a fully opaque shape home is not an arrival', () => {
		const { parts } = partsOf(1);
		const scene = planToScene(parts, planFor([parts[0].pathRef], () => ({ role: 'slide', from: 'right' })), 'calm', 'a', BOX);
		const motion = (scene as { elements: { motion: { verb: string; from?: number[] }[] }[] }).elements[0].motion;
		expect(motion.map((m) => m.verb).sort()).toEqual(['reveal', 'slide']);
		expect(motion.find((m) => m.verb === 'slide')?.from?.[0]).toBeGreaterThan(0);
	});

	it('never emits draw and reveal on one element — parseScene rejects that pair', () => {
		const { parts } = partsOf(3);
		const scene = planToScene(parts, planFor(parts.map((p) => p.pathRef), () => ({ role: 'draw', emphasize: true })), 'calm', 'a', BOX);
		for (const el of (scene as { elements: { motion: { verb: string }[] }[] }).elements) {
			const verbs = new Set(el.motion.map((m) => m.verb));
			expect(verbs.has('draw') && verbs.has('reveal')).toBe(false);
		}
		expect(validatePlan(scene)).toEqual({ ok: true });
	});

	it('"already there" carries no presence verb, and drops out of elements entirely', () => {
		const { parts } = partsOf(2);
		const refs = parts.map((p) => p.pathRef);
		const scene = planToScene(parts, planFor(refs, (_r, i) => ({ role: i === 0 ? 'still' : 'fade' })), 'calm', 'a', BOX);
		expect((scene as { elements: unknown[] }).elements).toHaveLength(1);
	});

	it('emphasize adds highlight without displacing the arrival', () => {
		const { parts } = partsOf(1);
		const scene = planToScene(parts, planFor([parts[0].pathRef], () => ({ role: 'fade', emphasize: true })), 'calm', 'a', BOX);
		expect((scene as { elements: { motion: { verb: string }[] }[] }).elements[0].motion.map((m) => m.verb)).toEqual(['reveal', 'highlight']);
	});
});

describe('every plan this faculty writes validates against the real engine schema', () => {
	for (const role of ['draw', 'fade', 'slide', 'still'] as const) {
		it(`a whole drawing of "${role}" parts passes parseScene`, () => {
			const { parts } = partsOf(5);
			const scene = planToScene(parts, planFor(parts.map((p) => p.pathRef), (_r, i) => ({ role, beat: (i % 3) + 1, emphasize: i === 0 })), 'brisk', 'a', BOX);
			const v = validatePlan(scene);
			expect(v.ok, v.ok ? '' : v.errors.join('; ')).toBe(true);
		});
	}
});

describe('seekMs — the millisecond trap', () => {
	it('converts a frame fraction to the milliseconds compile().at() actually wants', () => {
		// at() derives progress = t / durationMs, so handing it k/N seeks to ~0 and the strip would
		// show frame 0 forever while looking perfectly correct.
		expect(seekMs(0.5, 3600)).toBe(1800);
		expect(seekMs(1, 3600)).toBe(3600);
		expect(seekMs(0, 3600)).toBe(0);
	});

	it('clamps out of range rather than seeking past the end', () => {
		expect(seekMs(2, 1000)).toBe(1000);
		expect(seekMs(-1, 1000)).toBe(0);
	});
});

describe('reopening is a derivation — the round trip is total for anything we wrote', () => {
	const roles = ['draw', 'fade', 'slide', 'still'] as const;

	for (const pace of ['calm', 'brisk'] as Pace[]) {
		it(`plan → scene → plan is identity at ${pace} pace`, () => {
			const { parts } = partsOf(6);
			const refs = parts.map((p) => p.pathRef);
			const original = planFor(refs, (_r, i) => ({
				role: roles[i % 4],
				beat: (i % 3) + 1,
				from: (['left', 'right', 'above', 'below'] as const)[i % 4],
				emphasize: i % 2 === 0,
			}));
			const scene = planToScene(parts, original, pace, 'a', BOX);
			const back = sceneToPlan(scene);
			expect(back.pace).toBe(pace);
			for (const ref of refs) {
				const before = original.get(ref);
				if (before?.role === 'still') {
					// A still part has no element, so it cannot round-trip — the caller re-seeds it as
					// still, which is what "not in the spec" means. Asserted so the asymmetry is deliberate.
					expect(back.plan.has(ref)).toBe(false);
					continue;
				}
				const after = back.plan.get(ref);
				expect(after?.role, ref).toBe(before?.role);
				expect(after?.beat, ref).toBe(before?.beat);
				expect(after?.emphasize, ref).toBe(before?.emphasize);
				if (before?.role === 'slide') expect(after?.from, ref).toBe(before?.from);
			}
		});
	}

	it('recognizes a beat-shaped scene', () => {
		const { parts } = partsOf(4);
		const scene = planToScene(parts, planFor(parts.map((p) => p.pathRef), (_r, i) => ({ beat: i + 1 })), 'calm', 'a', BOX);
		expect(isBeatShaped(scene)).toBe(true);
		expect(sceneToPlan(scene).beats).toBe(4);
	});

	it('refuses to call a hand-authored, unevenly windowed scene beat-shaped', () => {
		// examples/anima-scene.md's own svg slide is NOT uniformly windowed — spans of .2/.15/.2/.15/.3.
		const hand = {
			source: 'svg',
			duration: 3600,
			hero: 1,
			asset: 'flow',
			elements: [
				{ id: 'n1', pathRef: 'n1', motion: [{ verb: 'draw', at: 0, span: 0.2 }] },
				{ id: 'a1', pathRef: 'a1', motion: [{ verb: 'draw', at: 0.2, span: 0.15 }] },
			],
		} as never;
		expect(isBeatShaped(hand)).toBe(false);
		// It must still be READ, not re-timed — a saved asset carries no version history to recover from.
		expect(sceneToPlan(hand).beatShaped).toBe(false);
		expect(sceneToPlan(hand).plan.size).toBe(2);
	});
});
