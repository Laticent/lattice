import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStage, gestureRest, type RectSource, type Stage } from './stage';
import { resolveTheme } from './theme';

// THE DEICTIC GESTURES — naming a piece of the host's content (underline / wash / bracket / tap),
// plus `circle` used as the ring.
//
// What is under test here is GEOMETRY and DISPOSAL, not motion aesthetics:
//
//   1. the cursor comes to rest OUTSIDE the box it just named — the property that makes
//      occlusion impossible by construction rather than by a whitespace search;
//   2. the ink tracks its target every frame while it is on screen (#1400);
//   3. an abort takes the ink away with the motion;
//   4. `clearance: 0` leaves `circle` byte-identical, so no existing tour moved.
//
// jsdom has no layout, so every target here is a `RectSource` the test positions on purpose —
// which is not a stand-in for the mechanism, it IS the mechanism (the stage's only question of
// a target is "where are you now"). The real-surface oracle is docs/e2e/present-guide.spec.ts.

let active: Stage | null = null;

/** The cursor's real ink footprint — a 28px box centered on where it is placed (`stage.ts`). */
const POINTER = 28;

const rect = (b: { left: number; top: number; width: number; height: number }): DOMRect =>
	({ x: b.left, y: b.top, left: b.left, top: b.top, width: b.width, height: b.height, right: b.left + b.width, bottom: b.top + b.height, toJSON: () => ({}) }) as DOMRect;

/** A target the test can move, optionally answering with per-line rectangles. */
function target(init: { left: number; top: number; width: number; height: number }, lines?: { left: number; top: number; width: number; height: number }[]) {
	const box = { ...init };
	let rects = lines ? [...lines] : null;
	const src: RectSource = { getBoundingClientRect: () => rect(box) };
	if (rects) src.getClientRects = () => (rects as { left: number; top: number; width: number; height: number }[]).map(rect);
	return {
		src,
		moveTo: (next: Partial<typeof box>) => Object.assign(box, next),
		setLines: (next: typeof rects) => {
			rects = next;
		},
		box: () => ({ ...box }),
	};
}

const frames = (n: number) =>
	new Promise<void>((res) => {
		let i = 0;
		const step = () => (++i >= n ? res() : requestAnimationFrame(step));
		requestAnimationFrame(step);
	});

const ink = (kind: string) => [...document.querySelectorAll<HTMLElement>(`.vetrina-stage [data-vt-cue="${kind}"]`)];
const cursorAt = () => {
	const c = document.querySelector<HTMLElement>('.vetrina-cursor');
	return { x: Number.parseFloat(c?.style.left ?? 'NaN'), y: Number.parseFloat(c?.style.top ?? 'NaN') };
};
/** Does the cursor's 28px footprint, centered where it rests, touch `b`? */
const covers = (p: { x: number; y: number }, b: { left: number; top: number; width: number; height: number }) =>
	p.x - POINTER / 2 < b.left + b.width && p.x + POINTER / 2 > b.left && p.y - POINTER / 2 < b.top + b.height && p.y + POINTER / 2 > b.top;
const px = (el: HTMLElement, prop: 'left' | 'top' | 'width' | 'height') => Number.parseFloat(el.style[prop]);
/** The underline stroke's drawn thickness at a given emphasis — the one observable `strength` has. */
function inkWeight(strength: 'quiet' | 'notable'): number {
	const stage = mount();
	const t = target({ left: 300, top: 200, width: 400, height: 24 });
	stage.gesture('underline', t.src, undefined, { clearance: 19, strength }).catch(() => {});
	const h = Number.parseFloat(ink('underline')[0].style.height);
	stage.destroy();
	document.body.innerHTML = '';
	active = null;
	return h;
}

beforeEach(() => {
	if (!Element.prototype.animate) {
		Element.prototype.animate = vi.fn(() => ({ cancel() {}, finish() {} })) as unknown as typeof Element.prototype.animate;
	}
});
afterEach(() => {
	active?.destroy();
	active = null;
	document.body.innerHTML = '';
});

/** `still` by default: the cue still happens, the sweeps collapse, so a spec runs in ms rather
 *  than seconds. One test below uses `full` on purpose, because the sweep is what it measures. */
function mount(motion: 'full' | 'legible' | 'still' = 'still'): Stage {
	const root = document.createElement('div');
	document.body.appendChild(root);
	active = createStage({ root, onExit: () => {}, theme: resolveTheme({ motion }) });
	return active;
}

// ── the pure geometry ────────────────────────────────────────────────────────────────

describe('gestureRest — the promise a host can check', () => {
	const box = { left: 300, top: 200, width: 400, height: 24 };

	it('puts the cursor clear of the box it names, for every deictic gesture', () => {
		// The property, stated once: whatever the shape, the hand ends up somewhere the thing it
		// just named is still fully visible. This is the whole reason the position is derived
		// from the stroke instead of searched for.
		for (const kind of ['underline', 'wash', 'bracket', 'tap', 'circle'] as const) {
			const rest = gestureRest(kind, box, null, POINTER / 2 + 5);
			expect(rest, `${kind} has no rest`).not.toBeNull();
			expect(covers(rest as { x: number; y: number }, box), `${kind} rests ON the box it named`).toBe(false);
		}
	});

	it('takes its Y from the ink and its X from the box, when they are different things', () => {
		// The contract, and the one case that discriminates it. `box` here is the BLOCK — a
		// paragraph running well below the phrase — while `rects` are the phrase's own three
		// lines. The hand must end BELOW THE PHRASE (not below the paragraph, which would be
		// three lines late) and PAST THE BLOCK (not past the phrase, which would land it on the
		// words that follow). Handing the same rectangle to both, as a first version of this
		// test did, cannot tell the two apart: a union's bottom IS its last line's bottom.
		const lines = [
			{ left: 500, top: 200, width: 200, height: 24 },
			{ left: 300, top: 228, width: 400, height: 24 },
			{ left: 300, top: 256, width: 90, height: 24 },
		];
		const block = { left: 300, top: 200, width: 400, height: 300 }; // the paragraph, still going
		const rest = gestureRest('wash', block, lines, 19) as { x: number; y: number };
		expect(rest.y).toBeGreaterThan(280); // below the phrase's LAST LINE…
		expect(rest.y).toBeLessThan(400); // …not below the whole paragraph
		expect(rest.x).toBeGreaterThan(700); // clear of the BLOCK, not just of the phrase
	});

	it('reads the line its own stroke will use — first for underline, last for wash', () => {
		// The two gestures share a rest formula and NOT a line: `underline` strokes the first rect,
		// `wash` paints every rect and ends on the last. Reading the last for both made the library
		// disagree with itself, and a host asking where the cursor would stop got an answer one
		// line-height away from the truth.
		const lines = [
			{ left: 300, top: 200, width: 400, height: 24 },
			{ left: 300, top: 240, width: 200, height: 24 },
		];
		const block = { left: 300, top: 200, width: 400, height: 64 };
		expect((gestureRest('underline', block, lines, 19) as { y: number }).y).toBeLessThan(260);
		expect((gestureRest('wash', block, lines, 19) as { y: number }).y).toBeGreaterThan(280);
	});

	it('reports nothing for the five non-deictic gestures — their motion is their own', () => {
		for (const kind of ['wave', 'check', 'cross', 'shake'] as const) expect(gestureRest(kind, box, null, 19)).toBeNull();
	});

	it('scales the keep-out with clearance, because a host knows its own cursor', () => {
		const near = gestureRest('bracket', box, null, 0) as { x: number; y: number };
		const far = gestureRest('bracket', box, null, 40) as { x: number; y: number };
		expect(near.x - far.x).toBe(40);
	});
});

// ── the cues themselves ──────────────────────────────────────────────────────────────

describe('underline — "this line"', () => {
	it('draws the stroke in the descender gap and rests past the block, not on it', async () => {
		const stage = mount();
		const t = target({ left: 300, top: 200, width: 400, height: 24 });
		await stage.gesture('underline', t.src, undefined, { clearance: POINTER / 2 + 5 });
		const [stroke] = ink('underline');
		expect(stroke, 'no underline was drawn').toBeTruthy();
		expect(px(stroke, 'left')).toBe(300);
		expect(px(stroke, 'width')).toBe(400);
		// BELOW the text's bottom edge. A stroke through the words is a strikethrough.
		expect(px(stroke, 'top')).toBeGreaterThan(224);
		expect(covers(cursorAt(), t.box())).toBe(false);
	});

	it('strokes the LINE it was handed, not the block that contains it', async () => {
		// Same contract as `gestureRest`: ink follows the client rects, the cursor clears the
		// bounding box. A stroke drawn under the block's box instead would sit three lines below
		// the sentence it is naming and run the full column width.
		const stage = mount();
		const t = target({ left: 300, top: 200, width: 400, height: 90 }, [{ left: 300, top: 200, width: 250, height: 24 }]);
		await stage.gesture('underline', t.src, undefined, { clearance: 19 });
		const [stroke] = ink('underline');
		expect(px(stroke, 'width')).toBe(250);
		expect(px(stroke, 'top')).toBeLessThan(240); // under the LINE, not under the block
	});

	it('re-draws when the host reflows mid-cue (#1400)', async () => {
		const stage = mount();
		const t = target({ left: 300, top: 200, width: 400, height: 24 });
		const run = stage.gesture('underline', t.src, undefined, { clearance: 19 });
		await frames(2);
		t.moveTo({ left: 120, top: 640 });
		await frames(3);
		const [stroke] = ink('underline');
		expect(px(stroke, 'left')).toBe(120);
		expect(px(stroke, 'top')).toBeGreaterThan(640);
		await run;
	});

	it('takes the ink away when the cue is aborted', async () => {
		const stage = mount('full');
		const t = target({ left: 300, top: 200, width: 400, height: 24 });
		const ctl = new AbortController();
		const run = stage.gesture('underline', t.src, ctl.signal, { clearance: 19 });
		await frames(2);
		expect(ink('underline')).toHaveLength(1);
		ctl.abort();
		await expect(run).rejects.toThrow();
		expect(ink('underline'), 'the underline outlived the cue that drew it').toHaveLength(0);
	});
});

describe('wash — "these words"', () => {
	it('paints one band per line rect, following the phrase rather than the paragraph', async () => {
		const stage = mount();
		const lines = [
			{ left: 500, top: 200, width: 200, height: 24 },
			{ left: 300, top: 228, width: 400, height: 24 },
		];
		const t = target({ left: 300, top: 200, width: 400, height: 52 }, lines);
		await stage.gesture('wash', t.src, undefined, { clearance: 19 });
		const bands = ink('wash');
		expect(bands).toHaveLength(2);
		expect(px(bands[0], 'left')).toBe(500);
		expect(px(bands[0], 'width')).toBe(200);
		expect(px(bands[1], 'left')).toBe(300);
	});

	it('falls back to the bounding box for a host with no per-line resolution', async () => {
		const stage = mount();
		const t = target({ left: 300, top: 200, width: 400, height: 24 }); // no getClientRects
		await stage.gesture('wash', t.src, undefined, { clearance: 19 });
		const bands = ink('wash');
		expect(bands).toHaveLength(1);
		expect(px(bands[0], 'width')).toBe(400);
	});

	it('ignores a line box that is nowhere — a zero-area or non-finite rect is not a line', async () => {
		// `getClientRects()` legitimately returns empty boxes (a collapsed range, a hidden span), and
		// a band painted from one lands at the viewport corner. Same three shapes of "gone" the
		// bounding-box path has guarded since #1400, applied per rect.
		const stage = mount();
		const t = target({ left: 300, top: 200, width: 400, height: 24 }, [
			{ left: 0, top: 0, width: 0, height: 0 },
			{ left: 300, top: 200, width: 400, height: 24 },
		]);
		await stage.gesture('wash', t.src, undefined, { clearance: 19 });
		const bands = ink('wash');
		expect(bands, 'a zero-area rect was painted as a band').toHaveLength(1);
		expect(px(bands[0], 'left')).toBe(300);
	});

	it('collapses a band whose line stopped existing, rather than leaving it over nothing', async () => {
		const stage = mount();
		const t = target({ left: 300, top: 200, width: 400, height: 52 }, [
			{ left: 500, top: 200, width: 200, height: 24 },
			{ left: 300, top: 228, width: 400, height: 24 },
		]);
		const run = stage.gesture('wash', t.src, undefined, { clearance: 19 });
		await frames(2);
		t.setLines([{ left: 300, top: 200, width: 600, height: 24 }]); // reflowed to one line
		await frames(3);
		const bands = ink('wash');
		expect(px(bands[0], 'width')).toBe(600);
		expect(px(bands[1], 'width'), 'a band stayed painted where the words no longer are').toBe(0);
		await run;
	});
});

describe('bracket — "this whole block"', () => {
	it('outlines OUTSIDE the block and rests in the margin beside it', async () => {
		const stage = mount();
		const t = target({ left: 300, top: 200, width: 400, height: 180 });
		await stage.gesture('bracket', t.src, undefined, { clearance: POINTER / 2 + 5 });
		const [outline] = ink('bracket');
		expect(px(outline, 'left')).toBeLessThan(300);
		expect(px(outline, 'width')).toBeGreaterThan(400);
		const p = cursorAt();
		expect(p.x).toBeLessThan(300);
		expect(covers(p, t.box())).toBe(false);
	});
});

describe('tap — "this one"', () => {
	it('ripples on the target and rests off its corner', async () => {
		const stage = mount();
		const t = target({ left: 300, top: 200, width: 60, height: 22 });
		await stage.gesture('tap', t.src, undefined, { clearance: POINTER / 2 + 5 });
		expect(ink('tap').length).toBeGreaterThan(0);
		const p = cursorAt();
		expect(p.x).toBeGreaterThan(360);
		expect(covers(p, t.box())).toBe(false);
	});
});

describe('an explicit `rest` is where the stroke ENDS, not somewhere it withdraws to', () => {
	// A host passes `rest` precisely because the gesture's own ending is occupied. Ending at the
	// default and correcting afterwards is a double hop THROUGH the rejected position — a visible
	// stutter, and a moment of the cursor sitting on the words it was placed to avoid.
	//
	// The oracle is DIRECTIONAL, which is what makes it able to fail: the natural ending of every
	// one of these is to the RIGHT of the target, and the rest given is to the LEFT. If the stroke
	// still visits its default first, the cursor's furthest-right sample is past the target.
	const leftOf = (b: { left: number; top: number; height: number }) => ({
		getBoundingClientRect: () => rect({ left: b.left - 60, top: b.top + b.height / 2 - 1, width: 2, height: 2 }),
	});

	for (const kind of ['underline', 'wash', 'bracket', 'tap'] as const) {
		it(`${kind} goes straight there`, async () => {
			const stage = mount('full');
			const box = { left: 600, top: 200, width: 300, height: 24 };
			const t = target(box, [box]);
			let furthestRight = Number.NEGATIVE_INFINITY;
			const run = stage.gesture(kind, t.src, undefined, { clearance: POINTER / 2 + 5, rest: leftOf(box) });
			for (let i = 0; i < 260; i++) {
				const p = cursorAt();
				if (Number.isFinite(p.x)) furthestRight = Math.max(furthestRight, p.x);
				await frames(1);
			}
			await run;
			const end = cursorAt();
			expect(end.x).toBeCloseTo(box.left - 59, 0);
			expect(furthestRight).toBeLessThan(box.left + box.width + POINTER);
		});
	}
});

describe('circle — the ring, and the tours that already use it', () => {
	it('is byte-identical with no clearance: the ink is still the target box', async () => {
		// The regression this pins: `clearance` inflates the ring and the orbit, and the default
		// has to leave every walkthrough written before it exactly where it was.
		const stage = mount();
		const t = target({ left: 300, top: 200, width: 400, height: 180 });
		const run = stage.gesture('circle', t.src);
		await frames(2);
		const [ring] = ink('circle');
		expect([px(ring, 'left'), px(ring, 'top'), px(ring, 'width'), px(ring, 'height')]).toEqual([300, 200, 400, 180]);
		await run;
	});

	it('with clearance, draws the ring around a small target instead of over it', async () => {
		const stage = mount();
		const t = target({ left: 300, top: 200, width: 60, height: 40 });
		const run = stage.gesture('circle', t.src, undefined, { clearance: POINTER / 2 + 5 });
		await frames(2);
		const [ring] = ink('circle');
		expect(px(ring, 'left')).toBeLessThan(300);
		expect(px(ring, 'width')).toBeGreaterThan(60);
		await run;
	});

	it('honors an explicit rest, which is how a host makes the orbit ending deterministic', async () => {
		const stage = mount();
		const t = target({ left: 300, top: 200, width: 60, height: 40 });
		const where = target({ left: 900, top: 500, width: 2, height: 2 });
		await stage.gesture('circle', t.src, undefined, { clearance: 19, rest: where.src });
		expect(cursorAt()).toEqual({ x: 901, y: 501 });
	});
});

describe('teardown and the reduced tier — the two ways `circle` used to leak', () => {
	it('SETTLES when the stage is destroyed mid-orbit, rather than parking its caller forever', async () => {
		// The rAF tick returned on `destroyed` without resolving or rejecting, so the promise stayed
		// pending and held everything awaiting it — the target, its range, the frame document.
		// `tween` carries a comment about exactly this from #1400; the orbit had the same bug, and
		// it became reachable the moment the vocabulary started routing real traffic through it.
		const stage = mount('full');
		const t = target({ left: 300, top: 200, width: 200, height: 120 });
		let settled = 'pending';
		stage.gesture('circle', t.src).then(
			() => {
				settled = 'resolved';
			},
			() => {
				settled = 'rejected';
			},
		);
		await frames(3);
		stage.destroy();
		await frames(3);
		await Promise.resolve();
		expect(settled, 'the caller is still waiting on a stage that no longer exists').toBe('resolved');
	});

	it('takes the ring away on an abort under the reduced tier, not only under full motion', async () => {
		// `if (reduced) return wait(…)` returned BEFORE the promise that owned the disposer, so on a
		// prefers-reduced-motion device every retarget left the previous ring painted for up to
		// 1.7s — stacking with the next one, on exactly the devices least able to tolerate it.
		const root = document.createElement('div');
		document.body.appendChild(root);
		active = createStage({ root, onExit: () => {}, theme: resolveTheme({ motion: 'legible' }) });
		const t = target({ left: 300, top: 200, width: 200, height: 120 });
		const ctl = new AbortController();
		const run = active.gesture('circle', t.src, ctl.signal).catch(() => {});
		await frames(2);
		expect(ink('circle')).toHaveLength(1);
		ctl.abort();
		await run;
		await frames(2);
		expect(ink('circle'), 'the ring outlived the cue that drew it').toHaveLength(0);
	});

	it('refuses a clearance that is not a number, rather than pinning the cursor forever', async () => {
		// `Math.max(0, NaN)` is NaN. One NaN reaches `place()`, writes "NaNpx" (which the CSSOM
		// silently drops), and every later duration and eased `t` is NaN — so every subsequent
		// tween resolves having moved nothing. Unrecoverable, silent, and one guard away.
		// FULL motion, deliberately. The reduced tiers `place()` the cursor outright, which writes a
		// finite value back over a poisoned one and hides the defect; the poisoning lives in the
		// TWEEN, where a NaN coordinate makes the duration NaN, then `t` NaN, then `t < 1` false —
		// so the tween resolves on frame one having moved nothing, forever.
		const stage = mount('full');
		const a = target({ left: 300, top: 200, width: 400, height: 24 });
		await stage.gesture('underline', a.src, undefined, { clearance: Number.NaN });
		const b = target({ left: 800, top: 500, width: 300, height: 24 });
		await stage.gesture('underline', b.src, undefined, { clearance: 19 });
		const p = cursorAt();
		expect(Number.isFinite(p.x), 'the cursor coordinates are NaN — every later gesture is a no-op').toBe(true);
		expect(p.x).toBeGreaterThan(800);
	}, 30_000);
});

describe('the shapes of "gone", and the shapes of "no"', () => {
	it('is a no-op — never a throw — for a target that resolves to nothing', async () => {
		const stage = mount();
		for (const kind of ['underline', 'wash', 'bracket', 'tap'] as const) {
			await expect(stage.gesture(kind, () => null)).resolves.toBeUndefined();
			expect(ink(kind)).toHaveLength(0);
		}
	});

	it('draws nothing for a zero-area target — that is "nowhere", not the viewport corner', async () => {
		const stage = mount();
		const gone: RectSource = { getBoundingClientRect: () => rect({ left: 0, top: 0, width: 0, height: 0 }) };
		await stage.gesture('underline', gone, undefined, { clearance: 19 });
		expect(ink('underline')).toHaveLength(0);
	});

	it('draws nothing for a silenced cue, while the API still resolves', async () => {
		const root = document.createElement('div');
		document.body.appendChild(root);
		active = createStage({ root, onExit: () => {}, theme: resolveTheme({ motion: 'still', cues: { underline: false } }) });
		const t = target({ left: 300, top: 200, width: 400, height: 24 });
		await active.gesture('underline', t.src, undefined, { clearance: 19 });
		expect(ink('underline')).toHaveLength(0);
	});
});

describe('the motion policy', () => {
	it('keeps the CUE and drops the SWEEP under legible', async () => {
		// The tier's whole rule: knowing where to look is content, the sweep across the screen is
		// vestibular. So the ink must still appear, and the cursor must arrive without traveling.
		const stage = mount('legible');
		const box = { left: 300, top: 200, width: 400, height: 24 };
		const t = target(box);
		await stage.gesture('underline', t.src, undefined, { clearance: 19 });
		expect(ink('underline'), 'legible dropped the cue — but knowing where to look is content').toHaveLength(1);
		// EXACTLY the rest the sweep would have reached, not merely "somewhere that is not on the
		// text". A teleport that stops at the stroke's START also clears the box, so asserting
		// non-occlusion alone passes against a cursor that never finished the gesture.
		expect(cursorAt()).toEqual(gestureRest('underline', box, [box], 19));
	});

	it('actually sweeps under full motion, ending past the block', async () => {
		const stage = mount('full');
		const t = target({ left: 300, top: 200, width: 400, height: 24 });
		const path: number[] = [];
		const run = stage.gesture('underline', t.src, undefined, { clearance: 19 });
		const watch = window.setInterval(() => {
			const p = cursorAt();
			if (Number.isFinite(p.x)) path.push(Math.round(p.x));
		}, 30);
		await run;
		window.clearInterval(watch);
		// AFTER THE TURN, and that is the whole design of this oracle.
		//
		// Every deictic gesture APPROACHES its stroke and then SWEEPS along it, and the approach is
		// itself a tween — so "the cursor visited many positions" is satisfied by the approach
		// alone. Two earlier versions of this test stayed green with `sweepAlong`'s motion deleted
		// outright, one of them after being written specifically to catch that. The cursor arrives
		// from the right, so the approach runs x DOWNWARD to the stroke's left end and the sweep
		// runs back UP: the turning point is the minimum, and only what happens after it is the
		// sweep. A teleport to rest contributes exactly one position there.
		const turn = path.indexOf(Math.min(...path));
		const after = new Set(path.slice(turn + 1));
		expect(after.size, `no motion along the stroke itself — only the approach to it (path ${JSON.stringify(path)})`).toBeGreaterThan(3);
		expect(cursorAt().x).toBeGreaterThan(700);
	}, 20_000);

	it('draws heavier ink for a notable target than for a quiet one', () => {
		// `strength` is public surface and nothing else asserts it does anything: a mutation making
		// notable identical to quiet passed the whole suite.
		const quiet = inkWeight('quiet');
		const notable = inkWeight('notable');
		expect(notable).toBeGreaterThan(quiet);
	});
});
