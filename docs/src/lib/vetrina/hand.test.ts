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
					const start = handOffset(0, dist, phase, amount, 0);
					expect(Math.abs(start.along)).toBeLessThan(1e-9);
					expect(Math.abs(start.across)).toBeLessThan(1e-9);
					const end = handOffset(1, dist, phase, amount, 700);
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
				const { along, across } = handOffset(t, dist, 2.1, 1, t * 700);
				peak = Math.max(peak, Math.abs(along), Math.abs(across));
			}
			expect(peak).toBeGreaterThan(1); // it does something
			expect(peak).toBeLessThan(40); // and not much
		}
	});

	it('actually overshoots — the ballistic phase goes PAST the mark and settles back', () => {
		// The first version of this term was `sin(PI * min(1, u/0.78) ** 1.6)`, which is `sin(PI)`
		// for every u past the threshold and masked to zero before it, so the whole thing evaluated
		// to 1e-15 while three documents said it shipped. What makes this test able to fail is that
		// it asks for a SIGNED along-axis bump in the corrective window, not merely "some motion".
		const at = (u: number) => handOffset(u, 900, 0.4, 1, 0).along;
		// A fixed elapsed time isolates the overshoot from the tremor: at t=0 both tremor terms
		// carry only their constant phase, so what varies across the window is the bump.
		const base = at(0.78);
		const peak = Math.max(at(0.84), at(0.88), at(0.92));
		expect(peak - base).toBeGreaterThan(3);
		// …and it is gone by the time the cursor arrives.
		expect(Math.abs(at(1))).toBeLessThan(1e-9);
	});

	it('tremors in HERTZ — the same band whatever the glide takes', () => {
		// Driving the tremor off PROGRESS made its frequency the band divided by the duration: a
		// 260ms retarget put the micro band above 30 Hz, under two samples per cycle at 60fps, so
		// what painted was an alias whose rate depended on frame timing.
		//
		// The oracle is a wall-clock one: hold the CLOCK still and vary the PROGRESS. Against the
		// clock the two tremor terms are then identical and only the envelope, the arc and the
		// overshoot move, so the `across` difference is bounded by those. Progress-driven, the
		// tremor moves too — 10.7 and 55 radians across the movement, several radians for this step
		// — and the difference blows past any such bound.
		const a = handOffset(0.42, 600, 1.1, 1, 200);
		const b = handOffset(0.5, 600, 1.1, 1, 200);
		// The arc's own change over this step, which is all that may legitimately differ.
		const arcSpan = Math.abs(Math.sin(Math.PI * 0.5) - Math.sin(Math.PI * 0.42)) * Math.min(600 * 0.055, 22);
		expect(Math.abs(b.across - a.across)).toBeLessThan(arcSpan + 1.2);
		// And it MOVES with the clock at a fixed progress — the property progress-driving lost.
		expect(handOffset(0.5, 600, 1.1, 1, 0).across).not.toBeCloseTo(handOffset(0.5, 600, 1.1, 1, 55).across, 3);
	});

	it('scales with `amount`, and vanishes at zero', () => {
		const one = handOffset(0.5, 600, 1.1, 1, 40);
		const half = handOffset(0.5, 600, 1.1, 0.5, 40);
		const none = handOffset(0.5, 600, 1.1, 0, 40);
		expect(none).toEqual({ along: 0, across: 0 });
		expect(half.across).toBeCloseTo(one.across / 2, 9);
		expect(Math.abs(one.across)).toBeGreaterThan(0.5);
	});

	it('refuses a non-finite distance rather than emitting NaN', () => {
		// A NaN here would be written straight into `style.left` and the cursor would never come
		// back — the same failure mode a non-finite `clearance` had before it was guarded.
		expect(handOffset(0.5, Number.NaN, 1, 1, 40)).toEqual({ along: 0, across: 0 });
		expect(handOffset(0.5, Number.POSITIVE_INFINITY, 1, 1, 40)).toEqual({ along: 0, across: 0 });
		// A non-finite CLOCK is the same hazard from the other side — `performance.now()` is sane,
		// but the value reaching here is a subtraction and this writes straight into `style.left`.
		const t = handOffset(0.5, 600, 1, 1, Number.NaN);
		expect(Number.isFinite(t.along) && Number.isFinite(t.across)).toBe(true);
	});

	it('is band-limited — the path turns a few times, it does not rattle', () => {
		// White noise (a `Math.random()` per frame) would change sign on most samples. A sum of
		// hand-frequency sinusoids changes sign a handful of times across a whole movement.
		let flips = 0;
		let prev = handOffset(0.001, 800, 0.7, 1, 0.7).across;
		for (let t = 0.002; t < 1; t += 0.002) {
			const v = handOffset(t, 800, 0.7, 1, t * 700).across;
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

	it('paints no wobble under the reduced-motion tiers, at any `hand`', async () => {
		// A wobble IS vestibular motion, and a viewer who asked for less of it did not ask for a
		// more lifelike version. BE PRECISE ABOUT WHAT THIS SHOWS: the tiers suppress the hand
		// TWICE over, and only the outer one is reachable. Every `tween` call site is already gated
		// on `reduced` — a reduced glide teleports rather than tweening — so `const hand = reduced ?
		// 0 : …` is defense in depth against a future call site that forgets, and no fixture can
		// reach it today. (The mutation battery therefore carries no mutation for it; a mutation
		// that cannot fail is not evidence, and reporting it as a survivor would teach us to ignore
		// survivors.) What IS pinned here is the product claim: with `hand` at its maximum, the
		// cursor still lands exactly on its target and nothing is painted off it.
		const root = document.createElement('div');
		document.body.appendChild(root);
		active = createStage({ root, onExit: () => {}, theme: resolveTheme({ motion: 'legible', hand: 2 }) });
		await pathOf(active, { left: 900, top: 640, width: 200, height: 80 });
		expect(cursorAt()).toEqual({ x: 922, y: 658 });
	});

	it('does not SNAP when a movement is aborted mid-flight', async () => {
		// Present aborts on every block change, so mid-stroke abandonment is the designed path, not
		// an edge. Zeroing the displacement and repainting was correct about the state and wrong
		// about the picture: it moved the cursor by the hand's whole amplitude in one frame. The
		// pixels are kept and adopted as the logical position instead.
		//
		// A GESTURE, not `point()`: `point()` waits ~480ms before it glides at all, and jsdom's rAF
		// runs far faster than a display's, so a frame-counted budget after `point()` samples a
		// cursor that has not started moving — which is how an earlier version of this test passed
		// against the very defect it names. `bracket` approaches immediately.
		const stage = mount(2);
		const ctl = new AbortController();
		const run = stage.gesture('bracket', at({ left: 1200, top: 820, width: 300, height: 200 }), ctl.signal, { clearance: 19 });
		const start = cursorAt();
		let before = start;
		for (let i = 0; i < 400; i++) {
			await frames(1);
			before = cursorAt();
			if (Math.hypot(before.x - start.x, before.y - start.y) > 120) break;
		}
		expect(Math.hypot(before.x - start.x, before.y - start.y), 'the movement never got going — this test is measuring nothing').toBeGreaterThan(60);
		ctl.abort();
		await run.catch(() => {});
		const after = cursorAt();
		expect(Math.hypot(after.x - before.x, after.y - before.y), 'the cursor jumped when the movement was abandoned').toBeLessThan(1.5);
	});

	it('adopts the pixels it stopped at, so the NEXT movement starts from where the hand is', async () => {
		// The other half, and the one a single reading of `style.left` cannot see: clearing the
		// displacement without adopting it leaves the LOGICAL position on the clean path while the
		// painted one is elsewhere. Nothing moves at the abort — and then the next movement starts
		// from the logical point and jumps by the whole displacement on its first frame.
		const stage = mount(2);
		const ctl = new AbortController();
		const run = stage.gesture('bracket', at({ left: 1200, top: 820, width: 300, height: 200 }), ctl.signal, { clearance: 19 });
		const start = cursorAt();
		let stopped = start;
		for (let i = 0; i < 400; i++) {
			await frames(1);
			stopped = cursorAt();
			if (Math.hypot(stopped.x - start.x, stopped.y - start.y) > 120) break;
		}
		expect(Math.hypot(stopped.x - start.x, stopped.y - start.y)).toBeGreaterThan(60);
		ctl.abort();
		await run.catch(() => {});
		const ctl2 = new AbortController();
		const second = stage.gesture('bracket', at({ left: 60, top: 120, width: 300, height: 200 }), ctl2.signal, { clearance: 19 });
		let firstMove = stopped;
		for (let i = 0; i < 400; i++) {
			await frames(1);
			const p = cursorAt();
			if (Math.hypot(p.x - stopped.x, p.y - stopped.y) > 0.001) {
				firstMove = p;
				break;
			}
		}
		ctl2.abort();
		await second.catch(() => {});
		expect(firstMove, 'the resumed movement never started').not.toEqual(stopped);
		expect(Math.hypot(firstMove.x - stopped.x, firstMove.y - stopped.y), 'the next movement started somewhere the hand was not').toBeLessThan(8);
	});

	it('leaves no stale displacement for a movement that PLACES without tweening', async () => {
		// Adopting the pixels is only half the reset; the displacement itself has to be cleared, or
		// it rides on every later `place()` that does not go through a tween — `circle`'s orbit is
		// one, and the reduced tiers are others. A tween would hide it (it recomputes the offset on
		// its first frame), which is why this test uses the orbit and the previous one does not.
		const stage = mount(2);
		const ctl = new AbortController();
		const box = { left: 1200, top: 820, width: 300, height: 200 };
		const run = stage.gesture('bracket', at(box), ctl.signal, { clearance: 19 });
		const start = cursorAt();
		for (let i = 0; i < 400; i++) {
			await frames(1);
			if (Math.hypot(cursorAt().x - start.x, cursorAt().y - start.y) > 120) break;
		}
		ctl.abort();
		await run.catch(() => {});
		// The orbit paints an ellipse around the target, straight from `place()`.
		const ctl2 = new AbortController();
		const ring = stage.gesture('circle', at(box), ctl2.signal);
		let residual = Number.POSITIVE_INFINITY;
		const mx = box.left + box.width / 2;
		const my = box.top + box.height / 2;
		const rx = Math.min(box.width * 0.42, 260);
		const ry = Math.min(box.height * 0.42, 180);
		for (let i = 0; i < 40; i++) {
			await frames(1);
			const p = cursorAt();
			if (!Number.isFinite(p.x)) continue;
			residual = Math.min(residual, Math.abs(Math.hypot((p.x - mx) / rx, (p.y - my) / ry) - 1));
		}
		ctl2.abort();
		await ring.catch(() => {});
		expect(residual, 'the orbit was painted off its own ring — a stale displacement rode along').toBeLessThan(0.05);
	});

	it('leaves nothing painted off its logical position once a glide ends', async () => {
		// The other half: a completed glide must land EXACTLY on its destination, or the next beat
		// that places the cursor without tweening would move it for no reason.
		const stage = mount(2);
		await pathOf(stage, { left: 900, top: 640, width: 200, height: 80 });
		const landed = cursorAt();
		expect(landed.x).toBeCloseTo(922, 6);
		expect(landed.y).toBeCloseTo(658, 6);
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
