import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStage, type RectSource, type Stage } from './stage';
import { resolveTheme } from './theme';

// REVEAL — does a cue bring its target into view before it names it?
//
// The defect these pin: nothing in the stage scrolled. `point()` at a target below the fold
// aimed the cursor off the bottom of the window and the beat played to an empty viewport — for
// the library's whole life, not as a regression. The drag path had the one `scrollIntoView` call
// in the file (its drop target), so the answer existed for one verb and nowhere else. A desktop
// host usually fits; a phone fits almost nothing, which is where it was finally reported.
//
// jsdom has no layout and no scrolling, so these drive a `RectSource` whose `scrollIntoView` the
// test OWNS — it records the call and moves the rect, the way a real scroll would. That is not a
// stand-in for the mechanism; it IS the mechanism (the stage only ever asks a target where it is
// and tells it to come into view). Whether `block: 'nearest'` scrolls a given target at all is
// the browser's decision, not ours, and the one real-surface oracle is
// docs/e2e/vetrina-exemplars.spec.ts (HARD RULE #23).

let active: Stage | null = null;

/** A target whose scroll the test can watch. `scrollIntoView` logs its argument and MOVES the
 *  rect by `scrollBy`, so the "did it scroll before it measured" question has an answer that is
 *  not a matter of reading the implementation. `log` interleaves rect reads with scrolls, which
 *  is what makes the ORDER assertable. */
function watchedTarget(init: { left: number; top: number; width: number; height: number }, opts: { scrollBy?: { dx: number; dy: number }; rejectBehavior?: boolean } = {}) {
	const box = { ...init };
	const log: string[] = [];
	const calls: (boolean | ScrollIntoViewOptions | undefined)[] = [];
	const src: RectSource = {
		getBoundingClientRect: () => {
			log.push('rect');
			return {
				x: box.left,
				y: box.top,
				left: box.left,
				top: box.top,
				width: box.width,
				height: box.height,
				right: box.left + box.width,
				bottom: box.top + box.height,
				toJSON: () => ({}),
			} as DOMRect;
		},
		scrollIntoView: (arg?: boolean | ScrollIntoViewOptions) => {
			calls.push(arg);
			// An engine that does not know the `behavior` value throws from the dictionary
			// conversion rather than ignoring it — see the `'instant'` case below.
			if (opts.rejectBehavior && typeof arg === 'object' && arg?.behavior) throw new TypeError("The provided value 'instant' is not a valid enum value of type ScrollBehavior.");
			log.push('scroll');
			if (opts.scrollBy) {
				box.left += opts.scrollBy.dx;
				box.top += opts.scrollBy.dy;
			}
		},
	};
	return { src, log, calls, box };
}

/** A target that cannot scroll at all — the shape a host supplies for a region it positions
 *  itself (a canvas hit box, a row in a virtualized list). `scrollIntoView` is optional. */
function unscrollableTarget(init: { left: number; top: number; width: number; height: number }): RectSource {
	return {
		getBoundingClientRect: () =>
			({ x: init.left, y: init.top, left: init.left, top: init.top, width: init.width, height: init.height, right: init.left + init.width, bottom: init.top + init.height, toJSON: () => ({}) }) as DOMRect,
	};
}

const frames = (n: number) =>
	new Promise<void>((res) => {
		let i = 0;
		const step = () => (++i >= n ? res() : requestAnimationFrame(step));
		requestAnimationFrame(step);
	});

const cursorEl = () => document.querySelector<HTMLElement>('.vetrina-cursor');
/** The spotlight ring — the only stage child sized to a target box (every other cue is a small
 *  transform-centered burst). Same selector geometry.test.ts uses. */
const glowOf = () => document.querySelector<HTMLElement>('.vetrina-stage > div[style*="border-radius:14px"], .vetrina-stage > div[style*="border-radius: 14px"]');
const at = (el: HTMLElement | null, axis: 'left' | 'top') => Number.parseFloat(el?.style[axis] ?? 'NaN');

function mount(theme: Parameters<typeof resolveTheme>[0] = {}): Stage {
	const root = document.createElement('div');
	document.body.appendChild(root);
	active = createStage({ root, onExit: () => {}, theme: resolveTheme({ motion: 'full', ...theme }) });
	return active;
}

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

describe('an aimed cue brings its target into view first', () => {
	it('point() scrolls the target, with the options that make it safe to do every time', async () => {
		const stage = mount();
		const { src, calls } = watchedTarget({ left: 300, top: 2400, width: 120, height: 40 });
		await stage.point(src);
		expect(calls).toHaveLength(1);
		// `nearest` on BOTH axes is what makes this safe before every aim: the decision "is this
		// already visible" belongs to the browser, and its answer for an in-view target is to
		// scroll nothing. `instant` keeps the geometry final and synchronous — a smooth scroll
		// would still be running when the glide, whose duration was fixed at kickoff, landed.
		expect(calls[0]).toEqual({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
	});

	it('scrolls BEFORE anything in the beat measures the target', async () => {
		const stage = mount();
		// A target 2400px down that the scroll brings to 200px. THREE things in the beat read the
		// rect — the anticipation ping, the register beat's `alreadyAimed`, and the glide's own
		// duration — and each one means "where the target is NOW", so the scroll has to come before
		// all three. This is why the reveal sits at the top of `point()` rather than inside
		// `moveToEl`, which the first two have already run before: from there, the ping had been
		// drawn at the old place while the cursor glided to the new one.
		const { src, log } = watchedTarget({ left: 300, top: 2400, width: 120, height: 40 }, { scrollBy: { dx: 0, dy: -2200 } });
		await stage.point(src);
		expect(log[0], `the stage measured before it scrolled: ${log.slice(0, 4).join(',')}`).toBe('scroll');
		// And it lands on the target's post-scroll position, not where it used to be.
		expect(at(cursorEl(), 'top')).toBeCloseTo(218, 0); // aimAt: 200 + min(height/2, 18)
	});

	it('a gesture-only beat reveals its own target — it never passes through point()', async () => {
		// `sayAt: 'gesture'` exists for a beat whose only movement is a deictic stroke: the ink is
		// drawn where the target stands and the cursor is not sent anywhere. The ring is the
		// readable oracle — it re-reads its target every frame, so it draws wherever the target
		// IS, and with no reveal nothing scrolls and it draws 2400px down the page.
		const stage = mount();
		const { src, calls } = watchedTarget({ left: 300, top: 2400, width: 120, height: 40 }, { scrollBy: { dx: 0, dy: -2200 } });
		// Not awaited: the orbit's rAF loop deliberately never settles once the stage is destroyed
		// (teardown is terminal), so awaiting it would hang rather than assert.
		void stage.gesture('circle', src);
		await frames(3);
		expect(calls).toHaveLength(1);
		expect(glowOf()?.style.top, 'the ring is drawn off the bottom of the window — the gesture never revealed its target').toBe('200px');
	});

	it('a target that cannot scroll is not an error — the cue still plays', async () => {
		const stage = mount();
		const src = unscrollableTarget({ left: 700, top: 400, width: 40, height: 30 });
		await stage.point(src);
		expect(at(cursorEl(), 'left')).toBeCloseTo(720, 0);
		expect(at(cursorEl(), 'top')).toBeCloseTo(415, 0);
	});

	it("retries without `behavior` on an engine that rejects 'instant' rather than not scrolling at all", async () => {
		// `behavior` is a WebIDL enum: a member the engine does not know throws TypeError from the
		// dictionary conversion instead of being ignored. `'instant'` shipped in Safari 15.4, so on
		// an older iOS the whole call throws — and silently swallowing that would leave exactly the
		// phones this fix is for pointing off-screen again.
		const stage = mount();
		const { src, calls, log } = watchedTarget({ left: 300, top: 900, width: 120, height: 40 }, { rejectBehavior: true, scrollBy: { dx: 0, dy: -700 } });
		await stage.point(src);
		expect(calls).toHaveLength(2);
		expect(calls[1]).toEqual({ block: 'nearest', inline: 'nearest' });
		expect(log[0]).toBe('scroll'); // the RETRY is what scrolled; the first call threw before logging
		expect(at(cursorEl(), 'top')).toBeCloseTo(218, 0); // aimAt: 200 + min(height/2, 18)
	});

	it('keeps playing when a host source refuses to scroll at all', async () => {
		const stage = mount();
		const src: RectSource = {
			...unscrollableTarget({ left: 700, top: 400, width: 40, height: 30 }),
			getBoundingClientRect: () => ({ x: 700, y: 400, left: 700, top: 400, width: 40, height: 30, right: 740, bottom: 430, toJSON: () => ({}) }) as DOMRect,
			scrollIntoView: () => {
				throw new Error('this region is positioned by the host');
			},
		};
		await stage.point(src);
		expect(at(cursorEl(), 'left')).toBeCloseTo(720, 0);
	});
});

describe("bounds:'host' re-seats the chrome after a scroll the stage itself performed", () => {
	// The chrome is measured against the VISIBLE part of `root`, and scrolling changes that box —
	// but only `resize` was wired to `relayout`, because until now nothing in the stage could move
	// the page. A caption seated against the pre-scroll intersection is the same class of defect
	// as the off-screen Exit chip that made `bounds: 'host'` measure the visible part in the first
	// place: chrome about where the host used to be.
	function partlyVisibleHost() {
		const root = document.createElement('div');
		document.body.appendChild(root);
		// 400px tall, starting 600px down a ~768px window: 168px of it is on screen.
		const hostBox = { left: 40, top: 600, width: 900, height: 400 };
		root.getBoundingClientRect = () =>
			({ left: hostBox.left, top: hostBox.top, width: hostBox.width, height: hostBox.height, right: hostBox.left + hostBox.width, bottom: hostBox.top + hostBox.height, x: hostBox.left, y: hostBox.top, toJSON: () => ({}) }) as DOMRect;
		active = createStage({ root, onExit: () => {}, theme: resolveTheme({ motion: 'full', caption: 'bar', bounds: 'host' }) });
		const layer = document.querySelector('.vetrina-stage') as HTMLElement;
		// jsdom measures every element as 0x0, and the seating converts viewport -> layer by
		// subtracting the LAYER's box. The layer is `position: fixed; inset: 0`, so the window IS
		// its box — without this the assertions below would be about jsdom, not about the clamp.
		layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: window.innerWidth, bottom: window.innerHeight, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
		return { layer, hostBox };
	}

	it('moves the caption when the reveal scrolls the host up the window', async () => {
		const { layer, hostBox } = partlyVisibleHost();
		const stage = active as Stage;
		await frames(2); // the mount's own rAF seats the dock once
		const dock = layer.querySelector('.vetrina-caption') as HTMLElement;
		const before = Number.parseFloat(dock.style.bottom);
		expect(Number.isFinite(before)).toBe(true);

		// The target is inside the host, below the fold; revealing it scrolls the page 500px, which
		// carries the host with it (a real scroll moves both).
		const { src } = watchedTarget({ left: 300, top: 900, width: 120, height: 40 }, { scrollBy: { dx: 0, dy: -500 } });
		const scrolled = src.scrollIntoView;
		src.scrollIntoView = (arg) => {
			hostBox.top -= 500;
			scrolled?.call(src, arg);
		};
		await stage.point(src);

		const after = Number.parseFloat(dock.style.bottom);
		// The host's visible bottom moved from the window's bottom edge (768) up to 500, so the
		// dock's distance from the bottom of the window grows by that much.
		expect(after - before, `the dock stayed at ${before}px — it is still seated against the pre-scroll host`).toBeGreaterThan(200);
	});
});
