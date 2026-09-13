import { render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The engine host is stubbed. These tests are about WHICH TILE GETS A FRAME and — the property
// the whole module exists for — WHETHER A FRAME IS EVER UNMOUNTED. They are not about rendering
// a slide; that is the e2e suite's job, on a real browser (HARD RULE #23).
//
// The mock counts mounts and unmounts, because "the pool reuses its frames" is not observable
// from the DOM: a reused DeckPreview and a recreated one look identical once rendered. A React
// remount is exactly the teardown WebKit does not reclaim, so the count IS the contract.
let mounts = 0;
let unmounts = 0;
vi.mock('@/components/DeckPreview', async () => {
	const React = await import('react');
	return {
		default: (props: Record<string, unknown>) => {
			React.useEffect(() => {
				mounts++;
				return () => {
					unmounts++;
				};
			}, []);
			return <figure data-testid="deck-preview" data-sample={String(props.sample)} data-specimen={props.specimen ? 'yes' : 'no'} />;
		},
	};
});

import { APPLY_MS, BASE_SLOTS, HARD_MAX_SLOTS, PooledThumbFace, PreviewPool, RELEASE_GRACE } from './preview-pool';

// A controllable IntersectionObserver: jsdom has none, and the pool's no-IO fallback treats
// every tile as in band, which would make every assertion here vacuous.
type Entry = { target: Element; isIntersecting: boolean };
type IOOptions = { root?: Element | Document | null; rootMargin?: string };
let observers: { cb: (e: Entry[]) => void; options: IOOptions; targets: Set<Element>; disconnected: boolean }[] = [];

class FakeIO {
	cb: (e: Entry[]) => void;
	options: IOOptions;
	targets = new Set<Element>();
	disconnected = false;
	// It TAKES THE OPTIONS, and not only because dropping them is a signature mismatch a static
	// analyzer flags: a fake that discards `root` cannot fail when the observer is rooted at the
	// wrong element, which is exactly the defect that shipped — `rootMargin` is applied to the root
	// only, so rooting at the viewport bought nothing on a grid that scrolls inside a container.
	constructor(cb: (e: Entry[]) => void, options: IOOptions = {}) {
		this.cb = cb;
		this.options = options;
		observers.push(this);
	}
	observe(el: Element) {
		this.targets.add(el);
	}
	unobserve(el: Element) {
		this.targets.delete(el);
	}
	disconnect() {
		this.disconnected = true;
		this.targets.clear();
	}
}

/**
 * Deliver a COALESCED BATCH — several entries for one target in one callback, which is what a
 * real IntersectionObserver does when the update-observations step runs more than once before its
 * task is serviced. Measured on the real Studio: 4-10 such batches per flick-scroll of the
 * gallery, overwhelmingly the shape `[true, false]`. The pool reads the LAST entry; a `([e])`
 * destructure reads the first, which is a stale answer and strands a tile in band forever.
 */
function deliver(el: Element, states: boolean[]) {
	act(() => {
		for (const o of observers) {
			if (!o.disconnected && o.targets.has(el)) o.cb(states.map((isIntersecting) => ({ target: el, isIntersecting })));
		}
	});
}

const intersect = (el: Element, isIntersecting: boolean) => deliver(el, [isIntersecting]);

/** Let the pool's throttle fire. Assignments settle rather than track (see `schedule`), so
 *  nothing at all happens until this runs. */
function settle(ms = APPLY_MS + 20) {
	act(() => {
		vi.advanceTimersByTime(ms);
	});
}

// Geometry, because the pool's priority order asks whether a tile is ON SCREEN and jsdom answers
// every rect with zeros. Tiles opt in through this map; anything absent reads as off screen,
// which is the conservative answer and the one an un-stubbed test would get anyway.
const rects = new Map<Element, { top: number; height: number }>();
const onScreen = (el: Element) => rects.set(el, { top: 10, height: 100 });
const offScreen = (el: Element) => rects.set(el, { top: 5000, height: 100 });

/** Four of the author's own tiles, then four catalog specimens — the one configuration in which
 *  "per tile" is a claim about `specimen` rather than a claim about the whole pool. */
function MixedGrid() {
	return (
		<PreviewPool>
			{Array.from({ length: 8 }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: a fixed-length fake grid; the index IS the tile's identity.
				<div key={i} data-testid={`tile-${i}`}>
					<PooledThumbFace options={{ themeBase: '', runtimeUrl: '', engineUrl: '' }} sample={`# ${i}`} specimen={i >= 4} className="aspect-video w-full" />
				</div>
			))}
		</PreviewPool>
	);
}

/** A grid inside a real scrolling container — the shape every shipped consumer has, and the one
 *  the bare `Grid` below does not model. */
function ScrollGrid({ n }: { n: number }) {
	return (
		<div data-testid="scroller" style={{ overflowY: 'auto', height: 400 }}>
			<PreviewPool>
				{Array.from({ length: n }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: a fixed-length fake grid; the index IS the tile's identity.
					<div key={i} data-testid={`tile-${i}`}>
						<PooledThumbFace options={{ themeBase: '', runtimeUrl: '', engineUrl: '' }} sample={`# ${i}`} className="aspect-video w-full" />
					</div>
				))}
			</PreviewPool>
		</div>
	);
}

function Grid({ n, specimen = false, pooled = true }: { n: number; specimen?: boolean; pooled?: boolean }) {
	const tiles = Array.from({ length: n }, (_, i) => (
		// biome-ignore lint/suspicious/noArrayIndexKey: a fixed-length fake grid; the index IS the tile's identity.
		<div key={i} data-testid={`tile-${i}`}>
			<PooledThumbFace options={{ themeBase: '', runtimeUrl: '', engineUrl: '' }} sample={`# ${i}`} specimen={specimen} className="aspect-video w-full" />
		</div>
	));
	return pooled ? <PreviewPool>{tiles}</PreviewPool> : <>{tiles}</>;
}

/** The `sample` each mounted frame is currently showing — the pool's output, in one read. */
const showing = (c: HTMLElement) => [...c.querySelectorAll('[data-testid="deck-preview"]')].map((f) => f.getAttribute('data-sample'));

/** The observed element for tile `i` — the face's own span, not the wrapper. */
const face = (c: HTMLElement, i: number) => c.querySelector(`[data-testid="tile-${i}"] span`) as Element;

beforeEach(() => {
	mounts = 0;
	unmounts = 0;
	observers = [];
	rects.clear();
	vi.useFakeTimers();
	(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO;
	Element.prototype.getBoundingClientRect = function () {
		const r = rects.get(this) ?? { top: 0, height: 0 };
		return { top: r.top, left: 0, right: 200, bottom: r.top + r.height, width: 200, height: r.height, x: 0, y: r.top, toJSON: () => ({}) } as DOMRect;
	};
});
afterEach(() => {
	vi.useRealTimers();
	(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});

describe('PreviewPool — which tiles hold a frame', () => {
	it('gives a frame to a tile that scrolls into band, and nothing to one that has not', () => {
		const { container, unmount } = render(<Grid n={4} />);
		settle();
		expect(showing(container), 'a pool with no in-band tile mounted a frame anyway').toEqual([]);

		intersect(face(container, 1), true);
		settle();
		expect(showing(container)).toEqual(['# 1']);
		unmount();
	});

	it('never exceeds the slot ceiling for tiles that are merely in band', () => {
		const n = BASE_SLOTS * 3;
		const { container, unmount } = render(<Grid n={n} />);
		// In band and NOT on screen — no rect is stubbed, so every tile reads as off screen. This is
		// the half the ceiling is for: a band that reaches past the fold must not mint a document per
		// tile it admits.
		for (let i = 0; i < n; i++) intersect(face(container, i), true);
		settle();
		expect(showing(container).length, `the pool grew past its floor of ${BASE_SLOTS} for off-screen tiles`).toBeLessThanOrEqual(BASE_SLOTS);
		unmount();
	});

	it('covers EVERY tile on screen, even past the base ceiling', () => {
		// The regression this pins, and it is the one a one-sided ceiling test cannot see: a fixed
		// cap of 10 left the 11th and 12th fully-visible tiles permanently blank on a desktop
		// gallery — permanently, because nothing re-runs the assignment pass while the grid sits
		// still. Measured on the real Studio at 1440x900, one blank card; at 1920x1200, two. The
		// design this replaced stated the opposite invariant outright: what is on screen is not
		// negotiable.
		const n = BASE_SLOTS + 5;
		const { container, unmount } = render(<Grid n={n} />);
		for (let i = 0; i < n; i++) {
			onScreen(face(container, i));
			intersect(face(container, i), true);
		}
		settle();
		const shown = showing(container);
		for (let i = 0; i < n; i++) {
			expect(shown, `tile ${i} is on screen and has no preview`).toContain(`# ${i}`);
		}
		expect(shown.length).toBe(n);
		unmount();
	});

	it('stops growing at the hard ceiling', () => {
		// …but "cover what is on screen" is not unbounded. Past HARD_MAX_SLOTS the pool starves the
		// least-recently-seen tiles again — a visible defect rather than an invisible memory one,
		// which is the trade this constant makes.
		const n = HARD_MAX_SLOTS + 6;
		const { container, unmount } = render(<Grid n={n} />);
		for (let i = 0; i < n; i++) {
			onScreen(face(container, i));
			intersect(face(container, i), true);
		}
		settle();
		expect(showing(container).length).toBe(HARD_MAX_SLOTS);
		unmount();
	});

	it('never re-points a slot across the specimen boundary', () => {
		// `DeckPreview` builds its renderer ONCE, on first mount, so `specimen` is fixed per SLOT
		// however many times the document is rewritten. A pool that re-points a catalog sample into
		// a slot built for the author's own slide therefore silences that slide's overflow alarm —
		// the regression `specimen`'s docstring warns about, reappearing inside the pool. The
		// invariant is per slot, so it is read per slot: no slot ever changes its answer.
		const { container, unmount } = render(<MixedGrid />);
		const seenBySlot = new Map<number, Set<string>>();
		const record = () => {
			[...container.querySelectorAll('[data-testid="deck-preview"]')].forEach((f, i) => {
				const set = seenBySlot.get(i) ?? new Set<string>();
				set.add(String(f.getAttribute('data-specimen')));
				seenBySlot.set(i, set);
			});
		};
		// Wave 1: the author's own tiles. Wave 2: the specimens, with wave 1 released.
		for (let i = 0; i < 4; i++) {
			onScreen(face(container, i));
			intersect(face(container, i), true);
		}
		settle();
		record();
		for (let i = 0; i < 4; i++) {
			offScreen(face(container, i));
			intersect(face(container, i), false);
		}
		// Let the grace window EXPIRE before the second wave asks for a slot, in two steps. A single
		// long settle does not do it: the pass runs once, APPLY_MS after the last event, while the
		// first wave is still inside its grace and holding — so the second wave would take fresh
		// slots and never approach the boundary this test is about. (That is also the behavior worth
		// knowing: assignments change on events, not on the clock.)
		settle(RELEASE_GRACE + APPLY_MS + 40);
		for (let i = 4; i < 8; i++) {
			onScreen(face(container, i));
			intersect(face(container, i), true);
		}
		settle();
		record();
		for (const [slot, answers] of seenBySlot) {
			expect([...answers], `slot ${slot} served both a specimen and the author's own slide`).toHaveLength(1);
		}
		// And the specimens really did get previews, so the invariant is not held by showing nothing.
		expect(showing(container).filter((s) => s !== null && Number(s.slice(2)) >= 4).length).toBeGreaterThan(0);
		unmount();
	});

	it('RE-POINTS a slot instead of remounting it — the property the module exists for', () => {
		const n = BASE_SLOTS * 2;
		const { container, unmount } = render(<Grid n={n} />);
		for (let i = 0; i < BASE_SLOTS; i++) {
			onScreen(face(container, i));
			intersect(face(container, i), true);
		}
		settle();
		const firstWave = showing(container);
		expect(firstWave.length).toBe(BASE_SLOTS);
		const mountedOnce = mounts;
		expect(unmounts, 'a frame was torn down before any tile left the band').toBe(0);

		// The first wave scrolls away, a second wave arrives. Past the grace window, so the slots
		// really do change hands rather than being held.
		for (let i = 0; i < BASE_SLOTS; i++) {
			offScreen(face(container, i));
			intersect(face(container, i), false);
		}
		for (let i = BASE_SLOTS; i < n; i++) {
			onScreen(face(container, i));
			intersect(face(container, i), true);
		}
		settle(RELEASE_GRACE + APPLY_MS + 40);

		const secondWave = showing(container);
		expect(secondWave.some((s) => s !== null && Number(s.slice(2)) >= BASE_SLOTS), 'the second wave never got a slot').toBe(true);
		// THE RELATION. The slots now show different slides and not one frame was recreated:
		// no unmount, and no mount beyond the ones that opened the pool. A pool that re-created
		// its frames would pass every count assertion above and fix nothing at all.
		expect(unmounts, `${unmounts} frames were torn down; a pooled frame must outlive the tile it shows`).toBe(0);
		expect(mounts, `the pool mounted ${mounts - mountedOnce} extra frames instead of re-pointing`).toBe(mountedOnce);
		unmount();
	});

	it('prefers a tile ON SCREEN over one that is merely inside its release grace', () => {
		// The bug this pins, seen on the real gallery as three blank cards: a tile that had
		// scrolled away kept squatting on its slot through the grace window while a tile filling
		// the screen waited. Priority has to decide who KEEPS a slot, not only who gets a free one.
		const n = BASE_SLOTS + 4;
		const { container, unmount } = render(<Grid n={n} />);
		for (let i = 0; i < BASE_SLOTS; i++) {
			onScreen(face(container, i));
			intersect(face(container, i), true);
		}
		settle();
		expect(showing(container).length).toBe(BASE_SLOTS);

		// Four early tiles leave the band but stay INSIDE the grace window; four new tiles arrive
		// and are on screen. Settle by less than RELEASE_GRACE, so the grace-holders are still
		// eligible to keep their slots — and must lose them anyway.
		for (let i = 0; i < 4; i++) {
			offScreen(face(container, i));
			intersect(face(container, i), false);
		}
		for (let i = BASE_SLOTS; i < n; i++) {
			onScreen(face(container, i));
			intersect(face(container, i), true);
		}
		settle();

		const shown = showing(container);
		for (let i = BASE_SLOTS; i < n; i++) {
			expect(shown, `tile ${i} is on screen and has no preview; a grace-holder kept the slot`).toContain(`# ${i}`);
		}
		unmount();
	});

	it('roots its observer at the scroller the tiles actually scroll in', () => {
		// `rootMargin` is applied to the ROOT. With a null root the observer still clips against
		// intermediate scrollers, so the 150px margin — the head start a tile gets before it is
		// needed — silently bought nothing on every grid this ships to, all of which scroll inside a
		// container.
		const { container, unmount } = render(<ScrollGrid n={3} />);
		const scroller = container.querySelector('[data-testid="scroller"]');
		expect(observers.length).toBeGreaterThan(0);
		for (const o of observers) {
			expect(o.options.root, 'an observer was rooted at the viewport instead of the scroller').toBe(scroller);
			expect(o.options.rootMargin, 'the band margin is gone').toBeTruthy();
		}
		unmount();
	});

	it('reads the LAST entry of a coalesced batch, not the first', () => {
		// `[true, false]` is one batch saying "it came in and went out again". Reading entries[0]
		// leaves the tile marked in band forever, which strands a slot on a tile nobody can see.
		const { container, unmount } = render(<Grid n={3} />);
		deliver(face(container, 0), [true, false]);
		intersect(face(container, 1), true);
		settle(RELEASE_GRACE + APPLY_MS + 40);
		expect(showing(container), 'a tile that left in a coalesced batch kept its slot').toEqual(['# 1']);
		unmount();
	});
});

describe('PooledThumbFace — the tile box', () => {
	it('renders the caller box and no frame of its own', () => {
		const { container, unmount } = render(<Grid n={1} />);
		const box = face(container, 0) as HTMLElement;
		expect(box.tagName).toBe('SPAN');
		// The caller's box classes survive, so the grid's scroll height does not depend on whether
		// a preview happens to be mounted.
		expect(box.className).toContain('aspect-video');
		expect(box.className).toContain('w-full');
		// The box is EMPTY — no engine host anywhere inside the tile's own subtree. (The pool's
		// frames are elsewhere in the tree, which is the point; `showing()` finds them.)
		expect((container.querySelector('[data-testid="tile-0"]') as HTMLElement).querySelector('figure'), 'the tile mounted its own engine host instead of using the pool').toBeNull();
		unmount();
	});

	it('degrades to an empty box outside a pool rather than throwing', () => {
		const { container, unmount } = render(<Grid n={2} pooled={false} />);
		settle();
		expect(showing(container)).toEqual([]);
		expect(face(container, 0)).toBeTruthy();
		unmount();
	});

	it('forwards the specimen declaration per tile, and defaults to keeping the alarms', () => {
		// A catalog sample is silenced; the author's own slide is not. The default matters more
		// than the override: a face that declared `specimen` for everyone silenced Present's slide
		// overview, which is exactly where an author scans for a clipped slide.
		const plain = render(<Grid n={1} />);
		intersect(face(plain.container, 0), true);
		settle();
		expect(plain.container.querySelector('[data-testid="deck-preview"]')?.getAttribute('data-specimen'), "a thumbnail of the author's own slide was silenced").toBe('no');
		plain.unmount();

		const spec = render(<Grid n={1} specimen />);
		intersect(face(spec.container, 0), true);
		settle();
		expect(spec.container.querySelector('[data-testid="deck-preview"]')?.getAttribute('data-specimen'), 'a catalog specimen was not silenced').toBe('yes');
		spec.unmount();
	});
});
