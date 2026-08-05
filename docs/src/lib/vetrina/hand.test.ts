import { afterEach, describe, expect, it } from 'vitest';
import { createStage, handOffset, type RectSource, type Stage } from './stage';
import { resolveTheme } from './theme';

// THE HAND — the arc + tremor + overshoot the cursor's travel carries (stage.ts § "The hand").
//
// What is under test is the CONTRACT, not the aesthetics. Three claims a viewer cannot check
// and everything else in the library depends on:
//
//   1. THE ENDPOINTS ARE EXACT. Zero displacement at t=0 and t=1, so a glide starts where the
//      cursor is and lands on the point it was given. Every deictic gesture's ink, `gestureRest`
//      and a host's occlusion check are built on the destination being the destination.
//   2. IT IS BAND-LIMITED AND BOUNDED. A hand wobbles by pixels; it does not rattle, and it does
//      not throw the cursor across the screen on a long reach.
//   3. IT IS DETERMINISTIC AND SUPPRESSIBLE. Same movement index, same path — or a test could
//      never pin it. `hand: 0` and the reduced-motion tiers reproduce the old straight glide.
//
// jsdom has no compositor, so what is observed is what the stage actually writes: the cursor's
// `style.left/top`. That IS the mechanism — the displacement exists nowhere else.

let active: Stage | null = null;

// jsdom ships no Web Animations API, and the anticipation streak calls `el.animate`. That is
// decoration for a different feature; stub it so the glide under test is what fails or passes.
if (typeof Element.prototype.animate !== 'function') {
	// biome-ignore lint/suspicious/noExplicitAny: a minimal WAAPI stand-in for jsdom.
	(Element.prototype as any).animate = () => ({ cancel() {}, finish() {}, addEventListener() {}, removeEventListener() {}, finished: Promise.resolve() });
}

afterEach(() => {
	active?.destroy();
	active = null;
	document.body.innerHTML = '';
});

const rect = (b: { left: number; top: number; width: number; height: number }): DOMRect =>
	({ x: b.left, y: b.top, left: b.left, top: b.top, width: b.width, height: b.height, right: b.left + b.width, bottom: b.top + b.height, toJSON: () => ({}) }) as DOMRect;
const at = (b: { left: number; top: number; width: number; height: number }): RectSource => ({ getBoundingClientRect: () => rect(b) });

function mount(hand?: number): Stage {
	const root = document.createElement('div');
	document.body.appendChild(root);
	active = createStage({ root, onExit: () => {}, theme: resolveTheme(hand === undefined ? {} : { hand }) });
	return active;
}
const cursorAt = () => {
	const c = document.querySelector<HTMLElement>('.vetrina-cursor');
	return { x: Number.parseFloat(c?.style.left ?? 'NaN'), y: Number.parseFloat(c?.style.top ?? 'NaN') };
};
const frames = (n: number) =>
	new Promise<void>((res) => {
		let i = 0;
		const step = () => (++i >= n ? res() : requestAnimationFrame(step));
		requestAnimationFrame(step);
	});

/** Every position the cursor is painted at over one `point()`, sampled per frame until the glide
 *  actually finishes — a fixed frame budget would cut a long glide short and report its midpoint
 *  as its destination. NaN samples (before the first `place()`) are dropped by the caller. */
async function pathOf(stage: Stage, box: { left: number; top: number; width: number; height: number }): Promise<{ x: number; y: number }[]> {
	const seen: { x: number; y: number }[] = [];
	let done = false;
	const run = stage.point(at(box)).then(
		() => {
			done = true;
		},
		() => {
			done = true;
		},
	);
	for (let i = 0; i < 600 && !done; i++) {
		seen.push(cursorAt());
		await frames(1);
	}
	await run;
	seen.push(cursorAt());
	return seen.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

describe('handOffset — the displacement itself', () => {
	it('is exactly zero at both ends of a movement, at every amount and distance', () => {
		for (const dist of [4, 60, 900, 4000]) {
			for (const amount of [0.2, 1, 2]) {
				for (const phase of [0, 1.3, 5.9]) {
					const start = handOffset(0, dist, phase, amount);
					expect(Math.abs(start.along)).toBeLessThan(1e-9);
					expect(Math.abs(start.across)).toBeLessThan(1e-9);
					const end = handOffset(1, dist, phase, amount);
					expect(Math.abs(end.along)).toBeLessThan(1e-9);
					expect(Math.abs(end.across)).toBeLessThan(1e-9);
				}
			}
		}
	});

	it('is bounded — a cross-screen reach bows by a hand, not a fist', () => {
		// The caps are the point: arc ≤ 22px, tremor ≤ ~4.2px per band, overshoot ≤ 9px. A long
		// glide must not swing off the target's neighborhood, or the ink lands on other content.
		for (const dist of [200, 1500, 6000]) {
			let peak = 0;
			for (let t = 0; t <= 1; t += 0.005) {
				const { along, across } = handOffset(t, dist, 2.1, 1);
				peak = Math.max(peak, Math.abs(along), Math.abs(across));
			}
			expect(peak).toBeGreaterThan(1); // it does something
			expect(peak).toBeLessThan(40); // and not much
		}
	});

	it('scales with `amount`, and vanishes at zero', () => {
		const one = handOffset(0.5, 600, 1.1, 1);
		const half = handOffset(0.5, 600, 1.1, 0.5);
		const none = handOffset(0.5, 600, 1.1, 0);
		expect(none).toEqual({ along: 0, across: 0 });
		expect(half.across).toBeCloseTo(one.across / 2, 9);
		expect(Math.abs(one.across)).toBeGreaterThan(0.5);
	});

	it('refuses a non-finite distance rather than emitting NaN', () => {
		// A NaN here would be written straight into `style.left` and the cursor would never come
		// back — the same failure mode a non-finite `clearance` had before it was guarded.
		expect(handOffset(0.5, Number.NaN, 1, 1)).toEqual({ along: 0, across: 0 });
		expect(handOffset(0.5, Number.POSITIVE_INFINITY, 1, 1)).toEqual({ along: 0, across: 0 });
	});

	it('is band-limited — the path turns a few times, it does not rattle', () => {
		// White noise (a `Math.random()` per frame) would change sign on most samples. A sum of
		// hand-frequency sinusoids changes sign a handful of times across a whole movement.
		let flips = 0;
		let prev = handOffset(0.001, 800, 0.7, 1).across;
		for (let t = 0.002; t < 1; t += 0.002) {
			const v = handOffset(t, 800, 0.7, 1).across;
			if (v * prev < 0) flips += 1;
			prev = v;
		}
		expect(flips).toBeLessThan(12);
	});
});

describe('the hand, on a real glide', () => {
	it('leaves the destination exact', async () => {
		const stage = mount();
		// `aimAt` lands at left + min(w/2, 22), top + min(h/2, 18).
		const path = await pathOf(stage, { left: 900, top: 640, width: 200, height: 80 });
		const end = path[path.length - 1];
		expect(end.x).toBeCloseTo(922, 6);
		expect(end.y).toBeCloseTo(658, 6);
	});

	it('departs from a straight line in between — that is the whole feature', async () => {
		const stage = mount();
		const path = await pathOf(stage, { left: 900, top: 640, width: 200, height: 80 });
		const a = path[0];
		const b = path[path.length - 1];
		// Distance of each sample from the straight chord a→b. A perfectly straight glide is 0
		// for every sample; the hand is not.
		const L = Math.hypot(b.x - a.x, b.y - a.y);
		let worst = 0;
		for (const p of path) worst = Math.max(worst, Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L);
		expect(worst).toBeGreaterThan(1);
		expect(worst).toBeLessThan(40);
	});

	it('`hand: 0` reproduces the straight glide, sample for sample', async () => {
		// The compatibility pin. A host that wants the old motion has to be able to have it, and
		// "we did not change anything for you" is a claim that needs an oracle.
		const stage = mount(0);
		const path = await pathOf(stage, { left: 900, top: 640, width: 200, height: 80 });
		const a = path[0];
		const b = path[path.length - 1];
		const L = Math.hypot(b.x - a.x, b.y - a.y);
		for (const p of path) expect(Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L).toBeLessThan(1e-6);
	});

	it('is suppressed by the reduced-motion tiers, without the host asking', async () => {
		// A wobble IS vestibular motion. `legible` teleports the cursor, so there is no path to
		// bend — the assertion is that the stage resolves `hand` to nothing, not that the glide
		// happens to be short.
		const root = document.createElement('div');
		document.body.appendChild(root);
		active = createStage({ root, onExit: () => {}, theme: resolveTheme({ motion: 'legible', hand: 2 }) });
		await pathOf(active, { left: 900, top: 640, width: 200, height: 80 });
		expect(cursorAt()).toEqual({ x: 922, y: 658 });
	});

	it('lands clean when a glide is aborted mid-flight', async () => {
		// An abandoned movement must not leave the displacement painted: the next beat may place
		// the cursor without tweening, and it would sit that offset off the point it was given.
		const stage = mount(2);
		const ctl = new AbortController();
		const run = stage.point(at({ left: 1400, top: 900, width: 40, height: 40 }), ctl.signal);
		await frames(6);
		ctl.abort();
		await run.catch(() => {});
		const afterAbort = cursorAt();
		// Whatever the cursor's logical position was, the painted one equals it: place() with no
		// tween must agree with the last painted point.
		await stage.point(at({ left: afterAbort.x, top: afterAbort.y, width: 0, height: 0 })).catch(() => {});
		expect(cursorAt().x).toBeCloseTo(afterAbort.x, 6);
		expect(cursorAt().y).toBeCloseTo(afterAbort.y, 6);
	});
});

describe('resolveTheme — hand', () => {
	it('defaults to 1 and clamps a hostile value instead of trusting it', () => {
		expect(resolveTheme().hand).toBe(1);
		expect(resolveTheme({ hand: 0 }).hand).toBe(0);
		expect(resolveTheme({ hand: 0.4 }).hand).toBe(0.4);
		expect(resolveTheme({ hand: 99 }).hand).toBe(2);
		expect(resolveTheme({ hand: -3 }).hand).toBe(0);
		expect(resolveTheme({ hand: Number.NaN }).hand).toBe(1);
	});
});
