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
		// vestibular. So the ink must still appear, and the cursor must arrive without travelling.
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
		const seen = new Set<string>();
		const run = stage.gesture('underline', t.src, undefined, { clearance: 19 });
		const watch = window.setInterval(() => {
			const p = cursorAt();
			if (Number.isFinite(p.x)) seen.add(`${Math.round(p.x)}`);
		}, 30);
		await run;
		window.clearInterval(watch);
		// A teleport visits one x. A sweep visits many — this is the difference between the two
		// tiers, measured rather than assumed.
		expect(seen.size).toBeGreaterThan(3);
		expect(cursorAt().x).toBeGreaterThan(700);
	}, 20_000);
});
