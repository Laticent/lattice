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

import { APPLY_MS, MAX_SLOTS, PooledThumbFace, PreviewPool, RELEASE_GRACE } from './preview-pool';

// A controllable IntersectionObserver: jsdom has none, and the pool's no-IO fallback treats
// every tile as in band, which would make every assertion here vacuous.
type Entry = { target: Element; isIntersecting: boolean };
let observers: { cb: (e: Entry[]) => void; targets: Set<Element>; disconnected: boolean }[] = [];

class FakeIO {
	cb: (e: Entry[]) => void;
	targets = new Set<Element>();
	disconnected = false;
	constructor(cb: (e: Entry[]) => void) {
		this.cb = cb;
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

	it('never exceeds the slot ceiling, however many tiles are in band at once', () => {
		const n = MAX_SLOTS * 3;
		const { container, unmount } = render(<Grid n={n} />);
		for (let i = 0; i < n; i++) intersect(face(container, i), true);
		settle();
		expect(showing(container).length, `the pool grew past its ceiling of ${MAX_SLOTS}`).toBeLessThanOrEqual(MAX_SLOTS);
		unmount();
	});

	it('RE-POINTS a slot instead of remounting it — the property the module exists for', () => {
		const n = MAX_SLOTS * 2;
		const { container, unmount } = render(<Grid n={n} />);
		for (let i = 0; i < MAX_SLOTS; i++) {
			onScreen(face(container, i));
			intersect(face(container, i), true);
		}
		settle();
		const firstWave = showing(container);
		expect(firstWave.length).toBe(MAX_SLOTS);
		const mountedOnce = mounts;
		expect(unmounts, 'a frame was torn down before any tile left the band').toBe(0);

		// The first wave scrolls away, a second wave arrives. Past the grace window, so the slots
		// really do change hands rather than being held.
		for (let i = 0; i < MAX_SLOTS; i++) {
			offScreen(face(container, i));
			intersect(face(container, i), false);
		}
		for (let i = MAX_SLOTS; i < n; i++) {
			onScreen(face(container, i));
			intersect(face(container, i), true);
		}
		settle(RELEASE_GRACE + APPLY_MS + 40);

		const secondWave = showing(container);
		expect(secondWave.some((s) => s !== null && Number(s.slice(2)) >= MAX_SLOTS), 'the second wave never got a slot').toBe(true);
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
		const n = MAX_SLOTS + 4;
		const { container, unmount } = render(<Grid n={n} />);
		for (let i = 0; i < MAX_SLOTS; i++) {
			onScreen(face(container, i));
			intersect(face(container, i), true);
		}
		settle();
		expect(showing(container).length).toBe(MAX_SLOTS);

		// Four early tiles leave the band but stay INSIDE the grace window; four new tiles arrive
		// and are on screen. Settle by less than RELEASE_GRACE, so the grace-holders are still
		// eligible to keep their slots — and must lose them anyway.
		for (let i = 0; i < 4; i++) {
			offScreen(face(container, i));
			intersect(face(container, i), false);
		}
		for (let i = MAX_SLOTS; i < n; i++) {
			onScreen(face(container, i));
			intersect(face(container, i), true);
		}
		settle();

		const shown = showing(container);
		for (let i = MAX_SLOTS; i < n; i++) {
			expect(shown, `tile ${i} is on screen and has no preview; a grace-holder kept the slot`).toContain(`# ${i}`);
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
		expect(box.querySelector('figure'), 'the tile mounted its own engine host instead of using the pool').toBeNull();
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
