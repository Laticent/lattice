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
function watchedTarget(init: { left: number; top: number; width: number; height: number }, opts: { scrollBy?: { dx: number; dy: number }; once?: boolean; rejectBehavior?: boolean } = {}) {
	const box = { ...init };
	let scrolled = false;
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
			// `once` models the half of `block: 'nearest'` that matters when a target is revealed
			// TWICE in one beat (a drag's pick-up, then its snap-back): the second call finds the
			// box already in view and scrolls nothing. Without it the stub would march the target
			// off the top of the window, which is a fiction no browser performs.
			if (opts.scrollBy && !scrolled) {
				box.left += opts.scrollBy.dx;
				box.top += opts.scrollBy.dy;
				if (opts.once) scrolled = true;
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
		const tried: unknown[] = [];
		const src: RectSource = {
			...unscrollableTarget({ left: 700, top: 400, width: 40, height: 30 }),
			getBoundingClientRect: () => ({ x: 700, y: 400, left: 700, top: 400, width: 40, height: 30, right: 740, bottom: 430, toJSON: () => ({}) }) as DOMRect,
			scrollIntoView: (arg) => {
				tried.push(arg);
				throw new Error('this region is positioned by the host');
			},
		};
		await stage.point(src);
		// It TRIED — twice, because the first throw is indistinguishable from the `behavior` enum
		// rejection above, so the retry runs before the stage gives up. Without this the arm passes
		// against a `reveal` that silently became a no-op, which is the mutant it is nearest to.
		expect(tried).toHaveLength(2);
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

describe("a scroll the VIEWER performs re-seats the bounds:'host' chrome", () => {
	// The limit the previous pass logged and did not close. Under `bounds: 'host'` the chrome is
	// measured against the VISIBLE part of the host, and the chrome lives in a `position: fixed`
	// layer — so a scroll moves the host under it and leaves the caption describing where the host
	// used to be. Only `resize` and the stage's own reveal were wired to `relayout`.
	//
	// The jank question the record asked to be measured is answered by the SECOND arm here and by
	// a real-surface frame-cost run (docs/e2e/vetrina-cursor-caption.spec.ts): the handler reads
	// the clamped box and returns without writing when it has not moved, which is every scroll of
	// a host that already spans the window.

	/** A host taller than the window, partly on screen, with a counter on each rect read so an
	 *  arm can tell "checked and stopped" from "re-seated". */
	function scrollableHost(bounds: 'host' | 'viewport' = 'host') {
		const root = document.createElement('div');
		document.body.appendChild(root);
		const hostBox = { left: 0, top: 300, width: 900, height: 2000 };
		const reads = { root: 0, layer: 0 };
		root.getBoundingClientRect = () => {
			reads.root++;
			return { left: hostBox.left, top: hostBox.top, width: hostBox.width, height: hostBox.height, right: hostBox.left + hostBox.width, bottom: hostBox.top + hostBox.height, x: hostBox.left, y: hostBox.top, toJSON: () => ({}) } as DOMRect;
		};
		active = createStage({ root, onExit: () => {}, theme: resolveTheme({ motion: 'full', caption: 'bar', bounds }) });
		const layer = document.querySelector('.vetrina-stage') as HTMLElement;
		layer.getBoundingClientRect = () => {
			reads.layer++;
			return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: window.innerWidth, bottom: window.innerHeight, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
		};
		return { layer, hostBox, reads };
	}

	const scrollTo = async (hostBox: { top: number }, top: number) => {
		hostBox.top = top;
		window.dispatchEvent(new Event('scroll'));
		await frames(3); // the handler is rAF-coalesced
	};

	it('moves the caption when the viewer scrolls the host through the window', async () => {
		const { layer, hostBox } = scrollableHost();
		await frames(2);
		const dock = layer.querySelector('.vetrina-caption') as HTMLElement;
		const before = Number.parseFloat(dock.style.bottom);
		expect(Number.isFinite(before)).toBe(true);

		// The host's top moves from 300 to -400: its visible box now starts at the top of the
		// window and is 700px taller, so the dock's distance from the window's bottom changes.
		await scrollTo(hostBox, -400);
		const after = Number.parseFloat(dock.style.bottom);
		expect(after, `the dock stayed at ${before}px — it is still seated against the pre-scroll host`).not.toBeCloseTo(before, 0);
	});

	it('does NO work on a scroll that does not move the seated geometry — the whole jank answer', async () => {
		// A host taller than the window and spanning it: the intersection is the window at every
		// scroll position. This is the Studio's shell and every full-page tour, so it is the
		// common case rather than a lucky one.
		//
		// THE ORACLE IS THE WRITE, not the read, and the distinction is the cost model. Two rect
		// reads in a rAF callback are cheap; what is expensive is a STYLE WRITE, because it dirties
		// layout and turns the next frame's read into a forced reflow. So this watches the dock's
		// style attribute rather than counting `getBoundingClientRect` calls — which is also the
		// only oracle that still works now that the cheap check reads both rects itself.
		const { layer, hostBox } = scrollableHost();
		hostBox.top = -500; // already covering the window top to bottom
		await frames(2);
		const dock = layer.querySelector('.vetrina-caption') as HTMLElement;
		let writes = 0;
		const mo = new MutationObserver((recs) => {
			writes += recs.length;
		});
		mo.observe(dock, { attributes: true, attributeFilter: ['style'] });
		try {
			await scrollTo(hostBox, -600); // still spanning the window — seated geometry unchanged
			await scrollTo(hostBox, -700);
			await scrollTo(hostBox, -800);
			expect(writes, 'the handler wrote a style on a scroll that moved nothing').toBe(0);
			// The oracle can see a write when there IS one — otherwise "0" would prove nothing.
			await scrollTo(hostBox, 300); // now the host really does slide down the window
			expect(writes, 'the oracle never observed a write at all, so the zero above is meaningless').toBeGreaterThan(0);
		} finally {
			mo.disconnect();
		}
		expect(dock.style.bottom).toBeTruthy();
	});

	it('registers nothing at all under the default bounds', async () => {
		// `bounds: 'viewport'` seats every edge style in pure CSS, so there is nothing for a
		// scroll to re-seat — and a tour that never asked for any of this should not pay even a
		// handler that returns early.
		const { reads } = scrollableHost('viewport');
		await frames(2);
		const before = reads.root;
		window.dispatchEvent(new Event('scroll'));
		await frames(3);
		expect(reads.root - before, 'the default bounds paid for a scroll handler it has no use for').toBe(0);
	});

	it('stops listening on destroy', async () => {
		const { hostBox, reads } = scrollableHost();
		await frames(2);
		(active as Stage).destroy();
		const before = reads.root;
		await scrollTo(hostBox, -900);
		expect(reads.root - before, 'the stage outlived its scroll listener').toBe(0);
	});
});

describe('the reveal clears the tour\'s own caption', () => {
	// THE SECOND HALF OF THE IPHONE REPORT, and the half the first pass left unexplained. Making a
	// cue scroll its target into view is not the same as making it VISIBLE: `block: 'nearest'`
	// scrolls the minimum, so a target that was below the fold lands its bottom edge flush with
	// the window's — which is the edge this library paints its caption against. Under the phone's
	// `caption: 'scrim'` that is a 230px gradient reaching 90% opacity exactly there.
	//
	// Measured on the Studio's phone tour before this existed: the freshly typed tail of the
	// document sat 115px inside the gradient on Chromium at 390x844 and 225px inside it on real
	// WebKit at an iPhone 15 Pro box. The committed sampler scored both 0px, because it asked
	// whether the tail was inside the EDITOR rather than whether it was inside the VISIBLE part
	// of it (docs/e2e/demo-mobile.spec.ts).
	//
	// The room is asked for with `scroll-margin`, the platform's own "leave space for the fixed
	// thing over there", so the BROWSER keeps choosing which ancestor scrolls. jsdom has no
	// layout, so what these pin is the contract: the property is set from the measured caption box
	// before the scroll and restored after, and the same number is published for a host to read.

	/** Give the painted caption a real box. jsdom measures every element as 0x0, and a zero-area
	 *  box is deliberately NOT an occluder — so without this the stage would correctly report an
	 *  inset of 0 and these arms would be about jsdom. `h` px tall, against the bottom of a
	 *  ~768px window. */
	function captionCovering(h: number, theme: Parameters<typeof resolveTheme>[0] = {}, span?: { left: number; width: number }): Stage {
		const stage = mount({ caption: 'bar', ...theme });
		const painted = document.querySelector('.vetrina-caption') as HTMLElement;
		// `bar` paints the dock itself; `split`/`scrim` paint into a child. Either way the element
		// the style declared as its occluder is what gets measured, so stub whichever this is.
		const el = (painted.querySelector('div[aria-hidden="true"]') as HTMLElement) ?? painted;
		const top = (theme.placement === 'top' ? 0 : window.innerHeight - h);
		// `span` narrows the caption horizontally, which is what a centered `progress` pill (380px)
		// or a `split` cap (560px) really is. Default is full width — the `scrim` case, and what
		// every arm written before the extent existed assumed.
		const left = span ? span.left : 0;
		const width = span ? span.width : window.innerWidth;
		el.getBoundingClientRect = () => ({ left, top, width, height: h, right: left + width, bottom: top + h, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
		return stage;
	}

	/** A target that is a REAL element, so it has the `style` the reveal writes through, and whose
	 *  `scrollIntoView` MODELS what `block: 'nearest'` actually does to an off-screen target: it
	 *  brings the scroll-MARGIN box's near edge flush with the viewport's. Honoring the margin is
	 *  the whole point of the fixture — a stub that ignored it could not tell the fix from its
	 *  absence, which is the failure mode this file's subject is about. `seen` records the margin
	 *  at each call, so the two-pass shape (scroll, look, lift clear) is assertable. */
	function elementTarget(height = 40, left = 300) {
		const el = document.createElement('div');
		document.body.appendChild(el);
		const box = { left, top: 2400, width: 120, height };
		el.getBoundingClientRect = () => ({ left: box.left, top: box.top, width: box.width, height: box.height, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => ({}) }) as DOMRect;
		const seen: { top: string; bottom: string; block?: ScrollLogicalPosition }[] = [];
		el.scrollIntoView = (arg?: boolean | ScrollIntoViewOptions) => {
			const m = { top: el.style.scrollMarginTop, bottom: el.style.scrollMarginBottom, block: typeof arg === 'object' ? arg?.block : undefined };
			seen.push(m);
			const mb = Number.parseFloat(m.bottom) || 0;
			const mt = Number.parseFloat(m.top) || 0;
			if (box.top + box.height + mb > window.innerHeight) box.top = window.innerHeight - mb - box.height;
			else if (box.top - mt < 0) box.top = mt;
		};
		return { el, seen, box };
	}

	const published = (name: 'top' | 'bottom' | 'left' | 'right') => document.documentElement.style.getPropertyValue(`--vt-chrome-${name}`);

	it('lands the target clear of the caption, and hands the element back unchanged', async () => {
		const stage = captionCovering(230);
		await frames(2); // the mount rAF measures and publishes
		const { el, seen, box } = elementTarget();
		await stage.point(el);

		// TWO passes, and the order is the contract: scroll first (so nothing in the beat measures
		// a stale rect), then look at where it landed, then lift it clear if it landed covered.
		expect(seen, 'the target was never scrolled').toHaveLength(2);
		expect(seen[0], 'the first pass pre-empted the measurement it is supposed to decide from').toEqual({ top: '', bottom: '', block: 'nearest' });
		// `end`, not `nearest`, and it is an ENGINE fact: measured on both, Chromium's `nearest`
		// ignores a scroll-margin on a target already flush with the edge and scrolls nothing,
		// while WebKit honors it. `nearest` stays right for the first pass — that is what makes a
		// reveal safe before every aim — but by the second the decision has already been taken.
		expect(seen[1].block, 'the lift used `nearest`, which Chromium answers by doing nothing').toBe('end');
		// The number is the MEASURED caption box, not a constant: 230px of window covered.
		expect(seen[1].bottom, 'the reveal never asked for room for the caption it was about to talk through').toBe('230px');
		expect(seen[1].top, 'a bottom-placed caption must not also reserve room at the top').toBe('');
		// And the OUTCOME: the target's bottom edge is above the band, not flush with the window.
		expect(box.top + box.height, `the target ended at ${box.top + box.height} in a ${window.innerHeight}px window whose last 230px are covered`).toBeLessThanOrEqual(window.innerHeight - 230);
		// And it is the HOST's element — a tour that was only visiting must not leave a
		// `scroll-margin` behind on it, NOR the empty `style=""` a per-property restore leaves on
		// an element that had no style attribute to begin with.
		expect(el.style.scrollMarginBottom, 'the tour left its scroll-margin on the host element').toBe('');
		expect(el.getAttribute('style'), 'the tour left a style attribute on an element that had none').toBeNull();
	});

	it('publishes the same number for a host that scrolls its own content, and takes it back on destroy', async () => {
		const stage = captionCovering(230);
		await frames(2);
		// The Studio's editor reads this to follow what a tour types without revealing under the
		// caption; it cannot measure the stage itself, which is a body-portalled fixed layer.
		expect(published('bottom')).toBe('230px');
		expect(published('top')).toBe('0px');
		stage.destroy();
		// REMOVED, not zeroed — a stale inset would have every later reveal on this page leave
		// room for a caption that is no longer on it.
		expect(published('bottom'), 'the inset outlived the stage').toBe('');
		expect(published('top')).toBe('');
	});

	it('a top-placed caption reserves room at the TOP, and nothing at the bottom', async () => {
		const stage = captionCovering(64, { placement: 'top' });
		await frames(2);
		expect(published('top')).toBe('64px');
		expect(published('bottom')).toBe('0px');
		const { el, seen, box } = elementTarget();
		box.top = -900; // above the fold, so `nearest` brings it down to the top edge
		await stage.point(el);
		expect(seen).toHaveLength(2);
		expect(seen[1].top).toBe('64px');
		expect(seen[1].bottom).toBe('');
		expect(seen[1].block, 'a top-placed caption lifts toward the START edge').toBe('start');
		expect(box.top, 'the target landed under a top-placed caption').toBeGreaterThanOrEqual(64);
	});

	it('leaves a target TALLER than the remaining room alone, rather than pushing it off the top', async () => {
		// `nearest` acts on the scroll-MARGIN box. Once that box is taller than the viewport a
		// target that was visible has one edge in and one out, so the browser aligns the FAR edge
		// and pushes the near one off screen — a 500px target with a 230px band in a 659px window
		// ends 71px above the top. Shipped tours point at whole panes, so this is the ordinary
		// case; the right answer is to leave such a target where plain `nearest` put it.
		const stage = captionCovering(230);
		await frames(2);
		const { el, seen } = elementTarget(window.innerHeight - 230 + 10);
		await stage.point(el);
		expect(seen, 'the reveal asked for room it could only get by scrolling the target off screen').toHaveLength(1);
		expect(el.getAttribute('style')).toBeNull();
	});

	it('does not scroll a second time for a target that already landed clear of the caption', async () => {
		// The lift is not unconditional: an in-view target costs one no-op `nearest` and nothing
		// else. Without this every aim of every tour would pay two scrolls.
		const stage = captionCovering(230);
		await frames(2);
		const { el, seen, box } = elementTarget();
		box.top = 40; // already on screen, nowhere near the band
		await stage.point(el);
		expect(seen).toHaveLength(1);
	});

	it("caption: 'cursor' declares no occluder — its bubble already steps out of the way", async () => {
		// The one style that must NOT make reveals dodge it. Its whole design is to place the
		// balloon away from the thing being pointed at, and its only fixed chrome is a 32px corner
		// chip; reserving a band for that would move the page for nothing.
		const stage = captionCovering(230, { caption: 'cursor' });
		await frames(2);
		expect(published('bottom')).toBe('0px');
		const { el, seen } = elementTarget();
		await stage.point(el);
		expect(seen, 'the cursor caption made the reveal take a second pass it has no use for').toHaveLength(1);
		expect(seen[0].bottom, 'the cursor caption reserved a band it does not occupy').toBe('');
	});

	it('restores an element that DID have inline styles, exactly', async () => {
		const stage = captionCovering(230);
		await frames(2);
		const { el } = elementTarget();
		el.setAttribute('style', 'color: red; scroll-margin-bottom: 9px');
		await stage.point(el);
		// The DECLARATIONS, not the raw string: the restore goes through CSSOM (so a host CSP that
		// blocks `style-src-attr` cannot strand our value on the element), and any CSSOM write
		// re-serializes the declaration — `9px` can come back as `9px;`. Semantically identical,
		// and asserting the string would be asserting the serializer.
		expect(el.style.color).toBe('red');
		expect(el.style.scrollMarginBottom).toBe('9px');
		expect(el.style.scrollMarginTop).toBe('');
	});

	it('survives a SECOND stage publishing over it and then tearing down', async () => {
		// The failure this pins was reproduced, not imagined. `--vt-chrome-*` is one document-global
		// pair, and two stages can share a page: the Studio's Present guide builds a second one
		// (`caption: 'none'`) and two shipped tours open Present mid-run. The guide publishes 0px
		// over the tour's band and, on teardown, removes the property outright — so with a memo of
		// "what I last wrote", the live stage agreed with a value that was gone and never wrote
		// again. Every reveal for the rest of the run silently reverted to the defect.
		const tour = captionCovering(230);
		await frames(2);
		expect(published('bottom')).toBe('230px');

		// A second stage over the top — its own root, its own dock, no occluder of its own.
		const guideRoot = document.createElement('div');
		document.body.appendChild(guideRoot);
		const guide = createStage({ root: guideRoot, onExit: () => {}, theme: resolveTheme({ motion: 'full', caption: 'none' }) });
		await frames(2);
		guide.destroy();
		await frames(1);

		// The live stage puts its own number back on its next beat, rather than trusting a cache.
		// A `point` is the smallest real beat: it brackets a performance, and every perform bracket
		// goes through `syncCaption`, which is where the inset is republished. (`say` would do it
		// too, but only after its 140ms cross-fade, which is not what is under test here.)
		await tour.point(watchedTarget({ left: 10, top: 10, width: 20, height: 20 }).src);
		expect(published('bottom'), 'a departed stage took the live one\'s inset with it, permanently').toBe('230px');
	});

	it('a departing stage does not remove an inset that is no longer its own', async () => {
		const tour = captionCovering(230);
		await frames(2);
		const otherRoot = document.createElement('div');
		document.body.appendChild(otherRoot);
		const other = createStage({ root: otherRoot, onExit: () => {}, theme: resolveTheme({ motion: 'full', caption: 'none' }) });
		await frames(2);
		// `other` published 0px, so the live tour republishes 230px on its next beat...
		await tour.point(watchedTarget({ left: 10, top: 10, width: 20, height: 20 }).src);
		expect(published('bottom')).toBe('230px');
		// ...and now `other` tearing down must NOT delete it.
		other.destroy();
		expect(published('bottom'), 'a stage removed an inset it did not publish').toBe('230px');
	});

	it('a RectSource that is not an element still reveals — the margin is simply not available', async () => {
		// The Present guide's in-iframe regions answer `getBoundingClientRect` and nothing else.
		// They opt out of scrolling entirely, but a provider that DOES offer `scrollIntoView`
		// without being an element must not throw on the way past the margin.
		const stage = captionCovering(230);
		await frames(2);
		const { src, calls } = watchedTarget({ left: 300, top: 2400, width: 120, height: 40 });
		await stage.point(src);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toEqual({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
	});

	// ── The band is a RECT, not a full-width stripe ──────────────────────────────────────
	//
	// `chromeInset` used to read two fields of the caption's box and throw away the other two, so
	// a 380px centered `progress` pill on a 1024px window claimed all 1024 of them. Everything
	// that reveals then dodged a caption that was nowhere near it. jsdom has no layout, so the
	// pill's width is supplied the same way its height always has been — the input to this
	// arithmetic IS a rect (see `captionCovering`).
	//
	// A centered 380px caption on jsdom's 1024px window spans x 322..702, so the clear strips are
	// 322px on each side.
	const PILL = { left: 322, width: 380 };

	it('publishes the clear strip at each side, so a host can see the caption is not full width', async () => {
		const stage = captionCovering(230, {}, PILL);
		await frames(2);
		expect(published('left')).toBe('322px');
		expect(published('right')).toBe('322px');
		// The vertical pair is untouched by any of this — the published contract did not move.
		expect(published('bottom')).toBe('230px');
		stage.destroy();
	});

	it('publishes 0 on both sides for a FULL-WIDTH caption, which is what `scrim` is', async () => {
		// The default `captionCovering` box, i.e. every arm above this one. 0/0 is what makes the
		// extent additive: a consumer that reads a missing property as 0 rebuilds the old band.
		const stage = captionCovering(230);
		await frames(2);
		expect(published('left')).toBe('0px');
		expect(published('right')).toBe('0px');
		stage.destroy();
	});

	it('does NOT scroll for a target sitting BESIDE a narrow caption', async () => {
		const stage = captionCovering(230, {}, PILL);
		await frames(2);
		// x 40..160 — well clear of the pill's 322..702, and vertically deep in the band.
		const { el, seen } = elementTarget(40, 40);
		await stage.point(el);
		// ONE pass, not two: the first `nearest` brings it on screen, and the lift never runs
		// because nothing is painted over where it landed. Before this, it scrolled twice.
		expect(seen.length, 'the reveal lifted a target the caption does not cover').toBe(1);
		expect(seen[0].bottom, 'a scroll-margin was borrowed for a caption that is elsewhere').toBe('');
		stage.destroy();
	});

	it('still scrolls for a target BEHIND the same narrow caption', async () => {
		const stage = captionCovering(230, {}, PILL);
		await frames(2);
		// x 450..570 — inside the pill's span, so this is the case the lift exists for.
		const { el, seen } = elementTarget(40, 450);
		await stage.point(el);
		expect(seen.length).toBe(2);
		expect(seen[1].bottom).toBe('230px');
		expect(seen[1].block).toBe('end');
		stage.destroy();
	});

	it('treats a touching edge as clear, not as covered', async () => {
		const stage = captionCovering(230, {}, PILL);
		await frames(2);
		// x 202..322: its right edge is exactly the band's left edge. Nothing is painted over a
		// zero-width intersection, and a >= test here would lift for it.
		const { el, seen } = elementTarget(40, 202);
		await stage.point(el);
		expect(seen.length).toBe(1);
		stage.destroy();
	});
});

describe('the drag path reveals both of its ends, and the snap-back reveals again', () => {
	// Three of the five reveal call sites live in `drag`, and an independent pass found all three
	// uncovered: deleting them left the whole unit suite green. The drop target's call is not even
	// new — it predates this work as a bare `toEl.scrollIntoView?.(…)` — and routing it through
	// `reveal` changed it (it now passes `behavior` and re-seats the chrome), with nothing
	// asserting either.
	it('reveals the pick-up target before the glide, and the drop target before its own', async () => {
		const stage = mount();
		const from = watchedTarget({ left: 40, top: 60, width: 120, height: 40 });
		const to = watchedTarget({ left: 40, top: 2400, width: 120, height: 40 }, { scrollBy: { dx: 0, dy: -2200 } });
		await stage.drag(from.src, to.src);
		expect(from.calls, 'the thing being picked up was never revealed').toHaveLength(1);
		expect(to.calls, 'the drop target was never revealed').toHaveLength(1);
		expect(to.calls[0]).toEqual({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
		// The carried chip ends on the drop target's POST-scroll position.
		expect(at(cursorEl(), 'top')).toBeCloseTo(218, 0);
	});

	it('reveals `from` again on the snap-back, because the drop glide may have moved the page', async () => {
		const stage = mount();
		const from = watchedTarget({ left: 40, top: 60, width: 120, height: 40 });
		const to = watchedTarget({ left: 40, top: 2400, width: 120, height: 40 });
		const handle = await stage.drag(from.src, to.src);
		await handle.snapBack();
		expect(from.calls, 'the snap-back aimed at `from` without asking for it to be on screen').toHaveLength(2);
	});

	it('and under reduced motion the snap-back LANDS on `from` rather than shaking where `to` was', async () => {
		// The defect this pins is one this reveal introduced and an independent checker caught:
		// `legible`/`still` run no glide, so a reveal that scrolls the page while the cursor holds
		// its pre-scroll viewport coordinates leaves the "it didn't happen" shake off-screen —
		// measured at y=2415 in a 768px window. The reduced tier has to be placed explicitly.
		const stage = mount({ motion: 'legible' });
		const from = watchedTarget({ left: 40, top: 2400, width: 120, height: 40 }, { scrollBy: { dx: 0, dy: -2200 }, once: true });
		const to = watchedTarget({ left: 40, top: 500, width: 120, height: 40 });
		const handle = await stage.drag(from.src, to.src);
		await handle.snapBack();
		// `from` starts below the fold and its first reveal brings it to 200, so the cursor must end
		// on 218 — not on 518, where `to` is and where the unfixed draft left it shaking.
		expect(at(cursorEl(), 'top'), 'the cursor stayed on `to` — the shake plays where the item is not').toBeCloseTo(218, 0);
	});

});

describe('a gesture that does not use its target does not scroll to it', () => {
	it('`wave` and `shake` play at the cursor, so a target they ignore is not revealed', async () => {
		// Both are documented as playing at the cursor and they never read `el`. Revealing for them
		// scrolls the page out from under a cue that has not moved, which lands it over whatever
		// the scroll brought there. (`Stage.gesture` and `scene().gesture` both accept a target for
		// any kind, so this is reachable from the public surface even though no shipped tour does it.)
		const stage = mount();
		const wave = watchedTarget({ left: 300, top: 2400, width: 120, height: 40 });
		await stage.gesture('wave', wave.src);
		expect(wave.calls).toHaveLength(0);
		const shake = watchedTarget({ left: 300, top: 2400, width: 120, height: 40 });
		await stage.gesture('shake', shake.src);
		expect(shake.calls).toHaveLength(0);
	});

	it('a SILENCED cue draws nothing, so it must not move the page either', async () => {
		// `theme.cues = { circle: false }` is the documented way to switch a cue off. Scrolling for
		// ink that never appears is a page move with no visible cause — worse than the off-screen
		// cue the reveal exists to fix.
		const stage = mount({ cues: { circle: false, underline: false } });
		const circle = watchedTarget({ left: 300, top: 2400, width: 120, height: 40 });
		await stage.gesture('circle', circle.src);
		expect(circle.calls, 'a silenced circle scrolled the page for ink it never drew').toHaveLength(0);
		const underline = watchedTarget({ left: 300, top: 2400, width: 120, height: 40 });
		await stage.gesture('underline', underline.src);
		expect(underline.calls).toHaveLength(0);
	});

	it('but the same cue, un-silenced, does reveal — the guard is the silence, not the kind', async () => {
		const stage = mount();
		const circle = watchedTarget({ left: 300, top: 2400, width: 120, height: 40 });
		void stage.gesture('circle', circle.src);
		await frames(2);
		expect(circle.calls).toHaveLength(1);
	});
});
