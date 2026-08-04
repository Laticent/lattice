import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asElement, createStage, type RectSource, type Stage } from './stage';
import { resolveTheme } from './theme';

// GEOMETRY — where a cue lands relative to the thing it names (#1400).
//
// The defect these pin: a cue read its target's rect ONCE and held those pixels for its
// whole life. A host's own `act` commits asynchronously (a panel opens, a splitter moves),
// so the rect taken the moment `act` returned could be a whole pane out of date by the time
// the cue painted — and nothing ever corrected it. Measured on the real Studio at 1180x703:
// the ring drew at left=699 w=481 around a pane that was by then at left=571 w=609.
//
// jsdom has no layout, so a real element's rect is always 0x0 — which is precisely why these
// drive a `RectSource` whose rect the test moves on purpose. That is not a stand-in for the
// mechanism; it IS the mechanism (the stage only ever asks a target where it is), and the
// same widening is what lets a host aim at something inside an iframe. The real-surface
// oracle is e2e/vetrina-geometry.spec.ts (HARD RULE #23).

let active: Stage | null = null;

/** A target the test can move — the shape a host supplies for a cross-frame region. */
function movableTarget(init: { left: number; top: number; width: number; height: number }) {
	const box = { ...init };
	const src: RectSource = {
		getBoundingClientRect: () =>
			({
				x: box.left,
				y: box.top,
				left: box.left,
				top: box.top,
				width: box.width,
				height: box.height,
				right: box.left + box.width,
				bottom: box.top + box.height,
				toJSON: () => ({}),
			}) as DOMRect,
	};
	return { src, moveTo: (next: Partial<typeof box>) => Object.assign(box, next) };
}

const frames = (n: number) =>
	new Promise<void>((res) => {
		let i = 0;
		const step = () => (++i >= n ? res() : requestAnimationFrame(step));
		requestAnimationFrame(step);
	});

const glowOf = () => document.querySelector<HTMLElement>('.vetrina-stage > div[style*="border-radius:14px"], .vetrina-stage > div[style*="border-radius: 14px"]');

beforeEach(() => {
	// jsdom ships no Web Animations API; the cue's fade is theater, not the thing under test.
	if (!Element.prototype.animate) {
		Element.prototype.animate = vi.fn(() => ({ cancel() {}, finish() {} })) as unknown as typeof Element.prototype.animate;
	}
});
afterEach(() => {
	active?.destroy();
	active = null;
	document.body.innerHTML = '';
});

function mount(): Stage {
	const root = document.createElement('div');
	document.body.appendChild(root);
	active = createStage({ root, onExit: () => {}, theme: resolveTheme({ motion: 'full' }) });
	return active;
}

describe('a live cue tracks its target (#1400)', () => {
	it('re-draws the spotlight ring when the host reflows mid-cue', async () => {
		const stage = mount();
		const { src, moveTo } = movableTarget({ left: 699, top: 54, width: 481, height: 649 });

		// Not awaited: the orbit's rAF loop deliberately never settles once the stage is
		// destroyed (teardown is terminal), so awaiting it would hang rather than assert.
		void stage.gesture('circle', src);
		await frames(2);
		const glow = glowOf();
		expect(glow).not.toBeNull();
		expect(glow?.style.left).toBe('699px');
		expect(glow?.style.width).toBe('481px');

		// The host's own setter finally commits: the pane widens back across the splitter.
		// This is the exact transition that shipped a ring beginning mid-pane on production.
		moveTo({ left: 571, width: 609 });
		await frames(3);
		expect(glow?.style.left).toBe('571px');
		expect(glow?.style.width).toBe('609px');

	});

	it('orbits the cursor around the ring it just drew, not around a stale center', async () => {
		const stage = mount();
		const { src, moveTo } = movableTarget({ left: 0, top: 0, width: 200, height: 200 });
		const cursor = document.querySelector<HTMLElement>('.vetrina-cursor');

		// Not awaited: the orbit's rAF loop deliberately never settles once the stage is
		// destroyed (teardown is terminal), so awaiting it would hang rather than assert.
		void stage.gesture('circle', src);
		await frames(2);
		const near = (v: string | undefined) => Number.parseFloat(v ?? 'NaN');
		// Orbit radius is 42% of the box, so the cursor stays within the target's neighborhood.
		expect(near(cursor?.style.left)).toBeLessThan(300);

		// Move the target a long way. The orbit must follow it — a stale center leaves the
		// cursor circling empty space where the target used to be.
		moveTo({ left: 4000, top: 3000 });
		await frames(3);
		expect(near(cursor?.style.left)).toBeGreaterThan(3900);
		expect(near(cursor?.style.top)).toBeGreaterThan(2900);

	});

	it('draws the ring INSIDE the target box — the border does not inflate it', async () => {
		const stage = mount();
		const { src } = movableTarget({ left: 10, top: 20, width: 300, height: 100 });
		// Not awaited: the orbit's rAF loop deliberately never settles once the stage is
		// destroyed (teardown is terminal), so awaiting it would hang rather than assert.
		void stage.gesture('circle', src);
		await frames(2);
		// `border-box`, so the 3px border eats into the 300x100 rather than adding 6px to it.
		// The layer mounts outside any host reset, so the stage cannot inherit a box model.
		expect(glowOf()?.style.boxSizing).toBe('border-box');
	});
});

describe('a host rect source is a first-class target (the cross-frame seam)', () => {
	it('points at a rect source that is not an element', async () => {
		const stage = mount();
		const { src } = movableTarget({ left: 800, top: 400, width: 40, height: 30 });
		const cursor = document.querySelector<HTMLElement>('.vetrina-cursor');
		await stage.point(src);
		// aimAt clamps the offset into a large box; on a 40x30 target it lands at the center.
		expect(Number.parseFloat(cursor?.style.left ?? 'NaN')).toBeCloseTo(820, 0);
		expect(Number.parseFloat(cursor?.style.top ?? 'NaN')).toBeCloseTo(415, 0);
	});

	it('keeps `resolve` an ELEMENT contract — a rect source has no node to hand back', () => {
		const stage = mount();
		const { src } = movableTarget({ left: 0, top: 0, width: 1, height: 1 });
		expect(stage.resolve(src)).toBeNull();
		const el = document.createElement('button');
		expect(stage.resolve(el)).toBe(el);
		expect(asElement(src)).toBeNull();
		expect(asElement(el)).toBe(el);
	});
});
